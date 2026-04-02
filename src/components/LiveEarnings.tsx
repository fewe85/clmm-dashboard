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
  harvestThreshold: number
}

function calcRate(snapshots: Snapshot[]): { feesPerHour: number; rewardsPerHour: number } {
  if (snapshots.length < 3) return { feesPerHour: 0, rewardsPerHour: 0 }
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

export function LiveEarnings({ snapshots, pendingFees, pendingRewards, nextHarvestAt, harvestThreshold }: LiveEarningsProps) {
  const { feesPerHour, rewardsPerHour } = useMemo(() => calcRate(snapshots), [snapshots])
  const totalPerHour = feesPerHour + rewardsPerHour
  const totalPerSecond = totalPerHour / 3600

  // Smooth animated counter
  const [displayTotal, setDisplayTotal] = useState(pendingFees + pendingRewards)
  const baseRef = useRef({ value: pendingFees + pendingRewards, time: Date.now() })
  const rafRef = useRef<number>(0)

  useEffect(() => {
    baseRef.current = { value: pendingFees + pendingRewards, time: Date.now() }
  }, [pendingFees, pendingRewards])

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

  const fillPct = harvestThreshold > 0
    ? Math.min((displayTotal / harvestThreshold) * 100, 100)
    : 0
  const feesRatio = totalPerHour > 0 ? feesPerHour / totalPerHour : 0

  if (totalPerHour <= 0) return null

  // Generate deterministic "drops" at different speeds/positions
  // Ore types: diamond, crystal, nugget
  const ores = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => ({
      left: 10 + (i * 29 + 13) % 80,
      delay: (i * 0.7) % 4.5,
      duration: 2.5 + (i % 3) * 0.7,
      shape: i % 3, // 0=diamond, 1=crystal, 2=nugget
      isReward: i > Math.floor(12 * feesRatio),
    })),
  [feesRatio])

  return (
    <div className="flex flex-col items-center justify-between relative" style={{ width: 100, minHeight: '100%' }}>
      {/* Rate label */}
      <div className="text-center mb-1 z-10">
        <div className="earning-pulse mx-auto mb-1" />
        <div className="mono text-xs font-bold neon-value" style={{ color: 'var(--lavender)' }}>
          ${displayTotal.toFixed(4)}
        </div>
        <div className="hud-label" style={{ fontSize: '8px' }}>
          mining
        </div>
      </div>

      {/* Tank container — the drip zone */}
      <div className="relative flex-1 w-full" style={{ minHeight: 180 }}>
        {/* Tank outline with grid */}
        <div
          className="absolute inset-x-2 top-0 bottom-0 rounded-lg overflow-hidden"
          style={{
            border: '1px solid rgba(184,169,255,0.12)',
            background: '#050510',
          }}
        >
          {/* Grid overlay */}
          <div className="absolute inset-0" style={{
            backgroundImage: `
              linear-gradient(rgba(184,169,255,0.04) 1px, transparent 1px),
              linear-gradient(90deg, rgba(184,169,255,0.04) 1px, transparent 1px)
            `,
            backgroundSize: '12px 12px',
          }} />

          {/* Fill level (bottom-up) — neon gradient */}
          <div
            className="absolute bottom-0 left-0 right-0 transition-all duration-[2000ms] ease-linear"
            style={{
              height: `${fillPct}%`,
              background: `linear-gradient(to top, rgba(184,169,255,0.3), rgba(194,74,255,0.15) ${feesRatio * 100}%, rgba(184,169,255,0.2))`,
              borderTop: fillPct > 2 ? '1px solid rgba(184,169,255,0.4)' : 'none',
            }}
          >
            {/* Surface shimmer */}
            {fillPct > 5 && (
              <div className="surface-shimmer" />
            )}
          </div>

          {/* Falling ores */}
          {ores.map((o, i) => (
            <svg
              key={i}
              className="ore-fall"
              style={{
                left: `${o.left}%`,
                animationDelay: `${o.delay}s`,
                animationDuration: `${o.duration}s`,
                color: o.isReward ? 'var(--lavender)' : 'var(--neon-purple)',
                width: o.shape === 0 ? 7 : 6,
                height: o.shape === 0 ? 9 : 7,
              }}
              viewBox="0 0 10 12"
            >
              {o.shape === 0 ? (
                /* Diamond */
                <polygon points="5,0 10,5 5,12 0,5" fill="currentColor" opacity="0.8" />
              ) : o.shape === 1 ? (
                /* Crystal */
                <polygon points="3,0 7,0 9,5 7,12 3,12 1,5" fill="currentColor" opacity="0.7" />
              ) : (
                /* Nugget */
                <polygon points="2,2 8,0 10,4 8,8 2,10 0,6" fill="currentColor" opacity="0.7" />
              )}
            </svg>
          ))}
        </div>
      </div>

      {/* Bottom stats */}
      <div className="text-center mt-1.5 z-10 space-y-0.5">
        <div className="hud-label" style={{ fontSize: '8px' }}>
          <span style={{ color: 'var(--neon-purple)' }}>fees</span>
          {' + '}
          <span style={{ color: 'var(--lavender)' }}>rewards</span>
        </div>
        <div className="mono text-xs font-bold neon-value" style={{ color: 'var(--lavender)' }}>
          ${(totalPerHour * 24).toFixed(2)}/d
        </div>
        {harvestSec !== null && harvestSec > 0 && (
          <div className="mono" style={{ color: harvestSec < 300 ? 'var(--neon-green)' : 'var(--text-muted)', fontSize: '9px' }}>
            {Math.floor(harvestSec / 60)}:{String(Math.floor(harvestSec % 60)).padStart(2, '0')}
          </div>
        )}
      </div>
    </div>
  )
}
