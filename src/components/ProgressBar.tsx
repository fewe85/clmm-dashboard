interface ProgressBarProps {
  value: number
  max: number
  label: string
}

export function ProgressBar({ value, max, label }: ProgressBarProps) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0

  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs mb-1">
        <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
        <span style={{ color: 'var(--text-muted)' }}>
          ${value.toFixed(2)} / ${max.toFixed(2)}
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: pct >= 100
              ? 'var(--accent-green)'
              : 'linear-gradient(90deg, var(--accent-blue), var(--accent-purple))',
          }}
        />
      </div>
    </div>
  )
}
