import type { WalletBalance } from '../types'
import type { EchelonSummary } from '../services/echelon'

interface Props {
  botWallet: WalletBalance | null
  petraWallet: WalletBalance | null
  echelon?: EchelonSummary | null
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

      {wallet.balances.filter(b => !b.priceUnknown).map((b, i) => (
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

const ECHELON_CYAN = '#77FBFD'

function EchelonPanel({ data }: { data: EchelonSummary }) {
  const hfColor = data.healthFactor > 2 ? '#00ff88' : data.healthFactor > 1.5 ? '#ffd700' : '#ff4444'
  const hfLabel = data.healthFactor === Infinity ? '∞' : data.healthFactor.toFixed(2)

  return (
    <div
      className="flex-1 min-w-0 rounded-lg p-3"
      style={{
        background: '#08080f',
        border: '1px solid #2a2a3a',
        borderLeft: `2px solid ${ECHELON_CYAN}`,
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <span className="hud-label" style={{ color: ECHELON_CYAN, fontSize: '9px' }}>
          DOCK C — ECHELON
        </span>
        <span className="mono" style={{ fontSize: '8px', color: hfColor, marginLeft: 'auto' }}>
          HF {hfLabel}
        </span>
      </div>

      {/* Supplied */}
      {data.positions.filter(p => p.supplied > 0).map((p, i) => (
        <div key={`s${i}`} className="flex justify-between text-xs py-0.5">
          <span style={{ color: '#00ff88' }}>
            ↑ {p.asset}
            <span className="mono" style={{ fontSize: '8px', color: '#8892b0', marginLeft: 4 }}>
              {p.supplyApr.toFixed(1)}%
            </span>
          </span>
          <span className="mono" style={{ color: '#b0b8cc' }}>
            {p.supplied.toFixed(p.supplied < 0.01 ? 4 : 2)}
            <span style={{ color: '#d0d8ec' }}> ({fmtUsd(p.supplyUsd)})</span>
          </span>
        </div>
      ))}

      {/* Borrowed */}
      {data.positions.filter(p => p.borrowed > 0).map((p, i) => (
        <div key={`b${i}`} className="flex justify-between text-xs py-0.5">
          <span style={{ color: '#ff4444' }}>
            ↓ {p.asset}
            <span className="mono" style={{ fontSize: '8px', color: '#8892b0', marginLeft: 4 }}>
              {p.borrowApr.toFixed(1)}%
            </span>
          </span>
          <span className="mono" style={{ color: '#b0b8cc' }}>
            {p.borrowed.toFixed(2)}
            <span style={{ color: '#d0d8ec' }}> ({fmtUsd(p.borrowUsd)})</span>
          </span>
        </div>
      ))}

      {/* Totals */}
      <div className="mt-1.5 pt-1.5 flex justify-between text-xs" style={{ borderTop: '1px solid #2a2a3a' }}>
        <span className="hud-label" style={{ fontSize: '8px', color: '#b0b8cc' }}>Net Value</span>
        <span className="mono font-semibold" style={{ color: data.netUsd >= 0 ? '#d0d8ec' : '#ff4444' }}>
          {fmtUsd(data.netUsd)}
        </span>
      </div>
    </div>
  )
}

export function WalletBox({ botWallet, petraWallet, echelon }: Props) {
  if (!botWallet && !petraWallet && !echelon) return null

  const totalBoth = (botWallet?.totalUsd ?? 0) + (petraWallet?.totalUsd ?? 0) + (echelon?.netUsd ?? 0)

  return (
    <div className="card-glow rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-baseline gap-2">
          <h3 className="text-sm font-bold neon-value" style={{ color: 'var(--lavender)' }}>📦 CARGO MANIFEST</h3>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>(Wallets + Lending)</span>
        </div>
        <span className="mono text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>
          <span className="hud-label" style={{ fontSize: '8px', marginRight: 4 }}>PAYLOAD:</span>
          {fmtUsd(totalBoth)}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {botWallet && <WalletColumn wallet={botWallet} bay="BAY A — ACTIVE (Bot)" accent="#00ff88" />}
        {petraWallet && <WalletColumn wallet={petraWallet} bay="VAULT B — SECURED (Petra)" accent="#7eb8ff" />}
        {echelon && echelon.positions.length > 0 && <EchelonPanel data={echelon} />}
      </div>
    </div>
  )
}
