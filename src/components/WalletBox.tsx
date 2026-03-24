import type { WalletBalance } from '../types'

interface Props {
  botWallet: WalletBalance | null
  petraWallet: WalletBalance | null
}

function shortenAddr(addr: string): string {
  return addr.slice(0, 6) + '...' + addr.slice(-4)
}

function fmtUsd(v: number): string {
  if (v >= 1) return `$${v.toFixed(2)}`
  if (v >= 0.01) return `$${v.toFixed(4)}`
  return `$${v.toFixed(4)}`
}

function WalletColumn({ wallet }: { wallet: WalletBalance }) {
  return (
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-2">
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
        <div key={i} className="flex justify-between text-xs py-0.5">
          <span style={{ color: 'var(--text-primary)' }}>
            {b.token}
            {b.priceUnknown && <span style={{ color: 'var(--accent-yellow)' }}> ?</span>}
          </span>
          <span className="mono" style={{ color: 'var(--text-muted)' }}>
            {b.amount < 0.01 ? b.amount.toFixed(4) : b.amount.toFixed(4)}
            {!b.priceUnknown && ` (${fmtUsd(b.valueUsd)})`}
          </span>
        </div>
      ))}

      <div className="mt-1.5 pt-1.5 flex justify-between text-xs" style={{ borderTop: '1px solid var(--border)' }}>
        <span style={{ color: 'var(--text-muted)' }}>Total</span>
        <span className="mono font-semibold" style={{ color: 'var(--text-primary)' }}>
          {fmtUsd(wallet.totalUsd)}
        </span>
      </div>
    </div>
  )
}

export function WalletBox({ botWallet, petraWallet }: Props) {
  if (!botWallet && !petraWallet) return null

  const totalBoth = (botWallet?.totalUsd ?? 0) + (petraWallet?.totalUsd ?? 0)

  return (
    <div className="card-glow rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>Wallets</h3>
        <span className="mono text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
          Total: {fmtUsd(totalBoth)}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4" style={{ borderTop: '1px solid var(--border)', paddingTop: '0.75rem' }}>
        {botWallet && <WalletColumn wallet={botWallet} />}
        {petraWallet && <WalletColumn wallet={petraWallet} />}
      </div>
    </div>
  )
}
