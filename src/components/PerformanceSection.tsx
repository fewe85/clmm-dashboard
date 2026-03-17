import { useState } from 'react'
import type { PoolPerformance } from '../types'

type SortKey = 'poolName' | 'initialInvestment' | 'lpValueUsd' | 'hodlValueUsd' | 'outperformanceUsd' | 'totalHarvestedUsd' | 'netProfitUsd' | 'realizedApr' | 'totalRebalances'
type SortDir = 'asc' | 'desc'

interface PerformanceSectionProps {
  totalPositionUsd: number
  totalIdleUsd: number
  totalValueUsd: number
  totalFeesUsd: number
  totalRewardsUsd: number
  pnlUsd: number
  pnlPct: number
  initialCapital: number
  activePoolCount: number
  totalDailyEst: number
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
  activePoolCount,
  totalDailyEst,
  poolPerformances,
  totalNetProfit,
  totalHarvested,
  totalHodlValue,
  totalLpValue,
  totalRebalances,
}: PerformanceSectionProps) {
  const pnlPositive = pnlUsd >= 0
  const [sortKey, setSortKey] = useState<SortKey>('netProfitUsd')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const sortIndicator = (key: SortKey) => sortKey === key ? (sortDir === 'asc' ? ' \u25B2' : ' \u25BC') : ''

  // Separate active and closed pools; closed always at the end
  const activePools = poolPerformances.filter(p => !p.status)
  const closedPools = poolPerformances.filter(p => !!p.status)

  const sortedActive = [...activePools].sort((a, b) => {
    const aVal = a[sortKey]
    const bVal = b[sortKey]
    if (typeof aVal === 'string' && typeof bVal === 'string') {
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    }
    const diff = (aVal as number) - (bVal as number)
    return sortDir === 'asc' ? diff : -diff
  })
  const sortedPerformances = [...sortedActive, ...closedPools]

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

        {/* Summary line */}
        <div
          className="flex flex-wrap gap-x-6 gap-y-1 pt-3 text-xs"
          style={{ borderTop: '1px solid var(--border)', color: 'var(--text-muted)' }}
        >
          <span>{activePoolCount} Active Pools</span>
          <span>2 Chains (Sui + Aptos)</span>
          {totalDailyEst > 0 && (
            <>
              <span>Est. Daily: <span className="mono" style={{ color: 'var(--accent-green)' }}>{formatUsd(totalDailyEst)}</span></span>
              <span>Est. Monthly: <span className="mono" style={{ color: 'var(--accent-green)' }}>{formatUsd(totalDailyEst * 30)}</span></span>
            </>
          )}
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
                  {([
                    ['poolName', 'Pool', 'text-left pr-3'],
                    ['initialInvestment', 'Invested', 'text-right px-2'],
                    ['lpValueUsd', 'LP Value', 'text-right px-2'],
                    ['hodlValueUsd', 'HODL Value', 'text-right px-2'],
                    ['outperformanceUsd', 'LP vs HODL', 'text-right px-2'],
                    ['totalHarvestedUsd', 'Harvested', 'text-right px-2'],
                    ['netProfitUsd', 'Net Profit', 'text-right px-2'],
                    ['realizedApr', 'APR', 'text-right px-2'],
                    ['totalRebalances', 'Rebals', 'text-right pl-2'],
                  ] as [SortKey, string, string][]).map(([key, label, cls]) => (
                    <th
                      key={key}
                      className={`py-2 font-medium cursor-pointer select-none ${cls}`}
                      onClick={() => toggleSort(key)}
                      style={{ color: sortKey === key ? 'var(--accent-blue)' : undefined }}
                    >
                      {label}{sortIndicator(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sortedPerformances.map(p => {
                  const isClosed = !!p.status
                  return (
                  <tr key={p.poolName} style={{ borderBottom: '1px solid var(--border)', opacity: isClosed ? 0.4 : 1, fontStyle: isClosed ? 'italic' : undefined }}>
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
                    <td className="py-2 px-2 text-right tabular-nums" style={{ color: isClosed || p.netProfitUsd < 0 ? 'var(--text-muted)' : pnlColor(p.realizedApr) }}>
                      {isClosed || p.netProfitUsd < 0 ? '—' : `${p.realizedApr.toFixed(0)}%`}
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
