import type { WalletBalance } from '../types'

interface WalletBoxProps {
  suiWallet: WalletBalance | null
  aptosWallet: WalletBalance | null
}

function formatUsd(n: number): string {
  if (n >= 1000) return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (n >= 1) return `$${n.toFixed(2)}`
  if (n >= 0.01) return `$${n.toFixed(4)}`
  return `$${n.toFixed(6)}`
}

function formatAmount(n: number, token: string): string {
  if (token === 'USDC') return n.toFixed(2)
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  if (n >= 1) return n.toFixed(4)
  return n.toFixed(6)
}

interface CoinEntry {
  token: string
  amount: number
  valueUsd: number
  chain: string
  isGas?: boolean
  priceUnknown?: boolean
}

export function WalletBox({ suiWallet, aptosWallet }: WalletBoxProps) {
  const coins: CoinEntry[] = []

  if (suiWallet) {
    coins.push({
      token: 'SUI',
      amount: suiWallet.gasBalance,
      valueUsd: suiWallet.gasValueUsd,
      chain: 'Sui',
      isGas: true,
    })
    for (const b of suiWallet.idleBalances) {
      coins.push({ token: b.token, amount: b.amount, valueUsd: b.valueUsd, chain: 'Sui', priceUnknown: b.priceUnknown })
    }
  }

  if (aptosWallet) {
    coins.push({
      token: 'APT',
      amount: aptosWallet.gasBalance,
      valueUsd: aptosWallet.gasValueUsd,
      chain: 'Aptos',
      isGas: true,
    })
    for (const b of aptosWallet.idleBalances) {
      coins.push({ token: b.token, amount: b.amount, valueUsd: b.valueUsd, chain: 'Aptos', priceUnknown: b.priceUnknown })
    }
  }

  const totalUsd = coins.reduce((s, c) => s + c.valueUsd, 0)

  if (coins.length === 0) return null

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-medium" style={{ color: 'var(--text-muted)' }}>
          Wallet Balances
        </h2>
        <span className="text-sm font-semibold">{formatUsd(totalUsd)}</span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        {coins.map(c => (
          <div
            key={`${c.chain}-${c.token}`}
            className="flex items-center justify-between px-3 py-2 rounded-lg"
            style={{ background: 'var(--bg-primary)' }}
          >
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{c.token}</span>
              {c.isGas && (
                <span
                  className="px-1 py-px rounded text-xs"
                  style={{ background: 'rgba(234,179,8,0.15)', color: 'var(--accent-yellow)', fontSize: '10px' }}
                >
                  GAS
                </span>
              )}
              <span
                className="text-xs px-1.5 py-px rounded-full"
                style={{
                  background: c.chain === 'Sui' ? '#4da2ff20' : '#2ed8a320',
                  color: c.chain === 'Sui' ? '#4da2ff' : '#2ed8a3',
                  fontSize: '10px',
                }}
              >
                {c.chain}
              </span>
            </div>
            <div className="text-right">
              <span className="text-sm tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                {formatAmount(c.amount, c.token)}
              </span>
              <span className="text-xs tabular-nums ml-2" style={{ color: c.priceUnknown ? 'var(--accent-yellow)' : 'var(--text-muted)' }}>
                {c.priceUnknown ? '?' : formatUsd(c.valueUsd)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
