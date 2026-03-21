import { useState, useMemo } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts'
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
  const [window, setWindow] = useState<TimeWindow>('all')

  const chartData = useMemo(() => {
    if (metrics.length === 0) {
      // Fallback: two points — start ($0) and current net profit
      const netProfit = currentPositionValue + totalHarvested - INVESTED
      return [
        {
          time: new Date(BOT_START).getTime(),
          label: formatDate(new Date(BOT_START)),
          netProfit: 0,
        },
        {
          time: Date.now(),
          label: formatDate(new Date()),
          netProfit,
        },
      ]
    }

    const cutoff = window === 'all' ? 0 : Date.now() - WINDOWS.find(w => w.key === window)!.ms
    return metrics
      .filter(m => new Date(m.timestamp).getTime() >= cutoff)
      .map(m => ({
        time: new Date(m.timestamp).getTime(),
        label: formatDate(new Date(m.timestamp)),
        netProfit: m.position_value_usd + totalHarvested - INVESTED,
      }))
  }, [metrics, window, currentPositionValue, totalHarvested])

  const hasData = metrics.length > 0
  const lastProfit = chartData.length > 0 ? chartData[chartData.length - 1].netProfit : 0
  const lineColor = lastProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
          Net Profit
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
              tickFormatter={v => `$${v.toFixed(2)}`}
              width={50}
            />
            <ReferenceLine y={0} stroke="var(--text-muted)" strokeDasharray="3 3" strokeOpacity={0.5} />
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
              dataKey="netProfit"
              name="Net Profit"
              stroke={lineColor}
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
