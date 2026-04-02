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
  const drops = useMemo(() =>
    Array.from({ length: 14 }, (_, i) => ({
      left: 8 + (i * 31 + 17) % 84,
      delay: (i * 0.6) % 4,
      duration: 2 + (i % 4) * 0.6,
      size: i % 4 === 0 ? 4 : 3,
      isReward: i > Math.floor(14 * feesRatio),
    })),
  [feesRatio])

  return (
    <div className="flex flex-col items-center justify-between relative" style={{ width: 100, minHeight: '100%' }}>
      {/* Rate label */}
      <div className="text-center mb-1 z-10">
        <div className="earning-pulse mx-auto mb-1" />
        <div className="mono text-xs font-bold neon-value" style={{ color: 'var(--neon-gold)' }}>
          ${displayTotal.toFixed(4)}
        </div>
        <div className="hud-label" style={{ fontSize: '8px' }}>
          pending
        </div>
      </div>

      {/* Tank container — the drip zone */}
      <div className="relative flex-1 w-full" style={{ minHeight: 180 }}>
        {/* Tank outline with grid */}
        <div
          className="absolute inset-x-2 top-0 bottom-0 rounded-lg overflow-hidden"
          style={{
            border: '1px solid rgba(255,170,0,0.12)',
            background: '#050510',
          }}
        >
          {/* Grid overlay */}
          <div className="absolute inset-0" style={{
            backgroundImage: `
              linear-gradient(rgba(255,170,0,0.04) 1px, transparent 1px),
              linear-gradient(90deg, rgba(255,170,0,0.04) 1px, transparent 1px)
            `,
            backgroundSize: '12px 12px',
          }} />

          {/* Fill level (bottom-up) — neon gradient */}
          <div
            className="absolute bottom-0 left-0 right-0 transition-all duration-[2000ms] ease-linear"
            style={{
              height: `${fillPct}%`,
              background: `linear-gradient(to top, rgba(255,170,0,0.3), rgba(194,74,255,0.12) ${feesRatio * 100}%, rgba(255,208,0,0.2))`,
              borderTop: fillPct > 2 ? '1px solid rgba(255,208,0,0.4)' : 'none',
            }}
          >
            {/* Surface shimmer */}
            {fillPct > 5 && (
              <div className="surface-shimmer" />
            )}
          </div>

          {/* Falling drops — neon colors */}
          {drops.map((d, i) => (
            <div
              key={i}
              className="drop-fall"
              style={{
                left: `${d.left}%`,
                animationDelay: `${d.delay}s`,
                animationDuration: `${d.duration}s`,
                width: d.size,
                height: d.size,
                background: d.isReward ? 'var(--neon-gold)' : 'var(--neon-purple)',
                color: d.isReward ? 'var(--neon-gold)' : 'var(--neon-purple)',
              }}
            />
          ))}
        </div>
      </div>

      {/* Bottom stats */}
      <div className="text-center mt-1.5 z-10 space-y-0.5">
        <div className="hud-label" style={{ fontSize: '8px' }}>
          <span style={{ color: 'var(--neon-purple)' }}>fees</span>
          {' + '}
          <span style={{ color: 'var(--neon-gold)' }}>rewards</span>
        </div>
        <div className="mono text-xs font-bold neon-value" style={{ color: 'var(--neon-gold)' }}>
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
