import { usePoolData } from './hooks/usePoolData'
import { PoolGroup as PoolGroupComponent } from './components/PoolGroup'
import { PerformanceSection } from './components/PerformanceSection'

function App() {
  const {
    groups,
    poolPerformances,
    loading,
    countdown,
    refresh,
    totalPositionUsd,
    totalIdleUsd,
    totalValueUsd,
    totalFeesUsd,
    totalRewardsUsd,
    pnlUsd,
    pnlPct,
    deepUptime,
    walUptime,
    ikaUptime,
    suiUsdcUptime,
    aptosUptime,
    elonUptime,
    initialCapital,
    totalNetProfit,
    totalFeesEarned,
    totalHodlValue,
    totalLpValue,
    totalRebalances,
  } = usePoolData()

  return (
    <div className="min-h-screen p-4 md:p-6 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold">CLMM Dashboard</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Liquidity Bot Monitor
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
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Performance Overview + Analysis */}
      <div className="mb-6">
        <PerformanceSection
          totalPositionUsd={totalPositionUsd}
          totalIdleUsd={totalIdleUsd}
          totalValueUsd={totalValueUsd}
          totalFeesUsd={totalFeesUsd}
          totalRewardsUsd={totalRewardsUsd}
          pnlUsd={pnlUsd}
          pnlPct={pnlPct}
          initialCapital={initialCapital}
          deepUptime={deepUptime}
          walUptime={walUptime}
          ikaUptime={ikaUptime}
          suiUsdcUptime={suiUsdcUptime}
          aptosUptime={aptosUptime}
          elonUptime={elonUptime}
          poolPerformances={poolPerformances}
          totalNetProfit={totalNetProfit}
          totalFeesEarned={totalFeesEarned}
          totalHodlValue={totalHodlValue}
          totalLpValue={totalLpValue}
          totalRebalances={totalRebalances}
        />
      </div>

      {/* Pool Groups — full width, each group uses its own grid */}
      <div className="space-y-4">
        {groups.map(group => (
          <PoolGroupComponent key={group.protocol} group={group} loading={loading} />
        ))}
      </div>

      {/* Footer */}
      <div className="text-center mt-6 text-xs" style={{ color: 'var(--text-muted)' }}>
        On-chain data only. No backend, no indexer.
      </div>
    </div>
  )
}

export default App
