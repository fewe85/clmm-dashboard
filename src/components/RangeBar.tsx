interface RangeBarProps {
  priceLower: number
  priceUpper: number
  currentPrice: number
  inRange: boolean
  triggerDistancePct: number
}

export function RangeBar({ priceLower, priceUpper, currentPrice, inRange, triggerDistancePct }: RangeBarProps) {
  const range = priceUpper - priceLower
  const position = range > 0 ? ((currentPrice - priceLower) / range) * 100 : 50
  const clampedPosition = Math.max(0, Math.min(100, position))

  const triggerColor = triggerDistancePct >= 80
    ? 'var(--accent-red)'
    : triggerDistancePct >= 50
      ? 'var(--accent-yellow)'
      : 'var(--accent-green)'

  return (
    <div className="mt-2">
      {/* Price range labels */}
      <div className="flex justify-between text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
        <span>${priceLower.toFixed(4)}</span>
        <span>${priceUpper.toFixed(4)}</span>
      </div>

      {/* Main range bar */}
      <div
        className="relative h-3 rounded-full overflow-hidden"
        style={{ background: 'var(--bg-primary)' }}
      >
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: inRange
              ? 'linear-gradient(90deg, rgba(34,197,94,0.15), rgba(34,197,94,0.3), rgba(34,197,94,0.15))'
              : 'linear-gradient(90deg, rgba(239,68,68,0.15), rgba(239,68,68,0.3), rgba(239,68,68,0.15))',
          }}
        />
        <div
          className="absolute top-0 h-full w-1 rounded-full transition-all duration-500"
          style={{
            left: `${clampedPosition}%`,
            transform: 'translateX(-50%)',
            background: inRange ? 'var(--accent-green)' : 'var(--accent-red)',
            boxShadow: inRange
              ? '0 0 8px rgba(34,197,94,0.6)'
              : '0 0 8px rgba(239,68,68,0.6)',
          }}
        />
      </div>

      {/* Trigger distance bar */}
      <div className="mt-1.5 flex items-center gap-2">
        <div
          className="flex-1 h-1.5 rounded-full overflow-hidden"
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
        <span className="text-xs tabular-nums whitespace-nowrap" style={{ color: triggerColor }}>
          {triggerDistancePct.toFixed(0)}% to edge
        </span>
      </div>
    </div>
  )
}
