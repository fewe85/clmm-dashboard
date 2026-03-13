import { useState, useEffect, useCallback, useRef } from 'react'
import type { PoolData, PoolGroup, PoolPerformance, WalletBalance, BotState } from '../types'
import { fetchSuiPoolData, fetchSuiWalletBalance, fetchSuiUsdPrice } from '../services/sui'
import { fetchWalPoolData } from '../services/wal'
import { fetchSuiTurbosPoolData } from '../services/suiTurbos'
import { fetchAptosPoolData, fetchAptosWalletRaw } from '../services/aptos'
import { fetchElonPoolData, fetchElonWalletRaw } from '../services/elon'
import { fetchTurbosBotState, fetchThalaBotState, fetchElonBotState, fetchWalBotState, fetchSuiTurbosBotState } from '../services/botState'

const REFRESH_INTERVAL = 120_000 // 2 min — avoids Aptos RPC rate limits

const INITIAL_CAPITAL = 210 // $50 DEEP + $50 WAL + $10 SUI/TURBOS + $50 APT + $50 ELON
const SUI_BOT_START = '2026-03-07T00:00:00.000Z'
const WAL_BOT_START = '2026-03-12T00:00:00.000Z'
const SUI_TURBOS_BOT_START = '2026-03-12T00:00:00.000Z'
const APT_BOT_START = '2026-03-10T00:00:00.000Z'
const ELON_BOT_START = '2026-03-11T00:00:00.000Z'

// Start prices (hardcoded from deployment dates)
const START_PRICES: Record<string, { price: number; investment: number; start: string }> = {
  'DEEP / USDC':    { price: 0.0277, investment: 50, start: SUI_BOT_START },
  'WAL / USDC':     { price: 0.079,  investment: 50, start: WAL_BOT_START },
  'SUI / TURBOS':   { price: 0,      investment: 10, start: SUI_TURBOS_BOT_START }, // from state.json
  'APT / USDC':     { price: 0.992,  investment: 50, start: APT_BOT_START },
  'ELON / USDC':    { price: 0.091,  investment: 50, start: ELON_BOT_START },
}

// Projected APR from pending fees accrued since last on-chain collect.
// This matches DEX UI APR: current fee rate annualized, not diluted lifetime average.
function calcProjectedApr(
  pendingUsd: number,
  positionValueUsd: number,
  lastCollectAt: string | null,
): number {
  if (positionValueUsd <= 0 || !lastCollectAt) return 0
  const hoursSinceCollect = (Date.now() - new Date(lastCollectAt).getTime()) / (1000 * 60 * 60)
  if (hoursSinceCollect < 0.5) return 0 // avoid extreme APR from very short periods
  return (pendingUsd / positionValueUsd) * (365 * 24 / hoursSinceCollect) * 100
}

// Get the most recent fee-collection timestamp (rebalance or compound)
function getLastCollectAt(state: BotState | null, fallback: string): string {
  if (!state) return fallback
  const candidates = [state.lastRebalanceAt, state.lastCompoundAt].filter(Boolean) as string[]
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
  const hodlB = halfUsd // USDC stays at $1 (or SUI for SUI/TURBOS)
  return hodlA + hodlB
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
): PoolPerformance {
  const meta = START_PRICES[poolName] || { price: currentPrice, investment: 50, start: SUI_BOT_START }
  const startPrice = meta.price > 0 ? meta.price : currentPrice
  const investment = meta.investment

  // For SUI/TURBOS: price is TURBOS/SUI, not USD-denominated directly
  // But positionValueUsd is already in USD, so we use that
  const hodlValue = calcHodlValue(startPrice, currentPrice, investment)
  const lpValue = positionValueUsd + pendingFeesUsd + pendingRewardsUsd

  // Total fees earned = collected (compounded back) + pending
  const collectedFeesUsd = collectedFeesA * priceA + collectedFeesB
  const totalFeesEarned = collectedFeesUsd + pendingFeesUsd + pendingRewardsUsd

  const netProfit = lpValue - investment
  const daysRunning = Math.max(1, (Date.now() - new Date(meta.start).getTime()) / (1000 * 60 * 60 * 24))
  const realizedApr = investment > 0 ? (netProfit / investment) * (365 / daysRunning) * 100 : 0

  return {
    poolName,
    initialInvestment: investment,
    startPrice,
    currentPrice,
    hodlValueUsd: hodlValue,
    lpValueUsd: lpValue,
    outperformanceUsd: lpValue - hodlValue,
    outperformancePct: hodlValue > 0 ? ((lpValue - hodlValue) / hodlValue) * 100 : 0,
    totalFeesEarnedUsd: totalFeesEarned,
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
  const [loading, setLoading] = useState(true)
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000)
  const poolCache = useRef(loadPersistedPools())

  const refresh = useCallback(async () => {
    setLoading(true)
    // Phase 1: Sui fetches + bot states in parallel (no rate limit issues)
    const [
      deepRaw, wal, suiTurbos,
      turbosState, walState, suiTurbosState, thalaState, elonState,
    ] = await Promise.all([
      fetchSuiPoolData().catch((e: Error) => ({ error: String(e) }) as unknown as PoolData),
      fetchWalPoolData().catch(() => null),
      fetchSuiTurbosPoolData().catch(() => null),
      fetchTurbosBotState(),
      fetchWalBotState(),
      fetchSuiTurbosBotState(),
      fetchThalaBotState(),
      fetchElonBotState(),
    ])

    // Phase 1b: Aptos fetches SEQUENCED to avoid rate-limit burst
    // APT pool first, then ELON (which reuses APT pool cache for thAPT price)
    const aptosRaw = await fetchAptosPoolData().catch((e: Error) => ({ error: String(e) }) as unknown as PoolData)
    const elonRaw = await fetchElonPoolData().catch((e: Error) => ({ error: String(e) }) as unknown as PoolData)
    const [aptosWallet, elonWallet] = await Promise.all([
      fetchAptosWalletRaw().catch(() => ({ apt: 0, usdc: 0 })),
      fetchElonWalletRaw().catch(() => ({ elon: 0 })),
    ])

    // Use last good data when fetches fail
    const deep = useLastGood(deepRaw, 'deep', poolCache)
    const aptos = useLastGood(aptosRaw, 'aptos', poolCache)
    const elon = useLastGood(elonRaw, 'elon', poolCache)

    // Phase 2: Sui wallet needs DEEP price + SUI/USD price
    const deepPrice = deep.currentPrice > 0 ? deep.currentPrice : 0.02
    const suiUsdPrice = await fetchSuiUsdPrice()
    const suiWallet = await fetchSuiWalletBalance(deepPrice, suiUsdPrice).catch(() => null)

    // Helper: enrich pool with bot state and projected APR
    function enrichPool(
      pool: PoolData,
      state: BotState | null,
      botStart: string,
      _priceA: number,
    ) {
      if (state) pool.botState = state
      const lastCollectAt = getLastCollectAt(state, botStart)
      pool.feesApr = calcProjectedApr(pool.pendingFeesUsd, pool.positionValueUsd, lastCollectAt)
      pool.rewardsApr = calcProjectedApr(pool.pendingRewardsUsd, pool.positionValueUsd, lastCollectAt)
    }

    // Enrich all pools with cumulative APR over entire bot runtime
    enrichPool(deep, turbosState, SUI_BOT_START, deep.currentPrice)
    if (wal) enrichPool(wal, walState, WAL_BOT_START, wal.currentPrice)
    if (suiTurbos) enrichPool(suiTurbos, suiTurbosState, SUI_TURBOS_BOT_START, suiTurbos.currentPrice)
    enrichPool(aptos, thalaState, APT_BOT_START, aptos.currentPrice)
    enrichPool(elon, elonState, ELON_BOT_START, elon.currentPrice)

    // Build Thala shared wallet
    const aptPrice = aptos.currentPrice || 7.5
    const elonPrice = elon.currentPrice || 0.09
    const thalaWallet: WalletBalance = {
      gasToken: 'APT',
      gasBalance: aptosWallet.apt,
      gasValueUsd: aptosWallet.apt * aptPrice,
      idleBalances: [
        { token: 'USDC', amount: aptosWallet.usdc, valueUsd: aptosWallet.usdc },
        { token: 'ELON', amount: elonWallet.elon, valueUsd: elonWallet.elon * elonPrice },
      ],
      totalIdleUsd: aptosWallet.usdc + elonWallet.elon * elonPrice,
    }

    // Build Turbos pools array (DEEP + WAL + SUI/TURBOS)
    const turbosPools = [deep]
    if (wal) turbosPools.push(wal)
    if (suiTurbos) turbosPools.push(suiTurbos)

    // Build groups
    const turbosGroup: PoolGroup = {
      protocol: 'Turbos Finance',
      chain: 'sui',
      chainColor: '#4da2ff',
      walletBalance: suiWallet,
      pools: turbosPools,
    }

    const thalaGroup: PoolGroup = {
      protocol: 'Thala Finance',
      chain: 'aptos',
      chainColor: '#2ed8a3',
      walletBalance: thalaWallet,
      pools: [aptos, elon],
    }

    setGroups([turbosGroup, thalaGroup])

    // Calculate performance per pool
    const performances: PoolPerformance[] = []

    // DEEP/USDC: price is USDC per DEEP, fees in DEEP + USDC
    performances.push(calcPoolPerformance(
      deep.name, deep.currentPrice, deep.positionValueUsd,
      deep.pendingFeesUsd, deep.pendingRewardsUsd,
      turbosState?.totalFeesCollectedA || 0, turbosState?.totalFeesCollectedB || 0,
      deep.currentPrice, turbosState?.totalRebalances || 0,
    ))

    // WAL/USDC
    if (wal) {
      performances.push(calcPoolPerformance(
        wal.name, wal.currentPrice, wal.positionValueUsd,
        wal.pendingFeesUsd, wal.pendingRewardsUsd,
        walState?.totalFeesCollectedA || 0, walState?.totalFeesCollectedB || 0,
        wal.currentPrice, walState?.totalRebalances || 0,
      ))
    }

    // SUI/TURBOS: price is SUI per TURBOS, but we need USD prices
    // For HODL calc, use priceCenter from state.json as start price
    if (suiTurbos) {
      // SUI/TURBOS start price comes from state.json priceCenter
      const suiTurbosStartPrice = START_PRICES['SUI / TURBOS']
      if (suiTurbosStartPrice.price === 0 && suiTurbos.currentPrice > 0) {
        suiTurbosStartPrice.price = suiTurbos.currentPrice // use current as fallback
      }
      performances.push(calcPoolPerformance(
        suiTurbos.name, suiTurbos.currentPrice, suiTurbos.positionValueUsd,
        suiTurbos.pendingFeesUsd, suiTurbos.pendingRewardsUsd,
        suiTurbosState?.totalFeesCollectedA || 0, suiTurbosState?.totalFeesCollectedB || 0,
        suiTurbos.currentPrice, // TURBOS price in USD? Actually it's SUI per TURBOS
        suiTurbosState?.totalRebalances || 0,
      ))
    }

    // APT/USDC
    performances.push(calcPoolPerformance(
      aptos.name, aptos.currentPrice, aptos.positionValueUsd,
      aptos.pendingFeesUsd, aptos.pendingRewardsUsd,
      thalaState?.totalFeesCollectedA || 0, thalaState?.totalFeesCollectedB || 0,
      aptos.currentPrice, thalaState?.totalRebalances || 0,
    ))

    // ELON/USDC
    performances.push(calcPoolPerformance(
      elon.name, elon.currentPrice, elon.positionValueUsd,
      elon.pendingFeesUsd, elon.pendingRewardsUsd,
      elonState?.totalFeesCollectedA || 0, elonState?.totalFeesCollectedB || 0,
      elon.currentPrice, elonState?.totalRebalances || 0,
    ))

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
  const totalValueUsd = totalPositionUsd + totalIdleUsd
  const totalFeesUsd = allPools.reduce((sum, p) => sum + p.pendingFeesUsd, 0)
  const totalRewardsUsd = allPools.reduce((sum, p) => sum + p.pendingRewardsUsd, 0)

  // P&L
  const pnlUsd = totalValueUsd + totalFeesUsd + totalRewardsUsd - INITIAL_CAPITAL
  const pnlPct = INITIAL_CAPITAL > 0 ? (pnlUsd / INITIAL_CAPITAL) * 100 : 0

  // Uptime
  const deepUptime = formatUptime(SUI_BOT_START)
  const walUptime = formatUptime(WAL_BOT_START)
  const suiTurbosUptime = formatUptime(SUI_TURBOS_BOT_START)
  const aptosUptime = formatUptime(APT_BOT_START)
  const elonUptime = formatUptime(ELON_BOT_START)

  // Aggregate performance
  const totalNetProfit = poolPerformances.reduce((sum, p) => sum + p.netProfitUsd, 0)
  const totalFeesEarned = poolPerformances.reduce((sum, p) => sum + p.totalFeesEarnedUsd, 0)
  const totalHodlValue = poolPerformances.reduce((sum, p) => sum + p.hodlValueUsd, 0)
  const totalLpValue = poolPerformances.reduce((sum, p) => sum + p.lpValueUsd, 0)
  const totalRebalances = poolPerformances.reduce((sum, p) => sum + p.totalRebalances, 0)

  return {
    groups,
    poolPerformances,
    loading,
    countdown,
    refresh,
    totalPositionUsd,
    totalIdleUsd,
    totalValueUsd,
    totalFeesUsd,
    totalRewardsUsd,
    pnlUsd,
    pnlPct,
    deepUptime,
    walUptime,
    suiTurbosUptime,
    aptosUptime,
    elonUptime,
    initialCapital: INITIAL_CAPITAL,
    totalNetProfit,
    totalFeesEarned,
    totalHodlValue,
    totalLpValue,
    totalRebalances,
  }
}
