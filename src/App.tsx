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
    totalPositionValue, elonClmmVsHodl, totalClmmVsHodl,
    totalDailyEst, totalEarned,
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

      {/* Portfolio Summary — compact one-line */}
      {elon.pool && (
        <div
          className="flex flex-wrap gap-x-6 gap-y-1 text-xs mb-5 px-4 py-2.5 rounded-xl"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        >
          <SummaryItem label="STATION VALUE" value={formatUsd(totalPositionValue)} />
          <SummaryItem
            label="NAV ADVANTAGE"
            value={`${totalClmmVsHodl >= 0 ? '+' : ''}${formatUsd(totalClmmVsHodl)}`}
            color={totalClmmVsHodl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)'}
          />
          <SummaryItem
            label="TOTAL MINED"
            value={formatUsd(totalEarned)}
            color="var(--accent-green)"
          />
          <SummaryItem
            label="DAILY OUTPUT"
            value={totalDailyEst > 0 ? formatUsd(totalDailyEst) : '—'}
          />
          <NextHarvestTimer elon={elon} />
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

function NextHarvestTimer({ elon }: { elon: PoolMetrics }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])

  const timers = [
    { name: 'ELON', nextAt: elon.pool?.botState?.nextHarvestAt },
  ].filter(t => t.nextAt)

  if (timers.length === 0) return null

  const parts = timers.map(t => {
    const ms = new Date(t.nextAt!).getTime() - now
    if (ms <= 0) return { name: t.name, label: '0:00', color: 'var(--accent-green)' }
    const min = Math.floor(ms / 60_000)
    const sec = Math.floor((ms % 60_000) / 1000)
    const label = `${min}:${sec.toString().padStart(2, '0')}`
    const color = min < 5 ? 'var(--accent-yellow, #eab308)' : 'var(--text-primary)'
    return { name: t.name, label, color }
  })

  return (
    <div className="flex items-baseline gap-1.5">
      <span style={{ color: '#8892b0' }}>EXTRACTION IN</span>
      {parts.map((p, i) => (
        <span key={p.name} className="mono font-semibold" style={{ color: p.color }}>
          {i > 0 && <span style={{ color: 'var(--text-muted)' }}> · </span>}
          {p.label}
        </span>
      ))}
    </div>
  )
}

function SummaryItem({ label, value, color, sub, muted }: {
  label: string; value: string; color?: string; sub?: string; muted?: boolean
}) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span style={{ color: '#8892b0' }}>{label}</span>
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
