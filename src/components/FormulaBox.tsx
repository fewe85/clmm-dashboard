interface Props {
  rangeWidth: number
  currentPrice: number
}

export function FormulaBox({ rangeWidth }: Props) {
  // Placeholder values — will be calibrated with real data
  const sigmaDaily = 1.2 // estimated daily vol %
  const estC = 0.3 // estimated swap cost %
  const f = 0.3 // fee tier %
  const optimalDelta = (4 * estC * sigmaDaily * sigmaDaily) / f

  return (
    <div
      className="rounded-xl p-4"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <h3 className="text-xs font-semibold mb-3" style={{ color: 'var(--text-muted)' }}>
        Range Optimization
      </h3>

      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
        <div style={{ color: 'var(--text-muted)' }}>Aktuelle Range</div>
        <div className="mono" style={{ color: 'var(--text-primary)' }}>±{(rangeWidth / 2).toFixed(1)}%</div>

        <div style={{ color: 'var(--text-muted)' }}>σ_daily</div>
        <div className="mono" style={{ color: 'var(--text-primary)' }}>{sigmaDaily.toFixed(2)}%</div>

        <div style={{ color: 'var(--text-muted)' }}>Geschätztes c</div>
        <div className="mono" style={{ color: 'var(--text-primary)' }}>{estC.toFixed(2)}%</div>

        <div style={{ color: 'var(--text-muted)' }}>Berechnetes δ*</div>
        <div className="mono font-semibold" style={{ color: 'var(--accent-purple)' }}>±{optimalDelta.toFixed(1)}%</div>
      </div>

      <div className="mt-3 text-xs" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
        δ* = 4cσ²/f — wird kalibriert
      </div>
    </div>
  )
}
