import { useState, useEffect, useCallback, useRef } from 'react'
import type { PoolData, BotState, WalletBalance, HarvestEntry, RebalanceMetric } from '../types'
import { fetchAptosPoolData } from '../services/aptos'
import { fetchElonPoolData } from '../services/aptosElon'
import { fetchThalaBotState, fetchElonBotState, fetchRebalanceMetrics, fetchElonRebalanceMetrics } from '../services/botState'
import { fetchBotWallet, fetchPetraWallet } from '../services/wallet'
import {
  APT_INVESTED, APT_BOT_START, ELON_INVESTED, ELON_BOT_START,
  REFRESH_INTERVAL,
} from '../config'

function calcRolling24hApr(
  snapshots: { t: string; feesUsd: number; rewardsUsd: number; posUsd?: number }[],
  currentPosUsd: number,
): { feesApr: number; rewardsApr: number } {
  if (snapshots.length < 2) return { feesApr: 0, rewardsApr: 0 }
  const oldest = snapshots[0]
  const newest = snapshots[snapshots.length - 1]
  const hoursSpan = (new Date(newest.t).getTime() - new Date(oldest.t).getTime()) / (1000 * 60 * 60)
  if (hoursSpan < 2) return { feesApr: 0, rewardsApr: 0 }
  // Time-weighted average position value across all snapshots
  const posValues = snapshots.map(s => s.posUsd ?? 0).filter(v => v > 0)
  const avgPosUsd = posValues.length > 0
    ? posValues.reduce((a, b) => a + b, 0) / posValues.length
    : currentPosUsd
  if (avgPosUsd <= 0) return { feesApr: 0, rewardsApr: 0 }
  const feesEarned = newest.feesUsd - oldest.feesUsd
  const rewardsEarned = newest.rewardsUsd - oldest.rewardsUsd
  return {
    feesApr: feesEarned > 0 ? (feesEarned / avgPosUsd) * (365 * 24 / hoursSpan) * 100 : 0,
    rewardsApr: rewardsEarned > 0 ? (rewardsEarned / avgPosUsd) * (365 * 24 / hoursSpan) * 100 : 0,
  }
}

function getLastCollectAt(state: BotState | null, fallback: string): string {
  if (!state) return fallback
  const candidates = [state.lastRebalanceAt, state.lastCompoundAt, state.lastHarvestAt, state.lastIdleDeployAt].filter(Boolean) as string[]
  if (candidates.length === 0) return fallback
  return candidates.reduce((latest, d) => new Date(d) > new Date(latest) ? d : latest)
}

function calcHarvestFromBotState(
  state: BotState | null,
  priceMap: Record<string, number>,
): { harvestedUsd: number; harvestDetails: HarvestEntry[] } {
  if (!state || state.harvestEntries.length === 0) {
    return { harvestedUsd: 0, harvestDetails: [] }
  }
  const baseline = state.harvestedBaseline || { feesUsdcAtReset: 0, feesTokenAtReset: 0, rewardsAtReset: 0 }
  const details: HarvestEntry[] = state.harvestEntries.map(e => {
    let baselineAmount = 0
    if (e.token === 'USDC') baselineAmount = baseline.feesUsdcAtReset
    else if (e.token === 'APT' || e.token === 'ELON') baselineAmount = baseline.feesTokenAtReset
    else if (e.token === 'thAPT') baselineAmount = baseline.rewardsAtReset
    const sinceReset = Math.max(0, e.amount - baselineAmount)
    return {
      token: e.token,
      amount: sinceReset,
      valueUsd: sinceReset * (priceMap[e.token] || 0),
    }
  })
  return {
    harvestedUsd: details.reduce((s, d) => s + d.valueUsd, 0),
    harvestDetails: details,
  }
}

export interface PoolMetrics {
  pool: PoolData | null
  metrics: RebalanceMetric[]
  positionValue: number
  pendingFees: number
  pendingRewards: number
  totalHarvested: number
  netProfit: number
  netProfitPct: number
  daysRunning: number
  realizedApr: number
  dailyEst: number
  harvestRate7d: number
  totalRebalances: number
  rebalances24h: number
  rebalances7d: number
  avgTimeBetweenRebalances: number
  rangeWidth: number
  ceMultiplier: number
  invested: number
  botStart: string
}

const APT_STORAGE_KEY = 'clmm_last_good_pool'
const ELON_STORAGE_KEY = 'clmm_last_good_elon'

function loadPersistedPool(key: string): PoolData | null {
  try {
    const stored = sessionStorage.getItem(key)
    if (stored) return JSON.parse(stored)
  } catch { /* ignore */ }
  return null
}

function persistPool(key: string, data: PoolData): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(data))
  } catch { /* storage full */ }
}

function enrichPoolData(
  rawData: PoolData,
  botState: BotState | null,
  invested: number,
  botStart: string,
  priceMap: Record<string, number>,
): PoolData {
  const data = { ...rawData }
  if (botState) data.botState = botState
  const fallback = data.positionOpenedAt || botStart
  const lastCollectAt = getLastCollectAt(botState, fallback)

  // Rolling 24h APR from earnings snapshots (newest - oldest, annualized)
  const snapshots = botState?.earningsSnapshots
  if (snapshots && snapshots.length >= 2) {
    const apr = calcRolling24hApr(snapshots, data.positionValueUsd)
    data.feesApr = apr.feesApr
    data.rewardsApr = apr.rewardsApr
  } else {
    data.feesApr = 0
    data.rewardsApr = 0
  }
  data.lastCollectAt = lastCollectAt

  const harvest = calcHarvestFromBotState(botState, priceMap)
  data.harvestedUsd = harvest.harvestedUsd
  data.harvestDetails = harvest.harvestDetails
  const effectiveInvested = invested + (botState?.externalDeposits ?? 0)
  data.invested = effectiveInvested
  const lpValue = data.positionValueUsd + data.pendingFeesUsd + data.pendingRewardsUsd
  data.netProfit = lpValue + data.harvestedUsd - invested
  return data
}

function derivePoolMetrics(pool: PoolData | null, metrics: RebalanceMetric[], invested: number, botStart: string): Omit<PoolMetrics, 'pool' | 'metrics'> {
  const positionValue = pool?.positionValueUsd ?? 0
  const pendingFees = pool?.pendingFeesUsd ?? 0
  const pendingRewards = pool?.pendingRewardsUsd ?? 0
  const totalHarvested = pool?.harvestedUsd ?? 0
  const netProfit = pool?.netProfit ?? 0
  const netProfitPct = invested > 0 ? (netProfit / invested) * 100 : 0
  const daysRunning = Math.max(1, (Date.now() - new Date(botStart).getTime()) / (1000 * 60 * 60 * 24))
  const realizedApr = invested > 0 ? (netProfit / invested) * (365 / daysRunning) * 100 : 0

  let dailyEst = 0
  const totalEarnings = totalHarvested + pendingFees + pendingRewards
  if (daysRunning >= 1 && totalEarnings > 0) {
    // Stable: total earnings over full run period
    dailyEst = totalEarnings / daysRunning
  } else if (pool?.lastCollectAt && (pendingFees + pendingRewards) > 0) {
    // Fallback for first day: project from current pending
    const hoursSince = (Date.now() - new Date(pool.lastCollectAt).getTime()) / (1000 * 60 * 60)
    if (hoursSince >= 0.5) {
      dailyEst = ((pendingFees + pendingRewards) / hoursSince) * 24
    }
  }

  // Harvest rate: extrapolate current earnings velocity to 24h
  // Uses pending fees+rewards accumulated since last harvest/rebalance
  let harvestRate7d = 0
  if (pool?.lastCollectAt && (pendingFees + pendingRewards) > 0) {
    const hoursSinceCollect = (Date.now() - new Date(pool.lastCollectAt).getTime()) / (1000 * 60 * 60)
    if (hoursSinceCollect >= 0.5) {
      harvestRate7d = ((pendingFees + pendingRewards) / hoursSinceCollect) * 24
    }
  }
  // Fallback: total earnings / days running
  if (harvestRate7d === 0 && totalHarvested > 0) {
    harvestRate7d = (totalHarvested + pendingFees + pendingRewards) / daysRunning
  }
  const totalRebalances = (pool?.botState?.totalRebalances ?? 0) - (pool?.botState?.rebalancesAtReset ?? 0)
  const now = Date.now()
  const rebalances24h = metrics.filter(m => now - new Date(m.timestamp).getTime() < 86400_000).length
  const rebalances7d = metrics.filter(m => now - new Date(m.timestamp).getTime() < 7 * 86400_000).length
  const avgTimeBetweenRebalances = totalRebalances > 1 ? daysRunning * 24 / totalRebalances : 0
  const rangeWidth = pool ? ((pool.priceUpper - pool.priceLower) / pool.currentPrice) * 100 : 0
  const ceMultiplier = rangeWidth > 0 ? 200 / rangeWidth : 0

  return {
    positionValue, pendingFees, pendingRewards, totalHarvested,
    netProfit, netProfitPct, daysRunning, realizedApr, dailyEst,
    harvestRate7d, totalRebalances, rebalances24h, rebalances7d,
    avgTimeBetweenRebalances, rangeWidth, ceMultiplier,
    invested, botStart,
  }
}

export function usePoolData() {
  const [aptPool, setAptPool] = useState<PoolData | null>(null)
  const [elonPool, setElonPool] = useState<PoolData | null>(null)
  const [aptMetrics, setAptMetrics] = useState<RebalanceMetric[]>([])
  const [elonMetrics, setElonMetrics] = useState<RebalanceMetric[]>([])
  const [botWallet, setBotWallet] = useState<WalletBalance | null>(null)
  const [petraWallet, setPetraWallet] = useState<WalletBalance | null>(null)
  const [priceChanges, setPriceChanges] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000)
  const lastGoodApt = useRef<PoolData | null>(loadPersistedPool(APT_STORAGE_KEY))
  const lastGoodElon = useRef<PoolData | null>(loadPersistedPool(ELON_STORAGE_KEY))

  const refresh = useCallback(async () => {
    setLoading(true)

    // Fetch bot states first — we need the positionNftId for ELON pool lookup
    // (staked NFTs can't be found via wallet/indexer queries)
    const [aptState, elonState, aptRebalanceMetrics, elonRebalanceMetrics] = await Promise.all([
      fetchThalaBotState(),
      fetchElonBotState(),
      fetchRebalanceMetrics(),
      fetchElonRebalanceMetrics(),
    ])

    const [aptRaw, elonRaw] = await Promise.all([
      fetchAptosPoolData().catch((e: Error) => ({ error: String(e) }) as unknown as PoolData),
      fetchElonPoolData(elonState?.positionNftId).catch((e: Error) => ({ error: String(e) }) as unknown as PoolData),
    ])

    // Handle APT pool errors
    let aptData: PoolData
    if (aptRaw.error) {
      aptData = lastGoodApt.current
        ? { ...lastGoodApt.current, stale: true, lastUpdated: Date.now(), error: aptRaw.error }
        : aptRaw
    } else {
      aptData = aptRaw
      lastGoodApt.current = aptData
      persistPool(APT_STORAGE_KEY, aptData)
    }

    // Handle ELON pool errors
    let elonData: PoolData
    if (elonRaw.error) {
      elonData = lastGoodElon.current
        ? { ...lastGoodElon.current, stale: true, lastUpdated: Date.now(), error: elonRaw.error }
        : elonRaw
    } else {
      elonData = elonRaw
      lastGoodElon.current = elonData
      persistPool(ELON_STORAGE_KEY, elonData)
    }

    // APT price from APT pool
    const aptPrice = aptData.currentPrice || 0.96
    const elonPrice = elonData.currentPrice || 0.12

    // Price maps
    const aptPriceMap: Record<string, number> = {
      'APT': aptPrice, 'USDC': 1, 'thAPT': aptPrice, 'sthAPT': aptPrice, 'AptosCoin': aptPrice,
    }
    const elonPriceMap: Record<string, number> = {
      'ELON': elonPrice, 'USDC': 1, 'thAPT': aptPrice, 'sthAPT': aptPrice,
    }

    // Enrich ELON pool rewards with APT price (thAPT ≈ APT)
    if (!elonData.error && elonData.rewardAmount > 0) {
      elonData.pendingRewardsUsd = elonData.rewardAmount * aptPrice
      elonData.compoundPending = elonData.pendingFeesUsd + elonData.pendingRewardsUsd
    }

    // Enrich both pools
    aptData = enrichPoolData(aptData, aptState, APT_INVESTED, APT_BOT_START, aptPriceMap)
    elonData = enrichPoolData(elonData, elonState, ELON_INVESTED, ELON_BOT_START, elonPriceMap)

    // Wallets — shared, use combined price map
    const combinedPrices: Record<string, number> = { ...aptPriceMap, ...elonPriceMap }
    const [bw, pw] = await Promise.all([
      fetchBotWallet(combinedPrices).catch(() => null),
      fetchPetraWallet(combinedPrices).catch(() => null),
    ])

    // Fetch 24h price changes from CoinGecko (best-effort)
    try {
      const cgRes = await fetch(
        'https://api.coingecko.com/api/v3/simple/price?ids=aptos,echelon-prime&vs_currencies=usd&include_24hr_change=true',
      )
      if (cgRes.ok) {
        const cgData = await cgRes.json()
        setPriceChanges({
          APT: cgData.aptos?.usd_24h_change ?? 0,
          ELON: cgData['echelon-prime']?.usd_24h_change ?? 0,
        })
      }
    } catch { /* CoinGecko unavailable — skip */ }

    setAptPool(aptData)
    setElonPool(elonData)
    setAptMetrics(aptRebalanceMetrics)
    setElonMetrics(elonRebalanceMetrics)
    setBotWallet(bw)
    setPetraWallet(pw)
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

  // Per-pool metrics
  const aptEffInvested = APT_INVESTED + (aptPool?.botState?.externalDeposits ?? 0)
  const elonEffInvested = ELON_INVESTED + (elonPool?.botState?.externalDeposits ?? 0)
  const aptStart = aptPool?.botState?.resetAt ?? APT_BOT_START
  const elonStart = elonPool?.botState?.resetAt ?? ELON_BOT_START

  const apt: PoolMetrics = {
    pool: aptPool,
    metrics: aptMetrics,
    ...derivePoolMetrics(aptPool, aptMetrics, aptEffInvested, aptStart),
  }

  const elon: PoolMetrics = {
    pool: elonPool,
    metrics: elonMetrics,
    ...derivePoolMetrics(elonPool, elonMetrics, elonEffInvested, elonStart),
  }

  // Portfolio totals
  const totalPositionValue = apt.positionValue + elon.positionValue
  const totalPendingFees = apt.pendingFees + elon.pendingFees
  const totalPendingRewards = apt.pendingRewards + elon.pendingRewards
  const totalHarvested = apt.totalHarvested + elon.totalHarvested
  const totalDailyEst = apt.dailyEst + elon.dailyEst
  const maxDaysRunning = Math.max(apt.daysRunning, elon.daysRunning)
  const totalEarned = totalPendingFees + totalPendingRewards + totalHarvested

  // CLMM vs HODL — mirrors PoolCard PnlSection + ClmmVsHodl logic exactly
  function calcPoolClmmVsHodl(pm: PoolMetrics, invested: number): number {
    const pool = pm.pool
    if (!pool || !pool.botState?.centerPrice || invested <= 0) return 0
    const tokenAPrice = pool.currentPrice || 0
    const cp = pool.botState.centerPrice
    const entryPrice = Math.abs(cp - tokenAPrice) < Math.abs(1 / cp - tokenAPrice) ? cp : 1 / cp
    if (entryPrice <= 0) return 0
    // Same as PoolCard: netPnl = positionChange + fees + rewards + harvested
    const positionValue = pool.amountA * tokenAPrice + pool.amountB
    const positionChange = positionValue - invested
    const feesUsd = pool.feesA * tokenAPrice + pool.feesB
    const netPnl = positionChange + feesUsd + pool.pendingRewardsUsd + pm.totalHarvested
    const hodlReturn = invested * (tokenAPrice / entryPrice) - invested
    return netPnl - hodlReturn
  }
  const aptClmmVsHodl = calcPoolClmmVsHodl(apt, APT_INVESTED)
  const elonClmmVsHodl = calcPoolClmmVsHodl(elon, ELON_INVESTED)
  const totalClmmVsHodl = aptClmmVsHodl + elonClmmVsHodl

  return {
    apt,
    elon,
    botWallet,
    petraWallet,
    loading,
    countdown,
    refresh,
    priceChanges,
    // Portfolio totals
    totalPositionValue,
    totalPendingFees,
    totalPendingRewards,
    totalHarvested,
    totalEarned,
    aptClmmVsHodl,
    elonClmmVsHodl,
    totalClmmVsHodl,
    totalDailyEst,
    maxDaysRunning,
  }
}
