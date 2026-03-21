import type { WalletBalance } from '../types'
import { aptosGet, aptosIndexer } from './aptosRpc'

async function fetchWalletBalances(
  address: string,
  label: string,
  prices: Record<string, number>,
): Promise<WalletBalance> {
  let entries: { symbol: string; amount: number }[] = []

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
      { wallet: address },
    ) as any

    const balances = result?.data?.current_fungible_asset_balances ?? []
    // Native APT asset_type — only keep this one for APT, ignore staking/delegation resources
    const NATIVE_APT_TYPES = ['0xa', '0x000000000000000000000000000000000000000000000000000000000000000a', '0x1::aptos_coin::AptosCoin']
    const aptEntries = balances.filter((b: any) => (b.metadata?.symbol === 'APT' || b.metadata?.symbol === 'AptosCoin'))
    const hasMultipleApt = aptEntries.length > 1
    entries = balances
      .filter((b: any) => {
        // Deduplicate APT: keep only native APT coin
        if (hasMultipleApt && (b.metadata?.symbol === 'APT' || b.metadata?.symbol === 'AptosCoin')) {
          return NATIVE_APT_TYPES.some(t => b.asset_type === t)
        }
        return true
      })
      .map((b: any) => ({
        symbol: b.metadata?.symbol || 'UNKNOWN',
        amount: Number(b.amount || 0) / Math.pow(10, b.metadata?.decimals ?? 8),
      }))
  } catch {
    try {
      const resources = await aptosGet(`/accounts/${address}/resources`) as any[]
      for (const r of resources) {
        if (!r.type?.startsWith('0x1::coin::CoinStore<')) continue
        const coinType = r.type.match(/CoinStore<(.+)>/)?.[1]
        if (!coinType) continue
        const balance = Number(r.data?.coin?.value || 0)
        if (balance === 0) continue
        const symbol = coinType.split('::').pop() || 'UNKNOWN'
        const decimals = symbol === 'USDC' ? 6 : 8
        entries.push({ symbol, amount: balance / Math.pow(10, decimals) })
      }
    } catch { /* give up */ }
  }

  const balances = entries
    .filter(e => e.amount > 0)
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
    label,
    address,
    balances,
    totalUsd: balances.reduce((s, b) => s + b.valueUsd, 0),
  }
}

export async function fetchBotWallet(prices: Record<string, number>): Promise<WalletBalance> {
  return fetchWalletBalances(
    '0x89cd5907e16439a90c3661a72891667c3634ae6341820767490bbc7dc7b0752b',
    'Bot Wallet',
    prices,
  )
}

export async function fetchPetraWallet(prices: Record<string, number>): Promise<WalletBalance> {
  return fetchWalletBalances(
    '0x469f005fa97b1dd229ace5a677955611a11e24d88a178770d5f9948b8c2eb211',
    'Petra Wallet',
    prices,
  )
}
