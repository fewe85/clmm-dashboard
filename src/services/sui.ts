import type { PoolData, WalletBalance } from '../types'
import { sqrtPriceX64ToPrice, tickToPrice, decodeI32, calculatePositionAmounts } from './math'

const RPC = 'https://sui-mainnet.nodeinfra.com'
const POOL_ID = '0x198af6ff81028c6577e94465d534c4e2cfcbbab06a95724ece7011c55a9d1f5a'
const BOT_WALLET = '0x379ca6ed6398c76e103fb0e4c302b40aa4ccb72f1aae6503dbfe84af9c0a4c10'

const DECIMALS_DEEP = 6
const DECIMALS_USDC = 6
const DECIMALS_SUI = 9

const COIN_DEEP = '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP'
const COIN_USDC = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC'

async function rpcCall(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const json = await res.json()
  if (json.error) throw new Error(json.error.message)
  return json.result
}

async function getObject(objectId: string): Promise<Record<string, unknown>> {
  const result = await rpcCall('sui_getObject', [
    objectId,
    { showContent: true, showType: true },
  ])
  return result as Record<string, unknown>
}

async function getOwnedObjects(owner: string): Promise<Record<string, unknown>[]> {
  const result = await rpcCall('suix_getOwnedObjects', [
    owner,
    { filter: null, options: { showContent: true, showType: true } },
    null,
    50,
  ]) as { data: Record<string, unknown>[] }
  return result.data
}

async function getCoinBalance(owner: string, coinType: string): Promise<number> {
  try {
    const result = await rpcCall('suix_getBalance', [owner, coinType]) as any
    return Number(result.totalBalance || 0)
  } catch {
    return 0
  }
}

// Find DEEP price in USD using pool price (DEEP/USDC)
function getDeepPriceUsd(poolPrice: number): number {
  return poolPrice // DEEP/USDC price is already in USD terms
}

function calcTriggerDistancePct(tickCurrent: number, tickLower: number, tickUpper: number): number {
  const center = (tickLower + tickUpper) / 2
  const halfRange = (tickUpper - tickLower) / 2
  if (halfRange <= 0) return 0
  const distFromCenter = Math.abs(tickCurrent - center)
  return Math.min((distFromCenter / halfRange) * 100, 100)
}

async function fetchWalletBalances(deepPrice: number): Promise<WalletBalance> {
  const [suiRaw, deepRaw, usdcRaw] = await Promise.all([
    getCoinBalance(BOT_WALLET, '0x2::sui::SUI'),
    getCoinBalance(BOT_WALLET, COIN_DEEP),
    getCoinBalance(BOT_WALLET, COIN_USDC),
  ])

  const suiBalance = suiRaw / Math.pow(10, DECIMALS_SUI)
  const deepBalance = deepRaw / Math.pow(10, DECIMALS_DEEP)
  const usdcBalance = usdcRaw / Math.pow(10, DECIMALS_USDC)

  // SUI price: rough estimate ~1.2 USD (we don't have a SUI/USDC pool to check)
  // For gas reserve, exact price is less critical
  const suiPriceEstimate = 1.2
  const gasValueUsd = suiBalance * suiPriceEstimate

  const idleBalances = [
    { token: 'DEEP', amount: deepBalance, valueUsd: deepBalance * deepPrice },
    { token: 'USDC', amount: usdcBalance, valueUsd: usdcBalance },
  ]

  return {
    gasToken: 'SUI',
    gasBalance: suiBalance,
    gasValueUsd,
    idleBalances,
    totalIdleUsd: idleBalances.reduce((sum, b) => sum + b.valueUsd, 0),
  }
}

export async function fetchSuiPoolData(): Promise<PoolData> {
  try {
    // Fetch pool and wallet objects in parallel
    const [poolObj, ownedObjects] = await Promise.all([
      getObject(POOL_ID),
      getOwnedObjects(BOT_WALLET),
    ])

    // Parse pool data
    const poolContent = (poolObj as any).data.content.fields
    const sqrtPrice = BigInt(poolContent.sqrt_price)
    const tickCurrentBits = Number(poolContent.tick_current_index.fields.bits)
    const tickCurrent = decodeI32(tickCurrentBits)

    const currentPrice = sqrtPriceX64ToPrice(sqrtPrice, DECIMALS_DEEP, DECIMALS_USDC)

    // Find position NFT
    const positionNft = ownedObjects.find((obj: any) =>
      obj.data?.content?.type?.includes('TurbosPositionNFT')
    )

    if (!positionNft) {
      return makeErrorResult('No Turbos position found')
    }

    const nftFields = (positionNft as any).data.content.fields
    const positionId = nftFields.position_id

    // Fetch inner position data
    const positionObj = await getObject(positionId)
    const posFields = (positionObj as any).data.content.fields

    const tickLowerBits = Number(posFields.tick_lower_index.fields.bits)
    const tickUpperBits = Number(posFields.tick_upper_index.fields.bits)
    const tickLower = decodeI32(tickLowerBits)
    const tickUpper = decodeI32(tickUpperBits)
    const liquidity = Number(posFields.liquidity)

    const priceLower = tickToPrice(tickLower, DECIMALS_DEEP, DECIMALS_USDC)
    const priceUpper = tickToPrice(tickUpper, DECIMALS_DEEP, DECIMALS_USDC)
    const inRange = tickCurrent >= tickLower && tickCurrent < tickUpper

    // Calculate position amounts
    const { amountA, amountB } = calculatePositionAmounts(
      liquidity, tickCurrent, tickLower, tickUpper, DECIMALS_DEEP, DECIMALS_USDC
    )

    const deepPrice = getDeepPriceUsd(currentPrice)
    const positionValueUsd = amountA * deepPrice + amountB

    // Pending fees
    const feesA = Number(posFields.tokens_owed_a) / Math.pow(10, DECIMALS_DEEP)
    const feesB = Number(posFields.tokens_owed_b) / Math.pow(10, DECIMALS_USDC)
    const pendingFeesUsd = feesA * deepPrice + feesB

    // DEEP reward incentives
    const rewardInfos = posFields.reward_infos || []
    let rewardAmount = 0
    for (const ri of rewardInfos) {
      const owed = Number(ri.fields?.amount_owed || 0)
      if (owed > 0) rewardAmount += owed / Math.pow(10, DECIMALS_DEEP)
    }
    const pendingRewardsUsd = rewardAmount * deepPrice

    // Compound threshold: 1% of position value
    const compoundThreshold = positionValueUsd * 0.01
    const compoundPending = pendingFeesUsd + pendingRewardsUsd

    // Trigger distance
    const triggerDistancePct = calcTriggerDistancePct(tickCurrent, tickLower, tickUpper)

    // Wallet balances
    const walletBalance = await fetchWalletBalances(deepPrice)

    return {
      name: 'DEEP / USDC',
      chain: 'sui',
      protocol: 'Turbos Finance',
      tokenA: 'DEEP',
      tokenB: 'USDC',
      decimalsA: DECIMALS_DEEP,
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
      rewardToken: 'DEEP',
      rewardAmount,
      compoundPending,
      compoundThreshold,
      triggerDistancePct,
      walletBalance,
      botState: null, // filled by hook
      feesApr: 0, // calculated by hook
      rewardsApr: 0, // calculated by hook
      lastUpdated: Date.now(),
    }
  } catch (err) {
    console.error('Sui fetch error:', err)
    return makeErrorResult(String(err))
  }
}

function makeErrorResult(error: string): PoolData {
  return {
    name: 'DEEP / USDC',
    chain: 'sui',
    protocol: 'Turbos Finance',
    tokenA: 'DEEP',
    tokenB: 'USDC',
    decimalsA: DECIMALS_DEEP,
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
    rewardToken: 'DEEP',
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
