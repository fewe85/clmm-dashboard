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
  }
}

export async function fetchThalaBotState(): Promise<BotState | null> {
  const data = await fetchJson('/api/bot-state/thala') as any
  if (!data) return null
  return {
    lastRebalanceAt: data.lastRebalanceAt || data.position?.openedAt || null,
    lastCompoundAt: data.lastCompoundAt || null,
  }
}
