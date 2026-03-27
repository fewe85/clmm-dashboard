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

export async function fetchThalaBotState(): Promise<BotState | null> {
  const data = await fetchJson(`${import.meta.env.BASE_URL}api/bot-state/thala.json`) as any
  if (!data || !data.positionNftId) return null
  return {
    lastRebalanceAt: data.lastRebalanceAt || data.openedAt || null,
    lastCompoundAt: data.lastCompoundAt || null,
    lastHarvestAt: data.lastHarvestAt || null,
    lastIdleDeployAt: null,
    totalRebalances: data.totalRebalances || 0,
    totalFeesCollectedA: Number(data.totalFeesHarvestedApt || 0),
    totalFeesCollectedB: Number(data.totalFeesHarvestedUsdc || 0),
    harvestEntries: [
      ...(data.totalRewardsHarvested > 0 ? [{ token: 'thAPT', amount: Number(data.totalRewardsHarvested) }] : []),
      ...(data.totalFeesHarvestedApt > 0 ? [{ token: 'APT', amount: Number(data.totalFeesHarvestedApt) }] : []),
      ...(data.totalFeesHarvestedUsdc > 0 ? [{ token: 'USDC', amount: Number(data.totalFeesHarvestedUsdc) }] : []),
    ],
    ownedAptRaw: 0,
    ownedUsdcRaw: 0,
    centerPrice: Number(data.centerPrice || 0),
    positionNftId: data.positionNftId || undefined,
    lastSwapCost: Number(data.lastSwapCost || 0),
    avgSwapCost: Number(data.avgSwapCost || 0),
    sigmaDaily: Number(data.sigmaDaily || 0),
  }
}

export async function fetchElonBotState(): Promise<BotState | null> {
  const data = await fetchJson(`${import.meta.env.BASE_URL}api/bot-state/elon.json`) as any
  if (!data || !data.positionNftId) return null
  return {
    lastRebalanceAt: data.lastRebalanceAt || data.lastRebalancedAt || data.openedAt || null,
    lastCompoundAt: data.lastCompoundAt || data.lastCompoundedAt || null,
    lastHarvestAt: data.lastHarvestAt || data.lastHarvestedAt || null,
    lastIdleDeployAt: null,
    totalRebalances: data.totalRebalances || 0,
    totalFeesCollectedA: Number(data.totalFeesHarvestedElon || 0),
    totalFeesCollectedB: Number(data.totalFeesHarvestedUsdc || 0),
    harvestEntries: [
      ...(data.totalRewardsHarvested > 0 ? [{ token: 'thAPT', amount: Number(data.totalRewardsHarvested) }] : []),
      ...(data.totalFeesHarvestedElon > 0 ? [{ token: 'ELON', amount: Number(data.totalFeesHarvestedElon) }] : []),
      ...(data.totalFeesHarvestedUsdc > 0 ? [{ token: 'USDC', amount: Number(data.totalFeesHarvestedUsdc) }] : []),
    ],
    ownedAptRaw: 0,
    ownedUsdcRaw: 0,
    centerPrice: Number(data.centerPrice || 0),
    positionNftId: data.positionNftId || undefined,
    lastSwapCost: Number(data.lastSwapCost || 0),
    avgSwapCost: Number(data.avgSwapCost || 0),
    sigmaDaily: Number(data.sigmaDaily || 0),
  }
}

export async function fetchRebalanceMetrics(): Promise<any[]> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}api/bot-state/rebalance-metrics.jsonl`)
    if (!res.ok) return []
    const text = await res.text()
    return text.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
  } catch {
    return []
  }
}

export async function fetchElonRebalanceMetrics(): Promise<any[]> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}api/bot-state/elon-rebalance-metrics.jsonl`)
    if (!res.ok) return []
    const text = await res.text()
    return text.trim().split('\n').filter(Boolean).map(line => JSON.parse(line))
  } catch {
    return []
  }
}
