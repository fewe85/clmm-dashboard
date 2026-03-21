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

function parseHarvestEntries(data: any, fields: { key: string; token: string; decimals: number }[]): { token: string; amount: number }[] {
  const entries: { token: string; amount: number }[] = []
  for (const { key, token, decimals } of fields) {
    const raw = Number(data[key] || 0)
    if (raw > 0) {
      entries.push({ token, amount: raw / decimals })
    }
  }
  return entries
}

export async function fetchThalaBotState(): Promise<BotState | null> {
  const data = await fetchJson(`${import.meta.env.BASE_URL}api/bot-state/thala.json`) as any
  if (!data || (!data.lastRebalanceAt && !data.openedAt && !data.startedAt)) return null
  return {
    lastRebalanceAt: data.lastRebalanceAt || data.position?.openedAt || null,
    lastCompoundAt: data.lastCompoundAt || null,
    lastHarvestAt: data.lastHarvestAt || null,
    lastIdleDeployAt: data.lastIdleDeployAt || null,
    totalRebalances: data.totalRebalances || 0,
    totalFeesCollectedA: Number(data.totalFeesCollectedApt || 0) / 1e8,
    totalFeesCollectedB: Number(data.totalFeesCollectedUsdc || 0) / 1e6,
    harvestEntries: parseHarvestEntries(data, [
      { key: 'totalHarvestedThaptRaw', token: 'thAPT', decimals: 1e8 },
      { key: 'totalHarvestedAptRaw', token: 'APT', decimals: 1e8 },
      { key: 'totalHarvestedUsdcRaw', token: 'USDC', decimals: 1e6 },
    ]),
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
