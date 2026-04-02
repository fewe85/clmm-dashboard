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

function WalletColumn({ wallet, bay, accent }: { wallet: WalletBalance; bay: string; accent: string }) {
  return (
    <div
      className="flex-1 min-w-0 rounded-lg p-3"
      style={{
        background: '#08080f',
        border: '1px solid #2a2a3a',
        borderLeft: `2px solid ${accent}`,
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        {bay.includes('ACTIVE') && (
          <span className="earning-pulse" style={{ width: 5, height: 5 }} />
        )}
        {bay.includes('SECURED') && (
          <span style={{ fontSize: '9px' }}>🔒</span>
        )}
        <span className="hud-label" style={{ color: accent, fontSize: '9px' }}>
          {bay}
        </span>
      </div>
      <div className="mono text-xs mb-2" style={{ color: 'var(--text-muted)', fontSize: '9px' }}>
        {shortenAddr(wallet.address)}
      </div>

      {wallet.balances.length === 0 && (
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Empty bay</div>
      )}

      {wallet.balances.map((b, i) => (
        <div
          key={i}
          className="flex justify-between text-xs py-0.5"
          style={{ color: b.priceUnknown ? '#ff8c00' : undefined }}
        >
          <span style={{ color: b.priceUnknown ? '#ff8c00' : 'var(--text-primary)' }}>
            {b.token}
            {b.priceUnknown && (
              <span title="Unidentified Cargo" style={{ color: '#ff8c00', cursor: 'help' }}> ?</span>
            )}
          </span>
          <span className="mono" style={{ color: b.priceUnknown ? '#ff8c00' : '#b0b8cc' }}>
            {b.amount.toFixed(4)}
            {!b.priceUnknown && <span style={{ color: '#d0d8ec' }}> ({fmtUsd(b.valueUsd)})</span>}
          </span>
        </div>
      ))}

      <div className="mt-1.5 pt-1.5 flex justify-between text-xs" style={{ borderTop: '1px solid #2a2a3a' }}>
        <span className="hud-label" style={{ fontSize: '8px', color: '#b0b8cc' }}>Subtotal</span>
        <span className="mono font-semibold" style={{ color: '#d0d8ec' }}>
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
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-bold neon-value" style={{ color: 'var(--lavender)' }}>CARGO MANIFEST</h3>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>(Wallets)</span>
        </div>
        <span className="mono text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
          <span className="hud-label" style={{ fontSize: '8px', marginRight: 4 }}>PAYLOAD:</span>
          {fmtUsd(totalBoth)}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {botWallet && <WalletColumn wallet={botWallet} bay="BAY A — ACTIVE (Bot)" accent="#00ff88" />}
        {petraWallet && <WalletColumn wallet={petraWallet} bay="VAULT B — SECURED (Petra)" accent="#7eb8ff" />}
      </div>
    </div>
  )
}
