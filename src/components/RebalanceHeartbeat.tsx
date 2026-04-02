import type { RebalanceMetric } from '../types'

interface RebalanceHeartbeatProps {
  metrics: RebalanceMetric[]
  totalRebalances: number
  lastRebalanceAt: string | null
  swapCostTotal: number
}

/** Mini EKG-style chart showing rebalance events over time */
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

  // Generate SVG path — flat line with spikes at rebalance events
  const w = 320
  const h = 28
  const baseline = h - 2

  let path = `M 0 ${baseline}`
  for (let i = 0; i < BINS; i++) {
    const x = (i / (BINS - 1)) * w
    if (bins[i] > 0) {
      const spikeH = (bins[i] / maxBin) * (h - 6)
      path += ` L ${x} ${baseline} L ${x} ${baseline - spikeH} L ${x + 0.5} ${baseline}`
    }
  }
  path += ` L ${w} ${baseline}`

  // Glow dots at spike peaks
  const dots: { x: number; y: number; count: number }[] = []
  for (let i = 0; i < BINS; i++) {
    if (bins[i] > 0) {
      const x = (i / (BINS - 1)) * w
      const spikeH = (bins[i] / maxBin) * (h - 6)
      dots.push({ x, y: baseline - spikeH, count: bins[i] })
    }
  }

  return (
    <div className="rounded-xl px-3 py-2" style={{ background: 'var(--bg-primary)', border: '1px solid var(--border)' }}>
      {/* SVG heartbeat */}
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: '28px' }}>
        {/* Baseline */}
        <line x1="0" y1={baseline} x2={w} y2={baseline} stroke="var(--border)" strokeWidth="0.5" />

        {/* EKG path */}
        <path
          d={path}
          fill="none"
          stroke="var(--accent-green)"
          strokeWidth="1.2"
          strokeLinecap="round"
          opacity="0.7"
        />

        {/* Glow dots at peaks */}
        {dots.map((d, i) => (
          <circle
            key={i}
            cx={d.x}
            cy={d.y}
            r={d.count > 1 ? 2.5 : 1.5}
            fill="var(--accent-green)"
            opacity={0.6 + (d.count / maxBin) * 0.4}
          >
            {/* Pulse animation on most recent dot */}
            {i === dots.length - 1 && (
              <animate attributeName="r" values="1.5;3;1.5" dur="2s" repeatCount="indefinite" />
            )}
          </circle>
        ))}

        {/* Day markers */}
        {Array.from({ length: DAYS - 1 }, (_, d) => {
          const x = ((d + 1) / DAYS) * w
          return (
            <line key={d} x1={x} y1={0} x2={x} y2={h} stroke="var(--border)" strokeWidth="0.3" strokeDasharray="2,3" />
          )
        })}
      </svg>

      {/* Stats row */}
      <div className="flex justify-between text-xs mono mt-1" style={{ color: 'var(--text-muted)' }}>
        <span>{totalRebalances} rebalances · last {lastAgo}</span>
        <span>~${swapCostTotal.toFixed(2)} swap costs</span>
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
