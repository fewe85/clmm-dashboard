import { usePoolData } from './hooks/usePoolData'
import { PoolCard } from './components/PoolCard'
import { PerformanceChart } from './components/PerformanceChart'
import { WalletBox } from './components/WalletBox'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AmbientBg } from './components/AmbientBg'
import {
  ELON_POOL_NAME,
} from './config'


function AppContent() {
  const {
    elon,
    botWallet, petraWallet,
    loading, countdown, refresh,
    priceChanges,
    elonClmmVsHodl,
  } = usePoolData()

  const isLoading = loading && !elon.pool

  const netProfit = elon.netProfit

  return (
    <div className="min-h-screen p-3 md:p-6 max-w-[960px] mx-auto relative" style={{ zIndex: 1 }}>
      <AmbientBg profit={netProfit} />
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="relative">
          {/* Nebula glow behind text */}
          <div style={{
            position: 'absolute',
            top: '-30px',
            left: '-40px',
            right: '-40px',
            bottom: '-30px',
            background: 'radial-gradient(ellipse at 50% 50%, rgba(140,40,200,0.7) 0%, rgba(80,60,220,0.5) 20%, rgba(220,40,140,0.35) 45%, rgba(60,100,200,0.15) 65%, transparent 80%)',
            filter: 'blur(25px)',
            pointerEvents: 'none',
            zIndex: 0,
          }} />
          <h1 className="text-2xl font-bold mono text-center relative" style={{ color: '#e0d0ff', letterSpacing: '0.15em', textShadow: '0 0 8px rgba(255,50,120,1), 0 0 20px rgba(255,50,120,0.6), 0 0 50px rgba(200,60,180,0.4), 0 0 100px rgba(150,50,200,0.2)' }}>
            ◈ SPACE STATION ◈
          </h1>
          <p className="mono font-medium text-center relative" style={{ color: '#d0b8ff', fontSize: '11px', letterSpacing: '0.2em', textShadow: '0 0 6px rgba(255,50,120,0.8), 0 0 15px rgba(255,50,120,0.5), 0 0 40px rgba(150,50,200,0.3)' }}>
            ⟐ SECTOR THALA/APT ⟐
          </p>
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

      {/* Summary bar removed — redundant with Pool Card */}

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
          {/* Pool Card with integrated Live Earnings */}
          <PoolCard pm={elon} poolName={ELON_POOL_NAME} priceChange24h={priceChanges.ELON} />

          {/* Wallets */}
          <WalletBox botWallet={botWallet} petraWallet={petraWallet} />

          {/* Performance Chart */}
          <PerformanceChart
            aptSnapshots={[]}
            elonSnapshots={elon.pool?.botState?.earningsSnapshots ?? []}
            aptClmmVsHodl={0}
            elonClmmVsHodl={elonClmmVsHodl}
            totalInvested={elon.invested}
            daysRunning={elon.daysRunning}
            netProfit={elon.netProfit}
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

// Summary bar + helpers removed — redundant with Pool Card

function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  )
}

export default App
