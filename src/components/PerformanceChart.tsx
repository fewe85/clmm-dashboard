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
  netProfit: number
}

type TimeWindow = '24h' | '7d' | '30d' | 'all'

const WINDOWS: { key: TimeWindow; label: string; ms: number }[] = [
  { key: '24h', label: '24h', ms: 86400_000 },
  { key: '7d', label: '7d', ms: 7 * 86400_000 },
  { key: '30d', label: '30d', ms: 30 * 86400_000 },
  { key: 'all', label: 'All', ms: Infinity },
]

export function PerformanceChart({ aptSnapshots, elonSnapshots, aptClmmVsHodl, elonClmmVsHodl, totalInvested, daysRunning, netProfit }: Props) {
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

    const baseApt = filteredSnaps.find(s => s.pool === 'apt')
    const baseElon = filteredSnaps.find(s => s.pool === 'elon')

    const points: { time: number; label: string; profit: number; vshodl: number }[] = []

    let lastApt: Snapshot | null = null
    let lastElon: Snapshot | null = null

    for (const snap of filteredSnaps) {
      const t = new Date(snap.t).getTime()
      if (snap.pool === 'apt') lastApt = snap
      else lastElon = snap

      // Earnings curve (fees + rewards only, no posUsd jumps from deposits)
      let earnings = 0
      if (lastApt && baseApt) {
        earnings += (lastApt.feesUsd - baseApt.feesUsd) + (lastApt.rewardsUsd - baseApt.rewardsUsd)
      }
      if (lastElon && baseElon) {
        earnings += (lastElon.feesUsd - baseElon.feesUsd) + (lastElon.rewardsUsd - baseElon.rewardsUsd)
      }

      points.push({ time: t, label: fmtDate(new Date(t)), profit: earnings, vshodl: 0 })
    }

    // Scale P&L curve to match the accurate netProfit from PoolCard
    if (mode === 'profit' && points.length > 1 && netProfit !== 0) {
      const lastEarnings = points[points.length - 1].profit
      if (lastEarnings > 0) {
        const scale = netProfit / lastEarnings
        for (const p of points) p.profit *= scale
      }
    }

    if (mode === 'vshodl' && points.length > 0) {
      const currentVsHodl = aptClmmVsHodl + elonClmmVsHodl

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
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <div>
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-bold neon-value" style={{ color: 'var(--lavender)' }}>
              {mode === 'profit' ? 'MISSION LOG' : 'MISSION PERFORMANCE'}
            </h3>
            {/* Mode toggle */}
            <div className="flex gap-1">
              {([['profit', 'P&L'], ['vshodl', 'vs HODL']] as const).map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setMode(key)}
                  className="text-xs px-2.5 py-0.5 rounded cursor-pointer"
                  style={{
                    background: mode === key ? '#c77dff' : 'transparent',
                    color: mode === key ? 'white' : 'var(--text-muted)',
                    border: mode === key ? '1px solid #c77dff' : '1px solid #2a2a3a',
                    transition: 'all 0.2s',
                    textShadow: mode === key ? '0 0 4px rgba(199,125,255,0.4)' : 'none',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="hud-label mt-0.5" style={{ fontSize: '8px' }}>
            {mode === 'profit' ? '(Fees + Rewards - IL - Swaps)' : '(CLMM/HODL)'}
          </div>
        </div>

        {/* Time window buttons */}
        <div className="flex gap-1">
          {WINDOWS.map(w => (
            <button
              key={w.key}
              onClick={() => setWindow(w.key)}
              className="text-xs px-2 py-0.5 rounded cursor-pointer"
              style={{
                background: window === w.key ? 'transparent' : 'transparent',
                color: window === w.key ? '#00ff88' : 'var(--text-muted)',
                border: window === w.key ? '1px solid #00ff88' : '1px solid #2a2a3a',
                boxShadow: window === w.key ? '0 0 6px rgba(0,255,136,0.2)' : 'none',
                transition: 'all 0.2s',
              }}
            >
              {w.label}
            </button>
          ))}
        </div>
      </div>

      {chartData.length <= 2 && (
        <div className="text-xs mb-1 hud-label" style={{ fontSize: '8px' }}>
          Collecting hourly snapshots — chart fills over time
        </div>
      )}

      <div style={{ height: 180 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
            <defs>
              <linearGradient id="gradGreen" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#00ff88" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#00ff88" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradRed" x1="0" y1="1" x2="0" y2="0">
                <stop offset="0%" stopColor="#ff2a6d" stopOpacity={0.2} />
                <stop offset="100%" stopColor="#ff2a6d" stopOpacity={0} />
              </linearGradient>
              <filter id="chartGlow">
                <feGaussianBlur in="SourceGraphic" stdDeviation="1.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>
            <CartesianGrid strokeDasharray="1 6" stroke="var(--border)" strokeOpacity={0.4} />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 9, fill: '#555', fontFamily: 'JetBrains Mono' }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 9, fill: '#555', fontFamily: 'JetBrains Mono' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={v => `$${(Number(v) || 0).toFixed(2)}`}
              width={55}
              domain={[minVal - padding, maxVal + padding]}
            />
            <ReferenceLine y={0} stroke="var(--text-muted)" strokeWidth={1} strokeOpacity={0.4} />
            <Tooltip
              contentStyle={{
                background: '#0d0d22',
                border: '1px solid #2a2a3a',
                borderRadius: 6,
                fontSize: 11,
                fontFamily: 'JetBrains Mono',
              }}
              labelStyle={{ color: 'var(--text-muted)' }}
              formatter={(val) => [`$${Number(val).toFixed(2)}`, mode === 'profit' ? 'Mission Yield' : 'NAV Advantage']}
            />
            <Area
              type="monotone"
              dataKey="value"
              name="Earnings"
              stroke={lastValue >= 0 ? '#00ff88' : '#ff2a6d'}
              strokeWidth={2}
              fill={lastValue >= 0 ? 'url(#gradGreen)' : 'url(#gradRed)'}
              filter="url(#chartGlow)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Bottom stats */}
      {mode === 'vshodl' && daysRunning > 0 && totalInvested > 0 && <ProjectedRates
        vsHodl={aptClmmVsHodl + elonClmmVsHodl}
        invested={totalInvested}
        days={daysRunning}
      />}
      {mode === 'profit' && daysRunning > 0 && lastValue !== 0 && <ProfitRates
        profit={lastValue}
        days={daysRunning}
      />}
    </div>
  )
}

function ProjectedRates({ vsHodl, invested, days }: { vsHodl: number; invested: number; days: number }) {
  const dailyRate = vsHodl / days
  const apr = (vsHodl / invested) * (365 / days) * 100
  const monthly = dailyRate * 30
  const yearly = dailyRate * 365

  return (
    <div className="flex flex-wrap items-center gap-4 mt-3 pt-3" style={{ borderTop: '1px solid #2a2a3a' }}>
      <Stat label="NAV ADVANTAGE" value={`${apr >= 0 ? '+' : ''}${apr.toFixed(0)}% APR`} positive={apr >= 0} />
      <Sep />
      <Stat label="VELOCITY" value={`${dailyRate >= 0 ? '+' : ''}$${Math.abs(dailyRate).toFixed(2)}/d`} positive={dailyRate >= 0} />
      <Stat label="MONTHLY" value={fmtBig(monthly)} positive={monthly >= 0} />
      <Stat label="PROJECTED RANGE" value={fmtBig(yearly)} positive={yearly >= 0} />
      <span className="hud-label" style={{ fontSize: '7px', opacity: 0.5 }}>
        ({days.toFixed(1)}d measured)
      </span>
    </div>
  )
}

function ProfitRates({ profit, days }: { profit: number; days: number }) {
  const daily = profit / days
  const monthly = daily * 30
  const yearly = daily * 365

  return (
    <div className="flex flex-wrap items-center gap-4 mt-3 pt-3" style={{ borderTop: '1px solid #2a2a3a' }}>
      <Stat label="MISSION YIELD" value={`${profit >= 0 ? '+' : ''}$${Math.abs(profit).toFixed(2)}`} positive={profit >= 0} />
      <Sep />
      <Stat label="VELOCITY" value={`${daily >= 0 ? '+' : ''}$${Math.abs(daily).toFixed(2)}/d`} positive={daily >= 0} />
      <Stat label="MONTHLY" value={fmtBig(monthly)} positive={monthly >= 0} />
      <Stat label="PROJECTED RANGE" value={fmtBig(yearly)} positive={yearly >= 0} />
      <span className="hud-label" style={{ fontSize: '7px', opacity: 0.5 }}>
        ({days.toFixed(1)}d measured)
      </span>
    </div>
  )
}

function Stat({ label, value, positive }: { label: string; value: string; positive: boolean }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="hud-label" style={{ fontSize: '8px' }}>{label}</span>
      <span className="mono text-xs font-semibold" style={{ color: positive ? '#00ff88' : '#ff2a6d' }}>
        {value}
      </span>
    </div>
  )
}

function Sep() {
  return <div style={{ width: 1, height: 14, background: '#2a2a3a' }} />
}

function fmtBig(v: number): string {
  const sign = v >= 0 ? '+' : '-'
  const abs = Math.abs(v)
  return abs >= 1000 ? `${sign}$${(abs / 1000).toFixed(1)}k` : `${sign}$${abs.toFixed(2)}`
}

function fmtDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}
