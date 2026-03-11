import { useState, useEffect, useCallback } from 'react'
import type { PoolData, PoolGroup, WalletBalance } from '../types'
import { fetchSuiPoolData, fetchSuiWalletBalance } from '../services/sui'
import { fetchAptosPoolData, fetchAptosWalletRaw } from '../services/aptos'
import { fetchElonPoolData, fetchElonWalletRaw } from '../services/elon'
import { fetchTurbosBotState, fetchThalaBotState, fetchElonBotState } from '../services/botState'

const REFRESH_INTERVAL = 60_000

const INITIAL_CAPITAL = 150 // $50 DEEP/USDC + $50 APT/USDC + $50 ELON/USDC
const SUI_BOT_START = '2026-03-07T00:00:00.000Z'
const APT_BOT_START = '2026-03-10T00:00:00.000Z'
const ELON_BOT_START = '2026-03-11T00:00:00.000Z'

function calcApr(pendingUsd: number, positionValueUsd: number, lastActionAt: string | null): number {
  if (!lastActionAt || positionValueUsd <= 0) return 0
  const hoursElapsed = (Date.now() - new Date(lastActionAt).getTime()) / (1000 * 60 * 60)
  if (hoursElapsed <= 0) return 0
  return (pendingUsd / positionValueUsd) * (365 * 24 / hoursElapsed) * 100
}

function formatUptime(startIso: string): string {
  const ms = Date.now() - new Date(startIso).getTime()
  const days = Math.floor(ms / (1000 * 60 * 60 * 24))
  const hours = Math.floor((ms % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  return `${days}d ${hours}h`
}

export function usePoolData() {
  const [groups, setGroups] = useState<PoolGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000)

  const refresh = useCallback(async () => {
    setLoading(true)
    // Phase 1: fetch pool data + bot state + Thala wallet (no dependency on pool prices)
    const [sui, aptos, elon, turbosState, thalaState, elonState, aptosWallet, elonWallet] =
      await Promise.all([
        fetchSuiPoolData(),
        fetchAptosPoolData(),
        fetchElonPoolData(),
        fetchTurbosBotState(),
        fetchThalaBotState(),
        fetchElonBotState(),
        fetchAptosWalletRaw().catch(() => ({ apt: 0, usdc: 0 })),
        fetchElonWalletRaw().catch(() => ({ elon: 0 })),
      ])

    // Phase 2: Sui wallet needs DEEP price from pool data
    const deepPrice = sui.currentPrice > 0 ? sui.currentPrice : 0.02
    const suiWallet = await fetchSuiWalletBalance(deepPrice).catch(() => null)

    // Enrich with bot state and APR
    if (turbosState) {
      sui.botState = turbosState
      const lastAction = turbosState.lastCompoundAt || turbosState.lastRebalanceAt || SUI_BOT_START
      sui.feesApr = calcApr(sui.pendingFeesUsd, sui.positionValueUsd, lastAction)
      sui.rewardsApr = calcApr(sui.pendingRewardsUsd, sui.positionValueUsd, lastAction)
    } else {
      sui.feesApr = calcApr(sui.pendingFeesUsd, sui.positionValueUsd, SUI_BOT_START)
      sui.rewardsApr = calcApr(sui.pendingRewardsUsd, sui.positionValueUsd, SUI_BOT_START)
    }

    if (thalaState) {
      aptos.botState = thalaState
      const lastAction = thalaState.lastCompoundAt || thalaState.lastRebalanceAt || APT_BOT_START
      aptos.feesApr = calcApr(aptos.pendingFeesUsd, aptos.positionValueUsd, lastAction)
      aptos.rewardsApr = calcApr(aptos.pendingRewardsUsd, aptos.positionValueUsd, lastAction)
    } else {
      aptos.feesApr = calcApr(aptos.pendingFeesUsd, aptos.positionValueUsd, APT_BOT_START)
      aptos.rewardsApr = calcApr(aptos.pendingRewardsUsd, aptos.positionValueUsd, APT_BOT_START)
    }

    if (elonState) {
      elon.botState = elonState
      const lastAction = elonState.lastCompoundAt || elonState.lastRebalanceAt || ELON_BOT_START
      elon.feesApr = calcApr(elon.pendingFeesUsd, elon.positionValueUsd, lastAction)
      elon.rewardsApr = calcApr(elon.pendingRewardsUsd, elon.positionValueUsd, lastAction)
    } else {
      elon.feesApr = calcApr(elon.pendingFeesUsd, elon.positionValueUsd, ELON_BOT_START)
      elon.rewardsApr = calcApr(elon.pendingRewardsUsd, elon.positionValueUsd, ELON_BOT_START)
    }

    // Build Thala shared wallet: APT (gas) + USDC + ELON
    const aptPrice = aptos.currentPrice || 7.5 // APT/USDC price from pool data
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

    // Build groups
    const turbosGroup: PoolGroup = {
      protocol: 'Turbos Finance',
      chain: 'sui',
      chainColor: '#4da2ff',
      walletBalance: suiWallet,
      pools: [sui],
    }

    const thalaGroup: PoolGroup = {
      protocol: 'Thala Finance',
      chain: 'aptos',
      chainColor: '#2ed8a3',
      walletBalance: thalaWallet,
      pools: [aptos, elon],
    }

    setGroups([turbosGroup, thalaGroup])
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
  const suiUptime = formatUptime(SUI_BOT_START)
  const aptosUptime = formatUptime(APT_BOT_START)
  const elonUptime = formatUptime(ELON_BOT_START)

  return {
    groups,
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
    suiUptime,
    aptosUptime,
    elonUptime,
    initialCapital: INITIAL_CAPITAL,
  }
}
