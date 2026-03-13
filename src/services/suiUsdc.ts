import type { PoolData } from '../types'
import { sqrtPriceX64ToPrice, tickToPrice, decodeI32, calculatePositionAmounts } from './math'

const RPC = 'https://fullnode.mainnet.sui.io:443'
const POOL_ID = '0x0df4f02d0e210169cb6d5aabd03c3058328c06f2c4dbb0804faa041159c78443'
const BOT_WALLET = '0x379ca6ed6398c76e103fb0e4c302b40aa4ccb72f1aae6503dbfe84af9c0a4c10'
const TURBOS_PACKAGE = '0x91bfbc386a41afcfd9b2533058d7e915a1d3829089cc268ff4333d54d6339ca1'

// coinA = SUI, coinB = USDC
const DECIMALS_SUI = 9
const DECIMALS_USDC = 6

const Q64 = BigInt(1) << BigInt(64)
const Q128 = BigInt(1) << BigInt(128)

// No extra price pools needed — SUI price from this pool itself

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

function subMod128(a: bigint, b: bigint): bigint {
  return ((a - b) % Q128 + Q128) % Q128
}

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

async function getTickData(poolId: string, tickBits: number): Promise<any> {
  const i32Type = `${TURBOS_PACKAGE}::i32::I32`
  const fields = await getDynamicFieldObject(poolId, i32Type, { bits: tickBits })
  return fields.value.fields
}

function calcTriggerDistancePct(tickCurrent: number, tickLower: number, tickUpper: number): number {
  const center = (tickLower + tickUpper) / 2
  const halfRange = (tickUpper - tickLower) / 2
  if (halfRange <= 0) return 0
  const distFromCenter = Math.abs(tickCurrent - center)
  return Math.min((distFromCenter / halfRange) * 100, 100)
}

export async function fetchSuiUsdcPoolData(): Promise<PoolData> {
  try {
    const [poolObj, ownedObjects] = await Promise.all([
      getObject(POOL_ID),
      getOwnedObjects(BOT_WALLET),
    ])

    const poolContent = (poolObj as any).data.content.fields
    const sqrtPrice = BigInt(poolContent.sqrt_price)
    const tickCurrentBits = Number(poolContent.tick_current_index.fields.bits)
    const tickCurrent = decodeI32(tickCurrentBits)

    // Price = USDC per SUI (SUI is coinA, USDC is coinB)
    const currentPrice = sqrtPriceX64ToPrice(sqrtPrice, DECIMALS_SUI, DECIMALS_USDC)
    const SUI_USD = currentPrice

    // Find all position NFTs for SUI/USDC pool, pick the one with most liquidity
    const positionNfts = ownedObjects.filter((obj: any) => {
      if (!obj.data?.content?.type?.includes('TurbosPositionNFT')) return false
      const nftFields = obj.data?.content?.fields
      if (!nftFields?.pool_id) return false
      return nftFields.pool_id === POOL_ID
    })

    if (positionNfts.length === 0) {
      return makeErrorResult('No SUI/USDC position found')
    }

    // Fetch inner position for each NFT and pick the one with highest liquidity
    const positionCandidates = await Promise.all(
      positionNfts.map(async (nft: any) => {
        const pid = nft.data.content.fields.position_id
        const obj = await getObject(pid)
        const fields = (obj as any).data.content.fields
        return { fields, liquidity: BigInt(fields.liquidity) }
      })
    )
    const best = positionCandidates.reduce((a, b) => a.liquidity > b.liquidity ? a : b)
    const posFields = best.fields

    const tickLowerBits = Number(posFields.tick_lower_index.fields.bits)
    const tickUpperBits = Number(posFields.tick_upper_index.fields.bits)
    const tickLower = decodeI32(tickLowerBits)
    const tickUpper = decodeI32(tickUpperBits)
    const liquidity = BigInt(posFields.liquidity)

    const [tickLowerData, tickUpperData] = await Promise.all([
      getTickData(POOL_ID, tickLowerBits),
      getTickData(POOL_ID, tickUpperBits),
    ])

    const priceLower = tickToPrice(tickLower, DECIMALS_SUI, DECIMALS_USDC)
    const priceUpper = tickToPrice(tickUpper, DECIMALS_SUI, DECIMALS_USDC)
    const inRange = tickCurrent >= tickLower && tickCurrent < tickUpper

    const { amountA, amountB } = calculatePositionAmounts(
      Number(liquidity), tickCurrent, tickLower, tickUpper, DECIMALS_SUI, DECIMALS_USDC
    )

    const positionValueUsd = amountA * SUI_USD + amountB

    // Pending fees
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
    const feesA = Number(feesARaw) / Math.pow(10, DECIMALS_SUI)
    const feesB = Number(feesBRaw) / Math.pow(10, DECIMALS_USDC)
    const pendingFeesUsd = feesA * SUI_USD + feesB

    // Rewards: slot 0 = TURBOS (inactive), slot 1 = SUI
    const poolRewardInfos = poolContent.reward_infos || []
    const posRewardInfos = posFields.reward_infos || []
    let rewardSuiAmount = 0
    for (let i = 0; i < poolRewardInfos.length && i < posRewardInfos.length; i++) {
      const vaultType = poolRewardInfos[i].fields?.vault_coin_type || ''
      if (!vaultType.endsWith('::sui::SUI')) continue // skip inactive TURBOS slot
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
      rewardSuiAmount = Number(rewardRaw) / Math.pow(10, 9)
    }
    const pendingRewardsUsd = rewardSuiAmount * SUI_USD

    const compoundThreshold = positionValueUsd * 0.01
    const compoundPending = pendingFeesUsd + pendingRewardsUsd

    const triggerDistancePct = calcTriggerDistancePct(tickCurrent, tickLower, tickUpper)

    return {
      name: 'SUI / USDC',
      chain: 'sui',
      protocol: 'Turbos Finance',
      tokenA: 'SUI',
      tokenB: 'USDC',
      decimalsA: DECIMALS_SUI,
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
      rewardToken: 'SUI',
      rewardAmount: rewardSuiAmount,
      compoundPending,
      compoundThreshold,
      triggerDistancePct,
      botState: null,
      feesApr: 0,
      rewardsApr: 0,
      lastUpdated: Date.now(),
    }
  } catch (err) {
    console.error('SUI/USDC fetch error:', err)
    return makeErrorResult(String(err))
  }
}

function makeErrorResult(error: string): PoolData {
  return {
    name: 'SUI / USDC',
    chain: 'sui',
    protocol: 'Turbos Finance',
    tokenA: 'SUI',
    tokenB: 'USDC',
    decimalsA: DECIMALS_SUI,
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
    rewardToken: 'SUI',
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
