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

interface PoolContext {
  invested: number
  entryPrice: number  // centerPrice at reset
  currentPrice: number
}

interface Props {
  aptSnapshots: Snapshot[]
  elonSnapshots: Snapshot[]
  aptClmmVsHodl: number
  elonClmmVsHodl: number
  aptContext?: PoolContext
  elonContext?: PoolContext
}

type TimeWindow = '24h' | '7d' | '30d' | 'all'

const WINDOWS: { key: TimeWindow; label: string; ms: number }[] = [
  { key: '24h', label: '24h', ms: 86400_000 },
  { key: '7d', label: '7d', ms: 7 * 86400_000 },
  { key: '30d', label: '30d', ms: 30 * 86400_000 },
  { key: 'all', label: 'All', ms: Infinity },
]

export function PerformanceChart({ aptSnapshots, elonSnapshots, aptClmmVsHodl, elonClmmVsHodl, aptContext, elonContext }: Props) {
  const [window, setWindow] = useState<TimeWindow>('all')
  const [mode, setMode] = useState<'profit' | 'vshodl'>('profit')

  const chartData = useMemo(() => {
    const allSnaps = [
      ...aptSnapshots.map(s => ({ ...s, pool: 'apt' as const })),
      ...elonSnapshots.map(s => ({ ...s, pool: 'elon' as const })),
    ].sort((a, b) => new Date(a.t).getTime() - new Date(b.t).getTime())

    if (allSnaps.length < 2) {
      const total = mode === 'vshodl'
        ? aptClmmVsHodl + elonClmmVsHodl
        : aptClmmVsHodl + elonClmmVsHodl
      return [
        { time: Date.now() - 3600_000, label: fmtDate(new Date(Date.now() - 3600_000)), value: 0 },
        { time: Date.now(), label: fmtDate(new Date()), value: total },
      ]
    }

    const cutoff = window === 'all' ? 0 : Date.now() - WINDOWS.find(w => w.key === window)!.ms
    const filteredSnaps = allSnaps.filter(s => new Date(s.t).getTime() >= cutoff)
    if (filteredSnaps.length < 2) return []

    const firstApt = filteredSnaps.find(s => s.pool === 'apt')
    const firstElon = filteredSnaps.find(s => s.pool === 'elon')
    const baseApt = firstApt ? (firstApt.posUsd || 0) + firstApt.feesUsd + firstApt.rewardsUsd : 0
    const baseElon = firstElon ? (firstElon.posUsd || 0) + firstElon.feesUsd + firstElon.rewardsUsd : 0
    const baseTotal = baseApt + baseElon

    // For vsHodl: track price changes to compute HODL return at each snapshot
    const firstAptPos = firstApt?.posUsd || 0
    const firstElonPos = firstElon?.posUsd || 0

    const points: { time: number; label: string; value: number }[] = []
    let lastAptValue = baseApt
    let lastElonValue = baseElon
    let lastAptPos = firstAptPos
    let lastElonPos = firstElonPos

    for (const snap of filteredSnaps) {
      const t = new Date(snap.t).getTime()
      const snapTotal = (snap.posUsd || 0) + snap.feesUsd + snap.rewardsUsd

      if (snap.pool === 'apt') {
        lastAptValue = snapTotal
        lastAptPos = snap.posUsd || lastAptPos
      } else {
        lastElonValue = snapTotal
        lastElonPos = snap.posUsd || lastElonPos
      }

      const netProfit = (lastAptValue + lastElonValue) - baseTotal

      if (mode === 'vshodl') {
        // HODL return = change in position value (price movement effect)
        const hodlReturn = (lastAptPos - firstAptPos) + (lastElonPos - firstElonPos)
        points.push({ time: t, label: fmtDate(new Date(t)), value: netProfit - hodlReturn })
      } else {
        points.push({ time: t, label: fmtDate(new Date(t)), value: netProfit })
      }
    }

    return points
  }, [aptSnapshots, elonSnapshots, aptClmmVsHodl, elonClmmVsHodl, window, mode, aptContext, elonContext])

  const lastValue = chartData.length > 0 ? chartData[chartData.length - 1].value : 0

  // Y-axis domain: always include 0
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
    </div>
  )
}

function fmtDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}
