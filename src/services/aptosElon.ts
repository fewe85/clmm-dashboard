import type { PoolData } from '../types'
import { sqrtPriceX64ToPrice, tickToPrice, decodeI64, calculatePositionAmounts, calcTriggerDistancePct } from './math'
import { aptosGet, aptosView, aptosIndexer } from './aptosRpc'

// ELON/USDC pool — token0=USDC (6 dec), token1=ELON (8 dec)
const POOL_ID = '0xf6ada118eaa45ddca28f74f1965b6f1f994bef5ebaf651c268238c2ea9ca5695'
const BOT_WALLET = '0x89cd5907e16439a90c3661a72891667c3634ae6341820767490bbc7dc7b0752b'
const CLMM_PACKAGE = '0x075b4890de3e312d9425408c43d9a9752b64ab3562a30e89a55bdc568c645920'
const FARMING_PACKAGE = '0xcb8365dc9f7ac6283169598aaad7db9c7b12f52da127007f37fa4565170ff59c'
const THAPT_INCENTIVE = '0x4adf2625cacbac53ea9f67caffd4935c9f885df00e54e65e2447756fb3b6c905'
const CLMM_COLLECTION = '0xab3f8aeacd280bc774ef13019667035af1a6856c542d41fdedf9a401b2ef2f70'

const DECIMALS_ELON = 8
const DECIMALS_USDC = 6

async function getPoolResource(): Promise<Record<string, unknown>> {
  const data = await aptosGet(
    `/accounts/${POOL_ID}/resource/${CLMM_PACKAGE}::pool::Pool`
  )
  return (data as any).data
}

// Position token cache
let _cachedPositionToken: string | null = null
let _positionTokenTs = 0
const POSITION_CACHE_TTL = 300_000

async function findPositionToken(): Promise<string | null> {
  if (_cachedPositionToken && Date.now() - _positionTokenTs < POSITION_CACHE_TTL) {
    return _cachedPositionToken
  }

  // Primary: use bot state's positionNftId (always correct, no indexer delay)
  try {
    const base = import.meta.env.BASE_URL || '/'
    const res = await fetch(`${base}api/bot-state/elon.json`)
    if (res.ok) {
      const state = await res.json()
      if (state?.positionNftId) {
        _cachedPositionToken = state.positionNftId
        _positionTokenTs = Date.now()
        return _cachedPositionToken
      }
    }
  } catch { /* fall through to indexer */ }

  // Fallback: indexer query with tick-based filtering
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
          limit: 10
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
    if (minted.length === 0) return _cachedPositionToken

    const sorted = minted.sort((a: any, b: any) => {
      const aId = parseInt(a.current_token_data?.token_name?.split(':')[1] ?? '0')
      const bId = parseInt(b.current_token_data?.token_name?.split(':')[1] ?? '0')
      return bId - aId
    })

    for (const pos of sorted) {
      try {
        const posResult = await aptosView(
          `${CLMM_PACKAGE}::pool::position_info`,
          [],
          [pos.token_data_id],
        )
        const info = posResult[0] as any
        const tl = decodeI64(info.tick_lower.bits)
        // ELON/USDC pool has positive ticks (~66000-67000 range)
        // APT/USDC pool has negative ticks (~-46000 range)
        if (tl > 0) {
          _cachedPositionToken = pos.token_data_id
          _positionTokenTs = Date.now()
          return _cachedPositionToken
        }
      } catch { /* try next */ }
    }

    return _cachedPositionToken
  } catch (err) {
    console.error('ELON indexer query failed:', err)
    return _cachedPositionToken
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

export async function fetchElonPoolData(): Promise<PoolData> {
  try {
    const poolData = await getPoolResource()

    const sqrtPrice = BigInt(poolData.sqrt_price as string)
    const tickBits = (poolData.tick as any).bits
    const tickCurrent = decodeI64(tickBits)

    // Pool native price: ELON per USDC (token1/token0 with decimal adjust)
    const nativePrice = sqrtPriceX64ToPrice(sqrtPrice, DECIMALS_USDC, DECIMALS_ELON)
    // We want USDC per ELON for display
    const currentPrice = nativePrice > 0 ? 1 / nativePrice : 0
    const elonPrice = currentPrice

    const positionToken = await findPositionToken()
    if (!positionToken) {
      return makeErrorResult('No ELON/USDC position found')
    }

    let amountElon = 0
    let amountUsdc = 0
    let feesElon = 0
    let feesUsdc = 0
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
        console.error('Failed to fetch ELON position info')
      }
    }

    try {
      const valueResult = await aptosView(
        `${CLMM_PACKAGE}::pool::position_total_value`,
        [],
        [positionToken],
      )
      if (valueResult) {
        // Pool returns [token0=USDC, token1=ELON]
        amountUsdc = Number(valueResult[0]) / Math.pow(10, DECIMALS_USDC)
        amountElon = Number(valueResult[1]) / Math.pow(10, DECIMALS_ELON)
      }
    } catch {
      if (liquidity > 0) {
        // calculatePositionAmounts returns [tokenA=token0=USDC, tokenB=token1=ELON]
        const calc = calculatePositionAmounts(
          liquidity, tickCurrent, tickLower, tickUpper, DECIMALS_USDC, DECIMALS_ELON
        )
        amountUsdc = calc.amountA
        amountElon = calc.amountB
      }
    }

    try {
      const feesResult = await aptosView(
        `${CLMM_PACKAGE}::pool::fees_available`,
        [],
        [positionToken],
      )
      if (feesResult) {
        // [token0=USDC, token1=ELON]
        feesUsdc = Number(feesResult[0]) / Math.pow(10, DECIMALS_USDC)
        feesElon = Number(feesResult[1]) / Math.pow(10, DECIMALS_ELON)
      }
    } catch {
      // fees stay 0
    }

    // Convert pool ticks to USDC/ELON prices (inverted)
    const nativePriceLower = tickToPrice(tickLower, DECIMALS_USDC, DECIMALS_ELON) // ELON/USDC at lower tick
    const nativePriceUpper = tickToPrice(tickUpper, DECIMALS_USDC, DECIMALS_ELON) // ELON/USDC at upper tick
    // Invert: lower native (fewer ELON per USDC) = higher USDC/ELON
    const priceLower = nativePriceUpper > 0 ? 1 / nativePriceUpper : 0
    const priceUpper = nativePriceLower > 0 ? 1 / nativePriceLower : 0
    const inRange = tickCurrent >= tickLower && tickCurrent < tickUpper

    const positionValueUsd = amountElon * elonPrice + amountUsdc
    const pendingFeesUsd = feesElon * elonPrice + feesUsdc

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
          rewardAmount = Number(rewardResult[0]) / Math.pow(10, 8) // thAPT has 8 decimals
        }
      } catch {
        // rewards stay 0
      }
    }

    // thAPT reward priced in APT ≈ USDC (need APT price, but we don't have it here)
    // We'll enrich this in usePoolData with the APT price from the other pool
    const pendingRewardsUsd = 0 // will be set by hook with correct APT price

    const compoundThreshold = positionValueUsd * 0.01
    const compoundPending = pendingFeesUsd + pendingRewardsUsd

    const triggerDistancePct = calcTriggerDistancePct(tickCurrent, tickLower, tickUpper)

    return {
      name: 'ELON / USDC',
      chain: 'aptos',
      protocol: 'Thala Finance',
      tokenA: 'ELON',
      tokenB: 'USDC',
      decimalsA: DECIMALS_ELON,
      decimalsB: DECIMALS_USDC,
      currentPrice,
      tickCurrent,
      tickLower,
      tickUpper,
      priceLower,
      priceUpper,
      inRange,
      positionValueUsd,
      amountA: amountElon,
      amountB: amountUsdc,
      pendingFeesUsd,
      feesA: feesElon,
      feesB: feesUsdc,
      pendingRewardsUsd,
      rewardToken: 'thAPT',
      rewardAmount,
      compoundPending,
      compoundThreshold,
      harvestedUsd: 0,
      harvestDetails: [],
      triggerDistancePct,
      botState: null,
      feesApr: 0,
      rewardsApr: 0,
      invested: 0,
      netProfit: 0,
      lastUpdated: Date.now(),
    }
  } catch (err) {
    console.error('ELON pool fetch error:', err)
    return makeErrorResult(String(err))
  }
}

function makeErrorResult(error: string): PoolData {
  return {
    name: 'ELON / USDC',
    chain: 'aptos',
    protocol: 'Thala Finance',
    tokenA: 'ELON',
    tokenB: 'USDC',
    decimalsA: DECIMALS_ELON,
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
    harvestedUsd: 0,
    harvestDetails: [],
    triggerDistancePct: 0,
    botState: null,
    feesApr: 0,
    rewardsApr: 0,
    invested: 0,
    netProfit: 0,
    lastUpdated: Date.now(),
    error,
  }
}
