import type { PoolData, WalletBalance } from '../types'
import { sqrtPriceX64ToPrice, tickToPrice, decodeI64, calculatePositionAmounts } from './math'

const RPC = 'https://fullnode.mainnet.aptoslabs.com/v1'
const INDEXER = 'https://indexer.mainnet.aptoslabs.com/v1/graphql'
const POOL_ID = '0xf6ada118eaa45ddca28f74f1965b6f1f994bef5ebaf651c268238c2ea9ca5695'
const BOT_WALLET = '0x89cd5907e16439a90c3661a72891667c3634ae6341820767490bbc7dc7b0752b'
const CLMM_PACKAGE = '0x075b4890de3e312d9425408c43d9a9752b64ab3562a30e89a55bdc568c645920'
const FARMING_PACKAGE = '0xcb8365dc9f7ac6283169598aaad7db9c7b12f52da127007f37fa4565170ff59c'
const THAPT_INCENTIVE = '0x4adf2625cacbac53ea9f67caffd4935c9f885df00e54e65e2447756fb3b6c905'
const CLMM_COLLECTION = '0x9447845e7d0ff3d6ed532c23996b29e5db43ecbc33a6fa62ec5667f85fedb3f6'

// Pool token order: token0=USDC(6), token1=ELON(8)
// Display order: tokenA=ELON, tokenB=USDC
const DECIMALS_USDC = 6  // token0
const DECIMALS_ELON = 8  // token1

const ELON_METADATA = '0xfc087a394c203d62c43eecfeba79db01441d39dd9d234131b78415626a26750e'

async function aptosView(func: string, typeArgs: string[], args: string[]): Promise<unknown[]> {
  const res = await fetch(`${RPC}/view`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      function: func,
      type_arguments: typeArgs,
      arguments: args,
    }),
  })
  if (!res.ok) throw new Error(`Aptos view error: ${res.status}`)
  return res.json()
}

async function aptosIndexer(query: string, variables: Record<string, unknown>): Promise<unknown> {
  const res = await fetch(INDEXER, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`Aptos indexer error: ${res.status}`)
  return res.json()
}

async function aptosGet(path: string): Promise<unknown> {
  const res = await fetch(`${RPC}${path}`)
  if (!res.ok) throw new Error(`Aptos API error: ${res.status}`)
  return res.json()
}

async function getPoolResource(): Promise<Record<string, unknown>> {
  const data = await aptosGet(
    `/accounts/${POOL_ID}/resource/${CLMM_PACKAGE}::pool::Pool`
  )
  return (data as any).data
}

async function findPositionToken(): Promise<string | null> {
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
    if (minted.length === 0) return null

    const sorted = minted.sort((a: any, b: any) => {
      const aId = parseInt(a.current_token_data?.token_name?.split(':')[1] ?? '0')
      const bId = parseInt(b.current_token_data?.token_name?.split(':')[1] ?? '0')
      return bId - aId
    })

    return sorted[0].token_data_id
  } catch (err) {
    console.error('ELON indexer query failed:', err)
    return null
  }
}

function calcTriggerDistancePct(tickCurrent: number, tickLower: number, tickUpper: number): number {
  const center = (tickLower + tickUpper) / 2
  const halfRange = (tickUpper - tickLower) / 2
  if (halfRange <= 0) return 0
  const distFromCenter = Math.abs(tickCurrent - center)
  return Math.min((distFromCenter / halfRange) * 100, 100)
}

async function fetchWalletBalances(elonPriceUsdc: number): Promise<WalletBalance> {
  // ELON balance only (USDC idle is tracked by APT pool to avoid double-counting)
  let elonRaw = 0
  try {
    const result = await aptosView(
      '0x1::primary_fungible_store::balance',
      ['0x1::fungible_asset::Metadata'],
      [BOT_WALLET, ELON_METADATA],
    )
    elonRaw = Number(result[0] ?? 0)
  } catch { /* stay 0 */ }

  const elonBalance = elonRaw / Math.pow(10, DECIMALS_ELON)
  const elonValueUsd = elonBalance * elonPriceUsdc

  // Gas: shared with APT bot, don't double-count
  // Show 0 for gas since APT pool shows it
  return {
    gasToken: 'APT',
    gasBalance: 0,
    gasValueUsd: 0,
    idleBalances: [
      { token: 'ELON', amount: elonBalance, valueUsd: elonValueUsd },
    ],
    totalIdleUsd: elonValueUsd,
  }
}

export async function fetchElonPoolData(): Promise<PoolData> {
  try {
    const poolData = await getPoolResource()

    const sqrtPrice = BigInt(poolData.sqrt_price as string)
    const tickBits = (poolData.tick as any).bits
    const tickCurrent = decodeI64(tickBits)

    // Pool native price: ELON per USDC (token1/token0)
    // sqrtPriceX64ToPrice with token0 decimals, token1 decimals
    const poolNativePrice = sqrtPriceX64ToPrice(sqrtPrice, DECIMALS_USDC, DECIMALS_ELON)
    // Display price: USDC per ELON
    const elonPriceUsdc = 1 / poolNativePrice

    const positionToken = await findPositionToken()
    if (!positionToken) {
      return makeErrorResult('No ELON/USDC position found')
    }

    // Position amounts: on-chain returns amount0=USDC, amount1=ELON
    let amountUsdc = 0
    let amountElon = 0
    let feesUsdc = 0
    let feesElon = 0
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
        amountUsdc = Number(valueResult[0]) / Math.pow(10, DECIMALS_USDC) // token0 = USDC
        amountElon = Number(valueResult[1]) / Math.pow(10, DECIMALS_ELON) // token1 = ELON
      }
    } catch {
      if (liquidity > 0) {
        // Fallback: calculate from liquidity
        // Note: calculatePositionAmounts returns amountA=token0=USDC, amountB=token1=ELON
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
        feesUsdc = Number(feesResult[0]) / Math.pow(10, DECIMALS_USDC) // token0 = USDC
        feesElon = Number(feesResult[1]) / Math.pow(10, DECIMALS_ELON) // token1 = ELON
      }
    } catch { /* stay 0 */ }

    // Price range: convert ticks to USDC/ELON display prices
    // tickToPrice with token0=USDC, token1=ELON gives ELON per USDC
    // Invert for display: USDC per ELON
    const priceLowerPoolNative = tickToPrice(tickLower, DECIMALS_USDC, DECIMALS_ELON)
    const priceUpperPoolNative = tickToPrice(tickUpper, DECIMALS_USDC, DECIMALS_ELON)
    // Invert: lower pool native price → higher display price (and vice versa)
    const priceLower = 1 / priceUpperPoolNative
    const priceUpper = 1 / priceLowerPoolNative

    const inRange = tickCurrent >= tickLower && tickCurrent < tickUpper

    // Display: tokenA=ELON, tokenB=USDC
    const positionValueUsd = amountElon * elonPriceUsdc + amountUsdc
    const pendingFeesUsd = feesElon * elonPriceUsdc + feesUsdc

    // Rewards: thAPT via farming incentive
    let rewardAmount = 0
    try {
      const stakeResult = await aptosView(
        `${FARMING_PACKAGE}::farming::token_stakes`,
        [],
        [positionToken],
      )
      const stakes = stakeResult[0] as any[]
      if (stakes.length > 0) {
        const rewardResult = await aptosView(
          `${FARMING_PACKAGE}::farming::pending_reward_info`,
          [],
          [positionToken, THAPT_INCENTIVE],
        )
        if (rewardResult) {
          rewardAmount = Number(rewardResult[0]) / Math.pow(10, 8) // thAPT has 8 decimals
        }
      }
    } catch { /* rewards stay 0 */ }
    // thAPT ≈ APT price — fetch from APT/USDC pool
    let aptPrice = 0.96 // fallback
    try {
      const aptPool = await aptosGet(
        `/accounts/0xa8a355df7d9e75ef16082da2a0bad62c173a054ab1e8eae0f0e26c828adaa4ef/resource/${CLMM_PACKAGE}::pool::Pool`
      ) as any
      const aptSqrtPrice = BigInt(aptPool.data.sqrt_price)
      aptPrice = sqrtPriceX64ToPrice(aptSqrtPrice, 8, 6) // APT(8) / USDC(6)
    } catch { /* use fallback */ }
    const pendingRewardsUsd = rewardAmount * aptPrice

    const compoundThreshold = positionValueUsd * 0.01
    const compoundPending = pendingFeesUsd + pendingRewardsUsd
    const triggerDistancePct = calcTriggerDistancePct(tickCurrent, tickLower, tickUpper)

    const walletBalance = await fetchWalletBalances(elonPriceUsdc)

    return {
      name: 'ELON / USDC',
      chain: 'aptos',
      protocol: 'Thala Finance',
      tokenA: 'ELON',
      tokenB: 'USDC',
      decimalsA: DECIMALS_ELON,
      decimalsB: DECIMALS_USDC,
      currentPrice: elonPriceUsdc,
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
      triggerDistancePct,
      walletBalance,
      botState: null,
      feesApr: 0,
      rewardsApr: 0,
      lastUpdated: Date.now(),
    }
  } catch (err) {
    console.error('ELON fetch error:', err)
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
    triggerDistancePct: 0,
    walletBalance: null,
    botState: null,
    feesApr: 0,
    rewardsApr: 0,
    lastUpdated: Date.now(),
    error,
  }
}
