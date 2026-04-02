import { useState } from 'react'
import type { PoolMetrics } from '../hooks/usePoolData'
import type { PoolData, BotState, RebalanceMetric } from '../types'
import { LiveEarnings } from './LiveEarnings'
import { RebalanceHeartbeat } from './RebalanceHeartbeat'

// Pool-specific fee config
const POOL_FEE_BPS: Record<string, number> = { APT: 5, ELON: 30 }
const POOL_DEFAULT_SIGMA: Record<string, number> = { APT: 4.7, ELON: 8.0 }

interface PoolCardProps {
  pm: PoolMetrics
  poolName: string
  priceChange24h?: number
  aptPrice?: number
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


export function PoolCard({ pm, poolName, priceChange24h, aptPrice: aptPriceProp }: PoolCardProps) {
  const [showOpt, setShowOpt] = useState(false)
  const { pool } = pm
  if (!pool) return null

  const tokenAPrice = pool.currentPrice || (pool.tokenA === 'APT' ? 0.96 : 0.12)
  const feeBps = POOL_FEE_BPS[pool.tokenA] ?? 5

  const pendingFees = pool.pendingFeesUsd ?? 0
  const pendingRewards = pool.pendingRewardsUsd ?? 0
  const harvestThreshold = pool.compoundThreshold ?? 0

  return (
    <div className="card-glow rounded-2xl p-5 flex gap-4">
      {/* Left: main content */}
      <div className="flex-1 space-y-4 min-w-0">
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
        <span className="hud-label">{pool.tokenA}</span>
        <span className="mono text-lg font-bold neon-value" style={{ color: 'var(--neon-yellow)' }}>
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

      {/* 3. Key Metrics 2×2 — with glow cards */}
      <div className="grid grid-cols-2 gap-2.5">
        <div className="rounded-lg px-3 py-2.5" style={{ background: '#050510', border: '1px solid var(--border)' }}>
          <div className="hud-label mb-0.5">Position Value</div>
          <div className="mono text-xl font-bold neon-value" style={{ color: 'var(--neon-yellow)' }}>
            {fmtUsd(pm.positionValue)}
          </div>
        </div>
        <div
          className="rounded-lg px-3 py-2.5"
          style={{
            background: pm.netProfit >= 0
              ? 'linear-gradient(135deg, rgba(57,255,20,0.06), #050510)'
              : 'linear-gradient(135deg, rgba(255,42,109,0.06), #050510)',
            border: `1px solid ${pm.netProfit >= 0 ? 'rgba(57,255,20,0.2)' : 'rgba(255,42,109,0.2)'}`,
          }}
        >
          <div className="hud-label mb-0.5">Net P&L</div>
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
        <div className="rounded-lg px-3 py-2.5" style={{ background: '#050510', border: '1px solid var(--border)' }}>
          <div className="hud-label mb-0.5">Est. Daily</div>
          <div className="mono text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            {pm.dailyEst > 0 ? fmtUsd(pm.dailyEst) : '—'}
          </div>
        </div>
        <div
          className="rounded-lg px-3 py-2.5"
          style={{
            background: 'linear-gradient(135deg, rgba(57,255,20,0.05), #050510)',
            border: '1px solid rgba(57,255,20,0.15)',
          }}
        >
          <div className="hud-label mb-0.5">APR</div>
          <div className="mono text-sm font-semibold" style={{ color: 'var(--accent-green)' }}>
            {(pool.feesApr + pool.rewardsApr) > 0
              ? `${(pool.feesApr + pool.rewardsApr).toFixed(0)}%`
              : '—'}
          </div>
          {(pool.feesApr > 0 || pool.rewardsApr > 0) && (
            <div className="mono text-xs" style={{ color: 'var(--text-muted)' }}>
              {pool.feesApr > 0 ? `Fees ${pool.feesApr.toFixed(0)}%` : ''}
              {pool.feesApr > 0 && pool.rewardsApr > 0 ? ' + ' : ''}
              {pool.rewardsApr > 0 ? `Rewards ${pool.rewardsApr.toFixed(0)}%` : ''}
            </div>
          )}
        </div>
      </div>

      {/* 4. Vertical Range Thermometer */}
      <VerticalRange pool={pool} rangeWidth={pm.rangeWidth} ceMultiplier={pm.ceMultiplier} />

      {/* 5. P&L Breakdown */}
      <PnlSection pool={pool} totalHarvested={pm.totalHarvested} feeBps={feeBps} tokenAPrice={tokenAPrice} aptPrice={aptPriceProp || (pool.tokenA === 'APT' ? tokenAPrice : 7)} />

      {/* 7. Rebalance Heartbeat */}
      <RebalanceHeartbeat
        metrics={pm.metrics}
        totalRebalances={pm.totalRebalances}
        lastRebalanceAt={pool.botState?.lastRebalanceAt ?? null}
        swapCostTotal={calcSwapCostTotal(pool, pm)}
      />

      {/* 8. Range Optimization (collapsed) */}
      <div>
        <button
          onClick={() => setShowOpt(!showOpt)}
          className="text-xs font-medium cursor-pointer w-full text-left py-1"
          style={{ color: 'var(--text-muted)', background: 'none', border: 'none' }}
        >
          Range Optimization {showOpt ? '▾' : '▸'}
        </button>
        {showOpt && <RangeOptimization pool={pool} metrics={pm.metrics} />}
      </div>
      </div>{/* end left */}

      {/* Right: Live Earnings drip tank */}
      <div className="flex-shrink-0 hidden md:flex" style={{ borderLeft: '1px solid var(--border)', paddingLeft: 16 }}>
        <LiveEarnings
          snapshots={pool.botState?.earningsSnapshots ?? []}
          pendingFees={pendingFees}
          pendingRewards={pendingRewards}
          nextHarvestAt={pool.botState?.nextHarvestAt ?? null}
          harvestThreshold={harvestThreshold}
        />
      </div>
    </div>
  )
}

/* ── Neon Power Bar — Range Indicator ───────────────────────────────────── */

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
  const danger = nearestPct < 0.5
  const warn = nearestPct < 1.2 && !danger

  const orbColor = danger ? '#ff2a6d' : warn ? '#ffaa00' : '#39ff14'
  const orbGlow = danger ? 'rgba(255,42,109,0.6)' : warn ? 'rgba(255,170,0,0.5)' : 'rgba(57,255,20,0.5)'

  // Tick marks (10 segments)
  const ticks = Array.from({ length: 11 }, (_, i) => i * 10)

  return (
    <div className="rounded-lg p-3" style={{ background: '#050510', border: '1px solid var(--border)' }}>
      {/* HUD label */}
      <div className="flex justify-between items-center mb-2">
        <span className="hud-label" style={{ color: inRange ? 'var(--neon-green)' : 'var(--neon-pink)' }}>
          {inRange ? 'IN RANGE' : 'OUT OF RANGE'}
        </span>
        <span className="hud-label">±{(rangeWidth / 2).toFixed(1)}% · {ceMultiplier.toFixed(0)}x CE</span>
      </div>

      {/* Price labels */}
      <div className="flex justify-between text-xs mb-1">
        <span className="mono" style={{ color: 'var(--text-muted)' }}>${priceLower.toFixed(4)}</span>
        <span className="mono font-bold neon-value" style={{ color: 'var(--neon-yellow)' }}>${currentPrice.toFixed(4)}</span>
        <span className="mono" style={{ color: 'var(--text-muted)' }}>${priceUpper.toFixed(4)}</span>
      </div>

      {/* Power bar SVG */}
      <svg viewBox="0 0 300 36" className="w-full" style={{ height: '36px' }}>
        <defs>
          <linearGradient id="bar-bg" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#ff2a6d" stopOpacity="0.2" />
            <stop offset="15%" stopColor="#ff2a6d" stopOpacity="0.05" />
            <stop offset="35%" stopColor="#39ff14" stopOpacity="0.08" />
            <stop offset="50%" stopColor="#39ff14" stopOpacity="0.12" />
            <stop offset="65%" stopColor="#39ff14" stopOpacity="0.08" />
            <stop offset="85%" stopColor="#ff2a6d" stopOpacity="0.05" />
            <stop offset="100%" stopColor="#ff2a6d" stopOpacity="0.2" />
          </linearGradient>
          <filter id="orb-glow">
            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Bar background */}
        <rect x="4" y="10" width="292" height="16" rx="3" fill="url(#bar-bg)" stroke="var(--border)" strokeWidth="0.5" />

        {/* Tick marks */}
        {ticks.map(pct => {
          const x = 4 + (pct / 100) * 292
          return <line key={pct} x1={x} y1={8} x2={x} y2={28} stroke="var(--border)" strokeWidth="0.4" />
        })}

        {/* Center line */}
        <line x1="150" y1="6" x2="150" y2="30" stroke="rgba(57,255,20,0.15)" strokeWidth="0.8" strokeDasharray="2,2" />

        {/* Danger zone flicker — left */}
        {(danger || warn) && nearestSide === 'lower' && (
          <rect x="4" y="10" width="44" height="16" rx="3" fill={danger ? '#ff2a6d' : '#ffaa00'} opacity="0.15" className="range-danger-pulse" />
        )}
        {/* Danger zone flicker — right */}
        {(danger || warn) && nearestSide === 'upper' && (
          <rect x="252" y="10" width="44" height="16" rx="3" fill={danger ? '#ff2a6d' : '#ffaa00'} opacity="0.15" className="range-danger-pulse" />
        )}

        {/* Orb glow */}
        <circle cx={4 + (clamped / 100) * 292} cy="18" r="10" fill={orbGlow} opacity="0.3" filter="url(#orb-glow)" />

        {/* Orb core */}
        <circle cx={4 + (clamped / 100) * 292} cy="18" r="5" fill={orbColor} filter="url(#orb-glow)">
          <animate attributeName="r" values="4;5.5;4" dur={danger ? '0.8s' : '3s'} repeatCount="indefinite" />
        </circle>

        {/* Orb inner bright spot */}
        <circle cx={4 + (clamped / 100) * 292} cy="17" r="2" fill="white" opacity="0.5" />
      </svg>

      {/* Distance label */}
      <div className="flex justify-center mt-1">
        <span className="mono text-xs font-semibold" style={{ color: orbColor, textShadow: `0 0 8px ${orbGlow}` }}>
          {nearestPct.toFixed(1)}% to {nearestSide}
        </span>
      </div>
    </div>
  )
}

/* ── P&L Breakdown ───────────────────────────────────────────────────────── */

function PnlSection({ pool, totalHarvested, feeBps, tokenAPrice, aptPrice }: {
  pool: PoolData; totalHarvested: number; feeBps: number; tokenAPrice: number; aptPrice: number
}) {
  const botState = pool.botState
  const positionValue = pool.amountA * tokenAPrice + pool.amountB
  const feesUsd = pool.feesA * tokenAPrice + pool.feesB
  const rewardsUsd = pool.pendingRewardsUsd

  // IL calculation: HODL value vs current position value
  // Use priceAtReset (stable across rebalances) if available, else fall back to centerPrice
  const resetPrice = botState?.priceAtReset || 0
  const cp = resetPrice > 0 ? resetPrice : (botState?.centerPrice || 0)
  const entryPrice = cp > 0 ? (Math.abs(cp - tokenAPrice) < Math.abs(1 / cp - tokenAPrice) ? cp : 1 / cp) : 0
  const hodlValue = entryPrice > 0 ? pool.invested * (tokenAPrice / entryPrice) : pool.invested
  const il = positionValue - hodlValue // negative = IL loss

  const avgC = botState?.avgSwapCost || 0
  const totalRebalances = (botState?.totalRebalances || 0) - (botState?.rebalancesAtReset || 0)
  const hasMeasured = avgC > 0
  const costPerReb = hasMeasured
    ? (avgC / 100) * positionValue
    : positionValue * (feeBps / 10000) * 2
  const swapCosts = Math.max(0, totalRebalances) * costPerReb

  // Gas costs (measured from on-chain TX receipts)
  const gasApt = (botState?.gasUsedApt || 0) - (botState?.gasAtReset || 0)
  const gasUsd = gasApt * aptPrice
  const hasGasMeasured = gasApt > 0

  const netPnl = feesUsd + rewardsUsd + totalHarvested + il - swapCosts - gasUsd

  const rows = [
    { label: 'Fees', value: feesUsd },
    { label: 'Rewards', value: rewardsUsd },
    { label: 'Harvested', value: totalHarvested },
    { label: 'IL', value: il },
    { label: `Swap Costs (${hasMeasured ? 'meas.' : 'est.'})`, value: -swapCosts },
    ...(hasGasMeasured ? [{ label: 'Gas Costs', value: -gasUsd }] : []),
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
            {fmtSign(r.value)}
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
      <ClmmVsHodl pool={pool} botState={botState} tokenAPrice={tokenAPrice} aptPrice={aptPrice} />
    </div>
  )
}

/* ── CLMM vs HODL ────────────────────────────────────────────────────────── */

function ClmmVsHodl({ pool, botState, tokenAPrice, aptPrice }: {
  pool: PoolData; botState: BotState | null; tokenAPrice: number; aptPrice: number
}) {
  if ((!botState?.centerPrice && !botState?.priceAtReset) || pool.invested <= 0) return null

  // Use priceAtReset (stable across rebalances) if available, else fall back to centerPrice
  const resetPrice = botState?.priceAtReset || 0
  const cp = resetPrice > 0 ? resetPrice : botState.centerPrice
  const entryPrice = Math.abs(cp - tokenAPrice) < Math.abs(1 / cp - tokenAPrice) ? cp : 1 / cp
  if (entryPrice <= 0) return null

  // Clean comparison: total CLMM value vs what HODL would be worth
  // pool.netProfit already includes swap costs (they reduced position value)
  // Gas costs are external (paid from APT wallet), must be subtracted separately
  const gasApt = (botState?.gasUsedApt || 0) - (botState?.gasAtReset || 0)
  const gasUsd = gasApt * aptPrice
  const hodlReturn = pool.invested * (tokenAPrice / entryPrice) - pool.invested
  const clmmAdv = pool.netProfit - gasUsd - hodlReturn

  return (
    <div className="flex justify-between text-xs pt-1.5 mt-1" style={{ borderTop: '1px solid var(--border)' }}>
      <span style={{ color: 'var(--text-muted)' }}>CLMM vs HODL</span>
      <span className="mono font-medium" style={{ color: clmmAdv >= 0 ? 'var(--accent-green)' : 'var(--accent-red)' }}>
        {fmtSign(clmmAdv)}
      </span>
    </div>
  )
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

function calcSwapCostTotal(pool: PoolData, pm: PoolMetrics): number {
  const feeBps = POOL_FEE_BPS[pool.tokenA] ?? 5
  const tokenAPrice = pool.currentPrice || 0.1
  const positionValue = pool.amountA * tokenAPrice + pool.amountB
  const avgC = pool.botState?.avgSwapCost || 0
  const costPerReb = avgC > 0
    ? (avgC / 100) * positionValue
    : positionValue * (feeBps / 10000) * 2
  return Math.max(0, pm.totalRebalances) * costPerReb
}

/* ── Range Optimization (collapsible) ────────────────────────────────────── */

function RangeOptimization({ pool, metrics }: { pool: PoolData; metrics: RebalanceMetric[] }) {
  const botState = pool.botState
  const defaultSigma = POOL_DEFAULT_SIGMA[pool.tokenA] ?? 5
  const feeBps = POOL_FEE_BPS[pool.tokenA] ?? 5
  const tickSpacing = pool.tokenA === 'APT' ? 10 : 60

  const rangeWidth = pool.currentPrice > 0
    ? ((pool.priceUpper - pool.priceLower) / pool.currentPrice) * 100
    : 0
  const currentDelta = rangeWidth / 2

  // --- Inputs (display %) ---
  const sigmaDisp = botState && botState.sigmaDaily > 0 ? botState.sigmaDaily : defaultSigma
  const sigmaSource = botState && botState.sigmaDaily > 0 ? 'measured' : 'default'

  // c_p75: 75th percentile of cHalfRoundTrip from rebalance metrics (more realistic than average)
  const cValues = metrics
    .map(m => m.cHalfRoundTrip ?? 0)
    .filter(v => v > 0)
    .sort((a, b) => a - b)
  const cAvgDisp = botState?.avgSwapCost ?? 0
  let cP75Disp = 0
  if (cValues.length >= 4) {
    const idx = Math.floor(cValues.length * 0.75)
    cP75Disp = cValues[idx]
  } else {
    cP75Disp = cAvgDisp // fallback to average if not enough data
  }
  const cSource = cP75Disp > 0 ? (cValues.length >= 4 ? 'p75' : 'avg') : 'none'

  // --- Convert to decimal ---
  const sigma = sigmaDisp / 100
  const cP75 = cP75Disp / 100
  const delta = currentDelta / 100

  const fFee = feeBps / 10000
  const fReward = pool.rewardsApr > 0 ? (pool.rewardsApr / 100 / 365) * delta : 0
  const fEff = fFee + 0.5 * fReward

  // --- Three constraints ---
  // 1. Formula optimum: δ* = 2 × c_p75 × σ² / f_eff (pure optimum, safety in ×1.5)
  let deltaFormula = 0
  if (cP75 > 0 && fEff > 0) deltaFormula = (2 * cP75 * sigma ** 2) / fEff

  // 2. Rebalance cap: σ / √N_max — minimum range to keep rebalances ≤ N_max per day
  const N_MAX = 12
  const deltaPolling = sigma / Math.sqrt(N_MAX)

  // 3. Tick floor: minimum usable ticks (4 × tick_spacing in %)
  const tickFloorPct = tickSpacing * 4 * 0.01 // each tick ≈ 0.01%
  const deltaTick = tickFloorPct / 100

  const recommended = Math.max(deltaFormula, deltaPolling, deltaTick)

  // Risk-adjusted: 1.6× multiplier accounts for σ-spikes, crash-slippage, execution delay
  const RISK_MULT = 1.6
  const riskAdjusted = recommended * RISK_MULT

  // Which constraint is binding?
  let binding = 'formula'
  if (recommended === deltaPolling) binding = 'polling'
  else if (recommended === deltaTick) binding = 'tick'

  // Convert to % for display
  const deltaFormulaPct = deltaFormula * 100
  const deltaPollingPct = deltaPolling * 100
  const deltaTickPct = deltaTick * 100
  const recommendedPct = recommended * 100
  const riskAdjustedPct = riskAdjusted * 100

  // Compare current range to risk-adjusted recommendation
  let rec = '', recColor = 'var(--text-muted)'
  if (cP75Disp <= 0) {
    rec = 'wird kalibriert'
  } else if (riskAdjustedPct > 0) {
    const dev = Math.abs(currentDelta - riskAdjustedPct) / riskAdjustedPct
    if (dev <= 0.25) { rec = 'Range passt'; recColor = 'var(--accent-green)' }
    else if (dev <= 0.75) { rec = currentDelta > recommendedPct ? 'Range zu breit' : 'Range zu eng'; recColor = 'var(--accent-yellow, #eab308)' }
    else { rec = currentDelta > recommendedPct ? 'Range zu breit' : 'Range zu eng'; recColor = 'var(--accent-red)' }
  }

  const bindingLabel: Record<string, string> = {
    formula: 'Formel', polling: 'Reb-Cap', tick: 'Tick-Min',
  }

  const rows: [string, string, string?][] = [
    ['Aktuelle Range', `±${currentDelta.toFixed(1)}%`],
    [`σ_daily (${sigmaSource})`, `${sigmaDisp.toFixed(2)}%`],
    [`c (${cSource})`, cSource !== 'none' ? `${cP75Disp.toFixed(2)}%` : '—',
      cValues.length >= 4 ? `avg ${cAvgDisp.toFixed(2)}%` : undefined],
    ['f_eff', `${(fEff * 100).toFixed(3)}%`],
    ['δ* Formel', deltaFormulaPct > 0 ? `±${deltaFormulaPct.toFixed(2)}%` : '—'],
    ['δ* Reb-Cap (≤12/d)', `±${deltaPollingPct.toFixed(2)}%`],
    ['δ* Tick-Min', `±${deltaTickPct.toFixed(2)}%`],
    ['δ* Optimum', recommendedPct > 0 ? `±${recommendedPct.toFixed(2)}%` : '—',
      binding !== 'formula' ? bindingLabel[binding] : undefined],
    ['δ* Risk-Adj. (×1.6)', riskAdjustedPct > 0 ? `±${riskAdjustedPct.toFixed(1)}%` : '—'],
  ]

  return (
    <div className="space-y-1 pt-1">
      {rows.map(([label, val, sub], i) => (
        <div key={i} className="flex justify-between text-xs">
          <span style={{ color: 'var(--text-muted)' }}>{label}</span>
          <span className="mono" style={{ color: 'var(--text-primary)' }}>
            {val}
            {sub && <span style={{ color: 'var(--text-muted)' }}> ({sub})</span>}
          </span>
        </div>
      ))}
      <div className="flex justify-between text-xs pt-1">
        <span style={{ color: 'var(--text-muted)' }}>Empfehlung</span>
        <span className="mono font-semibold" style={{ color: recColor }}>
          {rec || '—'}
          {riskAdjustedPct > 0 && cP75Disp > 0 && ` (±${riskAdjustedPct.toFixed(1)}%)`}
        </span>
      </div>
    </div>
  )
}
