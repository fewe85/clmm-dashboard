import type { PoolData } from '../types'
import { RangeBar } from './RangeBar'
import { ProgressBar } from './ProgressBar'

interface PoolPanelProps {
  pool: PoolData | null
  loading: boolean
}

function formatUsd(n: number): string {
  if (n >= 1000) return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (n >= 1) return `$${n.toFixed(2)}`
  if (n >= 0.01) return `$${n.toFixed(4)}`
  return `$${n.toFixed(6)}`
}

function formatAmount(n: number, decimals: number = 4): string {
  if (n >= 1000) return n.toLocaleString('en-US', { maximumFractionDigits: 2 })
  return n.toFixed(decimals)
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const now = Date.now()
  const diffMs = now - d.getTime()
  const diffH = Math.floor(diffMs / (1000 * 60 * 60))
  const diffM = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
  if (diffH > 24) {
    const days = Math.floor(diffH / 24)
    return `${days}d ${diffH % 24}h ago`
  }
  return `${diffH}h ${diffM}m ago`
}

export function PoolPanel({ pool, loading }: PoolPanelProps) {
  if (!pool && loading) {
    return (
      <div
        className="rounded-xl p-6 animate-pulse"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <div className="h-6 rounded w-48 mb-4" style={{ background: 'var(--border)' }} />
        <div className="h-4 rounded w-32 mb-3" style={{ background: 'var(--border)' }} />
        <div className="h-20 rounded mb-3" style={{ background: 'var(--border)' }} />
        <div className="h-4 rounded w-40 mb-2" style={{ background: 'var(--border)' }} />
        <div className="h-4 rounded w-36" style={{ background: 'var(--border)' }} />
      </div>
    )
  }

  if (!pool) return null

  const totalApr = pool.feesApr + pool.rewardsApr
  const bs = pool.botState

  return (
    <div
      className="rounded-lg p-4 transition-colors"
      style={{
        background: 'var(--bg-primary)',
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-semibold">{pool.name}</h2>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium"
            style={{
              background: pool.inRange ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
              color: pool.inRange ? 'var(--accent-green)' : 'var(--accent-red)',
            }}
          >
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: pool.inRange ? 'var(--accent-green)' : 'var(--accent-red)' }}
            />
            {pool.inRange ? 'In Range' : 'Out of Range'}
          </div>
          {totalApr > 0 && (
            <span className="text-xs font-medium tabular-nums" style={{ color: 'var(--accent-yellow)' }}>
              APR {totalApr.toFixed(1)}%
            </span>
          )}
        </div>
      </div>

      {/* Error / Stale indicator */}
      {pool.error && !pool.stale && (
        <div
          className="text-xs px-3 py-2 rounded-lg mb-3"
          style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--accent-red)' }}
        >
          {pool.error}
        </div>
      )}
      {pool.stale && (
        <div
          className="text-xs px-3 py-2 rounded-lg mb-3"
          style={{ background: 'rgba(234,179,8,0.1)', color: 'var(--accent-yellow)' }}
        >
          RPC rate-limited — showing cached data
        </div>
      )}

      {/* APR breakdown */}
      {totalApr > 0 && (
        <div
          className="flex gap-4 text-xs mb-4 px-3 py-2 rounded-lg"
          style={{ background: 'var(--bg-primary)', color: 'var(--text-secondary)' }}
        >
          <span>Fees APR: <span style={{ color: 'var(--accent-green)' }}>{pool.feesApr.toFixed(1)}%</span></span>
          <span>Rewards APR: <span style={{ color: 'var(--accent-purple)' }}>{pool.rewardsApr.toFixed(1)}%</span></span>
        </div>
      )}

      {/* Price */}
      <div className="mb-4">
        <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
          Current Price
        </div>
        <div className="text-2xl font-bold tabular-nums">
          {formatUsd(pool.currentPrice)}
        </div>
        <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
          {pool.tokenB} per {pool.tokenA}
        </div>
      </div>

      {/* Range Bar + Trigger Distance */}
      <div className="mb-4">
        <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
          Position Range
        </div>
        <RangeBar
          priceLower={pool.priceLower}
          priceUpper={pool.priceUpper}
          currentPrice={pool.currentPrice}
          inRange={pool.inRange}
          triggerDistancePct={pool.triggerDistancePct}
        />
      </div>

      {/* Position Value */}
      <div
        className="rounded-lg p-3 mb-3"
        style={{ background: 'var(--bg-primary)' }}
      >
        <div className="flex justify-between items-baseline">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Position Value</span>
          <span className="text-lg font-semibold">{formatUsd(pool.positionValueUsd)}</span>
        </div>
        <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
          <span>{formatAmount(pool.amountA)} {pool.tokenA}</span>
          <span>{formatAmount(pool.amountB, 2)} {pool.tokenB}</span>
        </div>
      </div>

      {/* Fees */}
      <div
        className="rounded-lg p-3 mb-3"
        style={{ background: 'var(--bg-primary)' }}
      >
        <div className="flex justify-between items-baseline">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Pending Fees</span>
          <span className="font-medium" style={{ color: 'var(--accent-green)' }}>
            {formatUsd(pool.pendingFeesUsd)}
          </span>
        </div>
        <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
          <span>{formatAmount(pool.feesA, 6)} {pool.tokenA}</span>
          <span>{formatAmount(pool.feesB, 6)} {pool.tokenB}</span>
        </div>
      </div>

      {/* Rewards */}
      <div
        className="rounded-lg p-3 mb-3"
        style={{ background: 'var(--bg-primary)' }}
      >
        <div className="flex justify-between items-baseline">
          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Pending Rewards</span>
          <span className="font-medium" style={{ color: 'var(--accent-purple)' }}>
            {formatUsd(pool.pendingRewardsUsd)}
          </span>
        </div>
        <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
          {formatAmount(pool.rewardAmount, 6)} {pool.rewardToken}
        </div>
      </div>

      {/* Compound Progress (1% of position value) */}
      <ProgressBar
        value={pool.compoundPending}
        max={pool.compoundThreshold}
        label="Compound Progress"
      />

      {/* Last Rebalance / Compound */}
      {bs && (
        <div
          className="flex justify-between text-xs mt-3 pt-3"
          style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}
        >
          <span>Rebalance: <span style={{ color: 'var(--text-secondary)' }}>{formatTimestamp(bs.lastRebalanceAt)}</span></span>
          <span>Compound: <span style={{ color: 'var(--text-secondary)' }}>{formatTimestamp(bs.lastCompoundAt)}</span></span>
        </div>
      )}
    </div>
  )
}
