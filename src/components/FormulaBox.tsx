interface Props {
  rangeWidth: number
  currentPrice: number
  sigmaDaily: number
  estimatedC: number
  fEffDaily: number
  poolName?: string
}

export function FormulaBox({ rangeWidth, sigmaDaily, estimatedC, fEffDaily, poolName }: Props) {
  // δ* = 4cσ²/f_eff
  const optimalDelta = (4 * estimatedC * sigmaDaily * sigmaDaily) / fEffDaily
  // Polling limit: δ_min = σ / √15
  const pollingLimit = sigmaDaily / Math.sqrt(15)

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <h3 className="text-xs font-semibold mb-3" style={{ color: 'var(--text-muted)' }}>
        Range Optimization{poolName ? ` — ${poolName}` : ''}
      </h3>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
        <div style={{ color: 'var(--text-muted)' }}>Aktuelle Range</div>
        <div className="mono" style={{ color: 'var(--text-primary)' }}>±{(rangeWidth / 2).toFixed(1)}%</div>

        <div style={{ color: 'var(--text-muted)' }}>σ_daily</div>
        <div className="mono" style={{ color: 'var(--text-primary)' }}>{(sigmaDaily * 100).toFixed(2)}%</div>

        <div style={{ color: 'var(--text-muted)' }}>Geschätztes c</div>
        <div className="mono" style={{ color: 'var(--text-primary)' }}>{(estimatedC * 100).toFixed(2)}%</div>

        <div style={{ color: 'var(--text-muted)' }}>Formel-Optimum δ*</div>
        <div className="mono font-semibold" style={{ color: 'var(--accent-purple)' }}>±{(optimalDelta * 100).toFixed(1)}%</div>

        <div style={{ color: 'var(--text-muted)' }}>Polling-Limit δ_min</div>
        <div className="mono" style={{ color: 'var(--text-primary)' }}>±{(pollingLimit * 100).toFixed(1)}%</div>
      </div>

      <div className="mt-3 text-xs" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
        PnL-Kurve flach zwischen ±1.5% und ±2.5% — c wird kalibriert
      </div>
    </div>
  )
}
