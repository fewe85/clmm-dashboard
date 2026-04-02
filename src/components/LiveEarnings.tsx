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
      left: 18 + (i * 23 + 11) % 64,
      delay: (i * 0.8) % 4.5,
      duration: 2.2 + (i % 3) * 0.6,
      shape: i % 3,
      isReward: i > Math.floor(10 * feesRatio),
    })),
  [feesRatio])

  return (
    <div className="flex flex-col items-center justify-between relative" style={{ width: 120, minHeight: '100%' }}>

      {/* Entire column is one SVG-driven containment tube */}
      <svg viewBox="0 0 120 420" className="w-full" style={{ height: '100%', minHeight: 380 }}>
        <defs>
          <linearGradient id="tube-glass" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#c77dff" stopOpacity="0.12" />
            <stop offset="20%" stopColor="#c77dff" stopOpacity="0.03" />
            <stop offset="80%" stopColor="#c77dff" stopOpacity="0.03" />
            <stop offset="100%" stopColor="#c77dff" stopOpacity="0.12" />
          </linearGradient>
          <linearGradient id="fill-grad" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor="#c77dff" stopOpacity="0.45" />
            <stop offset="40%" stopColor="#a855f7" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#c77dff" stopOpacity="0.05" />
          </linearGradient>
          <clipPath id="tube-clip">
            <rect x="20" y="55" width="80" height="300" rx="12" />
          </clipPath>
          <filter id="ore-glow">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1" />
          </filter>
        </defs>

        {/* Stars background */}
        {Array.from({ length: 12 }, (_, i) => (
          <circle key={i}
            cx={10 + (i * 37 + 5) % 100}
            cy={20 + (i * 53 + 17) % 380}
            r={i % 4 === 0 ? 0.8 : 0.4}
            fill="white" opacity={0.1 + (i % 3) * 0.06}
          />
        ))}

        {/* === TOP CAP — funnel/collector === */}
        {/* Antenna */}
        <line x1="60" y1="2" x2="60" y2="18" stroke="#c77dff" strokeWidth="1" opacity="0.5" />
        <circle cx="60" cy="2" r="2" fill="#c77dff" opacity="0.8">
          <animate attributeName="opacity" values="0.4;1;0.4" dur="2s" repeatCount="indefinite" />
        </circle>
        {/* Dish */}
        <path d="M 30 22 Q 60 12 90 22" fill="none" stroke="#c77dff" strokeWidth="1.5" opacity="0.5" />
        {/* Funnel body */}
        <path d="M 32 22 L 20 50 L 20 55 L 100 55 L 100 50 L 88 22 Z"
          fill="#0d0d1a" stroke="#c77dff" strokeWidth="0.8" opacity="0.7" />
        {/* Funnel inner glow */}
        <path d="M 38 26 L 28 48 L 92 48 L 82 26 Z" fill="#c77dff" opacity="0.03" />
        {/* Funnel opening indicator */}
        <ellipse cx="60" cy="50" rx="35" ry="4" fill="none" stroke="#c77dff" strokeWidth="0.5" opacity="0.3" />

        {/* Value display in funnel */}
        <text x="60" y="40" textAnchor="middle" fill="#c77dff" fontSize="8" fontFamily="JetBrains Mono, monospace" fontWeight="bold">
          ${displayTotal.toFixed(4)}
        </text>
        <text x="60" y="48" textAnchor="middle" fill="#c77dff" fontSize="5" fontFamily="JetBrains Mono, monospace" opacity="0.5" letterSpacing="1.5">
          COLLECTED
        </text>

        {/* === TUBE BODY — containment vessel === */}
        {/* Glass tube */}
        <rect x="20" y="55" width="80" height="300" rx="12" fill="url(#tube-glass)" stroke="#c77dff" strokeWidth="0.6" opacity="0.8" />

        {/* Metal rings/bands */}
        {[55, 115, 175, 235, 295, 355].map(y => (
          <g key={y}>
            <rect x="17" y={y - 2} width="86" height="4" rx="2"
              fill="#1a1a3e" stroke="#c77dff" strokeWidth="0.4" opacity="0.5" />
            {/* Bolts on each ring */}
            <circle cx="20" cy={y} r="1.5" fill="#1a1a3e" stroke="#c77dff" strokeWidth="0.3" opacity="0.4" />
            <circle cx="100" cy={y} r="1.5" fill="#1a1a3e" stroke="#c77dff" strokeWidth="0.3" opacity="0.4" />
          </g>
        ))}

        {/* Side pipes */}
        <rect x="14" y="70" width="3" height="270" rx="1.5" fill="#0d0d1a" stroke="#c77dff" strokeWidth="0.3" opacity="0.3" />
        <rect x="103" y="70" width="3" height="270" rx="1.5" fill="#0d0d1a" stroke="#c77dff" strokeWidth="0.3" opacity="0.3" />
        {/* Pipe connectors */}
        {[100, 180, 260].map(y => (
          <g key={`p${y}`}>
            <line x1="17" y1={y} x2="20" y2={y} stroke="#c77dff" strokeWidth="0.5" opacity="0.3" />
            <line x1="100" y1={y} x2="103" y2={y} stroke="#c77dff" strokeWidth="0.5" opacity="0.3" />
          </g>
        ))}

        {/* Viewing port — oval window */}
        <ellipse cx="60" cy="140" rx="18" ry="22" fill="none" stroke="#c77dff" strokeWidth="0.8" opacity="0.25" />
        <ellipse cx="60" cy="140" rx="16" ry="20" fill="none" stroke="#c77dff" strokeWidth="0.3" opacity="0.15" />
        {/* Glass reflection */}
        <ellipse cx="54" cy="132" rx="4" ry="6" fill="white" opacity="0.02" />

        {/* Content inside tube (clipped) */}
        <g clipPath="url(#tube-clip)">
          {/* Fill level */}
          <rect x="20" y={55 + 300 * (1 - fillPct / 100)} width="80" height={300 * fillPct / 100}
            fill="url(#fill-grad)">
            <animate attributeName="height"
              to={String(300 * fillPct / 100)}
              dur="2s" fill="freeze" />
          </rect>

          {/* Surface line glow */}
          {fillPct > 3 && (
            <line x1="22" y1={55 + 300 * (1 - fillPct / 100)} x2="98" y2={55 + 300 * (1 - fillPct / 100)}
              stroke="#c77dff" strokeWidth="1" opacity="0.5">
              <animate attributeName="opacity" values="0.3;0.7;0.3" dur="3s" repeatCount="indefinite" />
            </line>
          )}

          {/* Ore pile at bottom */}
          {fillPct > 5 && (
            <g opacity="0.35">
              <polygon points="20,355 30,342 40,350 50,338 60,345 70,335 80,348 90,340 100,355" fill="#c77dff" />
              <polygon points="25,355 35,346 45,352 55,340 65,348 75,338 85,350 95,345 100,355" fill="#a855f7" opacity="0.6" />
            </g>
          )}

          {/* Falling ores */}
          {ores.map((o, i) => {
            const oreX = 20 + (o.left / 100) * 80
            return (
              <g key={i} opacity="0">
                <animateTransform attributeName="transform" type="translate"
                  values={`0 -10; 0 300`}
                  dur={`${o.duration}s`} begin={`${o.delay}s`}
                  repeatCount="indefinite" />
                <animate attributeName="opacity" values="0;0.9;0.9;0"
                  dur={`${o.duration}s`} begin={`${o.delay}s`}
                  keyTimes="0;0.1;0.85;1" repeatCount="indefinite" />
                {o.shape === 0 ? (
                  <polygon points={`${oreX},60 ${oreX + 4},65 ${oreX},72 ${oreX - 4},65`}
                    fill={o.isReward ? '#c77dff' : '#a855f7'} />
                ) : o.shape === 1 ? (
                  <polygon points={`${oreX - 2},60 ${oreX + 2},60 ${oreX + 3},65 ${oreX + 2},72 ${oreX - 2},72 ${oreX - 3},65`}
                    fill={o.isReward ? '#c77dff' : '#a855f7'} />
                ) : (
                  <polygon points={`${oreX - 2},62 ${oreX + 3},60 ${oreX + 4},64 ${oreX + 3},68 ${oreX - 2},70 ${oreX - 3},66`}
                    fill={o.isReward ? '#c77dff' : '#a855f7'} />
                )}
                {/* Sparkle */}
                <circle cx={oreX} cy="64" r="1" fill="white" opacity="0.4" />
              </g>
            )
          })}
        </g>

        {/* === BOTTOM CAP — base/stand === */}
        <path d="M 20 355 L 15 370 L 105 370 L 100 355 Z"
          fill="#0d0d1a" stroke="#c77dff" strokeWidth="0.6" opacity="0.6" />
        {/* Base plate */}
        <rect x="12" y="370" width="96" height="5" rx="2"
          fill="#1a1a3e" stroke="#c77dff" strokeWidth="0.4" opacity="0.5" />
        {/* Base legs */}
        <rect x="22" y="375" width="4" height="12" rx="1" fill="#1a1a3e" stroke="#c77dff" strokeWidth="0.3" opacity="0.3" />
        <rect x="94" y="375" width="4" height="12" rx="1" fill="#1a1a3e" stroke="#c77dff" strokeWidth="0.3" opacity="0.3" />
        <rect x="56" y="375" width="8" height="12" rx="1" fill="#1a1a3e" stroke="#c77dff" strokeWidth="0.3" opacity="0.3" />

        {/* Status indicators on base */}
        <circle cx="35" cy="377" r="2" fill="#39ff14" opacity="0.6">
          <animate attributeName="opacity" values="0.3;0.8;0.3" dur="3s" repeatCount="indefinite" />
        </circle>
        <circle cx="85" cy="377" r="2" fill="#c77dff" opacity="0.6">
          <animate attributeName="opacity" values="0.3;0.8;0.3" dur="3s" repeatCount="indefinite" begin="1s" />
        </circle>

        {/* Bottom text */}
        <text x="60" y="398" textAnchor="middle" fill="#a855f7" fontSize="5" fontFamily="JetBrains Mono, monospace" opacity="0.5" letterSpacing="1">
          FEES + REWARDS
        </text>
        <text x="60" y="410" textAnchor="middle" fill="#c77dff" fontSize="9" fontFamily="JetBrains Mono, monospace" fontWeight="bold">
          ${(totalPerHour * 24).toFixed(2)}/d
        </text>
        {harvestSec !== null && harvestSec > 0 && (
          <text x="60" y="418" textAnchor="middle"
            fill={harvestSec < 300 ? '#39ff14' : '#4a5280'}
            fontSize="6" fontFamily="JetBrains Mono, monospace">
            {Math.floor(harvestSec / 60)}:{String(Math.floor(harvestSec % 60)).padStart(2, '0')}
          </text>
        )}
      </svg>
    </div>
  )
}
