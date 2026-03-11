import { useState, useEffect, useCallback } from 'react'
import type { PoolData } from '../types'
import { fetchSuiPoolData } from '../services/sui'
import { fetchAptosPoolData } from '../services/aptos'
import { fetchElonPoolData } from '../services/elon'
import { fetchTurbosBotState, fetchThalaBotState, fetchElonBotState } from '../services/botState'

const REFRESH_INTERVAL = 60_000

const INITIAL_CAPITAL = 155 // $55 DEEP/USDC + $50 APT/USDC + $50 ELON/USDC
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
  const [suiPool, setSuiPool] = useState<PoolData | null>(null)
  const [aptosPool, setAptosPool] = useState<PoolData | null>(null)
  const [elonPool, setElonPool] = useState<PoolData | null>(null)
  const [loading, setLoading] = useState(true)
  const [countdown, setCountdown] = useState(REFRESH_INTERVAL / 1000)

  const refresh = useCallback(async () => {
    setLoading(true)
    const [sui, aptos, elon, turbosState, thalaState, elonState] = await Promise.all([
      fetchSuiPoolData(),
      fetchAptosPoolData(),
      fetchElonPoolData(),
      fetchTurbosBotState(),
      fetchThalaBotState(),
      fetchElonBotState(),
    ])

    // Enrich with bot state and APR
    if (turbosState) {
      sui.botState = turbosState
      const lastAction = turbosState.lastCompoundAt || turbosState.lastRebalanceAt
      sui.feesApr = calcApr(sui.pendingFeesUsd, sui.positionValueUsd, lastAction)
      sui.rewardsApr = calcApr(sui.pendingRewardsUsd, sui.positionValueUsd, lastAction)
    }

    if (thalaState) {
      aptos.botState = thalaState
      const lastAction = thalaState.lastCompoundAt || thalaState.lastRebalanceAt
      aptos.feesApr = calcApr(aptos.pendingFeesUsd, aptos.positionValueUsd, lastAction)
      aptos.rewardsApr = calcApr(aptos.pendingRewardsUsd, aptos.positionValueUsd, lastAction)
    }

    if (elonState) {
      elon.botState = elonState
      const lastAction = elonState.lastCompoundAt || elonState.lastRebalanceAt
      elon.feesApr = calcApr(elon.pendingFeesUsd, elon.positionValueUsd, lastAction)
      elon.rewardsApr = calcApr(elon.pendingRewardsUsd, elon.positionValueUsd, lastAction)
    }

    setSuiPool(sui)
    setAptosPool(aptos)
    setElonPool(elon)
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

  // Totals: position + idle (excluding gas)
  const totalPositionUsd = (suiPool?.positionValueUsd || 0) + (aptosPool?.positionValueUsd || 0) + (elonPool?.positionValueUsd || 0)
  const totalIdleUsd = (suiPool?.walletBalance?.totalIdleUsd || 0) + (aptosPool?.walletBalance?.totalIdleUsd || 0) + (elonPool?.walletBalance?.totalIdleUsd || 0)
  const totalValueUsd = totalPositionUsd + totalIdleUsd
  const totalFeesUsd = (suiPool?.pendingFeesUsd || 0) + (aptosPool?.pendingFeesUsd || 0) + (elonPool?.pendingFeesUsd || 0)
  const totalRewardsUsd = (suiPool?.pendingRewardsUsd || 0) + (aptosPool?.pendingRewardsUsd || 0) + (elonPool?.pendingRewardsUsd || 0)

  // P&L
  const pnlUsd = totalValueUsd + totalFeesUsd + totalRewardsUsd - INITIAL_CAPITAL
  const pnlPct = INITIAL_CAPITAL > 0 ? (pnlUsd / INITIAL_CAPITAL) * 100 : 0

  // Uptime
  const suiUptime = formatUptime(SUI_BOT_START)
  const aptosUptime = formatUptime(APT_BOT_START)
  const elonUptime = formatUptime(ELON_BOT_START)

  return {
    suiPool,
    aptosPool,
    elonPool,
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
