import type { PoolGroup } from '../types'
import { PoolPanel } from './PoolPanel'

interface PoolGroupProps {
  group: PoolGroup
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

export function PoolGroup({ group, loading }: PoolGroupProps) {
  const wb = group.walletBalance

  return (
    <div>
      {/* Group Header */}
      <div
        className="rounded-t-xl px-5 py-3 flex items-center justify-between"
        style={{
          background: 'var(--bg-card)',
          borderTop: `2px solid ${group.chainColor}`,
          borderLeft: '1px solid var(--border)',
          borderRight: '1px solid var(--border)',
        }}
      >
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold">{group.protocol}</span>
          <span
            className="text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ background: `${group.chainColor}20`, color: group.chainColor }}
          >
            {group.chain.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Shared Wallet Balance */}
      {wb && (
        <div
          className="px-5 py-3"
          style={{
            background: 'var(--bg-card)',
            borderLeft: '1px solid var(--border)',
            borderRight: '1px solid var(--border)',
          }}
        >
          <div className="flex justify-between items-baseline mb-1.5">
            <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Shared Wallet</span>
            <span className="text-sm font-medium" style={{ color: 'var(--text-secondary)' }}>
              {formatUsd(wb.totalIdleUsd + wb.gasValueUsd)}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
            <span>
              {formatAmount(wb.gasBalance, 4)} {wb.gasToken}
              <span
                className="ml-1 px-1 py-px rounded"
                style={{ background: 'rgba(234,179,8,0.15)', color: 'var(--accent-yellow)', fontSize: '10px' }}
              >
                GAS
              </span>
              <span className="ml-1" style={{ color: 'var(--text-muted)' }}>{formatUsd(wb.gasValueUsd)}</span>
            </span>
            {wb.idleBalances.map(b => (
              <span key={b.token}>
                {formatAmount(b.amount, b.token === 'USDC' ? 2 : 4)} {b.token}
                <span className="ml-1" style={{ color: 'var(--text-muted)' }}>{formatUsd(b.valueUsd)}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Pool Panels */}
      <div
        className="rounded-b-xl p-3 pt-0"
        style={{
          background: 'var(--bg-card)',
          borderBottom: '1px solid var(--border)',
          borderLeft: '1px solid var(--border)',
          borderRight: '1px solid var(--border)',
        }}
      >
        <div className={`grid gap-3 ${group.pools.length > 1 ? 'grid-cols-1 md:grid-cols-2' : 'grid-cols-1'}`}>
          {group.pools.map(pool => (
            <PoolPanel key={pool.name} pool={pool} loading={loading} />
          ))}
        </div>
      </div>
    </div>
  )
}
