interface PerformanceSectionProps {
  totalPositionUsd: number
  totalIdleUsd: number
  totalValueUsd: number
  totalFeesUsd: number
  totalRewardsUsd: number
  pnlUsd: number
  pnlPct: number
  initialCapital: number
  deepUptime: string
  walUptime: string
  suiTurbosUptime: string
  aptosUptime: string
  elonUptime: string
}

function formatUsd(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function PerformanceSection({
  totalPositionUsd,
  totalIdleUsd,
  totalValueUsd,
  totalFeesUsd,
  totalRewardsUsd,
  pnlUsd,
  pnlPct,
  initialCapital,
  deepUptime,
  walUptime,
  suiTurbosUptime,
  aptosUptime,
  elonUptime,
}: PerformanceSectionProps) {
  const pnlPositive = pnlUsd >= 0

  return (
    <div
      className="rounded-xl p-5"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <h2 className="text-sm font-medium mb-4" style={{ color: 'var(--text-muted)' }}>
        Portfolio Overview
      </h2>

      {/* Main metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Total Value</div>
          <div className="text-xl font-bold mt-1">{formatUsd(totalValueUsd)}</div>
          <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Pos {formatUsd(totalPositionUsd)} + Idle {formatUsd(totalIdleUsd)}
          </div>
        </div>
        <div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>P&L vs {formatUsd(initialCapital)}</div>
          <div
            className="text-xl font-bold mt-1"
            style={{ color: pnlPositive ? 'var(--accent-green)' : 'var(--accent-red)' }}
          >
            {pnlPositive ? '+' : ''}{formatUsd(pnlUsd)}
          </div>
          <div
            className="text-xs mt-0.5"
            style={{ color: pnlPositive ? 'var(--accent-green)' : 'var(--accent-red)' }}
          >
            {pnlPositive ? '+' : ''}{pnlPct.toFixed(1)}%
          </div>
        </div>
        <div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Pending Fees</div>
          <div className="text-xl font-bold mt-1" style={{ color: 'var(--accent-green)' }}>
            {formatUsd(totalFeesUsd)}
          </div>
        </div>
        <div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Pending Rewards</div>
          <div className="text-xl font-bold mt-1" style={{ color: 'var(--accent-purple)' }}>
            {formatUsd(totalRewardsUsd)}
          </div>
        </div>
      </div>

      {/* Bot uptime */}
      <div
        className="flex flex-wrap gap-x-6 gap-y-1 pt-3 text-xs"
        style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}
      >
        <span>DEEP/USDC: <span style={{ color: 'var(--text-secondary)' }}>{deepUptime}</span></span>
        <span>WAL/USDC: <span style={{ color: 'var(--text-secondary)' }}>{walUptime}</span></span>
        <span>SUI/TURBOS: <span style={{ color: 'var(--text-secondary)' }}>{suiTurbosUptime}</span></span>
        <span>APT/USDC: <span style={{ color: 'var(--text-secondary)' }}>{aptosUptime}</span></span>
        <span>ELON/USDC: <span style={{ color: 'var(--text-secondary)' }}>{elonUptime}</span></span>
      </div>
    </div>
  )
}
