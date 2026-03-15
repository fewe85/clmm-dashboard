import type { PoolPerformance } from '../types'

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
  ikaUptime: string
  suiUsdcUptime: string
  aptosUptime: string
  elonUptime: string
  poolPerformances: PoolPerformance[]
  totalNetProfit: number
  totalHarvested: number
  totalHodlValue: number
  totalLpValue: number
  totalRebalances: number
}

function formatUsd(n: number): string {
  return `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

function pnlColor(n: number): string {
  return n >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'
}

function pnlSign(n: number): string {
  return n >= 0 ? '+' : ''
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
  ikaUptime,
  suiUsdcUptime,
  aptosUptime,
  elonUptime,
  poolPerformances,
  totalNetProfit,
  totalHarvested,
  totalHodlValue,
  totalLpValue,
  totalRebalances,
}: PerformanceSectionProps) {
  const pnlPositive = pnlUsd >= 0

  return (
    <div className="space-y-4">
      {/* Portfolio Overview */}
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
          <span>IKA/USDC: <span style={{ color: 'var(--text-secondary)' }}>{ikaUptime}</span></span>
          <span>SUI/USDC: <span style={{ color: 'var(--text-secondary)' }}>{suiUsdcUptime}</span></span>
          <span>APT/USDC: <span style={{ color: 'var(--text-secondary)' }}>{aptosUptime}</span></span>
          <span>ELON/USDC: <span style={{ color: 'var(--text-secondary)' }}>{elonUptime}</span></span>
        </div>
      </div>

      {/* Performance Comparison Table */}
      {poolPerformances.length > 0 && (
        <div
          className="rounded-xl p-5"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <h2 className="text-sm font-medium mb-4" style={{ color: 'var(--text-muted)' }}>
            Performance Analysis
          </h2>

          {/* Summary badges */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
            <div className="rounded-lg p-3" style={{ background: 'var(--bg-primary)' }}>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Net Profit</div>
              <div className="text-lg font-bold mt-0.5" style={{ color: pnlColor(totalNetProfit) }}>
                {pnlSign(totalNetProfit)}{formatUsd(totalNetProfit)}
              </div>
            </div>
            <div className="rounded-lg p-3" style={{ background: 'var(--bg-primary)' }}>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Total Harvested</div>
              <div className="text-lg font-bold mt-0.5" style={{ color: 'var(--accent-green)' }}>
                {formatUsd(totalHarvested)}
              </div>
            </div>
            <div className="rounded-lg p-3" style={{ background: 'var(--bg-primary)' }}>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>LP vs HODL</div>
              <div className="text-lg font-bold mt-0.5" style={{ color: pnlColor(totalLpValue + totalHarvested - totalHodlValue) }}>
                {pnlSign(totalLpValue + totalHarvested - totalHodlValue)}{formatUsd(totalLpValue + totalHarvested - totalHodlValue)}
              </div>
            </div>
            <div className="rounded-lg p-3" style={{ background: 'var(--bg-primary)' }}>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>HODL Value</div>
              <div className="text-lg font-bold mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                {formatUsd(totalHodlValue)}
              </div>
            </div>
            <div className="rounded-lg p-3" style={{ background: 'var(--bg-primary)' }}>
              <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Total Rebalances</div>
              <div className="text-lg font-bold mt-0.5" style={{ color: 'var(--accent-blue)' }}>
                {totalRebalances}
              </div>
            </div>
          </div>

          {/* Per-pool table */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                  <th className="text-left py-2 pr-3 font-medium">Pool</th>
                  <th className="text-right py-2 px-2 font-medium">Invested</th>
                  <th className="text-right py-2 px-2 font-medium">LP Value</th>
                  <th className="text-right py-2 px-2 font-medium">HODL Value</th>
                  <th className="text-right py-2 px-2 font-medium">LP vs HODL</th>
                  <th className="text-right py-2 px-2 font-medium">Harvested</th>
                  <th className="text-right py-2 px-2 font-medium">Net Profit</th>
                  <th className="text-right py-2 px-2 font-medium">APR</th>
                  <th className="text-right py-2 pl-2 font-medium">Rebals</th>
                </tr>
              </thead>
              <tbody>
                {poolPerformances.map(p => {
                  const isClosed = !!p.status
                  return (
                  <tr key={p.poolName} style={{ borderBottom: '1px solid var(--border)', opacity: isClosed ? 0.5 : 1 }}>
                    <td className="py-2 pr-3 font-medium" style={{ color: 'var(--text-primary)' }}>
                      {p.poolName}
                      {p.status && (
                        <span className="ml-2 text-[10px] font-normal px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-primary)', color: 'var(--text-muted)' }}>
                          {p.status}
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                      {formatUsd(p.initialInvestment)}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums font-medium" style={{ color: 'var(--text-primary)' }}>
                      {formatUsd(p.lpValueUsd)}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                      {formatUsd(p.hodlValueUsd)}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums font-medium" style={{ color: pnlColor(p.outperformanceUsd) }}>
                      {pnlSign(p.outperformanceUsd)}{formatUsd(p.outperformanceUsd)}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums" style={{ color: 'var(--accent-green)' }}>
                      {formatUsd(p.totalHarvestedUsd)}
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums font-medium" style={{ color: pnlColor(p.netProfitUsd) }}>
                      {pnlSign(p.netProfitUsd)}{formatUsd(p.netProfitUsd)}
                      <span className="ml-1 text-xs opacity-70">
                        ({pnlSign(p.netProfitPct)}{p.netProfitPct.toFixed(1)}%)
                      </span>
                    </td>
                    <td className="py-2 px-2 text-right tabular-nums" style={{ color: isClosed ? 'var(--text-muted)' : pnlColor(p.realizedApr) }}>
                      {isClosed ? '—' : `${p.realizedApr.toFixed(0)}%`}
                    </td>
                    <td className="py-2 pl-2 text-right tabular-nums" style={{ color: 'var(--accent-blue)' }}>
                      {isClosed ? '—' : p.totalRebalances}
                    </td>
                  </tr>
                  )
                })}
                {/* Totals row */}
                <tr style={{ borderTop: '2px solid var(--border)' }}>
                  <td className="py-2 pr-3 font-bold" style={{ color: 'var(--text-primary)' }}>
                    Total
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums font-bold" style={{ color: 'var(--text-secondary)' }}>
                    {formatUsd(poolPerformances.reduce((s, p) => s + p.initialInvestment, 0))}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums font-bold" style={{ color: 'var(--text-primary)' }}>
                    {formatUsd(totalLpValue)}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums font-bold" style={{ color: 'var(--text-secondary)' }}>
                    {formatUsd(totalHodlValue)}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums font-bold" style={{ color: pnlColor(totalLpValue + totalHarvested - totalHodlValue) }}>
                    {pnlSign(totalLpValue + totalHarvested - totalHodlValue)}{formatUsd(totalLpValue + totalHarvested - totalHodlValue)}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums font-bold" style={{ color: 'var(--accent-green)' }}>
                    {formatUsd(totalHarvested)}
                  </td>
                  <td className="py-2 px-2 text-right tabular-nums font-bold" style={{ color: pnlColor(totalNetProfit) }}>
                    {pnlSign(totalNetProfit)}{formatUsd(totalNetProfit)}
                  </td>
                  <td className="py-2 px-2 text-right" />
                  <td className="py-2 pl-2 text-right tabular-nums font-bold" style={{ color: 'var(--accent-blue)' }}>
                    {totalRebalances}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
