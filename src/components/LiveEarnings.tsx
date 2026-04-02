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

  const shaftStars = useMemo(() =>
    Array.from({ length: 18 }, (_, i) => ({
      x: 8 + (i * 41 + 7) % 84,
      y: 3 + (i * 37 + 11) % 94,
      r: i % 5 === 0 ? 0.8 : 0.4,
      twinkle: i % 6 === 0,
    })),
  [])

  return (
    <div className="flex flex-col items-center justify-between relative" style={{ width: 110, minHeight: '100%' }}>

      {/* Mining rig SVG header — satellite dish / collector */}
      <svg viewBox="0 0 110 40" className="w-full flex-shrink-0" style={{ height: 40 }}>
        {/* Stars */}
        <circle cx="10" cy="8" r="0.5" fill="white" opacity="0.3" />
        <circle cx="85" cy="5" r="0.6" fill="white" opacity="0.2" />
        <circle cx="30" cy="3" r="0.4" fill="white" opacity="0.25" />

        {/* Satellite dish / collector */}
        <path d="M 35 18 Q 55 6 75 18" fill="none" stroke="#c77dff" strokeWidth="1.5" opacity="0.6" />
        <path d="M 38 18 Q 55 8 72 18" fill="none" stroke="#c77dff" strokeWidth="0.5" opacity="0.3" />
        {/* Antenna */}
        <line x1="55" y1="12" x2="55" y2="4" stroke="#c77dff" strokeWidth="0.8" opacity="0.5" />
        <circle cx="55" cy="3" r="1.5" fill="#c77dff" opacity="0.7">
          <animate attributeName="opacity" values="0.4;0.9;0.4" dur="2s" repeatCount="indefinite" />
        </circle>
        {/* Dish supports */}
        <line x1="42" y1="18" x2="55" y2="24" stroke="#666" strokeWidth="0.6" opacity="0.4" />
        <line x1="68" y1="18" x2="55" y2="24" stroke="#666" strokeWidth="0.6" opacity="0.4" />
        {/* Collection beam downward */}
        <polygon points="48,24 62,24 68,38 42,38" fill="#c77dff" opacity="0.04" />
        <line x1="48" y1="24" x2="42" y2="38" stroke="#c77dff" strokeWidth="0.3" opacity="0.15" />
        <line x1="62" y1="24" x2="68" y2="38" stroke="#c77dff" strokeWidth="0.3" opacity="0.15" />

        {/* Value display */}
        <text x="55" y="34" textAnchor="middle" fill="#c77dff" fontSize="7" fontFamily="JetBrains Mono, monospace" fontWeight="bold" opacity="0.9">
          ${displayTotal.toFixed(4)}
        </text>
      </svg>

      {/* Mining shaft — the main container */}
      <div className="relative flex-1 w-full" style={{ minHeight: 180 }}>
        <div
          className="absolute inset-x-1 top-0 bottom-0 overflow-hidden"
          style={{
            border: '1px solid rgba(199,125,255,0.12)',
            background: '#020208',
            borderRadius: '4px 4px 8px 8px',
          }}
        >
          {/* Space background */}
          {shaftStars.map((s, i) => (
            <div key={i} className="absolute rounded-full" style={{
              left: `${s.x}%`, top: `${s.y}%`,
              width: s.r * 2, height: s.r * 2,
              background: 'white',
              opacity: 0.12 + (i % 3) * 0.08,
              animation: s.twinkle ? 'earning-pulse 3s ease-in-out infinite' : undefined,
            }} />
          ))}

          {/* Shaft frame — metallic ribs */}
          <div className="absolute top-0 bottom-0 left-0" style={{ width: 3, background: 'linear-gradient(to bottom, rgba(199,125,255,0.15), rgba(199,125,255,0.03), rgba(199,125,255,0.15))' }} />
          <div className="absolute top-0 bottom-0 right-0" style={{ width: 3, background: 'linear-gradient(to bottom, rgba(199,125,255,0.15), rgba(199,125,255,0.03), rgba(199,125,255,0.15))' }} />
          {/* Bolts/rivets */}
          {[10, 30, 50, 70, 90].map(pct => (
            <div key={`l${pct}`}>
              <div className="absolute" style={{ left: 0, top: `${pct}%`, width: 4, height: 4, borderRadius: '50%', background: 'rgba(199,125,255,0.1)', border: '0.5px solid rgba(199,125,255,0.15)' }} />
              <div className="absolute" style={{ right: 0, top: `${pct}%`, width: 4, height: 4, borderRadius: '50%', background: 'rgba(199,125,255,0.1)', border: '0.5px solid rgba(199,125,255,0.15)' }} />
            </div>
          ))}

          {/* Horizontal struts with glow */}
          {[25, 50, 75].map(pct => (
            <div key={pct} className="absolute left-1 right-1" style={{
              top: `${pct}%`, height: 1,
              background: 'linear-gradient(to right, rgba(199,125,255,0.15), rgba(199,125,255,0.04), rgba(199,125,255,0.15))',
            }} />
          ))}

          {/* Fill level — collected ore */}
          <div
            className="absolute bottom-0 left-0 right-0 transition-all duration-[2000ms] ease-linear"
            style={{
              height: `${fillPct}%`,
              background: 'linear-gradient(to top, rgba(199,125,255,0.4), rgba(168,85,247,0.2) 40%, rgba(199,125,255,0.05))',
              borderTop: fillPct > 2 ? '1px solid rgba(199,125,255,0.5)' : 'none',
            }}
          >
            {/* Ore pile silhouette */}
            {fillPct > 8 && (
              <svg className="absolute bottom-0 left-0 right-0" viewBox="0 0 100 16" preserveAspectRatio="none" style={{ height: '16px', opacity: 0.35 }}>
                <polygon points="0,16 5,10 12,14 18,8 25,12 32,6 40,11 48,7 55,13 62,5 70,10 78,14 85,8 92,12 100,16" fill="#c77dff" />
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
              <circle cx="5" cy="4" r="1" fill="white" opacity="0.4" />
            </svg>
          ))}
        </div>
      </div>

      {/* Bottom — cargo bay status */}
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
