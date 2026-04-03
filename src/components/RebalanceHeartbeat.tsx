import { useState } from 'react'
import type { RebalanceMetric } from '../types'

interface RebalanceHeartbeatProps {
  metrics: RebalanceMetric[]
  totalRebalances: number
  lastRebalanceAt: string | null
  swapCostTotal: number
}

type TimeWindow = '1d' | '1w' | '1m' | 'all'
const WINDOWS: { key: TimeWindow; label: string; ms: number }[] = [
  { key: '1d', label: '1D', ms: 86400_000 },
  { key: '1w', label: '1W', ms: 7 * 86400_000 },
  { key: '1m', label: '1M', ms: 30 * 86400_000 },
  { key: 'all', label: 'ALL', ms: Infinity },
]

export function RebalanceHeartbeat({ metrics, totalRebalances, lastRebalanceAt, swapCostTotal }: RebalanceHeartbeatProps) {
  const [window, setWindow] = useState<TimeWindow>('1w')
  if (totalRebalances <= 0) return null

  const lastAgo = lastRebalanceAt ? fmtTimeAgo(lastRebalanceAt) : '—'
  const costPerReb = swapCostTotal > 0 && totalRebalances > 0 ? swapCostTotal / totalRebalances : 1.5

  const now = Date.now()
  const windowMs = WINDOWS.find(w => w.key === window)!.ms
  const cutoff = windowMs === Infinity ? 0 : now - windowMs

  // Filter metrics to window
  const filtered = metrics.filter(m => new Date(m.timestamp).getTime() >= cutoff)
  const rebsInWindow = filtered.length

  // Build histogram based on window
  const DAYS = window === '1d' ? 1 : window === '1w' ? 7 : window === '1m' ? 30 : Math.max(7, Math.ceil((now - (metrics.length > 0 ? new Date(metrics[0].timestamp).getTime() : now)) / 86400_000))
  const BINS = Math.min(DAYS * 24, 720) // max 720 bins
  const binWidth = (DAYS * 86400_000) / BINS
  const bins = new Array(BINS).fill(0)

  for (const m of filtered) {
    const age = now - new Date(m.timestamp).getTime()
    if (age > DAYS * 86400_000 || age < 0) continue
    const bin = BINS - 1 - Math.floor(age / binWidth)
    if (bin >= 0 && bin < BINS) bins[bin]++
  }

  const maxBin = Math.max(1, ...bins)
  const w = 320, h = 48, baseline = h - 6, yAxisW = 22

  // Average cost per rebalance in window
  const avgCost = rebsInWindow > 0 ? (rebsInWindow * costPerReb) / rebsInWindow : 0
  const totalCostInWindow = rebsInWindow * costPerReb

  // Generate path
  const points: string[] = []
  for (let i = 0; i < BINS; i++) {
    const x = yAxisW + (i / (BINS - 1)) * (w - yAxisW)
    if (bins[i] > 0) {
      const spikeH = (bins[i] / maxBin) * (h - 14)
      const x0 = x - 1.5, x1 = x, x2 = x + 3
      points.push(`L ${x0} ${baseline}`)
      points.push(`L ${x1} ${baseline - spikeH}`)
      points.push(`C ${x1 + 1} ${baseline - spikeH * 0.3}, ${x2 - 1} ${baseline - 1}, ${x2} ${baseline}`)
    }
  }
  const path = `M ${yAxisW} ${baseline} ${points.join(' ')} L ${w} ${baseline}`

  const dots: { x: number; y: number; count: number }[] = []
  for (let i = 0; i < BINS; i++) {
    if (bins[i] > 0) {
      const x = yAxisW + (i / (BINS - 1)) * (w - yAxisW)
      const spikeH = (bins[i] / maxBin) * (h - 14)
      dots.push({ x, y: baseline - spikeH, count: bins[i] })
    }
  }

  // Average line Y
  const avgBin = rebsInWindow > 0 ? rebsInWindow / BINS : 0
  const avgLineY = avgBin > 0 ? baseline - (avgBin / maxBin) * (h - 14) : baseline

  // Day labels count based on window
  const dayLabelCount = Math.min(DAYS, 10)

  return (
    <div className="rounded-xl overflow-hidden" style={{
      background: `radial-gradient(circle at 50% 50%, rgba(0,255,136,0.03) 0%, transparent 30%, rgba(0,255,136,0.02) 50%, transparent 70%, rgba(0,255,136,0.01) 90%), #050510`,
      border: '1px solid var(--border)',
    }}>
      {/* Header with time filter */}
      <div className="flex justify-between items-center px-3 pt-2">
        <span className="hud-label" style={{ color: 'var(--lavender)', opacity: 0.6 }}>Course Corrections</span>
        <div className="flex gap-1">
          {WINDOWS.map(wn => (
            <button
              key={wn.key}
              onClick={() => setWindow(wn.key)}
              className="mono cursor-pointer"
              style={{
                fontSize: '7px',
                padding: '1px 4px',
                borderRadius: 3,
                border: window === wn.key ? '1px solid #00ff88' : '1px solid #2a2a3a',
                background: window === wn.key ? 'rgba(0,255,136,0.1)' : 'transparent',
                color: window === wn.key ? '#00ff88' : '#8892b0',
                transition: 'all 0.2s',
              }}
            >
              {wn.label}
            </button>
          ))}
        </div>
      </div>

      <div className="px-2 py-1">
        <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: '48px' }}>
          <defs>
            <filter id="phosphor">
              <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <linearGradient id="trace-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--neon-green)" stopOpacity="0.1" />
              <stop offset="100%" stopColor="var(--neon-green)" stopOpacity="0.7" />
            </linearGradient>
          </defs>

          {/* Y-axis: $1 steps + horizontal grid */}
          {(() => {
            const maxCost = Math.ceil(maxBin * costPerReb)
            const steps = Math.max(1, maxCost)
            return Array.from({ length: steps + 1 }, (_, i) => {
              const y = baseline - (i / steps) * (baseline - 6)
              return <g key={`y${i}`}>
                {i > 0 && <line x1={yAxisW} y1={y} x2={w} y2={y} stroke="#b0b8cc" strokeWidth="0.8" opacity="0.25" />}
                <text x={0} y={y + 3} fontSize="6.5" fill="#b0b8cc" fontFamily="JetBrains Mono">${i}</text>
              </g>
            })
          })()}

          {/* X-axis: day markers */}
          {Array.from({ length: dayLabelCount }, (_, d) => {
            const x = yAxisW + ((d + 1) / DAYS) * (w - yAxisW)
            return <g key={`v${d}`}>
              <line x1={x} y1="0" x2={x} y2={baseline} stroke="var(--neon-green)" strokeWidth="0.5" opacity="0.12" strokeDasharray="2,3" />
              <text x={x} y={h - 1} fontSize="5.5" fill="#8892b0" fontFamily="JetBrains Mono" textAnchor="middle">
                {window === '1d' ? `${(d + 1) * Math.floor(24 / dayLabelCount)}h` : `${d + 1}d`}
              </text>
            </g>
          })}

          {/* Average line (dashed, orange) */}
          {avgBin > 0 && avgLineY < baseline - 2 && (
            <line x1={yAxisW} y1={avgLineY} x2={w} y2={avgLineY}
              stroke="#ff6b35" strokeWidth="0.8" opacity="0.4" strokeDasharray="4,3" />
          )}

          {/* Afterglow */}
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

          {/* Baseline */}
          <line x1={yAxisW} y1={baseline} x2={w} y2={baseline} stroke="#8892b0" strokeWidth="0.5" opacity="0.2" />
          <text x={0} y={baseline + 3} fontSize="6.5" fill="#b0b8cc" fontFamily="JetBrains Mono">$0</text>
        </svg>
      </div>

      {/* Stats row */}
      <div className="flex justify-between items-center px-3 pb-2">
        <span className="mono" style={{ fontSize: '9px', color: '#b0b8cc' }}>
          <span className="earning-pulse" style={{ width: 4, height: 4, display: 'inline-block', verticalAlign: 'middle', marginRight: 4 }} />
          {rebsInWindow} corrections · last {lastAgo}
        </span>
        <span className="mono" style={{ fontSize: '9px' }}>
          <span style={{ color: '#ff6b35' }}>~${totalCostInWindow.toFixed(2)} spent</span>
          <span style={{ color: '#8892b0' }}> · avg ${avgCost.toFixed(2)}</span>
        </span>
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
