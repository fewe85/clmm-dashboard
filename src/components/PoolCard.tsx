import { useState } from 'react'
import type { PoolMetrics } from '../hooks/usePoolData'
import type { PoolData, BotState } from '../types'
import { calculatePositionAmounts } from '../services/math'

// Pool-specific fee config
const POOL_FEE_BPS: Record<string, number> = { APT: 5, ELON: 30 }
const POOL_DEFAULT_SIGMA: Record<string, number> = { APT: 4.7, ELON: 8.0 }

interface PoolCardProps {
  pm: PoolMetrics
  poolName: string
  priceChange24h?: number
}

function fmtUsd(v: number): string {
  const a = Math.abs(v)
  if (a >= 1000) return `$${a.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  if (a >= 0.01) return `$${a.toFixed(2)}`
  return `$${a.toFixed(4)}`
}

function fmtSign(v: number): string {
  return `${v >= 0 ? '+' : '-'}${fmtUsd(v)}`
}

function fmtTime(iso: string | null): string {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const h = Math.floor(diff / 3_600_000)
  const m = Math.floor((diff % 3_600_000) / 60_000)
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h ago`
  return `${h}h ${m}m ago`
}

export function PoolCard({ pm, poolName, priceChange24h }: PoolCardProps) {
  const [showOpt, setShowOpt] = useState(false)
  const { pool } = pm
  if (!pool) return null

  const tokenAPrice = pool.currentPrice || (pool.tokenA === 'APT' ? 0.96 : 0.12)
  const feeBps = POOL_FEE_BPS[pool.tokenA] ?? 5

  return (
    <div className="card-glow rounded-2xl p-5 space-y-4">
      {/* Stale / Error warnings */}
      {pool.stale && (
        <div className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(234,179,8,0.1)', color: 'var(--accent-yellow)' }}>
          Stale data — cached values. {pool.error}
        </div>
      )}
      {pool.error && !pool.stale && (
        <div className="text-xs px-3 py-1.5 rounded-lg" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--accent-red)' }}>
          {pool.error}
        </div>
      )}

      {/* 1. Header: Pool Name + In Range Badge */}
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold" style={{ color: 'var(--text-primary)' }}>{poolName}</h2>
        <span
          className={`text-xs px-2.5 py-1 rounded-full font-medium ${pool.inRange ? 'pulse-badge' : ''}`}
          style={{
            background: pool.inRange ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
            color: pool.inRange ? 'var(--accent-green)' : 'var(--accent-red)',
          }}
        >
          {pool.inRange ? 'In Range' : 'Out of Range'}
        </span>
      </div>

      {/* 2. Token Price + 24h Change */}
      <div className="flex items-baseline gap-2">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{pool.tokenA}</span>
        <span className="mono text-lg font-bold" style={{ color: 'var(--text-primary)' }}>
          ${tokenAPrice.toFixed(4)}
        </span>
        {priceChange24h != null && priceChange24h !== 0 && (
          <span
            className="mono text-xs font-medium"
            style={{ color: priceChange24h >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}
          >
            {priceChange24h >= 0 ? '+' : ''}{priceChange24h.toFixed(1)}% 24h
          </span>
        )}
      </div>

      {/* 3. Key Metrics 2×2 */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Position Value</div>
          <div className="mono text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {fmtUsd(pm.positionValue)}
          </div>
        </div>
        <div>
          <div className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Net P&L</div>
          <div
            className="mono text-lg font-bold"
            style={{ color: pm.netProfit >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}
          >
            {fmtSign(pm.netProfit)}
          </div>
          <div className="mono text-xs" style={{ color: 'var(--text-muted)' }}>
            {pm.netProfitPct >= 0 ? '+' : ''}{pm.netProfitPct.toFixed(1)}%
          </div>
        </div>
        <div>
          <div className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Est. Daily</div>
          <div className="mono text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {pm.dailyEst > 0 ? fmtUsd(pm.dailyEst) : '—'}
          </div>
        </div>
        <div>
          <div className="text-xs mb-0.5" style={{ color: 'var(--text-muted)' }}>Invested</div>
          <div className="mono text-sm" style={{ color: 'var(--text-muted)' }}>
            {fmtUsd(pm.invested)}
          </div>
        </div>
      </div>

      {/* 4. Vertical Range Thermometer */}
      <VerticalRange pool={pool} rangeWidth={pm.rangeWidth} ceMultiplier={pm.ceMultiplier} />

      {/* 5. P&L Breakdown */}
      <PnlSection pool={pool} totalHarvested={pm.totalHarvested} feeBps={feeBps} tokenAPrice={tokenAPrice} />

      {/* 6. Harvest Progress Bar */}
      <HarvestSection pool={pool} pm={pm} />

      {/* 7. Rebalance Stats (one line) */}
      <RebalanceLine pm={pm} pool={pool} />

      {/* 8. Range Optimization (collapsed) */}
      <div>
        <button
          onClick={() => setShowOpt(!showOpt)}
          className="text-xs font-medium cursor-pointer w-full text-left py-1"
          style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }}
        >
          Range Optimization {showOpt ? '▾' : '▸'}
        </button>
        {showOpt && <RangeOptimization pool={pool} />}
      </div>
    </div>
  )
}

/* ── Vertical Range Thermometer ──────────────────────────────────────────── */

function VerticalRange({ pool, rangeWidth, ceMultiplier }: {
  pool: PoolData; rangeWidth: number; ceMultiplier: number
}) {
  const { priceLower, priceUpper, currentPrice, inRange } = pool
  const range = priceUpper - priceLower
  const position = range > 0 ? ((currentPrice - priceLower) / range) * 100 : 50
  const clamped = Math.max(2, Math.min(98, position))

  const distLower = ((currentPrice - priceLower) / currentPrice) * 100
  const distUpper = ((priceUpper - currentPrice) / currentPrice) * 100
  const nearestPct = Math.min(distLower, distUpper)
  const nearestSide = distLower < distUpper ? 'lower' : 'upper'
  const edgeColor = nearestPct < 0.5 ? 'var(--accent-red)' : nearestPct < 1 ? 'var(--accent-yellow)' : 'var(--accent-green)'

  return (
    <div className="flex gap-4 items-stretch py-1">
      {/* Vertical bar */}
      <div className="relative rounded-full overflow-hidden flex-shrink-0" style={{ width: 10, height: 80, background: 'var(--bg-primary)' }}>
        <div
          className="absolute inset-0 rounded-full"
          style={{
            background: inRange
              ? 'linear-gradient(to top, rgba(239,68,68,0.25), rgba(34,197,94,0.35) 25%, rgba(34,197,94,0.35) 75%, rgba(239,68,68,0.25))'
              : 'rgba(239,68,68,0.2)',
          }}
        />
        {/* Price marker */}
        <div
          className="absolute left-0 right-0 rounded-full transition-all duration-500"
          style={{
            height: 4,
            bottom: `${clamped}%`,
            transform: 'translateY(50%)',
            background: inRange ? 'var(--accent-green)' : 'var(--accent-red)',
            boxShadow: inRange
              ? '0 0 8px rgba(34,197,94,0.8)'
              : '0 0 8px rgba(239,68,68,0.8)',
          }}
        />
      </div>

      {/* Labels column */}
      <div className="flex flex-col justify-between flex-1" style={{ height: 80 }}>
        <span className="mono text-xs" style={{ color: 'var(--text-muted)' }}>
          ${priceUpper.toFixed(4)}
        </span>
        <div className="space-y-0.5">
          <div>
            <span className="mono text-xs font-semibold" style={{ color: edgeColor }}>
              {nearestPct.toFixed(1)}% to {nearestSide}
            </span>
          </div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Range ±{(rangeWidth / 2).toFixed(1)}% · CE: {ceMultiplier.toFixed(0)}x
          </div>
        </div>
        <span className="mono text-xs" style={{ color: 'var(--text-muted)' }}>
          ${priceLower.toFixed(4)}
        </span>
      </div>
    </div>
  )
}

/* ── P&L Breakdown ───────────────────────────────────────────────────────── */

function PnlSection({ pool, totalHarvested, feeBps, tokenAPrice }: {
  pool: PoolData; totalHarvested: number; feeBps: number; tokenAPrice: number
}) {
  const botState = pool.botState
  const positionValue = pool.amountA * tokenAPrice + pool.amountB
  const positionChange = positionValue - pool.invested
  const feesUsd = pool.feesA * tokenAPrice + pool.feesB
  const rewardsUsd = pool.pendingRewardsUsd

  const avgC = botState?.avgSwapCost || 0
  const totalRebalances = botState?.totalRebalances || 0
  const hasMeasured = avgC > 0
  const costPerReb = hasMeasured
    ? (avgC / 100) * positionValue
    : positionValue * (feeBps / 10000) * 2
  const swapCosts = totalRebalances * costPerReb

  const netPnl = positionChange + feesUsd + rewardsUsd + totalHarvested - swapCosts

  const rows = [
    { label: 'Position Change', value: positionChange },
    { label: 'Fees', value: feesUsd },
    { label: 'Rewards', value: rewardsUsd },
    { label: 'Harvested', value: totalHarvested },
    { label: 'Swap Costs', value: -swapCosts, estimated: !hasMeasured },
  ]

  return (
    <div className="space-y-1">
      {rows.map((r, i) => (
        <div key={i} className="flex justify-between text-xs">
          <span style={{ color: 'var(--text-muted)' }}>{r.label}</span>
          <span
            className="mono font-medium"
            style={{ color: r.value >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}
          >
            {r.estimated ? '~' : ''}{fmtSign(r.value)}
          </span>
        </div>
      ))}

      {/* Net P&L total */}
      <div className="flex justify-between text-xs pt-1.5 mt-1.5" style={{ borderTop: '1px solid var(--border)' }}>
        <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>Net P&L</span>
        <span
          className="mono font-semibold"
          style={{ color: netPnl >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}
        >
          {fmtSign(netPnl)}
        </span>
      </div>

      {/* CLMM vs HODL */}
      <ClmmVsHodl pool={pool} botState={botState} tokenAPrice={tokenAPrice} netPnl={netPnl} />
    </div>
  )
}

/* ── CLMM vs HODL ────────────────────────────────────────────────────────── */

function ClmmVsHodl({ pool, botState, tokenAPrice, netPnl }: {
  pool: PoolData; botState: BotState | null; tokenAPrice: number; netPnl: number
}) {
  if (!botState?.centerPrice || pool.liquidity <= 0 || pool.tickLower === pool.tickUpper) return null

  const cp = botState.centerPrice
  const entryPrice = Math.abs(cp - tokenAPrice) < Math.abs(1 / cp - tokenAPrice) ? cp : 1 / cp

  const nativeSwapped = pool.tokenA === 'ELON'
  const dec0 = nativeSwapped ? pool.decimalsB : pool.decimalsA
  const dec1 = nativeSwapped ? pool.decimalsA : pool.decimalsB
  const R = nativeSwapped ? (1 / entryPrice) : entryPrice
  const nativePrice = R * Math.pow(10, dec1) / Math.pow(10, dec0)
  const tickEntry = Math.log(nativePrice) / Math.log(1.0001)

  const native = calculatePositionAmounts(pool.liquidity, tickEntry, pool.tickLower, pool.tickUpper, dec0, dec1)
  const entryA = nativeSwapped ? native.amountB : native.amountA
  const entryB = nativeSwapped ? native.amountA : native.amountB

  const hodlValue = entryA * tokenAPrice + entryB
  const entryValue = entryA * entryPrice + entryB
  const clmmAdv = netPnl - (hodlValue - entryValue)

  return (
    <div className="flex justify-between text-xs pt-1.5 mt-1" style={{ borderTop: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text-muted)' }}>CLMM vs HODL</span>
      <span className="mono font-medium" style={{ color: clmmAdv >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
        {fmtSign(clmmAdv)}
      </span>
    </div>
  )
}

/* ── Harvest Progress ────────────────────────────────────────────────────── */

function HarvestSection({ pool, pm }: { pool: PoolData; pm: PoolMetrics }) {
  const pending = pool.compoundPending ?? 0
  const threshold = pool.compoundThreshold ?? 0
  const pct = threshold > 0 ? Math.min((pending / threshold) * 100, 100) : 0
  const ready = pending >= threshold && threshold > 0

  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span style={{ color: 'var(--text-secondary)' }}>
          Next Harvest (1% of position)
          {ready && <span style={{ color: 'var(--accent-green)' }}> — Ready ({(pending / threshold).toFixed(1)}x)</span>}
        </span>
        <span className="mono" style={{ color: ready ? 'var(--accent-green)' : 'var(--text-muted)' }}>
          ${pending.toFixed(2)} / ${threshold.toFixed(2)}
        </span>
      </div>
      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-primary)' }}>
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            background: pct >= 100 ? 'var(--accent-green)' : 'var(--accent-blue)',
          }}
        />
      </div>
      {pm.harvestRate7d > 0 && (
        <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          Harvest Rate: <span className="mono">{fmtUsd(pm.harvestRate7d)}/day</span>
        </div>
      )}
    </div>
  )
}

/* ── Rebalance One-liner ─────────────────────────────────────────────────── */

function RebalanceLine({ pm, pool }: { pm: PoolMetrics; pool: PoolData }) {
  const total = pm.totalRebalances
  if (total === 0) return null

  const lastReb = pool.botState?.lastRebalanceAt ?? null
  const botState = pool.botState
  const feeBps = POOL_FEE_BPS[pool.tokenA] ?? 5
  const tokenAPrice = pool.currentPrice || (pool.tokenA === 'APT' ? 0.96 : 0.12)
  const positionValue = pool.amountA * tokenAPrice + pool.amountB
  const avgC = botState?.avgSwapCost || 0
  const hasMeasured = avgC > 0
  const costPerReb = hasMeasured
    ? (avgC / 100) * positionValue
    : positionValue * (feeBps / 10000) * 2
  const swapCost = total * costPerReb

  const parts = [
    `Total: ${total}`,
    `Last: ${fmtTime(lastReb)}`,
    `Swap Costs: ~$${swapCost.toFixed(2)}`,
  ]

  return (
    <div className="text-xs mono" style={{ color: 'var(--text-muted)' }}>
      {parts.join(' · ')}
    </div>
  )
}

/* ── Range Optimization (collapsible) ────────────────────────────────────── */

function RangeOptimization({ pool }: { pool: PoolData }) {
  const botState = pool.botState
  const defaultSigma = POOL_DEFAULT_SIGMA[pool.tokenA] ?? 5
  const feeBps = POOL_FEE_BPS[pool.tokenA] ?? 5

  const rangeWidth = pool.currentPrice > 0
    ? ((pool.priceUpper - pool.priceLower) / pool.currentPrice) * 100
    : 0
  const currentDelta = rangeWidth / 2

  const sigma = botState && botState.sigmaDaily > 0 ? botState.sigmaDaily : defaultSigma
  const sigmaSource = botState && botState.sigmaDaily > 0 ? 'measured' : 'default'
  const c = botState?.avgSwapCost ?? 0
  const cSource = c > 0 ? 'measured' : 'none'

  const fFee = feeBps / 100
  const fReward = pool.rewardsApr > 0 ? (pool.rewardsApr / 365) * (currentDelta / 100) : 0
  const fEff = fFee + 0.5 * fReward

  let deltaOpt = 0
  if (c > 0 && fEff > 0) deltaOpt = (4 * c * sigma ** 2) / fEff

  const deltaMin = sigma / Math.sqrt(15)
  const recommended = Math.max(deltaOpt, deltaMin)

  let rec = '', recColor = 'var(--text-muted)'
  if (c <= 0) {
    rec = 'wird kalibriert'
  } else if (recommended > 0) {
    const dev = Math.abs(currentDelta - recommended) / recommended
    if (dev <= 0.15) { rec = 'Range passt'; recColor = 'var(--accent-green)' }
    else if (dev <= 0.5) { rec = currentDelta > recommended ? 'Range zu breit' : 'Range zu eng'; recColor = 'var(--accent-yellow)' }
    else { rec = currentDelta > recommended ? 'Range zu breit' : 'Range zu eng'; recColor = 'var(--accent-red)' }
  }

  const rows = [
    ['Aktuelle Range', `±${currentDelta.toFixed(1)}%`],
    [`σ_daily (${sigmaSource})`, sigma > 0 ? `${sigma.toFixed(2)}%` : '—'],
    ['Gemessenes c', cSource === 'measured' ? `${c.toFixed(2)}%` : '—'],
    ['f_eff', `${fEff.toFixed(3)}%`],
    ['Formel-Optimum δ*', deltaOpt > 0 ? `±${deltaOpt.toFixed(2)}%` : '—'],
    ['Polling-Limit δ_min', `±${deltaMin.toFixed(2)}%`],
  ]

  return (
    <div className="space-y-1 pt-1">
      {rows.map(([label, val], i) => (
        <div key={i} className="flex justify-between text-xs">
          <span style={{ color: 'var(--text-muted)' }}>{label}</span>
          <span className="mono" style={{ color: 'var(--text-primary)' }}>{val}</span>
        </div>
      ))}
      <div className="flex justify-between text-xs pt-1">
        <span style={{ color: 'var(--text-muted)' }}>Empfehlung</span>
        <span className="mono font-semibold" style={{ color: recColor }}>
          {rec || '—'}
          {recommended > 0 && c > 0 && ` (±${recommended.toFixed(1)}%)`}
        </span>
      </div>
    </div>
  )
}
