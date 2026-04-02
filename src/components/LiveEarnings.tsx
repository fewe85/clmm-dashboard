import { useState, useEffect, useRef, useMemo } from 'react'

interface Snapshot {
  t: string
  feesUsd: number
  rewardsUsd: number
  posUsd: number
}

interface LiveEarningsProps {
  snapshots: Snapshot[]
  pendingFees: number
  pendingRewards: number
  nextHarvestAt: string | null
}

/** Calculate earning rate ($/hour) from recent snapshots */
function calcRate(snapshots: Snapshot[]): { feesPerHour: number; rewardsPerHour: number } {
  if (snapshots.length < 3) return { feesPerHour: 0, rewardsPerHour: 0 }
  // Use last ~6h of data for stable rate
  const recent = snapshots.slice(-6)
  const oldest = recent[0]
  const newest = recent[recent.length - 1]
  const hours = (new Date(newest.t).getTime() - new Date(oldest.t).getTime()) / 3_600_000
  if (hours < 1) return { feesPerHour: 0, rewardsPerHour: 0 }
  return {
    feesPerHour: Math.max(0, (newest.feesUsd - oldest.feesUsd) / hours),
    rewardsPerHour: Math.max(0, (newest.rewardsUsd - oldest.rewardsUsd) / hours),
  }
}

export function LiveEarnings({ snapshots, pendingFees, pendingRewards, nextHarvestAt }: LiveEarningsProps) {
  const { feesPerHour, rewardsPerHour } = useMemo(() => calcRate(snapshots), [snapshots])
  const totalPerHour = feesPerHour + rewardsPerHour
  const totalPerSecond = totalPerHour / 3600

  // Smooth animated counter
  const [displayTotal, setDisplayTotal] = useState(pendingFees + pendingRewards)
  const baseRef = useRef({ value: pendingFees + pendingRewards, time: Date.now() })
  const rafRef = useRef<number>(0)

  // Reset base when real data refreshes
  useEffect(() => {
    baseRef.current = { value: pendingFees + pendingRewards, time: Date.now() }
  }, [pendingFees, pendingRewards])

  // Tick animation
  useEffect(() => {
    if (totalPerSecond <= 0) return

    const tick = () => {
      const elapsed = (Date.now() - baseRef.current.time) / 1000
      setDisplayTotal(baseRef.current.value + elapsed * totalPerSecond)
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [totalPerSecond])

  // Harvest countdown
  const [harvestSec, setHarvestSec] = useState<number | null>(null)
  useEffect(() => {
    if (!nextHarvestAt) return
    const update = () => {
      const ms = new Date(nextHarvestAt).getTime() - Date.now()
      setHarvestSec(ms > 0 ? ms / 1000 : 0)
    }
    update()
    const t = setInterval(update, 1000)
    return () => clearInterval(t)
  }, [nextHarvestAt])

  // Split for display
  const feesRatio = totalPerHour > 0 ? feesPerHour / totalPerHour : 0
  const rewardsRatio = 1 - feesRatio
  const displayFees = displayTotal * feesRatio
  const displayRewards = displayTotal * rewardsRatio

  // Sparkline from snapshots (total earnings over time)
  const sparkData = useMemo(() => {
    if (snapshots.length < 2) return []
    return snapshots.map(s => s.feesUsd + s.rewardsUsd)
  }, [snapshots])

  if (totalPerHour <= 0) return null

  return (
    <div className="card-glow rounded-2xl p-5">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="earning-pulse" />
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Live Earnings
          </span>
        </div>
        <span className="mono text-xs" style={{ color: 'var(--text-muted)' }}>
          ${totalPerHour.toFixed(4)}/hr
        </span>
      </div>

      {/* Main counter */}
      <div className="text-center mb-4">
        <div className="mono text-3xl font-bold tracking-tight" style={{ color: 'var(--accent-green)' }}>
          ${displayTotal.toFixed(6)}
        </div>
        <div className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
          pending fees + rewards
        </div>
      </div>

      {/* Fee / Reward split bar */}
      <div className="mb-3">
        <div className="flex rounded-full overflow-hidden h-2 mb-1.5" style={{ background: 'var(--bg-primary)' }}>
          <div
            className="transition-all duration-1000 ease-linear"
            style={{
              width: `${feesRatio * 100}%`,
              background: 'var(--accent-blue)',
              minWidth: feesRatio > 0 ? '2px' : '0',
            }}
          />
          <div
            className="transition-all duration-1000 ease-linear"
            style={{
              width: `${rewardsRatio * 100}%`,
              background: 'var(--accent-green)',
              minWidth: rewardsRatio > 0 ? '2px' : '0',
            }}
          />
        </div>
        <div className="flex justify-between text-xs">
          <span style={{ color: 'var(--accent-blue)' }}>
            <span className="mono">${displayFees.toFixed(4)}</span> fees
          </span>
          <span style={{ color: 'var(--accent-green)' }}>
            <span className="mono">${displayRewards.toFixed(4)}</span> rewards
          </span>
        </div>
      </div>

      {/* Sparkline */}
      {sparkData.length > 3 && (
        <div className="mb-3">
          <Sparkline data={sparkData} />
        </div>
      )}

      {/* Rate + harvest row */}
      <div className="flex justify-between items-center text-xs" style={{ color: 'var(--text-muted)' }}>
        <div>
          <span className="mono font-semibold" style={{ color: 'var(--text-primary)' }}>
            ${(totalPerHour * 24).toFixed(2)}
          </span>
          /day est.
        </div>
        {harvestSec !== null && harvestSec > 0 && (
          <div>
            harvest in{' '}
            <span className="mono font-semibold" style={{
              color: harvestSec < 300 ? 'var(--accent-green)' : 'var(--text-primary)',
            }}>
              {Math.floor(harvestSec / 3600)}:{String(Math.floor((harvestSec % 3600) / 60)).padStart(2, '0')}:{String(Math.floor(harvestSec % 60)).padStart(2, '0')}
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

/** Tiny inline sparkline (SVG) */
function Sparkline({ data }: { data: number[] }) {
  const w = 280
  const h = 32
  const min = Math.min(...data)
  const max = Math.max(...data)
  const range = max - min || 1

  const points = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / range) * (h - 4) - 2
    return `${x},${y}`
  }).join(' ')

  // Gradient fill area
  const areaPoints = `0,${h} ${points} ${w},${h}`

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: '32px' }}>
      <defs>
        <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent-green)" stopOpacity="0.15" />
          <stop offset="100%" stopColor="var(--accent-green)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill="url(#spark-fill)" />
      <polyline
        points={points}
        fill="none"
        stroke="var(--accent-green)"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.7"
      />
    </svg>
  )
}
