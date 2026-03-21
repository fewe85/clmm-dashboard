import { useState, useEffect, useCallback, useRef } from 'react'
import type { PoolData, BotState, WalletBalance, HarvestEntry, RebalanceMetric } from '../types'
import { fetchAptosPoolData } from '../services/aptos'
import { fetchElonPoolData } from '../services/aptosElon'
import { fetchThalaBotState, fetchElonBotState, fetchRebalanceMetrics, fetchElonRebalanceMetrics } from '../services/botState'
import { fetchBotWallet, fetchPetraWallet } from '../services/wallet'
import {
  APT_INVESTED, APT_BOT_START, ELON_INVESTED, ELON_BOT_START,
  INITIAL_CAPITAL, REFRESH_INTERVAL,
} from '../config'

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
  data.feesApr = calcProjectedApr(data.pendingFeesUsd, data.positionValueUsd, lastCollectAt)
  data.rewardsApr = calcProjectedApr(data.pendingRewardsUsd, data.positionValueUsd, lastCollectAt)
  data.lastCollectAt = lastCollectAt

  const harvest = calcHarvestFromBotState(botState, priceMap)
  data.harvestedUsd = harvest.harvestedUsd
  data.harvestDetails = harvest.harvestDetails
  data.invested = invested
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
  if (pool?.lastCollectAt && (pendingFees + pendingRewards) > 0) {
    const hoursSince = (Date.now() - new Date(pool.lastCollectAt).getTime()) / (1000 * 60 * 60)
    if (hoursSince >= 0.5) {
      dailyEst = ((pendingFees + pendingRewards) / hoursSince) * 24
    }
  }

  const harvestRate7d = totalHarvested > 0 ? totalHarvested / Math.min(daysRunning, 7) : 0
  const totalRebalances = pool?.botState?.totalRebalances ?? 0
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
  const apt: PoolMetrics = {
    pool: aptPool,
    metrics: aptMetrics,
    ...derivePoolMetrics(aptPool, aptMetrics, APT_INVESTED, APT_BOT_START),
  }

  const elon: PoolMetrics = {
    pool: elonPool,
    metrics: elonMetrics,
    ...derivePoolMetrics(elonPool, elonMetrics, ELON_INVESTED, ELON_BOT_START),
  }

  // Portfolio totals
  const totalPositionValue = apt.positionValue + elon.positionValue
  const totalPendingFees = apt.pendingFees + elon.pendingFees
  const totalPendingRewards = apt.pendingRewards + elon.pendingRewards
  const totalHarvested = apt.totalHarvested + elon.totalHarvested
  const totalNetProfit = apt.netProfit + elon.netProfit
  const totalNetProfitPct = INITIAL_CAPITAL > 0 ? (totalNetProfit / INITIAL_CAPITAL) * 100 : 0
  const totalDailyEst = apt.dailyEst + elon.dailyEst
  const maxDaysRunning = Math.max(apt.daysRunning, elon.daysRunning)
  const totalRealizedApr = INITIAL_CAPITAL > 0 ? (totalNetProfit / INITIAL_CAPITAL) * (365 / maxDaysRunning) * 100 : 0

  return {
    apt,
    elon,
    botWallet,
    petraWallet,
    loading,
    countdown,
    refresh,
    // Portfolio totals
    totalPositionValue,
    totalPendingFees,
    totalPendingRewards,
    totalHarvested,
    totalNetProfit,
    totalNetProfitPct,
    totalDailyEst,
    totalRealizedApr,
    maxDaysRunning,
  }
}
