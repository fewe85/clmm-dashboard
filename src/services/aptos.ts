import type { PoolData } from '../types'
import { sqrtPriceX64ToPrice, tickToPrice, decodeI64, calculatePositionAmounts } from './math'
import { aptosGet, aptosView, aptosIndexer } from './aptosRpc'

const POOL_ID = '0xa8a355df7d9e75ef16082da2a0bad62c173a054ab1e8eae0f0e26c828adaa4ef'
const BOT_WALLET = '0x89cd5907e16439a90c3661a72891667c3634ae6341820767490bbc7dc7b0752b'
const CLMM_PACKAGE = '0x075b4890de3e312d9425408c43d9a9752b64ab3562a30e89a55bdc568c645920'
const FARMING_PACKAGE = '0xcb8365dc9f7ac6283169598aaad7db9c7b12f52da127007f37fa4565170ff59c'
const THAPT_INCENTIVE = '0x72d746cd3e2c31dd495e2dfc6c67d04c1978e2bf5f4add607d8f41905da1efe7'
const CLMM_COLLECTION = '0xab3f8aeacd280bc774ef13019667035af1a6856c542d41fdedf9a401b2ef2f70'

const DECIMALS_APT = 8
const DECIMALS_USDC = 6

const COIN_USDC = '0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDC'

async function getPoolResource(): Promise<Record<string, unknown>> {
  const data = await aptosGet(
    `/accounts/${POOL_ID}/resource/${CLMM_PACKAGE}::pool::Pool`
  )
  return (data as any).data
}

// Position token cache (changes only on rebalance — cache 5 min)
let _cachedPositionToken: string | null = null
let _positionTokenTs = 0
const POSITION_CACHE_TTL = 300_000 // 5 min

async function findPositionToken(): Promise<string | null> {
  if (_cachedPositionToken && Date.now() - _positionTokenTs < POSITION_CACHE_TTL) {
    return _cachedPositionToken
  }

  try {
    const result = await aptosIndexer(
      `query GetMintedPositions($wallet: String!, $collection: String!) {
        token_activities_v2(
          where: {
            from_address: { _eq: $wallet }
            current_token_data: {
              collection_id: { _eq: $collection }
            }
            type: { _eq: "0x4::collection::MintEvent" }
          }
          order_by: { transaction_version: desc }
          limit: 5
        ) {
          token_data_id
          current_token_data {
            token_name
          }
        }
      }`,
      { wallet: BOT_WALLET, collection: CLMM_COLLECTION },
    ) as any

    const minted = result?.data?.token_activities_v2 ?? []
    if (minted.length === 0) {
      console.warn('No minted CLMM positions found via indexer')
      return _cachedPositionToken // return stale if available
    }

    const sorted = minted.sort((a: any, b: any) => {
      const aId = parseInt(a.current_token_data?.token_name?.split(':')[1] ?? '0')
      const bId = parseInt(b.current_token_data?.token_name?.split(':')[1] ?? '0')
      return bId - aId
    })

    _cachedPositionToken = sorted[0].token_data_id
    _positionTokenTs = Date.now()
    return _cachedPositionToken
  } catch (err) {
    console.error('Indexer query failed:', err)
    return _cachedPositionToken // return stale if available
  }
}

async function isPositionStaked(tokenAddress: string): Promise<boolean> {
  try {
    const result = await aptosView(
      `${FARMING_PACKAGE}::farming::token_stakes`,
      [],
      [tokenAddress],
    )
    const stakes = result[0] as any[]
    return stakes.length > 0
  } catch {
    return false
  }
}

function getAptPriceUsd(poolPrice: number): number {
  return poolPrice
}

function calcTriggerDistancePct(tickCurrent: number, tickLower: number, tickUpper: number): number {
  const center = (tickLower + tickUpper) / 2
  const halfRange = (tickUpper - tickLower) / 2
  if (halfRange <= 0) return 0
  const distFromCenter = Math.abs(tickCurrent - center)
  return Math.min((distFromCenter / halfRange) * 100, 100)
}

async function getCoinBalance(owner: string, coinType: string): Promise<number> {
  // Use view function which handles both legacy CoinStore and migrated Fungible Asset balances
  try {
    const result = await aptosView(
      `0x1::coin::balance`,
      [coinType],
      [owner],
    )
    return Number(result[0] ?? 0)
  } catch {
    // Fallback to resource query for non-migrated coins
    try {
      const data = await aptosGet(
        `/accounts/${owner}/resource/0x1::coin::CoinStore<${coinType}>`
      ) as any
      return Number(data.data?.coin?.value || 0)
    } catch {
      return 0
    }
  }
}

export async function fetchAptosWalletRaw(): Promise<{ apt: number; usdc: number }> {
  const [aptRaw, usdcRaw] = await Promise.all([
    getCoinBalance(BOT_WALLET, '0x1::aptos_coin::AptosCoin'),
    getCoinBalance(BOT_WALLET, COIN_USDC),
  ])
  return {
    apt: aptRaw / Math.pow(10, DECIMALS_APT),
    usdc: usdcRaw / Math.pow(10, DECIMALS_USDC),
  }
}

export async function fetchAptosPoolData(): Promise<PoolData> {
  try {
    const poolData = await getPoolResource()

    const sqrtPrice = BigInt(poolData.sqrt_price as string)
    const tickBits = (poolData.tick as any).bits
    const tickCurrent = decodeI64(tickBits)

    const currentPrice = sqrtPriceX64ToPrice(sqrtPrice, DECIMALS_APT, DECIMALS_USDC)
    const aptPrice = getAptPriceUsd(currentPrice)

    const positionToken = await findPositionToken()
    if (!positionToken) {
      return makeErrorResult('No Thala position found')
    }

    let amountA = 0
    let amountB = 0
    let feesA = 0
    let feesB = 0
    let tickLower = 0
    let tickUpper = 0
    let liquidity = 0

    try {
      const posResult = await aptosView(
        `${CLMM_PACKAGE}::pool::position_info`,
        [],
        [positionToken],
      )
      const info = posResult[0] as any
      tickLower = decodeI64(info.tick_lower.bits)
      tickUpper = decodeI64(info.tick_upper.bits)
      liquidity = Number(info.liquidity)
    } catch {
      try {
        const posResource = await aptosGet(
          `/accounts/${positionToken}/resource/${CLMM_PACKAGE}::pool::Position`
        )
        const posData = posResource as any
        tickLower = decodeI64(posData.data.tick_lower.bits)
        tickUpper = decodeI64(posData.data.tick_upper.bits)
        liquidity = Number(posData.data.liquidity)
      } catch {
        console.error('Failed to fetch position info')
      }
    }

    try {
      const valueResult = await aptosView(
        `${CLMM_PACKAGE}::pool::position_total_value`,
        [],
        [positionToken],
      )
      if (valueResult) {
        amountA = Number(valueResult[0]) / Math.pow(10, DECIMALS_APT)
        amountB = Number(valueResult[1]) / Math.pow(10, DECIMALS_USDC)
      }
    } catch {
      if (liquidity > 0) {
        const calc = calculatePositionAmounts(
          liquidity, tickCurrent, tickLower, tickUpper, DECIMALS_APT, DECIMALS_USDC
        )
        amountA = calc.amountA
        amountB = calc.amountB
      }
    }

    try {
      const feesResult = await aptosView(
        `${CLMM_PACKAGE}::pool::fees_available`,
        [],
        [positionToken],
      )
      if (feesResult) {
        feesA = Number(feesResult[0]) / Math.pow(10, DECIMALS_APT)
        feesB = Number(feesResult[1]) / Math.pow(10, DECIMALS_USDC)
      }
    } catch {
      // fees stay 0
    }

    const priceLower = tickToPrice(tickLower, DECIMALS_APT, DECIMALS_USDC)
    const priceUpper = tickToPrice(tickUpper, DECIMALS_APT, DECIMALS_USDC)
    const inRange = tickCurrent >= tickLower && tickCurrent < tickUpper

    const positionValueUsd = amountA * aptPrice + amountB
    const pendingFeesUsd = feesA * aptPrice + feesB

    let rewardAmount = 0
    const staked = await isPositionStaked(positionToken)
    if (staked) {
      try {
        const rewardResult = await aptosView(
          `${FARMING_PACKAGE}::farming::pending_reward_info`,
          [],
          [positionToken, THAPT_INCENTIVE],
        )
        if (rewardResult) {
          rewardAmount = Number(rewardResult[0]) / Math.pow(10, DECIMALS_APT)
        }
      } catch {
        // rewards stay 0
      }
    }

    const pendingRewardsUsd = rewardAmount * aptPrice

    // Compound threshold: 1% of position value
    const compoundThreshold = positionValueUsd * 0.01
    const compoundPending = pendingFeesUsd + pendingRewardsUsd

    const triggerDistancePct = calcTriggerDistancePct(tickCurrent, tickLower, tickUpper)

    return {
      name: 'APT / USDC',
      chain: 'aptos',
      protocol: 'Thala Finance',
      tokenA: 'APT',
      tokenB: 'USDC',
      decimalsA: DECIMALS_APT,
      decimalsB: DECIMALS_USDC,
      currentPrice,
      tickCurrent,
      tickLower,
      tickUpper,
      priceLower,
      priceUpper,
      inRange,
      positionValueUsd,
      amountA,
      amountB,
      pendingFeesUsd,
      feesA,
      feesB,
      pendingRewardsUsd,
      rewardToken: 'thAPT',
      rewardAmount,
      compoundPending,
      compoundThreshold,
      triggerDistancePct,
      botState: null, // filled by hook
      feesApr: 0, // calculated by hook
      rewardsApr: 0, // calculated by hook
      lastUpdated: Date.now(),
    }
  } catch (err) {
    console.error('Aptos fetch error:', err)
    return makeErrorResult(String(err))
  }
}

function makeErrorResult(error: string): PoolData {
  return {
    name: 'APT / USDC',
    chain: 'aptos',
    protocol: 'Thala Finance',
    tokenA: 'APT',
    tokenB: 'USDC',
    decimalsA: DECIMALS_APT,
    decimalsB: DECIMALS_USDC,
    currentPrice: 0,
    tickCurrent: 0,
    tickLower: 0,
    tickUpper: 0,
    priceLower: 0,
    priceUpper: 0,
    inRange: false,
    positionValueUsd: 0,
    amountA: 0,
    amountB: 0,
    pendingFeesUsd: 0,
    feesA: 0,
    feesB: 0,
    pendingRewardsUsd: 0,
    rewardToken: 'thAPT',
    rewardAmount: 0,
    compoundPending: 0,
    compoundThreshold: 0,
    triggerDistancePct: 0,
    botState: null,
    feesApr: 0,
    rewardsApr: 0,
    lastUpdated: Date.now(),
    error,
  }
}
