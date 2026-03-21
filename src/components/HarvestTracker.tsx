import type { HarvestEntry, BotState } from '../types'
import { ProgressBar } from './ProgressBar'

interface Props {
  totalHarvested: number
  harvestDetails: HarvestEntry[]
  harvestRate7d: number
  compoundPending: number
  compoundThreshold: number
  botState: BotState | null
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

function formatUsd(v: number): string {
  if (v >= 1) return `$${v.toFixed(2)}`
  if (v >= 0.01) return `$${v.toFixed(4)}`
  return `$${v.toFixed(6)}`
}

export function HarvestTracker({ totalHarvested, harvestDetails, harvestRate7d, compoundPending, compoundThreshold, botState }: Props) {
  return (
    <div
      className="rounded-xl p-5"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
    >
      <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>
        Harvest Tracker
      </h3>

      {/* Total Harvested */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Total Harvested</span>
        <span className="mono text-sm font-semibold" style={{ color: 'var(--accent-green)' }}>
          {formatUsd(totalHarvested)}
        </span>
      </div>

      {/* Token Breakdown */}
      {harvestDetails.length > 0 && (
        <div className="mb-3 pl-2" style={{ borderLeft: '2px solid var(--border)' }}>
          {harvestDetails.map((d, i) => (
            <div key={i} className="flex justify-between text-xs py-0.5">
              <span style={{ color: 'var(--text-muted)' }}>{d.token}</span>
              <span className="mono" style={{ color: 'var(--text-secondary)' }}>
                {d.amount.toFixed(6)} ({formatUsd(d.valueUsd)})
              </span>
            </div>
          ))}
          {/* Show info if APT/USDC surplus not yet tracked */}
          {!harvestDetails.some(d => d.token === 'APT' && d.valueUsd > 0) &&
           !harvestDetails.some(d => d.token === 'USDC' && d.valueUsd > 0) && (
            <div className="text-xs py-1 mt-1" style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>
              APT/USDC Surplus: tracking wird eingebaut
            </div>
          )}
        </div>
      )}

      {/* Last Harvest */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Last Harvest</span>
        <span className="mono text-xs" style={{ color: 'var(--text-secondary)' }}>
          {formatTimestamp(botState?.lastHarvestAt ?? null)}
        </span>
      </div>

      {/* Harvest Rate */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Harvest Rate</span>
        <span className="mono text-xs" style={{ color: 'var(--text-secondary)' }}>
          {formatUsd(harvestRate7d)}/day
        </span>
      </div>

      {/* Compound Progress */}
      <ProgressBar
        value={compoundPending}
        max={compoundThreshold}
        label="Next Harvest (1% of position)"
      />
    </div>
  )
}
