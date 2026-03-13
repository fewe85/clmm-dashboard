import type { BotState } from '../types'

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    return res.json()
  } catch {
    return null
  }
}

export async function fetchTurbosBotState(): Promise<BotState | null> {
  const data = await fetchJson('/api/bot-state/turbos') as any
  if (!data || !data.openedAt) return null
  return {
    lastRebalanceAt: data.openedAt, // openedAt = last rebalance (new position)
    lastCompoundAt: data.lastCompoundAt || data.openedAt,
    totalRebalances: data.totalRebalances || 0,
    totalFeesCollectedA: Number(data.totalFeesCollectedDeep || 0) / 1e6,
    totalFeesCollectedB: Number(data.totalFeesCollectedUsdc || 0) / 1e6,
  }
}

export async function fetchThalaBotState(): Promise<BotState | null> {
  const data = await fetchJson('/api/bot-state/thala') as any
  if (!data) return null
  return {
    lastRebalanceAt: data.lastRebalanceAt || data.position?.openedAt || null,
    lastCompoundAt: data.lastCompoundAt || null,
    totalRebalances: data.rebalanceCount || 0,
    // Thala state.json stores fees in human-readable units already
    totalFeesCollectedA: Number(data.totalFeesCollectedApt || 0),
    totalFeesCollectedB: Number(data.totalFeesCollectedUsdc || 0),
  }
}

export async function fetchElonBotState(): Promise<BotState | null> {
  const data = await fetchJson('/api/bot-state/elon') as any
  if (!data) return null
  return {
    lastRebalanceAt: data.lastRebalanceAt || data.position?.openedAt || null,
    lastCompoundAt: data.lastCompoundAt || null,
    totalRebalances: data.rebalanceCount || 0,
    // Thala state.json stores fees in human-readable units already
    totalFeesCollectedA: Number(data.totalFeesCollectedElon || 0),
    totalFeesCollectedB: Number(data.totalFeesCollectedUsdc || 0),
  }
}

export async function fetchWalBotState(): Promise<BotState | null> {
  const data = await fetchJson('/api/bot-state/wal') as any
  if (!data || !data.openedAt) return null
  return {
    lastRebalanceAt: data.openedAt,
    lastCompoundAt: data.lastCompoundAt || data.openedAt,
    totalRebalances: data.totalRebalances || 0,
    totalFeesCollectedA: Number(data.totalFeesCollectedWal || 0) / 1e9,
    totalFeesCollectedB: Number(data.totalFeesCollectedUsdc || 0) / 1e6,
  }
}

export async function fetchSuiTurbosBotState(): Promise<BotState | null> {
  const data = await fetchJson('/api/bot-state/sui-turbos') as any
  if (!data || !data.openedAt) return null
  return {
    lastRebalanceAt: data.openedAt,
    lastCompoundAt: data.lastCompoundAt || data.openedAt,
    totalRebalances: data.totalRebalances || 0,
    totalFeesCollectedA: Number(data.totalFeesCollectedTurbos || 0) / 1e9,
    totalFeesCollectedB: Number(data.totalFeesCollectedSui || 0) / 1e9,
  }
}
