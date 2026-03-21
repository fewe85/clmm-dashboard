import type { WalletBalance } from '../types'

interface Props {
  botWallet: WalletBalance | null
  petraWallet: WalletBalance | null
}

function shortenAddr(addr: string): string {
  return addr.slice(0, 6) + '...' + addr.slice(-4)
}

function formatUsd(v: number): string {
  if (v >= 1) return `$${v.toFixed(2)}`
  if (v >= 0.01) return `$${v.toFixed(4)}`
  return `$${v.toFixed(6)}`
}

function WalletCard({ wallet }: { wallet: WalletBalance }) {
  return (
    <div
      className="rounded-lg p-4"
      style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>
          {wallet.label}
        </span>
        <span className="mono text-xs" style={{ color: 'var(--text-muted)' }}>
          {shortenAddr(wallet.address)}
        </span>
      </div>

      {wallet.balances.length === 0 && (
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>No balances</div>
      )}

      {wallet.balances.map((b, i) => (
        <div key={i} className="flex items-center justify-between py-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
              {b.token}
            </span>
            {b.priceUnknown && (
              <span className="text-xs" style={{ color: 'var(--accent-yellow)' }}>?</span>
            )}
          </div>
          <div className="text-right">
            <span className="mono text-xs" style={{ color: 'var(--text-primary)' }}>
              {b.amount < 0.01 ? b.amount.toFixed(6) : b.amount.toFixed(4)}
            </span>
            {!b.priceUnknown && (
              <span className="mono text-xs ml-2" style={{ color: 'var(--text-muted)' }}>
                {formatUsd(b.valueUsd)}
              </span>
            )}
          </div>
        </div>
      ))}

      <div className="mt-2 pt-2 flex justify-between" style={{ borderTop: '1px solid var(--border)' }}>
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Total</span>
        <span className="mono text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
          {formatUsd(wallet.totalUsd)}
        </span>
      </div>
    </div>
  )
}

export function WalletBox({ botWallet, petraWallet }: Props) {
  if (!botWallet && !petraWallet) return null

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>
        Wallets
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {botWallet && <WalletCard wallet={botWallet} />}
        {petraWallet && <WalletCard wallet={petraWallet} />}
      </div>
    </div>
  )
}
