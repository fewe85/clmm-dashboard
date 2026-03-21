interface RangeBarProps {
  priceLower: number
  priceUpper: number
  currentPrice: number
  inRange: boolean
  triggerDistancePct: number
  rangeWidth: number
  ceMultiplier: number
}

function pctToEdge(current: number, lower: number, upper: number): { pct: number; side: string } {
  const distToLower = current - lower
  const distToUpper = upper - current
  if (distToLower < distToUpper) {
    return { pct: (distToLower / (upper - lower)) * 100, side: 'lower' }
  }
  return { pct: (distToUpper / (upper - lower)) * 100, side: 'upper' }
}

export function RangeBar({ priceLower, priceUpper, currentPrice, inRange, triggerDistancePct, rangeWidth, ceMultiplier }: RangeBarProps) {
  const range = priceUpper - priceLower
  const position = range > 0 ? ((currentPrice - priceLower) / range) * 100 : 50
  const clampedPosition = Math.max(0, Math.min(100, position))
  const edge = pctToEdge(currentPrice, priceLower, priceUpper)

  const triggerColor = triggerDistancePct >= 80
    ? 'var(--accent-red)'
    : triggerDistancePct >= 50
      ? 'var(--accent-yellow)'
      : 'var(--accent-green)'

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
          Price Range
        </h3>
        <div className="flex items-center gap-3">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Range: <span className="mono" style={{ color: 'var(--text-primary)' }}>±{(rangeWidth / 2).toFixed(1)}%</span>
          </span>
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
            CE: <span className="mono" style={{ color: 'var(--accent-purple)' }}>{ceMultiplier.toFixed(0)}x</span>
          </span>
        </div>
      </div>

      {/* Price labels */}
      <div className="flex justify-between text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
        <span className="mono">${priceLower.toFixed(4)}</span>
        <span className="mono font-semibold" style={{ color: 'var(--text-primary)' }}>
          ${currentPrice.toFixed(4)}
        </span>
        <span className="mono">${priceUpper.toFixed(4)}</span>
      </div>

      {/* Main range bar — bigger */}
      <div
        className="relative h-5 rounded-full overflow-hidden"
        style={{ background: 'var(--bg-primary)' }}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: inRange
              ? 'linear-gradient(90deg, rgba(34,197,94,0.1), rgba(34,197,94,0.25), rgba(34,197,94,0.1))'
              : 'linear-gradient(90deg, rgba(239,68,68,0.1), rgba(239,68,68,0.25), rgba(239,68,68,0.1))',
          }}
        />
        <div
          className="absolute top-0 h-full w-1.5 rounded-full transition-all duration-500"
          style={{
            left: `${clampedPosition}%`,
            transform: 'translateX(-50%)',
            background: inRange ? 'var(--accent-green)' : 'var(--accent-red)',
            boxShadow: inRange
              ? '0 0 12px rgba(34,197,94,0.7)'
              : '0 0 12px rgba(239,68,68,0.7)',
          }}
        />
      </div>

      {/* Trigger distance */}
      <div className="mt-3 flex items-center gap-3">
        <div
          className="flex-1 h-2 rounded-full overflow-hidden"
          style={{ background: 'var(--bg-primary)' }}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(triggerDistancePct, 100)}%`,
              background: triggerColor,
              opacity: 0.8,
            }}
          />
        </div>
        <span className="text-xs mono whitespace-nowrap" style={{ color: triggerColor }}>
          {triggerDistancePct.toFixed(0)}% to edge
        </span>
      </div>

      {/* Edge distance detail */}
      <div className="mt-2 text-xs" style={{ color: 'var(--text-muted)' }}>
        <span className="mono">{edge.pct.toFixed(1)}%</span> to {edge.side} bound
      </div>
    </div>
  )
}
