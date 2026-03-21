import type { RebalanceMetric } from '../types'

interface Props {
  totalRebalances: number
  rebalances24h: number
  rebalances7d: number
  avgTimeBetweenRebalances: number
  metrics: RebalanceMetric[]
  lastRebalanceAt: string | null
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const now = Date.now()
  const diffMs = now - d.getTime()
  const hours = Math.floor(diffMs / (1000 * 60 * 60))
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    return `${days}d ${hours % 24}h ago`
  }
  return `${hours}h ${mins}m ago`
}

export function RebalanceStats({ totalRebalances, rebalances24h, rebalances7d, avgTimeBetweenRebalances, metrics, lastRebalanceAt }: Props) {
  const hasMetrics = metrics.length > 0

  // Estimated swap costs from metrics
  const avgCostPerRebalance = hasMetrics
    ? metrics.reduce((s, m) => s + (m.range_delta_pct ?? 0), 0) / metrics.length
    : 0
  const cumulativeSwapCost = hasMetrics
    ? metrics.reduce((s, m) => s + (m.total_cost_usd ?? 0), 0)
    : 0

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>
        Rebalance Stats
      </h3>

      <div className="grid grid-cols-2 gap-3">
        <StatRow label="Total" value={String(totalRebalances)} />
        <StatRow label="Last" value={formatTimestamp(lastRebalanceAt)} />
        <StatRow label="24h" value={String(rebalances24h)} />
        <StatRow label="7d" value={String(rebalances7d)} />
        <StatRow
          label="Avg Interval"
          value={avgTimeBetweenRebalances > 0 ? `${avgTimeBetweenRebalances.toFixed(1)}h` : '—'}
        />
        <StatRow
          label="Swap Costs"
          value={hasMetrics ? `$${cumulativeSwapCost.toFixed(2)}` : 'Wird gemessen...'}
        />
      </div>

      {hasMetrics && avgCostPerRebalance > 0 && (
        <div className="mt-3 text-xs" style={{ color: 'var(--text-muted)' }}>
          Avg range delta: {avgCostPerRebalance.toFixed(1)}%
        </div>
      )}
    </div>
  )
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="mono text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{value}</div>
    </div>
  )
}
