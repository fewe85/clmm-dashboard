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
  const h = 48
  const baseline = h - 6
  const yAxisW = 22 // space for Y labels

  // Generate oscilloscope path with smooth curves
  const points: string[] = []
  const costPerReb = swapCostTotal > 0 && totalRebalances > 0 ? swapCostTotal / totalRebalances : 1.5
  for (let i = 0; i < BINS; i++) {
    const x = yAxisW + (i / (BINS - 1)) * (w - yAxisW)
    if (bins[i] > 0) {
      const spikeH = (bins[i] / maxBin) * (h - 14)
      // Sharp spike up and smooth decay
      const x0 = x - 1.5
      const x1 = x
      const x2 = x + 3
      points.push(`L ${x0} ${baseline}`)
      points.push(`L ${x1} ${baseline - spikeH}`)
      points.push(`C ${x1 + 1} ${baseline - spikeH * 0.3}, ${x2 - 1} ${baseline - 1}, ${x2} ${baseline}`)
    }
  }

  const path = `M ${yAxisW} ${baseline} ${points.join(' ')} L ${w} ${baseline}`

  // Glow dots at peaks
  const dots: { x: number; y: number; count: number }[] = []
  for (let i = 0; i < BINS; i++) {
    if (bins[i] > 0) {
      const x = yAxisW + (i / (BINS - 1)) * (w - yAxisW)
      const spikeH = (bins[i] / maxBin) * (h - 14)
      dots.push({ x, y: baseline - spikeH, count: bins[i] })
    }
  }

  return (
    <div className="rounded-xl overflow-hidden" style={{
      background: `radial-gradient(circle at 50% 50%, rgba(0,255,136,0.03) 0%, transparent 30%, rgba(0,255,136,0.02) 50%, transparent 70%, rgba(0,255,136,0.01) 90%), #050510`,
      border: '1px solid var(--border)',
    }}>
      {/* Oscilloscope label */}
      <div className="flex justify-between items-center px-3 pt-2">
        <span className="hud-label" style={{ color: 'var(--lavender)', opacity: 0.6 }}>Course Corrections</span>
        <span className="hud-label" style={{ opacity: 0.4 }}>7d</span>
      </div>

      {/* SVG oscilloscope */}
      <div className="px-2 py-1">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: '48px' }}>
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

          {/* Y-axis: even $1 steps + visible horizontal grid lines */}
          {(() => {
            const maxCost = Math.ceil(maxBin * costPerReb)
            const steps = Math.max(1, maxCost)
            return Array.from({ length: steps + 1 }, (_, i) => {
              const val = i
              const y = baseline - (i / steps) * (baseline - 6)
              return <g key={`y${i}`}>
                {i > 0 && <line x1={yAxisW} y1={y} x2={w} y2={y} stroke="#b0b8cc" strokeWidth="0.8" opacity="0.25" />}
                <text x={0} y={y + 3} fontSize="6.5" fill="#b0b8cc" fontFamily="JetBrains Mono">${val}</text>
              </g>
            })
          })()}
          {/* X-axis: day markers with vertical lines */}
          {Array.from({ length: DAYS }, (_, d) => {
            const x = yAxisW + ((d + 1) / DAYS) * (w - yAxisW)
            return <g key={`v${d}`}>
              <line x1={x} y1="0" x2={x} y2={baseline} stroke="var(--neon-green)" strokeWidth="0.5" opacity="0.12" strokeDasharray="2,3" />
              <text x={x - 4} y={h - 1} fontSize="5.5" fill="#8892b0" fontFamily="JetBrains Mono" textAnchor="middle">{d + 1}d</text>
            </g>
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
          <line x1={yAxisW} y1={baseline} x2={w} y2={baseline} stroke="#8892b0" strokeWidth="0.5" opacity="0.2" />
          <text x={0} y={baseline + 3} fontSize="6" fill="#b0b8cc" fontFamily="JetBrains Mono">$0</text>
        </svg>
      </div>

      {/* Stats row */}
      <div className="flex justify-between px-3 pb-2">
        <span className="mono" style={{ fontSize: '9px', color: '#b0b8cc' }}>
          <span className="earning-pulse" style={{ width: 4, height: 4, display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }} />
          {totalRebalances} corrections · last {lastAgo}
        </span>
        <span className="mono" style={{ fontSize: '9px', color: '#ff6b35' }}>~${swapCostTotal.toFixed(2)} fuel spent</span>
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
