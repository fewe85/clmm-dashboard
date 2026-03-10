import type { PoolData, WalletBalance } from '../types'
import { sqrtPriceX64ToPrice, tickToPrice, decodeI32, calculatePositionAmounts } from './math'

const RPC = 'https://sui-mainnet.nodeinfra.com'
const POOL_ID = '0x198af6ff81028c6577e94465d534c4e2cfcbbab06a95724ece7011c55a9d1f5a'
const BOT_WALLET = '0x379ca6ed6398c76e103fb0e4c302b40aa4ccb72f1aae6503dbfe84af9c0a4c10'
const TURBOS_PACKAGE = '0x91bfbc386a41afcfd9b2533058d7e915a1d3829089cc268ff4333d54d6339ca1'

const DECIMALS_DEEP = 6
const DECIMALS_USDC = 6
const DECIMALS_SUI = 9

const COIN_DEEP = '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP'
const COIN_USDC = '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC'

const Q64 = BigInt(1) << BigInt(64)
const Q128 = BigInt(1) << BigInt(128)

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

async function getDynamicFieldObject(parentId: string, nameType: string, nameValue: unknown): Promise<any> {
  const result = await rpcCall('suix_getDynamicFieldObject', [
    parentId,
    { type: nameType, value: nameValue },
  ])
  return (result as any).data.content.fields
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

// Modular subtraction for u128 fee_growth values (unsigned wraparound)
function subMod128(a: bigint, b: bigint): bigint {
  return ((a - b) % Q128 + Q128) % Q128
}

// Compute fee_growth_inside for a tick range using Uniswap v3 formula
function computeGrowthInside(
  tickCurrent: number,
  tickLower: number,
  tickUpper: number,
  growthGlobal: bigint,
  growthOutsideLower: bigint,
  growthOutsideUpper: bigint,
): bigint {
  const growthBelow = tickCurrent >= tickLower
    ? growthOutsideLower
    : subMod128(growthGlobal, growthOutsideLower)
  const growthAbove = tickCurrent < tickUpper
    ? growthOutsideUpper
    : subMod128(growthGlobal, growthOutsideUpper)
  return subMod128(subMod128(growthGlobal, growthBelow), growthAbove)
}

// Fetch tick data from pool's dynamic field table
async function getTickData(poolId: string, tickBits: number): Promise<any> {
  const i32Type = `${TURBOS_PACKAGE}::i32::I32`
  const fields = await getDynamicFieldObject(poolId, i32Type, { bits: tickBits })
  return fields.value.fields
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
    const liquidity = BigInt(posFields.liquidity)

    // Fetch tick data for fee_growth_outside computation
    const [tickLowerData, tickUpperData] = await Promise.all([
      getTickData(POOL_ID, tickLowerBits),
      getTickData(POOL_ID, tickUpperBits),
    ])

    const priceLower = tickToPrice(tickLower, DECIMALS_DEEP, DECIMALS_USDC)
    const priceUpper = tickToPrice(tickUpper, DECIMALS_DEEP, DECIMALS_USDC)
    const inRange = tickCurrent >= tickLower && tickCurrent < tickUpper

    // Calculate position amounts
    const { amountA, amountB } = calculatePositionAmounts(
      Number(liquidity), tickCurrent, tickLower, tickUpper, DECIMALS_DEEP, DECIMALS_USDC
    )

    const deepPrice = getDeepPriceUsd(currentPrice)
    const positionValueUsd = amountA * deepPrice + amountB

    // Compute actual pending fees using fee_growth_inside delta (Uniswap v3 formula)
    const feeGrowthInsideA = computeGrowthInside(
      tickCurrent, tickLower, tickUpper,
      BigInt(poolContent.fee_growth_global_a),
      BigInt(tickLowerData.fee_growth_outside_a),
      BigInt(tickUpperData.fee_growth_outside_a),
    )
    const feeGrowthInsideB = computeGrowthInside(
      tickCurrent, tickLower, tickUpper,
      BigInt(poolContent.fee_growth_global_b),
      BigInt(tickLowerData.fee_growth_outside_b),
      BigInt(tickUpperData.fee_growth_outside_b),
    )
    const posFeeGrowthInsideA = BigInt(posFields.fee_growth_inside_a)
    const posFeeGrowthInsideB = BigInt(posFields.fee_growth_inside_b)

    const feesARaw = BigInt(posFields.tokens_owed_a) + subMod128(feeGrowthInsideA, posFeeGrowthInsideA) * liquidity / Q64
    const feesBRaw = BigInt(posFields.tokens_owed_b) + subMod128(feeGrowthInsideB, posFeeGrowthInsideB) * liquidity / Q64
    const feesA = Number(feesARaw) / Math.pow(10, DECIMALS_DEEP)
    const feesB = Number(feesBRaw) / Math.pow(10, DECIMALS_USDC)
    const pendingFeesUsd = feesA * deepPrice + feesB

    // DEEP reward incentives — compute using reward_growth_inside delta
    const poolRewardInfos = poolContent.reward_infos || []
    const posRewardInfos = posFields.reward_infos || []
    const deepTypeSuffix = '::deep::DEEP'
    let rewardAmount = 0
    for (let i = 0; i < poolRewardInfos.length && i < posRewardInfos.length; i++) {
      const vaultType = poolRewardInfos[i].fields?.vault_coin_type || ''
      if (!vaultType.endsWith(deepTypeSuffix)) continue

      const growthGlobal = BigInt(poolRewardInfos[i].fields.growth_global)
      const growthOutsideLower = BigInt(tickLowerData.reward_growths_outside[i])
      const growthOutsideUpper = BigInt(tickUpperData.reward_growths_outside[i])
      const growthInside = computeGrowthInside(
        tickCurrent, tickLower, tickUpper,
        growthGlobal, growthOutsideLower, growthOutsideUpper,
      )
      const posGrowthInside = BigInt(posRewardInfos[i].fields.reward_growth_inside)
      const amountOwed = BigInt(posRewardInfos[i].fields.amount_owed)
      const rewardRaw = amountOwed + subMod128(growthInside, posGrowthInside) * liquidity / Q64
      rewardAmount += Number(rewardRaw) / Math.pow(10, DECIMALS_DEEP)
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
