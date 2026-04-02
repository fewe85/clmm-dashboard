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

  const ores = useMemo(() =>
    Array.from({ length: 12 }, (_, i) => ({
      left: 10 + (i * 29 + 13) % 80,
      delay: (i * 0.7) % 4.5,
      duration: 2.5 + (i % 3) * 0.7,
      shape: i % 3,
      isReward: i > Math.floor(12 * feesRatio),
    })),
  [feesRatio])

  // Stars for the shaft background
  const shaftStars = useMemo(() =>
    Array.from({ length: 15 }, (_, i) => ({
      x: 10 + (i * 41 + 7) % 80,
      y: 5 + (i * 37 + 11) % 90,
      r: i % 4 === 0 ? 0.8 : 0.4,
    })),
  [])

  return (
    <div className="flex flex-col items-center justify-between relative" style={{ width: 110, minHeight: '100%' }}>
      {/* Header — mining status */}
      <div className="text-center mb-1 z-10">
        <div className="earning-pulse mx-auto mb-1" />
        <div className="mono text-xs font-bold neon-value" style={{ color: 'var(--lavender)' }}>
          ${displayTotal.toFixed(4)}
        </div>
        <div className="hud-label" style={{ fontSize: '7px', color: 'var(--lavender)', opacity: 0.7 }}>
          ORE MINED
        </div>
      </div>

      {/* Mining shaft */}
      <div className="relative flex-1 w-full" style={{ minHeight: 200 }}>
        <div
          className="absolute inset-x-1 top-0 bottom-0 rounded-lg overflow-hidden"
          style={{
            border: '1px solid rgba(199,125,255,0.15)',
            background: '#020208',
          }}
        >
          {/* Space background with stars */}
          {shaftStars.map((s, i) => (
            <div key={i} className="absolute rounded-full" style={{
              left: `${s.x}%`, top: `${s.y}%`,
              width: s.r * 2, height: s.r * 2,
              background: 'white',
              opacity: 0.15 + (i % 3) * 0.1,
            }} />
          ))}

          {/* Shaft frame lines — metallic edges */}
          <div className="absolute top-0 bottom-0 left-0" style={{ width: 2, background: 'linear-gradient(to bottom, rgba(199,125,255,0.2), rgba(199,125,255,0.05))' }} />
          <div className="absolute top-0 bottom-0 right-0" style={{ width: 2, background: 'linear-gradient(to bottom, rgba(199,125,255,0.2), rgba(199,125,255,0.05))' }} />

          {/* Horizontal struts */}
          {[20, 40, 60, 80].map(pct => (
            <div key={pct} className="absolute left-0 right-0" style={{
              top: `${pct}%`, height: 1,
              background: 'rgba(199,125,255,0.06)',
            }} />
          ))}

          {/* Fill level — ore collection at bottom */}
          <div
            className="absolute bottom-0 left-0 right-0 transition-all duration-[2000ms] ease-linear"
            style={{
              height: `${fillPct}%`,
              background: 'linear-gradient(to top, rgba(199,125,255,0.35), rgba(194,74,255,0.2) 50%, rgba(199,125,255,0.08))',
              borderTop: fillPct > 2 ? '1px solid rgba(199,125,255,0.5)' : 'none',
            }}
          >
            {/* Ore pile texture — small gem shapes in the fill */}
            {fillPct > 8 && (
              <svg className="absolute bottom-0 left-0 right-0" viewBox="0 0 100 20" style={{ height: '20px', opacity: 0.3 }}>
                <polygon points="10,20 15,12 20,20" fill="#c77dff" />
                <polygon points="25,20 28,14 31,20" fill="#a855f7" />
                <polygon points="40,20 46,10 52,20" fill="#d9a6ff" />
                <polygon points="60,20 64,13 68,20" fill="#c77dff" />
                <polygon points="75,20 80,11 85,20" fill="#a855f7" />
                <polygon points="90,20 93,15 96,20" fill="#d9a6ff" />
              </svg>
            )}
            {fillPct > 5 && <div className="surface-shimmer" />}
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
                color: o.isReward ? '#c77dff' : '#a855f7',
                width: o.shape === 0 ? 8 : 7,
                height: o.shape === 0 ? 10 : 8,
              }}
              viewBox="0 0 10 12"
            >
              {o.shape === 0 ? (
                <polygon points="5,0 10,5 5,12 0,5" fill="currentColor" opacity="0.9" />
              ) : o.shape === 1 ? (
                <polygon points="3,0 7,0 9,5 7,12 3,12 1,5" fill="currentColor" opacity="0.8" />
              ) : (
                <polygon points="2,2 8,0 10,4 8,8 2,10 0,6" fill="currentColor" opacity="0.8" />
              )}
              {/* Sparkle on each ore */}
              <circle cx="5" cy="4" r="1" fill="white" opacity="0.4" />
            </svg>
          ))}
        </div>
      </div>

      {/* Bottom stats */}
      <div className="text-center mt-1.5 z-10 space-y-0.5">
        <div className="hud-label" style={{ fontSize: '7px' }}>
          <span style={{ color: '#a855f7' }}>fees</span>
          {' + '}
          <span style={{ color: '#c77dff' }}>rewards</span>
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
