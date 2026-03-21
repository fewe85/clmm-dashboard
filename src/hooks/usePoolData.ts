import { useState, useEffect, useCallback, useRef } from 'react'
import type { PoolData, BotState, WalletBalance, HarvestEntry, RebalanceMetric } from '../types'
import { fetchAptosPoolData } from '../services/aptos'
import { fetchThalaBotState, fetchRebalanceMetrics } from '../services/botState'
import { fetchBotWallet, fetchPetraWallet } from '../services/wallet'
import { INVESTED, BOT_START, REFRESH_INTERVAL } from '../config'

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

const POOL_STORAGE_KEY = 'clmm_last_good_pool'

function loadPersistedPool(): PoolData | null {
  try {
    const stored = sessionStorage.getItem(POOL_STORAGE_KEY)
    if (stored) return JSON.parse(stored)
  } catch { /* ignore */ }
  return null
}

function persistPool(data: PoolData): void {
  try {
    sessionStorage.setItem(POOL_STORAGE_KEY, JSON.stringify(data))
  } catch { /* storage full */ }
}

export function usePoolData() {
  const [pool, setPool] = useState<PoolData | null>(null)
  const [botWallet, setBotWallet] = useState<WalletBalance | null>(null)
  const [petraWallet, setPetraWallet] = useState<WalletBalance | null>(null)
  const [metrics, setMetrics] = useState<RebalanceMetric[]>([])
  const [loading, setLoading] = useState(true)
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000)
  const priceHistory = useRef<number[]>([])
  const lastGood = useRef<PoolData | null>(loadPersistedPool())

  const refresh = useCallback(async () => {
    setLoading(true)

    const [aptosRaw, thalaState, rebalanceMetrics] = await Promise.all([
      fetchAptosPoolData().catch((e: Error) => ({ error: String(e) }) as unknown as PoolData),
      fetchThalaBotState(),
      fetchRebalanceMetrics(),
    ])

    // Use last good data on error
    let data: PoolData
    if (aptosRaw.error) {
      if (lastGood.current) {
        data = { ...lastGood.current, stale: true, lastUpdated: Date.now(), error: aptosRaw.error }
      } else {
        data = aptosRaw
      }
    } else {
      data = aptosRaw
      lastGood.current = data
      persistPool(data)
    }

    // Enrich with bot state
    if (thalaState) data.botState = thalaState
    const fallback = data.positionOpenedAt || BOT_START
    const lastCollectAt = getLastCollectAt(thalaState, fallback)
    data.feesApr = calcProjectedApr(data.pendingFeesUsd, data.positionValueUsd, lastCollectAt)
    data.rewardsApr = calcProjectedApr(data.pendingRewardsUsd, data.positionValueUsd, lastCollectAt)
    data.lastCollectAt = lastCollectAt

    const aptPrice = data.currentPrice || 0.96
    const priceMap: Record<string, number> = {
      'APT': aptPrice,
      'USDC': 1,
      'thAPT': aptPrice,
      'sthAPT': aptPrice,
      'AptosCoin': aptPrice,
    }

    // Harvest data
    const harvest = calcHarvestFromBotState(thalaState, priceMap)
    data.harvestedUsd = harvest.harvestedUsd
    data.harvestDetails = harvest.harvestDetails

    // Invested + Net Profit
    data.invested = INVESTED
    const lpValue = data.positionValueUsd + data.pendingFeesUsd + data.pendingRewardsUsd
    data.netProfit = lpValue + data.harvestedUsd - INVESTED

    // Price history (max 50 points)
    if (data.currentPrice > 0) {
      priceHistory.current.push(data.currentPrice)
      if (priceHistory.current.length > 50) priceHistory.current.shift()
      data.priceHistory = [...priceHistory.current]
    }

    // Fetch wallets
    const [bw, pw] = await Promise.all([
      fetchBotWallet(priceMap).catch(() => null),
      fetchPetraWallet(priceMap).catch(() => null),
    ])

    setPool(data)
    setBotWallet(bw)
    setPetraWallet(pw)
    setMetrics(rebalanceMetrics)
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

  // Derived values
  const positionValue = pool?.positionValueUsd ?? 0
  const pendingFees = pool?.pendingFeesUsd ?? 0
  const pendingRewards = pool?.pendingRewardsUsd ?? 0
  const totalHarvested = pool?.harvestedUsd ?? 0
  const netProfit = pool?.netProfit ?? 0
  const netProfitPct = INVESTED > 0 ? (netProfit / INVESTED) * 100 : 0
  const daysRunning = Math.max(1, (Date.now() - new Date(BOT_START).getTime()) / (1000 * 60 * 60 * 24))
  const realizedApr = INVESTED > 0 ? (netProfit / INVESTED) * (365 / daysRunning) * 100 : 0

  // Daily estimate
  let dailyEst = 0
  if (pool?.lastCollectAt && (pendingFees + pendingRewards) > 0) {
    const hoursSince = (Date.now() - new Date(pool.lastCollectAt).getTime()) / (1000 * 60 * 60)
    if (hoursSince >= 0.5) {
      dailyEst = ((pendingFees + pendingRewards) / hoursSince) * 24
    }
  }

  // Harvest rate (rolling 7d) — use rebalance metrics if available, else simple
  const harvestRate7d = totalHarvested > 0 ? totalHarvested / Math.min(daysRunning, 7) : 0

  // Rebalance stats
  const totalRebalances = pool?.botState?.totalRebalances ?? 0
  const now = Date.now()
  const rebalances24h = metrics.filter(m => now - new Date(m.timestamp).getTime() < 86400_000).length
  const rebalances7d = metrics.filter(m => now - new Date(m.timestamp).getTime() < 7 * 86400_000).length
  const avgTimeBetweenRebalances = totalRebalances > 1
    ? daysRunning * 24 / totalRebalances
    : 0

  // Capital efficiency
  const rangeWidth = pool ? ((pool.priceUpper - pool.priceLower) / pool.currentPrice) * 100 : 0
  const ceMultiplier = rangeWidth > 0 ? 200 / rangeWidth : 0

  return {
    pool,
    botWallet,
    petraWallet,
    metrics,
    loading,
    countdown,
    refresh,
    positionValue,
    pendingFees,
    pendingRewards,
    totalHarvested,
    netProfit,
    netProfitPct,
    daysRunning,
    realizedApr,
    dailyEst,
    harvestRate7d,
    totalRebalances,
    rebalances24h,
    rebalances7d,
    avgTimeBetweenRebalances,
    rangeWidth,
    ceMultiplier,
  }
}
