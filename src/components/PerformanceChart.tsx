import { useState, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import type { RebalanceMetric } from '../types'
import { INVESTED, BOT_START } from '../config'

interface Props {
  metrics: RebalanceMetric[]
  currentPositionValue: number
  totalHarvested: number
}

type TimeWindow = '24h' | '7d' | '30d' | 'all'

const WINDOWS: { key: TimeWindow; label: string; ms: number }[] = [
  { key: '24h', label: '24h', ms: 86400_000 },
  { key: '7d', label: '7d', ms: 7 * 86400_000 },
  { key: '30d', label: '30d', ms: 30 * 86400_000 },
  { key: 'all', label: 'All', ms: Infinity },
]

export function PerformanceChart({ metrics, currentPositionValue, totalHarvested }: Props) {
  const [window, setWindow] = useState<TimeWindow>('7d')

  const chartData = useMemo(() => {
    if (metrics.length === 0) {
      // Fallback: show current state as a single-point chart with start
      return [
        {
          time: new Date(BOT_START).getTime(),
          label: formatDate(new Date(BOT_START)),
          positionValue: INVESTED,
          harvested: 0,
          netProfit: 0,
        },
        {
          time: Date.now(),
          label: formatDate(new Date()),
          positionValue: currentPositionValue,
          harvested: totalHarvested,
          netProfit: currentPositionValue + totalHarvested - INVESTED,
        },
      ]
    }

    const cutoff = window === 'all' ? 0 : Date.now() - WINDOWS.find(w => w.key === window)!.ms
    return metrics
      .filter(m => new Date(m.timestamp).getTime() >= cutoff)
      .map(m => ({
        time: new Date(m.timestamp).getTime(),
        label: formatDate(new Date(m.timestamp)),
        positionValue: m.position_value_usd,
        harvested: 0, // cumulative harvest not tracked per-metric yet
        netProfit: m.position_value_usd - (m.total_cost_usd ?? INVESTED),
      }))
  }, [metrics, window, currentPositionValue, totalHarvested])

  const hasData = metrics.length > 0

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
          Performance
        </h3>
        <div className="flex gap-1">
          {WINDOWS.map(w => (
            <button
              key={w.key}
              onClick={() => setWindow(w.key)}
              className="text-xs px-2 py-1 rounded cursor-pointer transition-colors"
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

      {!hasData && (
        <div className="text-xs mb-2" style={{ color: 'var(--text-muted)' }}>
          Waiting for rebalance-metrics.jsonl — showing start vs current
        </div>
      )}

      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
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
              tickFormatter={v => `$${v.toFixed(0)}`}
              width={45}
            />
            <Tooltip
              contentStyle={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                fontSize: 12,
              }}
              labelStyle={{ color: 'var(--text-muted)' }}
              formatter={(val, name) => [`$${Number(val).toFixed(2)}`, String(name)]}
            />
            <Line
              type="monotone"
              dataKey="positionValue"
              name="Position Value"
              stroke="var(--accent-blue)"
              strokeWidth={2}
              dot={chartData.length <= 10}
            />
            <Line
              type="monotone"
              dataKey="netProfit"
              name="Net Profit"
              stroke="var(--accent-green)"
              strokeWidth={2}
              dot={chartData.length <= 10}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function formatDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`
}
