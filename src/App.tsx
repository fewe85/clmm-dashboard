import { usePoolData } from './hooks/usePoolData'
import { PoolCard } from './components/PoolCard'
import { PerformanceChart } from './components/PerformanceChart'
import { WalletBox } from './components/WalletBox'
import { ErrorBoundary } from './components/ErrorBoundary'
import {
  DEX, INITIAL_CAPITAL,
  APT_POOL_NAME, ELON_POOL_NAME,
} from './config'

function formatUsd(v: number): string {
  if (Math.abs(v) >= 1000) return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (Math.abs(v) >= 0.01) return `$${v.toFixed(2)}`
  return `$${v.toFixed(4)}`
}

function AppContent() {
  const {
    apt, elon,
    botWallet, petraWallet,
    loading, countdown, refresh,
    priceChanges,
    totalPositionValue, totalNetProfit, totalNetProfitPct,
    totalDailyEst, totalEarned,
  } = usePoolData()

  const isLoading = loading && !apt.pool && !elon.pool

  return (
    <div className="min-h-screen p-3 md:p-6 max-w-[960px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>CLMM Portfolio</h1>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{DEX} — Aptos</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs tabular-nums" style={{ color: 'var(--text-muted)' }}>{countdown}s</span>
          <button
            onClick={refresh}
            disabled={loading}
            className="text-xs px-3 py-1 rounded-lg font-medium transition-colors cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
          >
            {loading ? '...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Portfolio Summary — compact one-line */}
      {(apt.pool || elon.pool) && (
        <div
          className="flex flex-wrap gap-x-6 gap-y-1 text-xs mb-5 px-4 py-2.5 rounded-xl"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <SummaryItem label="Portfolio" value={formatUsd(totalPositionValue)} />
          <SummaryItem label="Invested" value={formatUsd(INITIAL_CAPITAL)} muted />
          <SummaryItem
            label="Net P&L"
            value={`${totalNetProfit >= 0 ? '+' : ''}${formatUsd(totalNetProfit)}`}
            color={totalNetProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}
            sub={`${totalNetProfitPct >= 0 ? '+' : ''}${totalNetProfitPct.toFixed(1)}%`}
          />
          <SummaryItem
            label="Total Earned"
            value={formatUsd(totalEarned)}
            color="var(--accent-green)"
          />
          <SummaryItem
            label="Est. Daily"
            value={totalDailyEst > 0 ? formatUsd(totalDailyEst) : '—'}
          />
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[1, 2].map(i => (
            <div key={i} className="rounded-2xl h-96 animate-pulse" style={{ background: 'var(--bg-card)' }} />
          ))}
        </div>
      )}

      {!isLoading && (
        <div className="space-y-5">
          {/* Pool Cards — side by side on desktop */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <PoolCard pm={apt} poolName={APT_POOL_NAME} priceChange24h={priceChanges.APT} />
            <PoolCard pm={elon} poolName={ELON_POOL_NAME} priceChange24h={priceChanges.ELON} />
          </div>

          {/* Wallets */}
          <WalletBox botWallet={botWallet} petraWallet={petraWallet} />

          {/* Performance Chart */}
          <PerformanceChart
            metrics={apt.metrics}
            currentPositionValue={apt.positionValue + elon.positionValue}
            totalHarvested={apt.totalHarvested + elon.totalHarvested}
            invested={INITIAL_CAPITAL}
          />
        </div>
      )}

      {/* Footer */}
      <div className="text-center mt-5 text-xs" style={{ color: 'var(--text-muted)' }}>
        On-chain data only · No backend
      </div>
    </div>
  )
}

function SummaryItem({ label, value, color, sub, muted }: {
  label: string; value: string; color?: string; sub?: string; muted?: boolean
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span style={{ color: 'var(--text-muted)' }}>{label}</span>
      <span className="mono font-semibold" style={{ color: color || (muted ? 'var(--text-muted)' : 'var(--text-primary)') }}>
        {value}
      </span>
      {sub && <span className="mono" style={{ color: 'var(--text-muted)' }}>{sub}</span>}
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
