import { useState, useEffect, useCallback, useRef } from 'react'
import type { PoolData, PoolGroup, PoolPerformance, BotState, AllWallets, HarvestEntry } from '../types'
import { fetchSuiPoolData, fetchSuiUsdPrice } from '../services/sui'
import { fetchWalPoolData } from '../services/wal'
import { fetchIkaPoolData } from '../services/ika'
import { fetchSuiUsdcPoolData } from '../services/suiUsdc'
import { fetchAptosPoolData } from '../services/aptos'
import { fetchTurbosBotState, fetchThalaBotState, fetchWalBotState, fetchIkaBotState, fetchSuiUsdcBotState } from '../services/botState'
import { fetchSuiWalletDynamic, fetchAptosWalletDynamic, fetchTurbosUsdPrice } from '../services/wallet'

const REFRESH_INTERVAL = 120_000 // 2 min — avoids Aptos RPC rate limits

const INITIAL_CAPITAL = 210 // $50 DEEP + $50 WAL + $50 IKA + $10 SUI/USDC + $50 APT (replaces old SUI/TURBOS $10)
const SUI_BOT_START = '2026-03-07T00:00:00.000Z'
const WAL_BOT_START = '2026-03-12T00:00:00.000Z'
const IKA_BOT_START = '2026-03-13T00:00:00.000Z'
const SUI_USDC_BOT_START = '2026-03-13T00:00:00.000Z'
const APT_BOT_START = '2026-03-10T00:00:00.000Z'
const ELON_BOT_START = '2026-03-11T00:00:00.000Z'

// Start prices (hardcoded from deployment dates)
const START_PRICES: Record<string, { price: number; investment: number; start: string }> = {
  'DEEP / USDC':    { price: 0.0277, investment: 50, start: SUI_BOT_START },
  'WAL / USDC':     { price: 0.079,  investment: 50, start: WAL_BOT_START },
  'IKA / USDC':     { price: 0,      investment: 50, start: IKA_BOT_START },   // will use current price as fallback
  'SUI / USDC':     { price: 0,      investment: 10, start: SUI_USDC_BOT_START }, // will use current price as fallback
  'APT / USDC':     { price: 0.992,  investment: 96.45, start: APT_BOT_START }, // $50 original + $46.45 migrated from ELON
}

// Projected APR from pending fees accrued since last on-chain collect.
// This matches DEX UI APR: current fee rate annualized, not diluted lifetime average.
// Returns 0 if < 30 min since last collect (not enough data for meaningful APR).
function calcProjectedApr(
  pendingUsd: number,
  positionValueUsd: number,
  lastCollectAt: string | null,
): number {
  if (positionValueUsd <= 0 || !lastCollectAt) return 0
  const hoursSinceCollect = (Date.now() - new Date(lastCollectAt).getTime()) / (1000 * 60 * 60)
  if (hoursSinceCollect < 0.5) return 0
  return (pendingUsd / positionValueUsd) * (365 * 24 / hoursSinceCollect) * 100
}

// Get the most recent fee-collection timestamp (rebalance, compound, or harvest)
function getLastCollectAt(state: BotState | null, fallback: string): string {
  if (!state) return fallback
  const candidates = [state.lastRebalanceAt, state.lastCompoundAt, state.lastHarvestAt].filter(Boolean) as string[]
  if (candidates.length === 0) return fallback
  return candidates.reduce((latest, d) => new Date(d) > new Date(latest) ? d : latest)
}


function formatUptime(startIso: string): string {
  const ms = Date.now() - new Date(startIso).getTime()
  const days = Math.floor(ms / (1000 * 60 * 60 * 24))
  const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  return `${days}d ${hours}h`
}

function calcHodlValue(startPrice: number, currentPrice: number, investment: number): number {
  if (startPrice <= 0 || currentPrice <= 0) return investment
  // 50/50 split: half in tokenA, half in tokenB (USDC)
  const halfUsd = investment / 2
  const tokensA = halfUsd / startPrice
  const hodlA = tokensA * currentPrice // tokenA appreciated/depreciated
  const hodlB = halfUsd // USDC stays at $1
  return hodlA + hodlB
}

// Calculate harvest USD from bot state harvest entries + current prices
function calcHarvestFromBotState(
  state: BotState | null,
  priceMap: Record<string, number>,
): { harvestedUsd: number; harvestDetails: HarvestEntry[] } {
  if (!state || state.harvestEntries.length === 0) {
    return { harvestedUsd: 0, harvestDetails: [] }
  }
  const details: HarvestEntry[] = state.harvestEntries.map(e => ({
    token: e.token,
    amount: e.amount,
    valueUsd: e.amount * (priceMap[e.token] || 0),
  }))
  return {
    harvestedUsd: details.reduce((s, d) => s + d.valueUsd, 0),
    harvestDetails: details,
  }
}

function calcPoolPerformance(
  poolName: string,
  currentPrice: number,
  positionValueUsd: number,
  pendingFeesUsd: number,
  pendingRewardsUsd: number,
  collectedFeesA: number,
  collectedFeesB: number,
  priceA: number, // current price of tokenA in USD
  totalRebalances: number,
  harvestedUsd: number,
): PoolPerformance {
  const meta = START_PRICES[poolName] || { price: currentPrice, investment: 50, start: SUI_BOT_START }
  const startPrice = meta.price > 0 ? meta.price : currentPrice
  const investment = meta.investment

  const hodlValue = calcHodlValue(startPrice, currentPrice, investment)
  const lpValue = positionValueUsd + pendingFeesUsd + pendingRewardsUsd

  // Total fees earned = collected (compounded back) + pending
  const collectedFeesUsd = collectedFeesA * priceA + collectedFeesB
  const totalFeesEarned = collectedFeesUsd + pendingFeesUsd + pendingRewardsUsd

  // Net profit includes harvested amounts (no longer in position)
  const netProfit = lpValue + harvestedUsd - investment
  const daysRunning = Math.max(1, (Date.now() - new Date(meta.start).getTime()) / (1000 * 60 * 60 * 24))
  const realizedApr = investment > 0 ? (netProfit / investment) * (365 / daysRunning) * 100 : 0

  return {
    poolName,
    initialInvestment: investment,
    startPrice,
    currentPrice,
    hodlValueUsd: hodlValue,
    lpValueUsd: lpValue,
    outperformanceUsd: lpValue + harvestedUsd - hodlValue,
    outperformancePct: hodlValue > 0 ? ((lpValue + harvestedUsd - hodlValue) / hodlValue) * 100 : 0,
    totalFeesEarnedUsd: totalFeesEarned,
    totalHarvestedUsd: harvestedUsd,
    totalRebalances,
    netProfitUsd: netProfit,
    netProfitPct: investment > 0 ? (netProfit / investment) * 100 : 0,
    daysRunning,
    realizedApr,
  }
}

// Persist last-good pool data to sessionStorage so it survives page reloads
const POOL_STORAGE_KEY = 'clmm_last_good_pools'

function loadPersistedPools(): Map<string, PoolData> {
  const map = new Map<string, PoolData>()
  try {
    const stored = sessionStorage.getItem(POOL_STORAGE_KEY)
    if (stored) {
      const entries = JSON.parse(stored) as [string, PoolData][]
      for (const [k, v] of entries) map.set(k, v)
    }
  } catch { /* ignore */ }
  return map
}

function persistPool(key: string, data: PoolData, cache: Map<string, PoolData>): void {
  cache.set(key, data)
  try {
    sessionStorage.setItem(POOL_STORAGE_KEY, JSON.stringify([...cache.entries()]))
  } catch { /* storage full */ }
}

// If a fetch returns an error result, use last good data instead (marked stale)
// NEVER returns $0 if we ever had a successful fetch (in-memory or sessionStorage)
function useLastGood(fresh: PoolData, key: string, cache: React.RefObject<Map<string, PoolData>>): PoolData {
  if (!fresh.error) {
    persistPool(key, fresh, cache.current)
    return fresh
  }
  const prev = cache.current.get(key)
  if (prev) {
    return { ...prev, stale: true, lastUpdated: Date.now(), error: fresh.error }
  }
  return fresh // first load failed — no cached data anywhere
}

export function usePoolData() {
  const [groups, setGroups] = useState<PoolGroup[]>([])
  const [poolPerformances, setPoolPerformances] = useState<PoolPerformance[]>([])
  const [wallets, setWallets] = useState<AllWallets>({ sui: null, aptos: null })
  const [loading, setLoading] = useState(true)
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000)
  const poolCache = useRef(loadPersistedPools())

  const refresh = useCallback(async () => {
    setLoading(true)
    // Phase 1: Sui fetches + bot states in parallel (no rate limit issues)
    const [
      deepRaw, walRaw, ikaRaw, suiUsdcRaw,
      turbosState, walState, ikaState, suiUsdcState, thalaState,
    ] = await Promise.all([
      fetchSuiPoolData().catch((e: Error) => ({ error: String(e) }) as unknown as PoolData),
      fetchWalPoolData().catch((e: Error) => ({ error: String(e) }) as unknown as PoolData),
      fetchIkaPoolData().catch((e: Error) => ({ error: String(e) }) as unknown as PoolData),
      fetchSuiUsdcPoolData().catch((e: Error) => ({ error: String(e) }) as unknown as PoolData),
      fetchTurbosBotState(),
      fetchWalBotState(),
      fetchIkaBotState(),
      fetchSuiUsdcBotState(),
      fetchThalaBotState(),
    ])

    // Phase 1b: Aptos fetch
    const aptosRaw = await fetchAptosPoolData().catch((e: Error) => ({ error: String(e) }) as unknown as PoolData)

    // Use last good data when fetches fail (never show $0 after first success)
    const deep = useLastGood(deepRaw, 'deep', poolCache)
    const wal = useLastGood(walRaw, 'wal', poolCache)
    const ika = useLastGood(ikaRaw, 'ika', poolCache)
    const suiUsdc = useLastGood(suiUsdcRaw, 'suiUsdc', poolCache)
    const aptos = useLastGood(aptosRaw, 'aptos', poolCache)

    // Phase 2: Build price map from pool data for wallet valuation
    const suiUsdPrice = await fetchSuiUsdPrice()
    const turbosPrice = await fetchTurbosUsdPrice(suiUsdPrice)
    const deepPrice = deep.currentPrice > 0 ? deep.currentPrice : 0.02
    const walPrice = wal.currentPrice || 0
    const ikaPrice = ika.currentPrice || 0
    const aptPrice = aptos.currentPrice || 0.96

    const priceMap: Record<string, number> = {
      'SUI': suiUsdPrice,
      'USDC': 1,
      'DEEP': deepPrice,
      'WAL': walPrice,
      'IKA': ikaPrice,
      'TURBOS': turbosPrice,
      'APT': aptPrice,
      'thAPT': aptPrice, // thAPT ≈ APT price
      'AptosCoin': aptPrice, // legacy symbol
    }

    // Fetch wallets in parallel
    const [suiWallet, aptosWallet] = await Promise.all([
      fetchSuiWalletDynamic(priceMap).catch(() => null),
      fetchAptosWalletDynamic(priceMap).catch(() => null),
    ])

    // Helper: enrich pool with bot state, APR, and harvest data
    function enrichPool(
      pool: PoolData,
      state: BotState | null,
      botStart: string,
    ) {
      if (state) pool.botState = state
      // Use on-chain position creation time when bot state is unavailable
      const fallback = pool.positionOpenedAt || botStart
      const lastCollectAt = getLastCollectAt(state, fallback)
      pool.feesApr = calcProjectedApr(pool.pendingFeesUsd, pool.positionValueUsd, lastCollectAt)
      pool.rewardsApr = calcProjectedApr(pool.pendingRewardsUsd, pool.positionValueUsd, lastCollectAt)

      // Harvest data: exclusively from bot state
      const harvest = calcHarvestFromBotState(state, priceMap)
      pool.harvestedUsd = harvest.harvestedUsd
      pool.harvestDetails = harvest.harvestDetails
    }

    // Enrich all pools with cumulative APR and harvest data (bot state only)
    enrichPool(deep, turbosState, SUI_BOT_START)
    enrichPool(wal, walState, WAL_BOT_START)
    enrichPool(ika, ikaState, IKA_BOT_START)
    enrichPool(suiUsdc, suiUsdcState, SUI_USDC_BOT_START)
    enrichPool(aptos, thalaState, APT_BOT_START)

    // Build groups
    const turbosGroup: PoolGroup = {
      protocol: 'Turbos Finance',
      chain: 'sui',
      chainColor: '#4da2ff',
      walletBalance: suiWallet,
      pools: [deep, wal, ika, suiUsdc],
    }

    const thalaGroup: PoolGroup = {
      protocol: 'Thala Finance',
      chain: 'aptos',
      chainColor: '#2ed8a3',
      walletBalance: aptosWallet,
      pools: [aptos],
    }

    setWallets({ sui: suiWallet, aptos: aptosWallet })
    setGroups([turbosGroup, thalaGroup])

    // Calculate performance per pool
    const performances: PoolPerformance[] = []

    // DEEP/USDC: price is USDC per DEEP, fees in DEEP + USDC
    performances.push(calcPoolPerformance(
      deep.name, deep.currentPrice, deep.positionValueUsd,
      deep.pendingFeesUsd, deep.pendingRewardsUsd,
      turbosState?.totalFeesCollectedA || 0, turbosState?.totalFeesCollectedB || 0,
      deep.currentPrice, turbosState?.totalRebalances || 0,
      deep.harvestedUsd,
    ))

    // WAL/USDC
    performances.push(calcPoolPerformance(
      wal.name, wal.currentPrice, wal.positionValueUsd,
      wal.pendingFeesUsd, wal.pendingRewardsUsd,
      walState?.totalFeesCollectedA || 0, walState?.totalFeesCollectedB || 0,
      wal.currentPrice, walState?.totalRebalances || 0,
      wal.harvestedUsd,
    ))

    // IKA/USDC
    const ikaStartPrice = START_PRICES['IKA / USDC']
    if (ikaStartPrice.price === 0 && ika.currentPrice > 0) {
      ikaStartPrice.price = ika.currentPrice
    }
    performances.push(calcPoolPerformance(
      ika.name, ika.currentPrice, ika.positionValueUsd,
      ika.pendingFeesUsd, ika.pendingRewardsUsd,
      ikaState?.totalFeesCollectedA || 0, ikaState?.totalFeesCollectedB || 0,
      ika.currentPrice, ikaState?.totalRebalances || 0,
      ika.harvestedUsd,
    ))

    // SUI/USDC
    const suiUsdcStartPrice = START_PRICES['SUI / USDC']
    if (suiUsdcStartPrice.price === 0 && suiUsdc.currentPrice > 0) {
      suiUsdcStartPrice.price = suiUsdc.currentPrice
    }
    performances.push(calcPoolPerformance(
      suiUsdc.name, suiUsdc.currentPrice, suiUsdc.positionValueUsd,
      suiUsdc.pendingFeesUsd, suiUsdc.pendingRewardsUsd,
      suiUsdcState?.totalFeesCollectedA || 0, suiUsdcState?.totalFeesCollectedB || 0,
      suiUsdc.currentPrice, suiUsdcState?.totalRebalances || 0,
      suiUsdc.harvestedUsd,
    ))

    // APT/USDC
    performances.push(calcPoolPerformance(
      aptos.name, aptos.currentPrice, aptos.positionValueUsd,
      aptos.pendingFeesUsd, aptos.pendingRewardsUsd,
      thalaState?.totalFeesCollectedA || 0, thalaState?.totalFeesCollectedB || 0,
      aptos.currentPrice, thalaState?.totalRebalances || 0,
      aptos.harvestedUsd,
    ))

    // ELON/USDC — closed position, capital migrated to APT/USDC
    performances.push({
      poolName: 'ELON / USDC',
      initialInvestment: 0,
      startPrice: 0.091,
      currentPrice: 0,
      hodlValueUsd: 0,
      lpValueUsd: 0,
      outperformanceUsd: 0,
      outperformancePct: 0,
      totalFeesEarnedUsd: 0,
      totalHarvestedUsd: 2.41, // historical harvest before migration
      totalRebalances: 0,
      netProfitUsd: 2.41, // harvested - invested (0)
      netProfitPct: 0,
      daysRunning: Math.max(1, (Date.now() - new Date(ELON_BOT_START).getTime()) / (1000 * 60 * 60 * 24)),
      realizedApr: 0,
      status: 'Closed — migrated',
    })

    setPoolPerformances(performances)
    setLoading(false)
    setCountdown(REFRESH_INTERVAL / 1000)
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, REFRESH_INTERVAL)
    return () => clearInterval(interval)
  }, [refresh])

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown(prev => (prev > 0 ? prev - 1 : REFRESH_INTERVAL / 1000))
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // Flatten pools for totals
  const allPools = groups.flatMap(g => g.pools)
  const totalPositionUsd = allPools.reduce((sum, p) => sum + p.positionValueUsd, 0)
  const totalIdleUsd = groups.reduce((sum, g) => sum + (g.walletBalance?.totalIdleUsd || 0), 0)
  const totalHarvestedUsd = allPools.reduce((sum, p) => sum + (p.harvestedUsd || 0), 0)
  const totalValueUsd = totalPositionUsd + totalIdleUsd
  const totalFeesUsd = allPools.reduce((sum, p) => sum + p.pendingFeesUsd, 0)
  const totalRewardsUsd = allPools.reduce((sum, p) => sum + p.pendingRewardsUsd, 0)

  // P&L includes harvested amounts (already sent to personal wallets)
  const pnlUsd = totalValueUsd + totalFeesUsd + totalRewardsUsd + totalHarvestedUsd - INITIAL_CAPITAL
  const pnlPct = INITIAL_CAPITAL > 0 ? (pnlUsd / INITIAL_CAPITAL) * 100 : 0

  // Uptime
  const deepUptime = formatUptime(SUI_BOT_START)
  const walUptime = formatUptime(WAL_BOT_START)
  const ikaUptime = formatUptime(IKA_BOT_START)
  const suiUsdcUptime = formatUptime(SUI_USDC_BOT_START)
  const aptosUptime = formatUptime(APT_BOT_START)
  const elonUptime = 'Closed'

  // Aggregate performance
  const totalNetProfit = poolPerformances.reduce((sum, p) => sum + p.netProfitUsd, 0)
  const totalFeesEarned = poolPerformances.reduce((sum, p) => sum + p.totalFeesEarnedUsd, 0)
  const totalHarvested = poolPerformances.reduce((sum, p) => sum + p.totalHarvestedUsd, 0)
  const totalHodlValue = poolPerformances.reduce((sum, p) => sum + p.hodlValueUsd, 0)
  const totalLpValue = poolPerformances.reduce((sum, p) => sum + p.lpValueUsd, 0)
  const totalRebalances = poolPerformances.reduce((sum, p) => sum + p.totalRebalances, 0)

  return {
    groups,
    poolPerformances,
    wallets,
    loading,
    countdown,
    refresh,
    totalPositionUsd,
    totalIdleUsd,
    totalValueUsd,
    totalFeesUsd,
    totalRewardsUsd,
    totalHarvestedUsd,
    pnlUsd,
    pnlPct,
    deepUptime,
    walUptime,
    ikaUptime,
    suiUsdcUptime,
    aptosUptime,
    elonUptime,
    initialCapital: INITIAL_CAPITAL,
    totalNetProfit,
    totalFeesEarned,
    totalHarvested,
    totalHodlValue,
    totalLpValue,
    totalRebalances,
  }
}
