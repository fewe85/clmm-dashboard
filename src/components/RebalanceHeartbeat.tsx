import type { RebalanceMetric } from '../types'

interface RebalanceHeartbeatProps {
  metrics: RebalanceMetric[]
  totalRebalances: number
  lastRebalanceAt: string | null
  swapCostTotal: number
}

/** Oscilloscope-style rebalance visualization */
export function RebalanceHeartbeat({ metrics, totalRebalances, lastRebalanceAt, swapCostTotal }: RebalanceHeartbeatProps) {
  if (totalRebalances <= 0) return null

  const lastAgo = lastRebalanceAt ? fmtTimeAgo(lastRebalanceAt) : '—'

  // Build 7-day hourly histogram (168 bins)
  const DAYS = 7
  const BINS = DAYS * 24
  const now = Date.now()
  const binWidth = (DAYS * 86400_000) / BINS
  const bins = new Array(BINS).fill(0)

  for (const m of metrics) {
    const age = now - new Date(m.timestamp).getTime()
    if (age > DAYS * 86400_000 || age < 0) continue
    const bin = BINS - 1 - Math.floor(age / binWidth)
    if (bin >= 0 && bin < BINS) bins[bin]++
  }

  const maxBin = Math.max(1, ...bins)
  const w = 320
  const h = 40
  const baseline = h - 4

  // Generate oscilloscope path with smooth curves
  const points: string[] = []
  for (let i = 0; i < BINS; i++) {
    const x = (i / (BINS - 1)) * w
    if (bins[i] > 0) {
      const spikeH = (bins[i] / maxBin) * (h - 10)
      // Sharp spike up and smooth decay
      const x0 = x - 1.5
      const x1 = x
      const x2 = x + 3
      points.push(`L ${x0} ${baseline}`)
      points.push(`L ${x1} ${baseline - spikeH}`)
      points.push(`C ${x1 + 1} ${baseline - spikeH * 0.3}, ${x2 - 1} ${baseline - 1}, ${x2} ${baseline}`)
    }
  }

  const path = `M 0 ${baseline} ${points.join(' ')} L ${w} ${baseline}`

  // Glow dots at peaks
  const dots: { x: number; y: number; count: number }[] = []
  for (let i = 0; i < BINS; i++) {
    if (bins[i] > 0) {
      const x = (i / (BINS - 1)) * w
      const spikeH = (bins[i] / maxBin) * (h - 10)
      dots.push({ x, y: baseline - spikeH, count: bins[i] })
    }
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{ background: '#050510', border: '1px solid var(--border)' }}>
      {/* Oscilloscope label */}
      <div className="flex justify-between items-center px-3 pt-2">
        <span className="hud-label" style={{ color: 'var(--neon-yellow)', opacity: 0.6 }}>Rebalance Activity</span>
        <span className="hud-label" style={{ opacity: 0.4 }}>7d</span>
      </div>

      {/* SVG oscilloscope */}
      <div className="px-2 py-1">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: '40px' }}>
          <defs>
            {/* Phosphor glow filter */}
            <filter id="phosphor">
              <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>

            {/* Afterglow gradient */}
            <linearGradient id="trace-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--neon-green)" stopOpacity="0.1" />
              <stop offset="100%" stopColor="var(--neon-green)" stopOpacity="0.7" />
            </linearGradient>
          </defs>

          {/* Grid */}
          {Array.from({ length: 5 }, (_, i) => {
            const y = 4 + (i / 4) * (h - 8)
            return <line key={`h${i}`} x1="0" y1={y} x2={w} y2={y} stroke="var(--neon-green)" strokeWidth="0.15" opacity="0.1" />
          })}
          {Array.from({ length: DAYS + 1 }, (_, d) => {
            const x = (d / DAYS) * w
            return <line key={`v${d}`} x1={x} y1="0" x2={x} y2={h} stroke="var(--neon-green)" strokeWidth="0.15" opacity="0.1" />
          })}

          {/* Afterglow trace (wider, dimmer) */}
          <path d={path} fill="none" stroke="var(--neon-green)" strokeWidth="3" opacity="0.08" filter="url(#phosphor)" />

          {/* Main trace */}
          <path d={path} fill="none" stroke="url(#trace-grad)" strokeWidth="1.2" strokeLinecap="round" filter="url(#phosphor)" />

          {/* Peak dots */}
          {dots.map((d, i) => (
            <g key={i}>
              <circle cx={d.x} cy={d.y} r="4" fill="var(--neon-green)" opacity="0.1" />
              <circle cx={d.x} cy={d.y} r={d.count > 1 ? 2 : 1.2} fill="var(--neon-green)" opacity="0.8">
                {i === dots.length - 1 && (
                  <animate attributeName="opacity" values="0.5;1;0.5" dur="1.5s" repeatCount="indefinite" />
                )}
              </circle>
            </g>
          ))}

          {/* Baseline glow */}
          <line x1="0" y1={baseline} x2={w} y2={baseline} stroke="var(--neon-green)" strokeWidth="0.4" opacity="0.2" />
        </svg>
      </div>

      {/* Stats row */}
      <div className="flex justify-between px-3 pb-2">
        <span className="mono hud-label">{totalRebalances} rebalances · last {lastAgo}</span>
        <span className="mono hud-label">~${swapCostTotal.toFixed(2)} swap costs</span>
      </div>
    </div>
  )
}

function fmtTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`
  return `${h}h ${m}m`
}
