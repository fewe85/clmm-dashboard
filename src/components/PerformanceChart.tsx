import { useState, useMemo } from 'react'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine,
} from 'recharts'

interface Snapshot {
  t: string
  feesUsd: number
  rewardsUsd: number
  posUsd: number
}

interface Props {
  aptSnapshots: Snapshot[]
  elonSnapshots: Snapshot[]
  aptClmmVsHodl: number
  elonClmmVsHodl: number
  totalInvested: number
  daysRunning: number
}

type TimeWindow = '24h' | '7d' | '30d' | 'all'

const WINDOWS: { key: TimeWindow; label: string; ms: number }[] = [
  { key: '24h', label: '24h', ms: 86400_000 },
  { key: '7d', label: '7d', ms: 7 * 86400_000 },
  { key: '30d', label: '30d', ms: 30 * 86400_000 },
  { key: 'all', label: 'All', ms: Infinity },
]

export function PerformanceChart({ aptSnapshots, elonSnapshots, aptClmmVsHodl, elonClmmVsHodl, totalInvested, daysRunning }: Props) {
  const [window, setWindow] = useState<TimeWindow>('all')
  const [mode, setMode] = useState<'profit' | 'vshodl'>('profit')

  const chartData = useMemo(() => {
    const allSnaps = [
      ...aptSnapshots.map(s => ({ ...s, pool: 'apt' as const })),
      ...elonSnapshots.map(s => ({ ...s, pool: 'elon' as const })),
    ].sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime())

    if (allSnaps.length < 2) {
      const val = mode === 'vshodl' ? aptClmmVsHodl + elonClmmVsHodl : 0
      return [
        { time: Date.now() - 3600_000, label: fmtDate(new Date(Date.now() - 3600_000)), value: 0 },
        { time: Date.now(), label: fmtDate(new Date()), value: val },
      ]
    }

    const cutoff = window === 'all' ? 0 : Date.now() - WINDOWS.find(w => w.key === window)!.ms
    const filteredSnaps = allSnaps.filter(s => new Date(s.t).getTime() >= cutoff)
    if (filteredSnaps.length < 2) return []

    // Baseline: first snapshot per pool
    const baseApt = filteredSnaps.find(s => s.pool === 'apt')
    const baseElon = filteredSnaps.find(s => s.pool === 'elon')

    const points: { time: number; label: string; profit: number; vshodl: number }[] = []

    let lastApt: Snapshot | null = null
    let lastElon: Snapshot | null = null

    for (const snap of filteredSnaps) {
      const t = new Date(snap.t).getTime()
      if (snap.pool === 'apt') lastApt = snap
      else lastElon = snap

      // Net Profit: delta(fees + rewards + posValue) since baseline
      let profit = 0
      if (lastApt && baseApt) {
        profit += (lastApt.feesUsd - baseApt.feesUsd) + (lastApt.rewardsUsd - baseApt.rewardsUsd)
          + ((lastApt.posUsd || 0) - (baseApt.posUsd || 0))
      }
      if (lastElon && baseElon) {
        profit += (lastElon.feesUsd - baseElon.feesUsd) + (lastElon.rewardsUsd - baseElon.rewardsUsd)
          + ((lastElon.posUsd || 0) - (baseElon.posUsd || 0))
      }

      points.push({ time: t, label: fmtDate(new Date(t)), profit, vshodl: 0 })
    }

    // For vsHodl: we can't compute exact per-snapshot HODL returns (no price data).
    // Use the accurate PoolCard values for the final point, and scale the earnings
    // curve (profit minus position changes = pure earnings) proportionally.
    if (mode === 'vshodl' && points.length > 0) {
      const currentVsHodl = aptClmmVsHodl + elonClmmVsHodl

      // Pure earnings curve (no position value changes, just fees+rewards delta)
      const earningsPoints: number[] = points.map((_p, i) => {
        let earnings = 0
        if (lastApt && baseApt) {
          const a = filteredSnaps.filter(s => s.pool === 'apt' && new Date(s.t).getTime() <= (points[i]?.time || 0)).pop()
          if (a) earnings += (a.feesUsd - baseApt.feesUsd) + (a.rewardsUsd - baseApt.rewardsUsd)
        }
        if (lastElon && baseElon) {
          const e = filteredSnaps.filter(s => s.pool === 'elon' && new Date(s.t).getTime() <= (points[i]?.time || 0)).pop()
          if (e) earnings += (e.feesUsd - baseElon.feesUsd) + (e.rewardsUsd - baseElon.rewardsUsd)
        }
        return earnings
      })

      const finalEarnings = earningsPoints[earningsPoints.length - 1] || 1
      for (let i = 0; i < points.length; i++) {
        // Scale: earnings proportion × current accurate vsHodl value
        points[i].vshodl = finalEarnings > 0
          ? (earningsPoints[i] / finalEarnings) * currentVsHodl
          : 0
      }
    }

    return points.map(p => ({
      time: p.time,
      label: p.label,
      value: mode === 'vshodl' ? p.vshodl : p.profit,
    }))
  }, [aptSnapshots, elonSnapshots, aptClmmVsHodl, elonClmmVsHodl, window, mode])

  const lastValue = chartData.length > 0 ? chartData[chartData.length - 1].value : 0

  const values = chartData.map(d => d.value)
  const minVal = Math.min(0, ...values)
  const maxVal = Math.max(0, ...values)
  const padding = Math.max(Math.abs(maxVal - minVal) * 0.1, 0.5)

  return (
    <div className="card-glow rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
            {mode === 'profit' ? 'Net Profit (Fees + Rewards - IL - Swaps)' : 'CLMM vs HODL (Outperformance)'}
          </h3>
          <div className="flex gap-1">
            {([['profit', 'P&L'], ['vshodl', 'vs HODL']] as const).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setMode(key)}
                className="text-xs px-2 py-0.5 rounded cursor-pointer transition-colors"
                style={{
                  background: mode === key ? 'var(--accent-purple, #8b5cf6)' : 'transparent',
                  color: mode === key ? 'white' : 'var(--text-muted)',
                  border: 'none',
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-1">
          {WINDOWS.map(w => (
            <button
              key={w.key}
              onClick={() => setWindow(w.key)}
              className="text-xs px-2 py-0.5 rounded cursor-pointer transition-colors"
              style={{
                background: window === w.key ? 'var(--accent-blue)' : 'transparent',
                color: window === w.key ? 'white' : 'var(--text-muted)',
                border: 'none',
              }}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {chartData.length <= 2 && (
        <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
          Collecting hourly snapshots — chart fills over time
        </div>
      )}

      <div style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="gradGreen" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent-green)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="var(--accent-green)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradRed" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="var(--accent-red)" stopOpacity={0.3} />
                <stop offset="100%" stopColor="var(--accent-red)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 10, fill: 'var(--text-muted)' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={v => `$${(Number(v) || 0).toFixed(2)}`}
              width={55}
              domain={[minVal - padding, maxVal + padding]}
            />
            <ReferenceLine y={0} stroke="var(--text-muted)" strokeWidth={1.5} strokeOpacity={0.7} />
            <Tooltip
              contentStyle={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: 'var(--text-muted)' }}
              formatter={(val) => [`$${Number(val).toFixed(2)}`, mode === 'profit' ? 'Net Profit' : 'vs HODL']}
            />
            <Area
              type="monotone"
              dataKey="value"
              name="Earnings"
              stroke={lastValue >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}
              strokeWidth={2}
              fill={lastValue >= 0 ? 'url(#gradGreen)' : 'url(#gradRed)'}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Projected outperformance rates */}
      {mode === 'vshodl' && daysRunning > 0 && totalInvested > 0 && <ProjectedRates
        vsHodl={aptClmmVsHodl + elonClmmVsHodl}
        invested={totalInvested}
        days={daysRunning}
      />}
    </div>
  )
}

function ProjectedRates({ vsHodl, invested, days }: { vsHodl: number; invested: number; days: number }) {
  const dailyRate = vsHodl / days
  const projections = [
    { label: 'Daily', value: dailyRate },
    { label: 'Monthly', value: dailyRate * 30 },
    { label: 'Yearly', value: dailyRate * 365 },
  ]
  const apr = (vsHodl / invested) * (365 / days) * 100

  return (
    <div className="flex items-center gap-5 mt-3 pt-3" style={{ borderTop: '1px solid var(--border)' }}>
      <div className="flex items-baseline gap-1.5">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Outperformance APR</span>
        <span className="mono text-sm font-semibold" style={{ color: apr >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
          {apr >= 0 ? '+' : ''}{apr.toFixed(0)}%
        </span>
      </div>
      <div style={{ width: 1, height: 14, background: 'var(--border)' }} />
      {projections.map(p => (
        <div key={p.label} className="flex items-baseline gap-1">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{p.label}</span>
          <span className="mono text-xs font-medium" style={{ color: p.value >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
            {p.value >= 0 ? '+' : ''}{Math.abs(p.value) >= 1000 ? `$${(p.value / 1000).toFixed(1)}k` : `$${p.value.toFixed(2)}`}
          </span>
        </div>
      ))}
      <span className="text-xs" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
        ({days.toFixed(1)}d measured)
      </span>
    </div>
  )
}

function fmtDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}
