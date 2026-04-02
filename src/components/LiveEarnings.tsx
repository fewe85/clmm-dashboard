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
    Array.from({ length: 10 }, (_, i) => ({
      left: 15 + (i * 27 + 11) % 70,
      delay: (i * 0.8) % 4.5,
      duration: 2.2 + (i % 3) * 0.6,
      shape: i % 3,
      isReward: i > Math.floor(10 * feesRatio),
    })),
  [feesRatio])

  const shaftStars = useMemo(() =>
    Array.from({ length: 15 }, (_, i) => ({
      x: 10 + (i * 41 + 7) % 80,
      y: 3 + (i * 37 + 11) % 94,
      r: i % 5 === 0 ? 0.8 : 0.4,
      twinkle: i % 6 === 0,
    })),
  [])

  return (
    <div className="flex flex-col items-center justify-between relative" style={{ width: 120, minHeight: '100%' }}>

      {/* Top: collector funnel + value */}
      <div className="text-center z-10 flex-shrink-0 w-full">
        <svg viewBox="0 0 120 38" className="w-full" style={{ height: 38 }}>
          <line x1="60" y1="2" x2="60" y2="14" stroke="#c77dff" strokeWidth="1" opacity="0.5" />
          <circle cx="60" cy="2" r="2" fill="#c77dff" opacity="0.8">
            <animate attributeName="opacity" values="0.4;1;0.4" dur="2s" repeatCount="indefinite" />
          </circle>
          <path d="M 30 18 Q 60 10 90 18" fill="none" stroke="#c77dff" strokeWidth="1.5" opacity="0.5" />
          <line x1="42" y1="18" x2="55" y2="26" stroke="#666" strokeWidth="0.6" opacity="0.4" />
          <line x1="78" y1="18" x2="65" y2="26" stroke="#666" strokeWidth="0.6" opacity="0.4" />
          <text x="60" y="34" textAnchor="middle" fill="#c77dff" fontSize="8" fontFamily="JetBrains Mono, monospace" fontWeight="bold">
            ${displayTotal.toFixed(4)}
          </text>
        </svg>
        <div className="hud-label" style={{ fontSize: '7px', color: '#c77dff', opacity: 0.6, marginTop: -2 }}>COLLECTED</div>
      </div>

      {/* Middle: containment tube — flex-1 fills remaining height */}
      <div className="relative flex-1 w-full" style={{ minHeight: 200 }}>
        <div
          className="absolute inset-x-2 top-0 bottom-0 overflow-hidden"
          style={{
            border: '1px solid rgba(199,125,255,0.15)',
            background: '#020208',
            borderRadius: 8,
          }}
        >
          {/* Stars */}
          {shaftStars.map((s, i) => (
            <div key={i} className="absolute rounded-full" style={{
              left: `${s.x}%`, top: `${s.y}%`,
              width: s.r * 2, height: s.r * 2,
              background: 'white',
              opacity: 0.1 + (i % 3) * 0.07,
              animation: s.twinkle ? 'earning-pulse 3s ease-in-out infinite' : undefined,
            }} />
          ))}

          {/* Metal frame edges */}
          <div className="absolute top-0 bottom-0 left-0" style={{ width: 3, background: 'linear-gradient(to bottom, rgba(199,125,255,0.2), rgba(199,125,255,0.04), rgba(199,125,255,0.2))' }} />
          <div className="absolute top-0 bottom-0 right-0" style={{ width: 3, background: 'linear-gradient(to bottom, rgba(199,125,255,0.2), rgba(199,125,255,0.04), rgba(199,125,255,0.2))' }} />

          {/* Metal bands with bolts */}
          {[12, 30, 50, 70, 88].map(pct => (
            <div key={pct} className="absolute left-0 right-0 flex items-center justify-between" style={{ top: `${pct}%` }}>
              <div style={{ width: '100%', height: 3, background: '#1a1a3e', border: '0.5px solid rgba(199,125,255,0.15)', borderRadius: 1 }} />
              <div className="absolute left-0" style={{ width: 5, height: 5, borderRadius: '50%', background: '#1a1a3e', border: '0.5px solid rgba(199,125,255,0.2)' }} />
              <div className="absolute right-0" style={{ width: 5, height: 5, borderRadius: '50%', background: '#1a1a3e', border: '0.5px solid rgba(199,125,255,0.2)' }} />
            </div>
          ))}

          {/* Viewing port */}
          <div className="absolute" style={{
            left: '50%', top: '28%', transform: 'translate(-50%, -50%)',
            width: 36, height: 44, borderRadius: '50%',
            border: '1px solid rgba(199,125,255,0.2)',
            boxShadow: 'inset 0 0 8px rgba(199,125,255,0.05)',
          }}>
            <div className="absolute" style={{
              top: 4, left: 6, width: 10, height: 14, borderRadius: '50%',
              background: 'rgba(255,255,255,0.015)',
            }} />
          </div>

          {/* Fill level */}
          <div
            className="absolute bottom-0 left-0 right-0 transition-all duration-[2000ms] ease-linear"
            style={{
              height: `${fillPct}%`,
              background: 'linear-gradient(to top, rgba(199,125,255,0.4), rgba(168,85,247,0.2) 40%, rgba(199,125,255,0.05))',
              borderTop: fillPct > 2 ? '1px solid rgba(199,125,255,0.5)' : 'none',
            }}
          >
            {fillPct > 8 && (
              <svg className="absolute bottom-0 left-0 right-0" viewBox="0 0 100 14" preserveAspectRatio="none" style={{ height: 14, opacity: 0.35 }}>
                <polygon points="0,14 8,8 16,12 24,5 32,10 40,4 50,9 58,3 66,11 74,6 82,10 90,4 100,14" fill="#c77dff" />
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

      {/* Bottom: base + stats */}
      <div className="text-center z-10 flex-shrink-0 mt-1 space-y-0.5">
        {/* Base stand SVG */}
        <svg viewBox="0 0 120 18" className="w-full" style={{ height: 16 }}>
          <path d="M 22 0 L 18 6 L 102 6 L 98 0 Z" fill="#1a1a3e" stroke="#c77dff" strokeWidth="0.5" opacity="0.5" />
          <rect x="16" y="6" width="88" height="4" rx="1" fill="#1a1a3e" stroke="#c77dff" strokeWidth="0.4" opacity="0.4" />
          <circle cx="35" cy="10" r="1.5" fill="#39ff14" opacity="0.5">
            <animate attributeName="opacity" values="0.3;0.7;0.3" dur="3s" repeatCount="indefinite" />
          </circle>
          <circle cx="85" cy="10" r="1.5" fill="#c77dff" opacity="0.5">
            <animate attributeName="opacity" values="0.3;0.7;0.3" dur="3s" repeatCount="indefinite" begin="1s" />
          </circle>
          <rect x="30" y="10" width="3" height="8" rx="1" fill="#1a1a3e" opacity="0.3" />
          <rect x="87" y="10" width="3" height="8" rx="1" fill="#1a1a3e" opacity="0.3" />
          <rect x="57" y="10" width="6" height="8" rx="1" fill="#1a1a3e" opacity="0.3" />
        </svg>
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
