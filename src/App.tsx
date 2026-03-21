import { usePoolData } from './hooks/usePoolData'
import { RangeBar } from './components/RangeBar'
import { PerformanceChart } from './components/PerformanceChart'
import { HarvestTracker } from './components/HarvestTracker'
import { RebalanceStats } from './components/RebalanceStats'
import { WalletBox } from './components/WalletBox'
import { FormulaBox } from './components/FormulaBox'
import { ErrorBoundary } from './components/ErrorBoundary'
import { POOL_NAME, DEX, INVESTED } from './config'

function formatUsd(v: number): string {
  if (v >= 1000) return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (v >= 1) return `$${v.toFixed(2)}`
  if (v >= 0.01) return `$${v.toFixed(4)}`
  return `$${v.toFixed(6)}`
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

function AppContent() {
  const {
    pool,
    botWallet,
    petraWallet,
    metrics,
    loading,
    countdown,
    refresh,
    positionValue,
    pendingFees,
    pendingRewards,
    totalHarvested,
    netProfit,
    netProfitPct,
    daysRunning,
    realizedApr,
    dailyEst,
    harvestRate7d,
    totalRebalances,
    rebalances24h,
    rebalances7d,
    avgTimeBetweenRebalances,
    rangeWidth,
    ceMultiplier,
  } = usePoolData()

  const isLoading = loading && !pool

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-[960px] mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold">{POOL_NAME}</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {DEX} — Aptos
            </p>
          </div>
          <div className="flex items-center gap-3">
            {pool && (
              <span
                className="text-xs px-2.5 py-1 rounded-full font-medium"
                style={{
                  background: pool.inRange ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                  color: pool.inRange ? 'var(--accent-green)' : 'var(--accent-red)',
                }}
              >
                {pool.inRange ? 'In Range' : 'Out of Range'}
              </span>
            )}
            <span className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>
              {countdown}s
            </span>
            <button
              onClick={refresh}
              disabled={loading}
              className="text-xs px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer disabled:opacity-50"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                color: 'var(--text-secondary)',
              }}
            >
              {loading ? '...' : 'Refresh'}
            </button>
          </div>
        </div>

        {/* Key metrics row */}
        {pool && (
          <div
            className="grid grid-cols-2 md:grid-cols-5 gap-4 rounded-xl p-4"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <MetricCard label="Position Value" value={formatUsd(positionValue)} />
            <MetricCard label="Invested" value={formatUsd(INVESTED)} />
            <MetricCard
              label="Net Profit"
              value={`${netProfit >= 0 ? '+' : ''}${formatUsd(netProfit)}`}
              color={netProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}
              sub={`${netProfitPct >= 0 ? '+' : ''}${netProfitPct.toFixed(1)}%`}
            />
            <MetricCard
              label="APR (realized)"
              value={`${realizedApr.toFixed(1)}%`}
              color="var(--accent-purple)"
              sub={`${daysRunning.toFixed(0)}d running`}
            />
            <MetricCard
              label="Est. Daily"
              value={dailyEst > 0 ? formatUsd(dailyEst) : '—'}
              sub={dailyEst > 0 ? `${formatUsd(dailyEst * 30)}/mo` : ''}
              color="var(--accent-blue)"
            />
          </div>
        )}

        {/* Pending fees + rewards summary */}
        {pool && (pendingFees > 0 || pendingRewards > 0) && (
          <div className="flex gap-4 mt-3 text-xs">
            <span style={{ color: 'var(--accent-green)' }}>
              Pending Fees: <span className="mono">{formatUsd(pendingFees)}</span>
              {pool.feesApr > 0 && <span className="ml-1" style={{ color: 'var(--text-muted)' }}>({pool.feesApr.toFixed(0)}% APR)</span>}
            </span>
            <span style={{ color: 'var(--accent-purple)' }}>
              Pending Rewards: <span className="mono">{formatUsd(pendingRewards)}</span>
              {' '}<span className="mono" style={{ color: 'var(--text-muted)' }}>({pool.rewardAmount.toFixed(4)} {pool.rewardToken})</span>
              {pool.rewardsApr > 0 && <span className="ml-1" style={{ color: 'var(--text-muted)' }}>({pool.rewardsApr.toFixed(0)}% APR)</span>}
            </span>
          </div>
        )}

        {/* Stale/error warnings */}
        {pool?.stale && (
          <div className="mt-2 text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(234,179,8,0.1)', color: 'var(--accent-yellow)' }}>
            Stale data — using cached values. {pool.error}
          </div>
        )}
        {pool?.error && !pool.stale && (
          <div className="mt-2 text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--accent-red)' }}>
            Error: {pool.error}
          </div>
        )}
      </div>

      {/* Loading skeleton */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-xl h-48 animate-pulse" style={{ background: 'var(--bg-card)' }} />
          ))}
        </div>
      )}

      {pool && !isLoading && (
        <div className="space-y-4">
          {/* Range Visualization */}
          <RangeBar
            priceLower={pool.priceLower}
            priceUpper={pool.priceUpper}
            currentPrice={pool.currentPrice}
            inRange={pool.inRange}
            triggerDistancePct={pool.triggerDistancePct}
            rangeWidth={rangeWidth}
            ceMultiplier={ceMultiplier}
          />

          {/* Performance Chart */}
          <PerformanceChart
            metrics={metrics}
            currentPositionValue={positionValue}
            totalHarvested={totalHarvested}
          />

          {/* Harvest + Rebalance side by side */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HarvestTracker
              totalHarvested={totalHarvested}
              harvestDetails={pool.harvestDetails}
              harvestRate7d={harvestRate7d}
              compoundPending={pool.compoundPending}
              compoundThreshold={pool.compoundThreshold}
              botState={pool.botState}
            />
            <RebalanceStats
              totalRebalances={totalRebalances}
              rebalances24h={rebalances24h}
              rebalances7d={rebalances7d}
              avgTimeBetweenRebalances={avgTimeBetweenRebalances}
              metrics={metrics}
              lastRebalanceAt={pool.botState?.lastRebalanceAt ?? null}
            />
          </div>

          {/* Wallets */}
          <WalletBox botWallet={botWallet} petraWallet={petraWallet} />

          {/* Position Detail */}
          <div
            className="rounded-xl p-5"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>
              Position Detail
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
              <div>
                <div style={{ color: 'var(--text-muted)' }}>APT Amount</div>
                <div className="mono" style={{ color: 'var(--text-primary)' }}>{pool.amountA.toFixed(4)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>USDC Amount</div>
                <div className="mono" style={{ color: 'var(--text-primary)' }}>{pool.amountB.toFixed(4)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Fee APT</div>
                <div className="mono" style={{ color: 'var(--text-primary)' }}>{pool.feesA.toFixed(6)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Fee USDC</div>
                <div className="mono" style={{ color: 'var(--text-primary)' }}>{pool.feesB.toFixed(6)}</div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Last Rebalance</div>
                <div className="mono" style={{ color: 'var(--text-primary)' }}>
                  {formatTimestamp(pool.botState?.lastRebalanceAt ?? null)}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Last Compound</div>
                <div className="mono" style={{ color: 'var(--text-primary)' }}>
                  {formatTimestamp(pool.botState?.lastCompoundAt ?? null)}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Last Harvest</div>
                <div className="mono" style={{ color: 'var(--text-primary)' }}>
                  {formatTimestamp(pool.botState?.lastHarvestAt ?? null)}
                </div>
              </div>
              <div>
                <div style={{ color: 'var(--text-muted)' }}>Total Fees APR</div>
                <div className="mono" style={{ color: 'var(--accent-green)' }}>
                  {(pool.feesApr + pool.rewardsApr).toFixed(0)}%
                </div>
              </div>
            </div>
          </div>

          {/* Formula Box */}
          <FormulaBox rangeWidth={rangeWidth} currentPrice={pool.currentPrice} />
        </div>
      )}

      {/* Footer */}
      <div className="text-center mt-6 text-xs" style={{ color: 'var(--text-muted)' }}>
        On-chain data only. No backend, no indexer.
      </div>
    </div>
  )
}

function MetricCard({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div>
      <div className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>{label}</div>
      <div className="mono text-sm font-semibold" style={{ color: color || 'var(--text-primary)' }}>
        {value}
      </div>
      {sub && (
        <div className="text-xs mt-0.5 mono" style={{ color: 'var(--text-muted)' }}>{sub}</div>
      )}
    </div>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  )
}

export default App
