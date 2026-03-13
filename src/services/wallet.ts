// Dynamic wallet balance fetching for Sui and Aptos
// Discovers ALL tokens > dust threshold, no hardcoded token list

import type { WalletBalance } from '../types'
import { sqrtPriceX64ToPrice } from './math'
import { aptosGet, aptosIndexer } from './aptosRpc'

const SUI_RPC = 'https://fullnode.mainnet.sui.io:443'
const SUI_WALLET = '0x379ca6ed6398c76e103fb0e4c302b40aa4ccb72f1aae6503dbfe84af9c0a4c10'
const APTOS_WALLET = '0x89cd5907e16439a90c3661a72891667c3634ae6341820767490bbc7dc7b0752b'

// TURBOS/SUI pool for TURBOS price derivation
const TURBOS_SUI_POOL = '0x2c6fc12bf0d093b5391e7c0fed7e044d52bc14eb29f6352a3fb358e33e80729e'

// --- Sui RPC helper ---

async function suiRpc(method: string, params: unknown[]): Promise<unknown> {
  const res = await fetch(SUI_RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const json = await res.json()
  if (json.error) throw new Error(json.error.message)
  return json.result
}

// --- Coin metadata cache (symbol + decimals) ---

const metaCache = new Map<string, { symbol: string; decimals: number }>()

async function suiCoinMeta(coinType: string): Promise<{ symbol: string; decimals: number }> {
  if (metaCache.has(coinType)) return metaCache.get(coinType)!
  try {
    const r = await suiRpc('suix_getCoinMetadata', [coinType]) as any
    const m = { symbol: r.symbol || coinType.split('::').pop()!, decimals: r.decimals ?? 9 }
    metaCache.set(coinType, m)
    return m
  } catch {
    const fallback = { symbol: coinType.split('::').pop() || '???', decimals: 9 }
    metaCache.set(coinType, fallback)
    return fallback
  }
}

// --- TURBOS price ---

export async function fetchTurbosUsdPrice(suiUsdPrice: number): Promise<number> {
  try {
    const result = await suiRpc('sui_getObject', [
      TURBOS_SUI_POOL,
      { showContent: true },
    ]) as any
    const fields = result.data.content.fields
    const sqrtPrice = BigInt(fields.sqrt_price)
    // Pool<TURBOS(9), SUI(9)> → price = SUI per TURBOS
    const turbosSuiPrice = sqrtPriceX64ToPrice(sqrtPrice, 9, 9)
    return turbosSuiPrice * suiUsdPrice
  } catch {
    return 0
  }
}

// --- Sui dynamic wallet ---

export async function fetchSuiWalletDynamic(prices: Record<string, number>): Promise<WalletBalance> {
  const allBal = await suiRpc('suix_getAllBalances', [SUI_WALLET]) as any[]

  // Fetch metadata for all coins in parallel
  const entries = await Promise.all(allBal.map(async (b: any) => {
    const meta = await suiCoinMeta(b.coinType)
    const amount = Number(b.totalBalance || 0) / Math.pow(10, meta.decimals)
    return { coinType: b.coinType as string, symbol: meta.symbol, amount }
  }))

  // Gas (SUI)
  const sui = entries.find(e => e.coinType === '0x2::sui::SUI')
  const suiBalance = sui?.amount || 0
  const suiPrice = prices['SUI'] || 0

  // All other tokens as idle balances
  const idle = entries
    .filter(e => e.coinType !== '0x2::sui::SUI' && e.amount > 0)
    .map(e => {
      const p = prices[e.symbol]
      const known = p !== undefined && p > 0
      return {
        token: e.symbol,
        amount: e.amount,
        valueUsd: known ? e.amount * p : 0,
        priceUnknown: !known,
      }
    })
    .filter(b => b.priceUnknown ? b.amount > 0.0001 : b.valueUsd > 0.001)
    .sort((a, b) => {
      if (a.priceUnknown !== b.priceUnknown) return a.priceUnknown ? 1 : -1
      return b.valueUsd - a.valueUsd
    })

  return {
    gasToken: 'SUI',
    gasBalance: suiBalance,
    gasValueUsd: suiBalance * suiPrice,
    idleBalances: idle,
    totalIdleUsd: idle.reduce((s, b) => s + b.valueUsd, 0),
  }
}

// --- Aptos dynamic wallet ---

export async function fetchAptosWalletDynamic(prices: Record<string, number>): Promise<WalletBalance> {
  let entries: { symbol: string; amount: number }[] = []

  // Strategy 1: Indexer for all fungible asset balances (includes migrated coins)
  try {
    const result = await aptosIndexer(
      `query GetAllBalances($wallet: String!) {
        current_fungible_asset_balances(
          where: { owner_address: { _eq: $wallet }, amount: { _gt: "0" } }
        ) {
          asset_type
          amount
          metadata {
            symbol
            decimals
          }
        }
      }`,
      { wallet: APTOS_WALLET },
    ) as any

    const balances = result?.data?.current_fungible_asset_balances ?? []
    entries = balances.map((b: any) => ({
      symbol: b.metadata?.symbol || 'UNKNOWN',
      amount: Number(b.amount || 0) / Math.pow(10, b.metadata?.decimals ?? 8),
    }))
  } catch {
    // Strategy 2: Fallback to account resources (CoinStore entries)
    try {
      const resources = await aptosGet(`/accounts/${APTOS_WALLET}/resources`) as any[]
      for (const r of resources) {
        if (!r.type?.startsWith('0x1::coin::CoinStore<')) continue
        const coinType = r.type.match(/CoinStore<(.+)>/)?.[1]
        if (!coinType) continue
        const balance = Number(r.data?.coin?.value || 0)
        if (balance === 0) continue

        const symbol = coinType.split('::').pop() || 'UNKNOWN'
        // Use known decimals, default 8 for Aptos
        const decimals = symbol === 'USDC' ? 6 : 8
        entries.push({ symbol, amount: balance / Math.pow(10, decimals) })
      }
    } catch { /* give up */ }
  }

  // Gas (APT)
  const apt = entries.find(e => e.symbol === 'APT')
  const aptBalance = apt?.amount || 0
  const aptPrice = prices['APT'] || 0

  // All other tokens as idle balances
  const idle = entries
    .filter(e => e.symbol !== 'APT' && e.amount > 0)
    .map(e => {
      const p = prices[e.symbol]
      const known = p !== undefined && p > 0
      return {
        token: e.symbol,
        amount: e.amount,
        valueUsd: known ? e.amount * p : 0,
        priceUnknown: !known,
      }
    })
    .filter(b => b.priceUnknown ? b.amount > 0.0001 : b.valueUsd > 0.001)
    .sort((a, b) => {
      if (a.priceUnknown !== b.priceUnknown) return a.priceUnknown ? 1 : -1
      return b.valueUsd - a.valueUsd
    })

  return {
    gasToken: 'APT',
    gasBalance: aptBalance,
    gasValueUsd: aptBalance * aptPrice,
    idleBalances: idle,
    totalIdleUsd: idle.reduce((s, b) => s + b.valueUsd, 0),
  }
}
