// On-chain harvest tracking: count token transfers from bot wallets to personal wallets
import type { HarvestEntry } from '../types'
import { aptosGet } from './aptosRpc'

const SUI_RPC = 'https://fullnode.mainnet.sui.io:443'

// Only count transfers AFTER harvest mode was activated
const HARVEST_START_MS = new Date('2026-03-15T12:30:00Z').getTime()

const SUI_BOT_WALLET = '0x379ca6ed6398c76e103fb0e4c302b40aa4ccb72f1aae6503dbfe84af9c0a4c10'
const SUI_SLUSH_WALLET = '0x1b82460190e9de744e1805f3ceb107157e7c8c7a0688c662fa45988ad1431497'

const APTOS_BOT_WALLET = '0x89cd5907e16439a90c3661a72891667c3634ae6341820767490bbc7dc7b0752b'
const APTOS_PETRA_WALLET = '0x469f005fa97b1dd229ace5a677955611a11e24d88a178770d5f9948b8c2eb211'

// Known Sui coin types → symbol + decimals
const SUI_COINS: Record<string, { symbol: string; decimals: number }> = {
  '0x2::sui::SUI': { symbol: 'SUI', decimals: 9 },
  '0xdba34672e30cb065b1f93e3ab55318768fd6fef66c15942c9f7cb846e2f900e7::usdc::USDC': { symbol: 'USDC', decimals: 6 },
  '0xdeeb7a4662eec9f2f3def03fb937a663dddaa2e215b8078a284d026b7946c270::deep::DEEP': { symbol: 'DEEP', decimals: 6 },
  '0x356a26eb9e012a68958082340d4c4116e7f55615cf27affcff209cf0ae544f59::wal::WAL': { symbol: 'WAL', decimals: 9 },
  '0x7262fb2f7a3a14c888c438a3cd9b912469a58cf60f367352c46584262e8299aa::ika::IKA': { symbol: 'IKA', decimals: 9 },
  '0x5d1f47ea69bb0de31c313d7acf89b890dbb8991ea8e03c6c355171f84bb1ba4a::turbos::TURBOS': { symbol: 'TURBOS', decimals: 9 },
}

// Known Aptos coin types → symbol + decimals
const APTOS_COINS: Record<string, { symbol: string; decimals: number }> = {
  '0x1::aptos_coin::AptosCoin': { symbol: 'APT', decimals: 8 },
  '0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDC': { symbol: 'USDC', decimals: 6 },
}

// Known Aptos fungible asset metadata addresses → symbol + decimals
const APTOS_FA_METADATA: Record<string, { symbol: string; decimals: number }> = {
  '0xfc087a394c203d62c43eecfeba79db01441d39dd9d234131b78415626a26750e': { symbol: 'ELON', decimals: 8 },
  '0xa0d9d647c5737a5aed08d2cfeb39c31cf901d44bc4aa024eaa7e5e68b804e011': { symbol: 'thAPT', decimals: 8 },
  '0xbae207659db88bea0cbead6da0ed00aac12edcdda169e591cd41c94180b46f3b': { symbol: 'USDC', decimals: 6 },
}

// Dynamic metadata resolver cache (for FA tokens not in static map)
const faMetadataCache = new Map<string, { symbol: string; decimals: number } | null>()

async function resolveFaMetadata(addr: string): Promise<{ symbol: string; decimals: number } | null> {
  const normalized = addr.toLowerCase()
  const known = Object.entries(APTOS_FA_METADATA).find(([k]) => k.toLowerCase() === normalized)?.[1]
  if (known) return known
  if (faMetadataCache.has(normalized)) return faMetadataCache.get(normalized)!
  try {
    const res = await aptosGet(`/accounts/${addr}/resource/0x1::fungible_asset::Metadata`) as any
    const info = { symbol: res.data?.symbol || 'UNKNOWN', decimals: Number(res.data?.decimals || 0) }
    faMetadataCache.set(normalized, info)
    return info
  } catch {
    faMetadataCache.set(normalized, null)
    return null
  }
}

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

// Cache harvest results for 5 min (transfers don't change frequently)
const harvestCache = new Map<string, { data: HarvestEntry[]; ts: number }>()
const HARVEST_CACHE_TTL = 300_000

/**
 * Fetch all token transfers from Sui bot wallet to Slush wallet.
 * Uses queryTransactionBlocks with FromAddress filter, then inspects balanceChanges.
 */
export async function fetchSuiHarvestTransfers(priceMap: Record<string, number>): Promise<HarvestEntry[]> {
  const cacheKey = 'sui_harvest'
  const cached = harvestCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < HARVEST_CACHE_TTL) return cached.data

  try {
    // Query all transactions from bot wallet, most recent first
    const result = await suiRpc('suix_queryTransactionBlocks', [{
      filter: { FromAddress: SUI_BOT_WALLET },
      options: { showBalanceChanges: true, showInput: true },
    }, null, 50, true]) as any

    // Aggregate balance changes where Slush wallet received tokens
    const totals = new Map<string, number>() // symbol → human amount

    for (const tx of (result.data || [])) {
      const txTimestampMs = Number(tx.timestampMs || 0)
      if (txTimestampMs < HARVEST_START_MS) continue
      for (const bc of (tx.balanceChanges || [])) {
        // Look for positive balance changes to Slush wallet (= received tokens)
        if (bc.owner?.AddressOwner === SUI_SLUSH_WALLET) {
          const amount = BigInt(bc.amount)
          if (amount <= 0n) continue

          const coinInfo = Object.entries(SUI_COINS).find(([type]) => bc.coinType?.includes(type))?.[1]
          if (!coinInfo) continue

          const human = Number(amount) / Math.pow(10, coinInfo.decimals)
          totals.set(coinInfo.symbol, (totals.get(coinInfo.symbol) || 0) + human)
        }
      }
    }

    const entries: HarvestEntry[] = []
    for (const [symbol, amount] of totals) {
      const price = priceMap[symbol] || 0
      entries.push({ token: symbol, amount, valueUsd: amount * price })
    }

    harvestCache.set(cacheKey, { data: entries, ts: Date.now() })
    return entries
  } catch (err) {
    console.warn('Failed to fetch Sui harvest transfers:', err)
    return cached?.data || []
  }
}

/**
 * Fetch token transfers from Aptos bot wallet to Petra wallet.
 * Handles both legacy coin::transfer and modern primary_fungible_store::transfer.
 */
export async function fetchAptosHarvestTransfers(priceMap: Record<string, number>): Promise<HarvestEntry[]> {
  const cacheKey = 'aptos_harvest'
  const cached = harvestCache.get(cacheKey)
  if (cached && Date.now() - cached.ts < HARVEST_CACHE_TTL) return cached.data

  try {
    const txs = await aptosGet(`/accounts/${APTOS_BOT_WALLET}/transactions?limit=50`) as any[]
    const totals = new Map<string, number>()

    for (const tx of txs) {
      if (!tx.success) continue
      // Aptos timestamps are in microseconds
      const txTimestampMs = Math.floor(Number(tx.timestamp) / 1000)
      if (txTimestampMs < HARVEST_START_MS) continue
      const fn = tx.payload?.function
      const args = tx.payload?.arguments
      const typeArgs = tx.payload?.type_arguments

      // Case 1: primary_fungible_store::transfer(metadata, recipient, amount)
      // This is how ELON, thAPT, and modern FA tokens are transferred
      if (fn === '0x1::primary_fungible_store::transfer') {
        const recipient = args?.[1]
        if (typeof recipient !== 'string' || recipient.toLowerCase() !== APTOS_PETRA_WALLET.toLowerCase()) continue
        const amount = Number(args?.[2] || 0)
        if (amount <= 0) continue
        const metadataArg = args?.[0]
        const metadataAddr = typeof metadataArg === 'object' ? metadataArg?.inner : metadataArg
        if (!metadataAddr) continue
        const info = await resolveFaMetadata(metadataAddr)
        if (!info) continue
        const human = amount / Math.pow(10, info.decimals)
        totals.set(info.symbol, (totals.get(info.symbol) || 0) + human)
        continue
      }

      // Case 2: coin::transfer<CoinType>(recipient, amount)
      if (fn === '0x1::coin::transfer' || fn === '0x1::aptos_account::transfer_coins') {
        const recipient = args?.[0]
        if (typeof recipient !== 'string' || recipient.toLowerCase() !== APTOS_PETRA_WALLET.toLowerCase()) continue
        const amount = Number(args?.[1] || 0)
        if (amount <= 0) continue
        const coinType = typeArgs?.[0] || '0x1::aptos_coin::AptosCoin'
        const info = APTOS_COINS[coinType]
        if (!info) continue
        const human = amount / Math.pow(10, info.decimals)
        totals.set(info.symbol, (totals.get(info.symbol) || 0) + human)
        continue
      }

      // Case 3: aptos_account::transfer (native APT only)
      if (fn === '0x1::aptos_account::transfer') {
        const recipient = args?.[0]
        if (typeof recipient !== 'string' || recipient.toLowerCase() !== APTOS_PETRA_WALLET.toLowerCase()) continue
        const amount = Number(args?.[1] || 0)
        if (amount <= 0) continue
        const human = amount / Math.pow(10, 8)
        totals.set('APT', (totals.get('APT') || 0) + human)
      }
    }

    const entries: HarvestEntry[] = []
    for (const [symbol, amount] of totals) {
      const price = priceMap[symbol] || 0
      entries.push({ token: symbol, amount, valueUsd: amount * price })
    }

    harvestCache.set(cacheKey, { data: entries, ts: Date.now() })
    return entries
  } catch (err) {
    console.warn('Failed to fetch Aptos harvest transfers:', err)
    return cached?.data || []
  }
}
