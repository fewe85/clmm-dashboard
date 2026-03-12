import { useState, useEffect, useCallback } from 'react'
import type { PoolGroup, PoolPerformance, WalletBalance } from '../types'
import { fetchSuiPoolData, fetchSuiWalletBalance } from '../services/sui'
import { fetchWalPoolData } from '../services/wal'
import { fetchSuiTurbosPoolData } from '../services/suiTurbos'
import { fetchAptosPoolData, fetchAptosWalletRaw } from '../services/aptos'
import { fetchElonPoolData, fetchElonWalletRaw } from '../services/elon'
import { fetchTurbosBotState, fetchThalaBotState, fetchElonBotState, fetchWalBotState, fetchSuiTurbosBotState } from '../services/botState'

const REFRESH_INTERVAL = 60_000

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

function calcApr(pendingUsd: number, positionValueUsd: number, lastActionAt: string | null): number {
  if (!lastActionAt || positionValueUsd <= 0) return 0
  const hoursElapsed = (Date.now() - new Date(lastActionAt).getTime()) / (1000 * 60 * 60)
  if (hoursElapsed <= 0) return 0
  return (pendingUsd / positionValueUsd) * (365 * 24 / hoursElapsed) * 100
}

function latestAction(...dates: (string | null | undefined)[]): string | null {
  let best: string | null = null
  for (const d of dates) {
    if (!d) continue
    if (!best || new Date(d).getTime() > new Date(best).getTime()) best = d
  }
  return best
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

export function usePoolData() {
  const [groups, setGroups] = useState<PoolGroup[]>([])
  const [poolPerformances, setPoolPerformances] = useState<PoolPerformance[]>([])
  const [loading, setLoading] = useState(true)
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000)

  const refresh = useCallback(async () => {
    setLoading(true)
    // Phase 1: fetch all pool data + bot states + wallets in parallel
    const [
      deep, wal, suiTurbos, aptos, elon,
      turbosState, walState, suiTurbosState, thalaState, elonState,
      aptosWallet, elonWallet,
    ] = await Promise.all([
      fetchSuiPoolData(),
      fetchWalPoolData().catch(() => null),
      fetchSuiTurbosPoolData().catch(() => null),
      fetchAptosPoolData(),
      fetchElonPoolData(),
      fetchTurbosBotState(),
      fetchWalBotState(),
      fetchSuiTurbosBotState(),
      fetchThalaBotState(),
      fetchElonBotState(),
      fetchAptosWalletRaw().catch(() => ({ apt: 0, usdc: 0 })),
      fetchElonWalletRaw().catch(() => ({ elon: 0 })),
    ])

    // Phase 2: Sui wallet needs DEEP price
    const deepPrice = deep.currentPrice > 0 ? deep.currentPrice : 0.02
    const suiWallet = await fetchSuiWalletBalance(deepPrice).catch(() => null)

    // Enrich DEEP/USDC with bot state and APR
    if (turbosState) {
      deep.botState = turbosState
      const lastAction = latestAction(turbosState.lastCompoundAt, turbosState.lastRebalanceAt) || SUI_BOT_START
      deep.feesApr = calcApr(deep.pendingFeesUsd, deep.positionValueUsd, lastAction)
      deep.rewardsApr = calcApr(deep.pendingRewardsUsd, deep.positionValueUsd, lastAction)
    } else {
      deep.feesApr = calcApr(deep.pendingFeesUsd, deep.positionValueUsd, SUI_BOT_START)
      deep.rewardsApr = calcApr(deep.pendingRewardsUsd, deep.positionValueUsd, SUI_BOT_START)
    }

    // Enrich WAL/USDC
    if (wal) {
      if (walState) {
        wal.botState = walState
        const lastAction = latestAction(walState.lastCompoundAt, walState.lastRebalanceAt) || WAL_BOT_START
        wal.feesApr = calcApr(wal.pendingFeesUsd, wal.positionValueUsd, lastAction)
        wal.rewardsApr = calcApr(wal.pendingRewardsUsd, wal.positionValueUsd, lastAction)
      } else {
        wal.feesApr = calcApr(wal.pendingFeesUsd, wal.positionValueUsd, WAL_BOT_START)
        wal.rewardsApr = calcApr(wal.pendingRewardsUsd, wal.positionValueUsd, WAL_BOT_START)
      }
    }

    // Enrich SUI/TURBOS
    if (suiTurbos) {
      if (suiTurbosState) {
        suiTurbos.botState = suiTurbosState
        const lastAction = latestAction(suiTurbosState.lastCompoundAt, suiTurbosState.lastRebalanceAt) || SUI_TURBOS_BOT_START
        suiTurbos.feesApr = calcApr(suiTurbos.pendingFeesUsd, suiTurbos.positionValueUsd, lastAction)
        suiTurbos.rewardsApr = calcApr(suiTurbos.pendingRewardsUsd, suiTurbos.positionValueUsd, lastAction)
      } else {
        suiTurbos.feesApr = calcApr(suiTurbos.pendingFeesUsd, suiTurbos.positionValueUsd, SUI_TURBOS_BOT_START)
        suiTurbos.rewardsApr = calcApr(suiTurbos.pendingRewardsUsd, suiTurbos.positionValueUsd, SUI_TURBOS_BOT_START)
      }
    }

    // Enrich APT/USDC
    if (thalaState) {
      aptos.botState = thalaState
      const lastAction = latestAction(thalaState.lastCompoundAt, thalaState.lastRebalanceAt) || APT_BOT_START
      aptos.feesApr = calcApr(aptos.pendingFeesUsd, aptos.positionValueUsd, lastAction)
      aptos.rewardsApr = calcApr(aptos.pendingRewardsUsd, aptos.positionValueUsd, lastAction)
    } else {
      aptos.feesApr = calcApr(aptos.pendingFeesUsd, aptos.positionValueUsd, APT_BOT_START)
      aptos.rewardsApr = calcApr(aptos.pendingRewardsUsd, aptos.positionValueUsd, APT_BOT_START)
    }

    // Enrich ELON/USDC
    if (elonState) {
      elon.botState = elonState
      const lastAction = latestAction(elonState.lastCompoundAt, elonState.lastRebalanceAt) || ELON_BOT_START
      elon.feesApr = calcApr(elon.pendingFeesUsd, elon.positionValueUsd, lastAction)
      elon.rewardsApr = calcApr(elon.pendingRewardsUsd, elon.positionValueUsd, lastAction)
    } else {
      elon.feesApr = calcApr(elon.pendingFeesUsd, elon.positionValueUsd, ELON_BOT_START)
      elon.rewardsApr = calcApr(elon.pendingRewardsUsd, elon.positionValueUsd, ELON_BOT_START)
    }

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
