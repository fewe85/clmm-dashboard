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

// Parse harvest entries from bot state raw fields
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

export async function fetchTurbosBotState(): Promise<BotState | null> {
  const data = await fetchJson(`${import.meta.env.BASE_URL}api/bot-state/turbos.json`) as any
  if (!data || !data.openedAt) return null
  return {
    lastRebalanceAt: data.openedAt,
    lastCompoundAt: data.lastCompoundAt || data.openedAt,
    lastHarvestAt: data.lastHarvestAt || null,
    lastIdleDeployAt: null,
    totalRebalances: data.totalRebalances || 0,
    totalFeesCollectedA: Number(data.totalFeesCollectedDeep || 0) / 1e6,
    totalFeesCollectedB: Number(data.totalFeesCollectedUsdc || 0) / 1e6,
    harvestEntries: parseHarvestEntries(data, [
      { key: 'totalHarvestedDeepRaw', token: 'DEEP', decimals: 1e6 },
      { key: 'totalHarvestedUsdcRaw', token: 'USDC', decimals: 1e6 },
      { key: 'totalHarvestedSuiRaw', token: 'SUI', decimals: 1e9 },
      { key: 'totalHarvestedTurbosRaw', token: 'TURBOS', decimals: 1e9 },
    ]),
  }
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

export async function fetchElonBotState(): Promise<BotState | null> {
  const data = await fetchJson(`${import.meta.env.BASE_URL}api/bot-state/elon.json`) as any
  if (!data) return null
  return {
    lastRebalanceAt: data.lastRebalanceAt || data.position?.openedAt || null,
    lastCompoundAt: data.lastCompoundAt || null,
    lastHarvestAt: data.lastHarvestAt || null,
    lastIdleDeployAt: null,
    totalRebalances: data.totalRebalances || 0,
    totalFeesCollectedA: Number(data.totalFeesCollectedElon || 0) / 1e8,
    totalFeesCollectedB: Number(data.totalFeesCollectedUsdc || 0) / 1e6,
    harvestEntries: parseHarvestEntries(data, [
      { key: 'totalHarvestedThaptRaw', token: 'thAPT', decimals: 1e8 },
      { key: 'totalHarvestedElonRaw', token: 'ELON', decimals: 1e8 },
      { key: 'totalHarvestedUsdcRaw', token: 'USDC', decimals: 1e6 },
    ]),
  }
}

export async function fetchWalBotState(): Promise<BotState | null> {
  const data = await fetchJson(`${import.meta.env.BASE_URL}api/bot-state/wal.json`) as any
  if (!data || !data.openedAt) return null
  return {
    lastRebalanceAt: data.openedAt,
    lastCompoundAt: data.lastCompoundAt || data.openedAt,
    lastHarvestAt: data.lastHarvestAt || null,
    lastIdleDeployAt: null,
    totalRebalances: data.totalRebalances || 0,
    totalFeesCollectedA: Number(data.totalFeesCollectedWal || 0) / 1e9,
    totalFeesCollectedB: Number(data.totalFeesCollectedUsdc || 0) / 1e6,
    harvestEntries: parseHarvestEntries(data, [
      { key: 'totalHarvestedWalRaw', token: 'WAL', decimals: 1e9 },
      { key: 'totalHarvestedUsdcRaw', token: 'USDC', decimals: 1e6 },
      { key: 'totalHarvestedSuiRaw', token: 'SUI', decimals: 1e9 },
      { key: 'totalHarvestedTurbosRaw', token: 'TURBOS', decimals: 1e9 },
    ]),
  }
}

export async function fetchIkaBotState(): Promise<BotState | null> {
  const data = await fetchJson(`${import.meta.env.BASE_URL}api/bot-state/ika.json`) as any
  if (!data || !data.openedAt) return null
  return {
    lastRebalanceAt: data.openedAt,
    lastCompoundAt: data.lastCompoundAt || data.openedAt,
    lastHarvestAt: data.lastHarvestAt || null,
    lastIdleDeployAt: null,
    totalRebalances: data.totalRebalances || 0,
    totalFeesCollectedA: Number(data.totalFeesCollectedIka || 0) / 1e9,
    totalFeesCollectedB: Number(data.totalFeesCollectedUsdc || 0) / 1e6,
    harvestEntries: parseHarvestEntries(data, [
      { key: 'totalHarvestedIkaRaw', token: 'IKA', decimals: 1e9 },
      { key: 'totalHarvestedUsdcRaw', token: 'USDC', decimals: 1e6 },
      { key: 'totalHarvestedSuiRaw', token: 'SUI', decimals: 1e9 },
      { key: 'totalHarvestedTurbosRaw', token: 'TURBOS', decimals: 1e9 },
    ]),
  }
}

export async function fetchSuiUsdcBotState(): Promise<BotState | null> {
  const data = await fetchJson(`${import.meta.env.BASE_URL}api/bot-state/sui-usdc.json`) as any
  if (!data || !data.openedAt) return null
  return {
    lastRebalanceAt: data.openedAt,
    lastCompoundAt: data.lastCompoundAt || data.openedAt,
    lastHarvestAt: data.lastHarvestAt || null,
    lastIdleDeployAt: null,
    totalRebalances: data.totalRebalances || 0,
    totalFeesCollectedA: Number(data.totalFeesCollectedSui || 0) / 1e9,
    totalFeesCollectedB: Number(data.totalFeesCollectedUsdc || 0) / 1e6,
    harvestEntries: parseHarvestEntries(data, [
      { key: 'totalHarvestedSuiRaw', token: 'SUI', decimals: 1e9 },
      { key: 'totalHarvestedUsdcRaw', token: 'USDC', decimals: 1e6 },
      { key: 'totalHarvestedTurbosRaw', token: 'TURBOS', decimals: 1e9 },
    ]),
  }
}
