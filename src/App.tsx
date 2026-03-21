import { usePoolData, type PoolMetrics } from './hooks/usePoolData'
import { RangeBar } from './components/RangeBar'
import { PerformanceChart } from './components/PerformanceChart'
import { HarvestTracker } from './components/HarvestTracker'
import { RebalanceStats } from './components/RebalanceStats'
import { WalletBox } from './components/WalletBox'
import { FormulaBox } from './components/FormulaBox'
import { PnlBreakdown } from './components/PnlBreakdown'
import { ErrorBoundary } from './components/ErrorBoundary'
import {
  DEX, INITIAL_CAPITAL,
  APT_POOL_NAME, APT_SIGMA_DAILY, APT_ESTIMATED_C, APT_F_EFF_DAILY, APT_EST_SWAP_COST_PER_REBALANCE,
  ELON_POOL_NAME, ELON_SIGMA_DAILY, ELON_ESTIMATED_C, ELON_F_EFF_DAILY, ELON_EST_SWAP_COST_PER_REBALANCE,
} from './config'

function formatUsd(v: number): string {
  if (Math.abs(v) >= 1000) return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (Math.abs(v) >= 1) return `$${v.toFixed(2)}`
  if (Math.abs(v) >= 0.01) return `$${v.toFixed(4)}`
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

function PoolSection({
  pm,
  poolName,
  estSwapCost,
}: {
  pm: PoolMetrics
  poolName: string
  estSwapCost: number
}) {
  const { pool } = pm
  if (!pool) return null

  return (
    <div className="space-y-4">
      {/* Pool header with status */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>{poolName}</h2>
        <span
          className="text-xs px-2.5 py-1 rounded-full font-medium"
          style={{
            background: pool.inRange ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
            color: pool.inRange ? 'var(--accent-green)' : 'var(--accent-red)',
          }}
        >
          {pool.inRange ? 'In Range' : 'Out of Range'}
        </span>
      </div>

      {/* Pool metrics row */}
      <div
        className="grid grid-cols-2 md:grid-cols-5 gap-4 rounded-xl p-4"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
      >
        <MetricCard label="Position Value" value={formatUsd(pm.positionValue)} />
        <MetricCard label="Invested" value={formatUsd(pm.invested)} />
        <MetricCard
          label="Net Profit"
          value={`${pm.netProfit >= 0 ? '+' : ''}${formatUsd(pm.netProfit)}`}
          color={pm.netProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}
          sub={`${pm.netProfitPct >= 0 ? '+' : ''}${pm.netProfitPct.toFixed(1)}%`}
        />
        <MetricCard
          label="APR (realized)"
          value={`${pm.realizedApr.toFixed(1)}%`}
          color="var(--accent-purple)"
          sub={`${pm.daysRunning.toFixed(0)}d running`}
        />
        <MetricCard
          label="Est. Daily"
          value={pm.dailyEst > 0 ? formatUsd(pm.dailyEst) : '—'}
          sub={pm.dailyEst > 0 ? `${formatUsd(pm.dailyEst * 30)}/mo` : ''}
          color="var(--accent-blue)"
        />
      </div>

      {/* Pending fees + rewards */}
      {(pm.pendingFees > 0 || pm.pendingRewards > 0) && (
        <div className="flex gap-4 text-xs">
          <span style={{ color: 'var(--accent-green)' }}>
            Pending Fees: <span className="mono">{formatUsd(pm.pendingFees)}</span>
            {pool.feesApr > 0 && <span className="ml-1" style={{ color: 'var(--text-muted)' }}>({pool.feesApr.toFixed(0)}% APR)</span>}
          </span>
          <span style={{ color: 'var(--accent-purple)' }}>
            Pending Rewards: <span className="mono">{formatUsd(pm.pendingRewards)}</span>
            {' '}<span className="mono" style={{ color: 'var(--text-muted)' }}>({pool.rewardAmount.toFixed(4)} {pool.rewardToken})</span>
            {pool.rewardsApr > 0 && <span className="ml-1" style={{ color: 'var(--text-muted)' }}>({pool.rewardsApr.toFixed(0)}% APR)</span>}
          </span>
        </div>
      )}

      {/* Warnings */}
      {pool.stale && (
        <div className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(234,179,8,0.1)', color: 'var(--accent-yellow)' }}>
          Stale data — using cached values. {pool.error}
        </div>
      )}
      {pool.error && !pool.stale && (
        <div className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--accent-red)' }}>
          Error: {pool.error}
        </div>
      )}

      {/* Range bar */}
      <RangeBar
        priceLower={pool.priceLower}
        priceUpper={pool.priceUpper}
        currentPrice={pool.currentPrice}
        inRange={pool.inRange}
        triggerDistancePct={pool.triggerDistancePct}
        rangeWidth={pm.rangeWidth}
        ceMultiplier={pm.ceMultiplier}
      />

      {/* P&L Breakdown */}
      <PnlBreakdown
        pool={pool}
        botState={pool.botState}
        totalHarvested={pm.totalHarvested}
        estSwapCost={estSwapCost}
      />

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
            <div style={{ color: 'var(--text-muted)' }}>{pool.tokenA} Amount</div>
            <div className="mono" style={{ color: 'var(--text-primary)' }}>{pool.amountA.toFixed(4)}</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)' }}>{pool.tokenB} Amount</div>
            <div className="mono" style={{ color: 'var(--text-primary)' }}>{pool.amountB.toFixed(4)}</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)' }}>Fee {pool.tokenA}</div>
            <div className="mono" style={{ color: 'var(--text-primary)' }}>{pool.feesA.toFixed(6)}</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)' }}>Fee {pool.tokenB}</div>
            <div className="mono" style={{ color: 'var(--text-primary)' }}>{pool.feesB.toFixed(6)}</div>
          </div>
          <div>
            <div style={{ color: 'var(--text-muted)' }}>Last Rebalance</div>
            <div className="mono" style={{ color: 'var(--text-primary)' }}>
              {formatTimestamp(pool.botState?.lastRebalanceAt ?? null)}
            </div>
          </div>
          {pool.botState?.lastIdleDeployAt && (
          <div>
            <div style={{ color: 'var(--text-muted)' }}>Last Idle Deploy</div>
            <div className="mono" style={{ color: 'var(--text-primary)' }}>
              {formatTimestamp(pool.botState.lastIdleDeployAt)}
            </div>
          </div>
          )}
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
    </div>
  )
}

function AppContent() {
  const {
    apt, elon,
    botWallet, petraWallet,
    loading, countdown, refresh,
    totalPositionValue, totalNetProfit, totalNetProfitPct,
    totalDailyEst, totalRealizedApr, maxDaysRunning,
    totalHarvested,
  } = usePoolData()

  const isLoading = loading && !apt.pool && !elon.pool

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-[960px] mx-auto">
      {/* Global Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-xl font-bold">CLMM Portfolio</h1>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {DEX} — Aptos
            </p>
          </div>
          <div className="flex items-center gap-3">
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

        {/* Global portfolio metrics */}
        {(apt.pool || elon.pool) && (
          <div
            className="grid grid-cols-2 md:grid-cols-5 gap-4 rounded-xl p-4"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
          >
            <MetricCard label="Portfolio Value" value={formatUsd(totalPositionValue)} />
            <MetricCard label="Total Invested" value={formatUsd(INITIAL_CAPITAL)} />
            <MetricCard
              label="Total Net Profit"
              value={`${totalNetProfit >= 0 ? '+' : ''}${formatUsd(totalNetProfit)}`}
              color={totalNetProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}
              sub={`${totalNetProfitPct >= 0 ? '+' : ''}${totalNetProfitPct.toFixed(1)}%`}
            />
            <MetricCard
              label="APR (realized)"
              value={`${totalRealizedApr.toFixed(1)}%`}
              color="var(--accent-purple)"
              sub={`${maxDaysRunning.toFixed(0)}d running`}
            />
            <MetricCard
              label="Est. Daily"
              value={totalDailyEst > 0 ? formatUsd(totalDailyEst) : '—'}
              sub={totalDailyEst > 0 ? `${formatUsd(totalDailyEst * 30)}/mo` : ''}
              color="var(--accent-blue)"
            />
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

      {!isLoading && (
        <div className="space-y-8">
          {/* APT/USDC Pool Section */}
          <PoolSection pm={apt} poolName={APT_POOL_NAME} estSwapCost={APT_EST_SWAP_COST_PER_REBALANCE} />

          {/* Divider */}
          <div style={{ borderTop: '1px solid var(--border)' }} />

          {/* ELON/USDC Pool Section */}
          <PoolSection pm={elon} poolName={ELON_POOL_NAME} estSwapCost={ELON_EST_SWAP_COST_PER_REBALANCE} />

          {/* Divider */}
          <div style={{ borderTop: '1px solid var(--border)' }} />

          {/* Shared sections */}

          {/* Performance Chart (combined) */}
          <PerformanceChart
            metrics={apt.metrics}
            currentPositionValue={totalPositionValue}
            totalHarvested={totalHarvested}
            invested={INITIAL_CAPITAL}
          />

          {/* Harvest + Rebalance — combined harvests, per-pool rebalance */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <HarvestTracker
              totalHarvested={totalHarvested}
              harvestDetails={[
                ...(apt.pool?.harvestDetails ?? []),
                ...(elon.pool?.harvestDetails ?? []),
              ]}
              harvestRate7d={apt.harvestRate7d + elon.harvestRate7d}
              compoundPending={(apt.pool?.compoundPending ?? 0) + (elon.pool?.compoundPending ?? 0)}
              compoundThreshold={(apt.pool?.compoundThreshold ?? 0) + (elon.pool?.compoundThreshold ?? 0)}
              botState={apt.pool?.botState ?? elon.pool?.botState ?? null}
            />
            <div className="space-y-4">
              <RebalanceStats
                totalRebalances={apt.totalRebalances}
                rebalances24h={apt.rebalances24h}
                rebalances7d={apt.rebalances7d}
                avgTimeBetweenRebalances={apt.avgTimeBetweenRebalances}
                metrics={apt.metrics}
                lastRebalanceAt={apt.pool?.botState?.lastRebalanceAt ?? null}
                poolName={APT_POOL_NAME}
              />
              <RebalanceStats
                totalRebalances={elon.totalRebalances}
                rebalances24h={elon.rebalances24h}
                rebalances7d={elon.rebalances7d}
                avgTimeBetweenRebalances={elon.avgTimeBetweenRebalances}
                metrics={elon.metrics}
                lastRebalanceAt={elon.pool?.botState?.lastRebalanceAt ?? null}
                poolName={ELON_POOL_NAME}
              />
            </div>
          </div>

          {/* Wallets */}
          <WalletBox botWallet={botWallet} petraWallet={petraWallet} />

          {/* Formula Boxes — per pool */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <FormulaBox
              rangeWidth={apt.rangeWidth}
              currentPrice={apt.pool?.currentPrice ?? 0}
              sigmaDaily={APT_SIGMA_DAILY}
              estimatedC={APT_ESTIMATED_C}
              fEffDaily={APT_F_EFF_DAILY}
              poolName={APT_POOL_NAME}
            />
            <FormulaBox
              rangeWidth={elon.rangeWidth}
              currentPrice={elon.pool?.currentPrice ?? 0}
              sigmaDaily={ELON_SIGMA_DAILY}
              estimatedC={ELON_ESTIMATED_C}
              fEffDaily={ELON_F_EFF_DAILY}
              poolName={ELON_POOL_NAME}
            />
          </div>
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
