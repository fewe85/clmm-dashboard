import { useState, useEffect } from 'react'
import { usePoolData, type PoolMetrics } from './hooks/usePoolData'
import { PoolCard } from './components/PoolCard'
import { PerformanceChart } from './components/PerformanceChart'
import { WalletBox } from './components/WalletBox'
import { ErrorBoundary } from './components/ErrorBoundary'
import { AmbientBg } from './components/AmbientBg'
import {
  ELON_POOL_NAME,
} from './config'

function formatUsd(v: number): string {
  if (Math.abs(v) >= 1000) return `$${v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (Math.abs(v) >= 0.01) return `$${v.toFixed(2)}`
  return `$${v.toFixed(4)}`
}

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
        <div>
          <h1 className="text-lg font-bold glitch-text neon-value" style={{ color: 'var(--lavender)' }}>SPACE STATION</h1>
          <p className="text-xs hud-label" style={{ color: '#c77dff' }}>SECTOR THALA/APT</p>
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
