import { useState, useEffect, useRef, useMemo, useCallback } from 'react'

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
  positionValue: number
}

// ─── Config ───────────────────────────────────────────────────────────────
const FILL_TARGET = 200 // $200 = 100% fill
const W = 140 // canvas width
const ZONE_INTAKE = 0.18  // top 18%
const ZONE_PROCESS = 0.37 // middle 37%
// bottom 45% = collection

// ─── Color palette ────────────────────────────────────────────────────────
const COL = {
  bg: '#0a0a1a',
  metal: '#2a2a3a',
  metalLight: '#3a3a4a',
  metalBorder: 'rgba(180,77,255,0.2)',
  neonGreen: '#00ff88',
  neonPurple: '#b44dff',
  warn: '#ff6b35',
  asteroid: ['#c77dff', '#b44dff', '#d494ff', '#a855f7', '#c06cff'],
  glow: 'rgba(0,255,136,0.15)',
  processGlow: 'rgba(255,107,53,0.08)',
}

// ─── Asteroid particle type ───────────────────────────────────────────────
interface Particle {
  x: number; y: number; vx: number; vy: number
  size: number; rotation: number; rotSpeed: number
  phase: 'intake' | 'process' | 'done'
  color: string; opacity: number
  // shape vertices (irregular polygon)
  shape: number[][]
  fragments?: { x: number; y: number; vx: number; vy: number; size: number; glow: number }[]
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

function makeShape(size: number): number[][] {
  const pts = 5 + Math.floor(Math.random() * 3)
  const verts: number[][] = []
  for (let i = 0; i < pts; i++) {
    const angle = (i / pts) * Math.PI * 2
    const r = size * (0.5 + Math.random() * 0.5)
    verts.push([Math.cos(angle) * r, Math.sin(angle) * r])
  }
  return verts
}

function makeParticle(_h: number): Particle {
  const size = 8 + Math.random() * 12
  return {
    x: 20 + Math.random() * (W - 40),
    y: -size,
    vx: (Math.random() - 0.5) * 0.15,
    vy: 0.3 + Math.random() * 0.4,
    size,
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.03,
    phase: 'intake',
    color: COL.asteroid[Math.floor(Math.random() * COL.asteroid.length)],
    opacity: 0.8 + Math.random() * 0.2,
    shape: makeShape(size),
  }
}

/** Ore Density meter — live APR from fastest available data */
function OreDensityMeter({ ratePerHour, positionValue, pendingTotal, snapshots }: {
  ratePerHour: number; positionValue: number; pendingTotal: number; snapshots: Snapshot[]
}) {
  // Track pending changes between refreshes for real-time rate
  const prevPendingRef = useRef({ value: pendingTotal, time: Date.now() })
  const liveRateRef = useRef(ratePerHour)

  useEffect(() => {
    const prev = prevPendingRef.current
    const now = Date.now()
    const dt = (now - prev.time) / 3_600_000 // hours
    const dv = pendingTotal - prev.value

    if (dt > 0.01 && dv > 0) { // at least ~30s and positive change
      // Blend: 70% new measurement, 30% old to smooth noise
      liveRateRef.current = liveRateRef.current * 0.3 + (dv / dt) * 0.7
    }
    prevPendingRef.current = { value: pendingTotal, time: now }
  }, [pendingTotal])

  // Also check last 2 snapshots for fast reaction after rebalance
  const shortRate = useMemo(() => {
    if (snapshots.length < 2) return 0
    const last = snapshots[snapshots.length - 1]
    const prev = snapshots[snapshots.length - 2]
    const dt = (new Date(last.t).getTime() - new Date(prev.t).getTime()) / 3_600_000
    if (dt < 0.3) return 0 // too close, unreliable
    const dEarn = (last.feesUsd - prev.feesUsd) + (last.rewardsUsd - prev.rewardsUsd)
    return dEarn > 0 ? dEarn / dt : 0
  }, [snapshots])

  // Use the most responsive rate: max of live-pending, short-snapshot, and hourly average
  const bestRate = Math.max(liveRateRef.current, shortRate, ratePerHour)
  const liveApr = positionValue > 0 ? (bestRate * 24 * 365 / positionValue) * 100 : 0
  const canvasRef = useRef<HTMLCanvasElement>(null)
  // Track recent "clicks" for visual decay
  const clicksRef = useRef<{ x: number; t: number; size: number }[]>([])
  const lastClickRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const cw = 130, ch = 22
    canvas.width = cw
    canvas.height = ch

    // Click interval: high rate = fast clicks, low = slow
    // Map: $0.5/h → 1 click/2s, $5/h → 5 clicks/s, $50/h → 20 clicks/s
    const clicksPerSec = Math.max(0.3, Math.min(25, bestRate * 1.2))
    const avgIntervalMs = 1000 / clicksPerSec

    let animId = 0

    const draw = () => {
      const now = Date.now()
      ctx.clearRect(0, 0, cw, ch)

      // Spawn clicks at randomized intervals
      const timeSinceLast = now - lastClickRef.current
      const jitter = avgIntervalMs * (0.3 + Math.random() * 1.4)
      if (timeSinceLast > jitter) {
        clicksRef.current.push({
          x: 4 + Math.random() * (cw - 8),
          t: now,
          size: 1.5 + Math.random() * 2,
        })
        lastClickRef.current = now
      }

      // Draw + decay
      const alive: typeof clicksRef.current = []
      for (const c of clicksRef.current) {
        const age = (now - c.t) / 1000
        if (age > 1.2) continue
        alive.push(c)

        const alpha = Math.max(0, 1 - age / 1.2)
        const r = c.size * (1 + age * 0.5)

        // Dot
        ctx.beginPath()
        ctx.arc(c.x, ch / 2, r, 0, Math.PI * 2)

        // Color based on intensity: green normal, yellow high, red spike
        let color: string
        if (bestRate > 20) color = `rgba(255,42,109,${alpha * 0.9})`      // spike — pink
        else if (bestRate > 5) color = `rgba(255,200,0,${alpha * 0.8})`    // high — yellow
        else color = `rgba(0,255,136,${alpha * 0.7})`                          // normal — green

        ctx.fillStyle = color
        ctx.fill()

        // Glow ring on fresh clicks
        if (age < 0.3) {
          ctx.beginPath()
          ctx.arc(c.x, ch / 2, r + 3, 0, Math.PI * 2)
          ctx.fillStyle = color.replace(/[\d.]+\)$/, `${alpha * 0.15})`)
          ctx.fill()
        }
      }
      clicksRef.current = alive

      // Meter bar background
      ctx.fillStyle = 'rgba(199,125,255,0.04)'
      ctx.fillRect(0, ch - 3, cw, 3)

      // Activity level bar
      const level = Math.min(1, bestRate / 15)
      const barColor = bestRate > 20 ? '#ff2a6d' : bestRate > 5 ? '#ffcc00' : '#00ff88'
      ctx.fillStyle = barColor
      ctx.globalAlpha = 0.3
      ctx.fillRect(0, ch - 3, cw * level, 3)
      ctx.globalAlpha = 1

      animId = requestAnimationFrame(draw)
    }

    draw()
    return () => cancelAnimationFrame(animId)
  }, [ratePerHour])

  // APR tier label
  const tier = liveApr > 10000 ? 'ULTRA RICH' : liveApr > 3000 ? 'RICH VEIN' : liveApr > 1000 ? 'GOOD' : 'SPARSE'
  const tierColor = liveApr > 10000 ? '#ff2a6d' : liveApr > 3000 ? '#ffcc00' : liveApr > 1000 ? '#00ff88' : '#9a9ab0'

  return (
    <div className="w-full flex-shrink-0 px-1">
      <div className="flex items-center justify-between mb-0.5">
        <span className="mono font-bold" style={{ fontSize: '9px', color: '#b0b8cc' }}>ORE DENSITY</span>
        <span className="mono font-bold" style={{ fontSize: '9px', color: tierColor }}>
          {tier} {liveApr > 0 ? `${liveApr >= 1000 ? `${(liveApr / 1000).toFixed(1)}k` : liveApr.toFixed(0)}%` : ''}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: 22, borderRadius: 4, background: '#06060f', border: '1px solid #1a1a2a' }}
      />
    </div>
  )
}

export function LiveEarnings({ snapshots, pendingFees, pendingRewards, nextHarvestAt, harvestThreshold, positionValue }: LiveEarningsProps) {
  const { feesPerHour, rewardsPerHour } = useMemo(() => calcRate(snapshots), [snapshots])
  const totalPerHour = feesPerHour + rewardsPerHour
  const totalPerSecond = totalPerHour / 3600

  // Smooth animated counter
  const [displayTotal, setDisplayTotal] = useState(pendingFees + pendingRewards)
  const baseRef = useRef({ value: pendingFees + pendingRewards, time: Date.now() })

  useEffect(() => {
    baseRef.current = { value: pendingFees + pendingRewards, time: Date.now() }
  }, [pendingFees, pendingRewards])

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

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const particlesRef = useRef<Particle[]>([])
  const lastSpawnRef = useRef(0)
  const nextSpawnDelay = useRef(500) // first spawn fast
  const fillRef = useRef(0)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const h = canvas.height
    const now = Date.now()

    // Update display total
    const elapsed = (now - baseRef.current.time) / 1000
    const currentTotal = baseRef.current.value + elapsed * totalPerSecond
    setDisplayTotal(currentTotal)

    // Fill level — based on harvest threshold (1% of position)
    const fillTarget = harvestThreshold > 0 ? harvestThreshold : FILL_TARGET
    const targetFill = Math.min(currentTotal / fillTarget, 1)
    fillRef.current += (targetFill - fillRef.current) * 0.02

    // Zone boundaries
    const intakeEnd = h * ZONE_INTAKE
    const processEnd = h * (ZONE_INTAKE + ZONE_PROCESS)

    ctx.clearRect(0, 0, W, h)

    // ─── BACKGROUND — 3D space station interior ──────────────────
    ctx.fillStyle = '#08080f'
    ctx.fillRect(0, 0, W, h)

    const railW = 4
    const collectionH = h - processEnd - 7

    // Perspective walls — converging lines create depth
    const cx = W / 2
    const vanishY = h * 0.45 // vanishing point

    // Wall panels (left + right) with perspective gradient
    const wallGradL = ctx.createLinearGradient(0, 0, railW + 15, 0)
    wallGradL.addColorStop(0, '#1a1a2a')
    wallGradL.addColorStop(1, '#0c0c18')
    ctx.fillStyle = wallGradL
    ctx.fillRect(0, 0, railW + 15, h)

    const wallGradR = ctx.createLinearGradient(W, 0, W - railW - 15, 0)
    wallGradR.addColorStop(0, '#1a1a2a')
    wallGradR.addColorStop(1, '#0c0c18')
    ctx.fillStyle = wallGradR
    ctx.fillRect(W - railW - 15, 0, railW + 15, h)

    // Horizontal panel lines on walls (perspective spacing)
    ctx.strokeStyle = 'rgba(180,77,255,0.06)'
    ctx.lineWidth = 0.5
    for (let i = 0; i < 20; i++) {
      const y = i * (h / 19)
      // Left wall panel line
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(railW + 12, y)
      ctx.stroke()
      // Right wall panel line
      ctx.beginPath()
      ctx.moveTo(W - railW - 12, y)
      ctx.lineTo(W, y)
      ctx.stroke()
    }

    // Vertical ribs on walls
    ctx.strokeStyle = 'rgba(180,77,255,0.04)'
    for (const x of [5, 10, W - 9, W - 14]) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, h)
      ctx.stroke()
    }

    // Floor/ceiling perspective lines converging to center
    ctx.strokeStyle = 'rgba(180,77,255,0.03)'
    ctx.lineWidth = 0.5
    for (const startX of [0, W]) {
      for (let i = 1; i <= 4; i++) {
        const targetX = cx + (startX > cx ? 1 : -1) * (15 - i * 3)
        ctx.beginPath()
        ctx.moveTo(startX, 0)
        ctx.lineTo(targetX, vanishY)
        ctx.lineTo(startX, h)
        ctx.stroke()
      }
    }

    // Ambient light strip along walls (top)
    const stripGrad = ctx.createLinearGradient(0, 0, 0, 8)
    stripGrad.addColorStop(0, 'rgba(180,77,255,0.1)')
    stripGrad.addColorStop(1, 'transparent')
    ctx.fillStyle = stripGrad
    ctx.fillRect(0, 0, railW + 12, 8)
    ctx.fillRect(W - railW - 12, 0, railW + 12, 8)

    // Side rail highlights (neon trim)
    ctx.fillStyle = 'rgba(180,77,255,0.08)'
    ctx.fillRect(railW + 14, 0, 1, h)
    ctx.fillRect(W - railW - 15, 0, 1, h)

    // Zone separator bands — bulkhead doors
    for (const y of [intakeEnd, processEnd]) {
      // Bulkhead frame
      ctx.fillStyle = '#1e1e30'
      ctx.fillRect(0, y - 3, W, 6)
      ctx.fillStyle = '#161625'
      ctx.fillRect(0, y - 2, W, 4)
      // Neon trim on bulkhead
      ctx.fillStyle = 'rgba(180,77,255,0.12)'
      ctx.fillRect(0, y - 3, W, 1)
      ctx.fillRect(0, y + 2, W, 1)
      // Bolts
      for (const bx of [8, W - 12]) {
        ctx.beginPath()
        ctx.arc(bx, y, 2.5, 0, Math.PI * 2)
        ctx.fillStyle = '#12121f'
        ctx.fill()
        ctx.strokeStyle = 'rgba(180,77,255,0.12)'
        ctx.lineWidth = 0.5
        ctx.stroke()
      }
    }

    // Hatch opening at top
    ctx.fillStyle = '#0a0a15'
    ctx.fillRect(railW + 16, 0, W - railW * 2 - 32, 3)
    ctx.strokeStyle = 'rgba(180,77,255,0.15)'
    ctx.lineWidth = 0.5
    ctx.strokeRect(railW + 16, 0, W - railW * 2 - 32, 3)

    // Processing zone — subtle heat glow
    const heatGrad = ctx.createLinearGradient(0, intakeEnd, 0, processEnd)
    heatGrad.addColorStop(0, 'rgba(180,77,255,0.01)')
    heatGrad.addColorStop(0.5, `rgba(180,77,255,${0.03 + Math.sin(now * 0.003) * 0.015})`)
    heatGrad.addColorStop(1, 'rgba(0,255,136,0.02)')
    ctx.fillStyle = heatGrad
    ctx.fillRect(railW + 15, intakeEnd + 3, W - railW * 2 - 30, processEnd - intakeEnd - 6)

    // ─── ROBOT WITH EYE LASERS ────────────────────────────────────
    const robotX = W / 2
    const robotY = processEnd - 16

    // Gentle idle bob + tilt
    const bobY = Math.sin(now * 0.0015) * 3 + Math.sin(now * 0.0025) * 1.5
    const rby = robotY + bobY

    // Eye positions
    const eyeLX = robotX - 4
    const eyeRX = robotX + 4
    const eyeY = rby - 28

    // Find nearest asteroid above robot to target
    let targetX = robotX
    let targetY = eyeY - 30
    let hasTarget = false
    let nearestDist = Infinity
    for (const p of particlesRef.current) {
      if (p.phase !== 'intake') continue
      const dist = Math.sqrt((p.x - robotX) ** 2 + (p.y - eyeY) ** 2)
      if (p.y > intakeEnd && p.y < eyeY && dist < nearestDist) {
        nearestDist = dist
        targetX = p.x
        targetY = p.y
        hasTarget = true
      }
    }

    // Collision: any asteroid within laser range of eye-to-target line
    const blades = hasTarget ? [
      { ax: eyeLX, ay: eyeY, bx: targetX, by: targetY },
      { ax: eyeRX, ay: eyeY, bx: targetX, by: targetY },
    ] : []

    ctx.save()

    // ── Robot body — Mech Sentinel ──
    const rx = robotX, ry = rby

    // Shadow/ground glow under feet
    ctx.beginPath()
    ctx.ellipse(rx, ry + 18, 16, 3, 0, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(180,77,255,0.06)'
    ctx.fill()

    // Legs — angled, mechanical
    ctx.fillStyle = '#3a3a4a'
    // Left leg: thigh
    ctx.fillRect(rx - 11, ry + 2, 5, 7)
    // Left leg: shin (slightly wider)
    ctx.fillStyle = '#444455'
    ctx.fillRect(rx - 12, ry + 8, 6, 6)
    // Left knee joint
    ctx.beginPath()
    ctx.arc(rx - 9, ry + 8, 2, 0, Math.PI * 2)
    ctx.fillStyle = '#b44dff'
    ctx.globalAlpha = 0.4
    ctx.fill()
    ctx.globalAlpha = 1
    // Left foot
    ctx.fillStyle = '#2a2a3a'
    ctx.fillRect(rx - 14, ry + 13, 9, 4)
    ctx.fillStyle = 'rgba(180,77,255,0.1)'
    ctx.fillRect(rx - 13, ry + 14, 7, 2)

    // Right leg (mirrored)
    ctx.fillStyle = '#3a3a4a'
    ctx.fillRect(rx + 6, ry + 2, 5, 7)
    ctx.fillStyle = '#444455'
    ctx.fillRect(rx + 6, ry + 8, 6, 6)
    ctx.beginPath()
    ctx.arc(rx + 9, ry + 8, 2, 0, Math.PI * 2)
    ctx.fillStyle = '#b44dff'
    ctx.globalAlpha = 0.4
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.fillStyle = '#2a2a3a'
    ctx.fillRect(rx + 5, ry + 13, 9, 4)
    ctx.fillStyle = 'rgba(180,77,255,0.1)'
    ctx.fillRect(rx + 6, ry + 14, 7, 2)

    // Torso — layered armor plates
    ctx.fillStyle = '#4a4a5a'
    ctx.fillRect(rx - 13, ry - 18, 26, 21)
    // Upper chest plate
    ctx.fillStyle = '#555566'
    ctx.fillRect(rx - 11, ry - 17, 22, 8)
    // Lower abdomen
    ctx.fillStyle = '#3d3d4e'
    ctx.fillRect(rx - 10, ry - 5, 20, 7)
    // Center chest seam
    ctx.fillStyle = 'rgba(180,77,255,0.06)'
    ctx.fillRect(rx - 0.5, ry - 17, 1, 20)

    // Reactor core (chest) — pulsing
    const corePulse = 0.5 + Math.sin(now * 0.004) * 0.3
    ctx.beginPath()
    ctx.arc(rx, ry - 8, 4, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(180,77,255,${corePulse * 0.8})`
    ctx.fill()
    ctx.beginPath()
    ctx.arc(rx, ry - 8, 2, 0, Math.PI * 2)
    ctx.fillStyle = '#d494ff'
    ctx.fill()
    // Reactor glow
    ctx.beginPath()
    ctx.arc(rx, ry - 8, 8, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(180,77,255,${corePulse * 0.08})`
    ctx.fill()

    // Shoulder armor — angular
    ctx.fillStyle = '#3a3a4a'
    // Left shoulder
    ctx.beginPath()
    ctx.moveTo(rx - 13, ry - 18)
    ctx.lineTo(rx - 20, ry - 14)
    ctx.lineTo(rx - 20, ry - 8)
    ctx.lineTo(rx - 13, ry - 8)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(180,77,255,0.08)'
    ctx.fillRect(rx - 19, ry - 13, 6, 1)
    // Right shoulder
    ctx.fillStyle = '#3a3a4a'
    ctx.beginPath()
    ctx.moveTo(rx + 13, ry - 18)
    ctx.lineTo(rx + 20, ry - 14)
    ctx.lineTo(rx + 20, ry - 8)
    ctx.lineTo(rx + 13, ry - 8)
    ctx.closePath()
    ctx.fill()
    ctx.fillStyle = 'rgba(180,77,255,0.08)'
    ctx.fillRect(rx + 13, ry - 13, 6, 1)

    // Arms — segmented
    ctx.fillStyle = '#444455'
    // Left arm
    ctx.fillRect(rx - 21, ry - 8, 5, 14)
    ctx.beginPath()
    ctx.arc(rx - 19, ry - 1, 1.5, 0, Math.PI * 2)
    ctx.fillStyle = '#b44dff'
    ctx.globalAlpha = 0.3
    ctx.fill()
    ctx.globalAlpha = 1
    // Left hand/fist
    ctx.fillStyle = '#555566'
    ctx.fillRect(rx - 22, ry + 5, 7, 5)
    // Right arm
    ctx.fillStyle = '#444455'
    ctx.fillRect(rx + 16, ry - 8, 5, 14)
    ctx.beginPath()
    ctx.arc(rx + 19, ry - 1, 1.5, 0, Math.PI * 2)
    ctx.fillStyle = '#b44dff'
    ctx.globalAlpha = 0.3
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.fillStyle = '#555566'
    ctx.fillRect(rx + 15, ry + 5, 7, 5)

    // Head — angular helmet
    ctx.fillStyle = '#555566'
    // Helmet base
    ctx.beginPath()
    ctx.moveTo(rx - 10, ry - 20)
    ctx.lineTo(rx - 8, ry - 35)
    ctx.lineTo(rx + 8, ry - 35)
    ctx.lineTo(rx + 10, ry - 20)
    ctx.closePath()
    ctx.fill()
    // Helmet crest
    ctx.fillStyle = '#4a4a5a'
    ctx.beginPath()
    ctx.moveTo(rx - 2, ry - 35)
    ctx.lineTo(rx, ry - 40)
    ctx.lineTo(rx + 2, ry - 35)
    ctx.closePath()
    ctx.fill()

    // Visor — wide angular slit
    ctx.fillStyle = '#0a0a1a'
    ctx.beginPath()
    ctx.moveTo(rx - 9, ry - 29)
    ctx.lineTo(rx - 7, ry - 31)
    ctx.lineTo(rx + 7, ry - 31)
    ctx.lineTo(rx + 9, ry - 29)
    ctx.lineTo(rx + 7, ry - 27)
    ctx.lineTo(rx - 7, ry - 27)
    ctx.closePath()
    ctx.fill()

    // Eyes — glow brighter when targeting
    const eyeGlow = hasTarget ? 1.0 : 0.5
    ctx.fillStyle = `rgba(255,68,68,${eyeGlow})`
    ctx.fillRect(eyeLX - 2, eyeY - 1, 4, 3)
    ctx.fillRect(eyeRX - 2, eyeY - 1, 4, 3)
    if (hasTarget) {
      // Visor glow when firing
      ctx.fillStyle = 'rgba(255,68,68,0.2)'
      ctx.beginPath()
      ctx.moveTo(rx - 9, ry - 29)
      ctx.lineTo(rx - 7, ry - 31)
      ctx.lineTo(rx + 7, ry - 31)
      ctx.lineTo(rx + 9, ry - 29)
      ctx.lineTo(rx + 7, ry - 27)
      ctx.lineTo(rx - 7, ry - 27)
      ctx.closePath()
      ctx.fill()
    }

    // Antenna — sensor array
    ctx.fillStyle = '#6a6a7a'
    ctx.fillRect(rx + 5, ry - 40, 1, 5)
    ctx.fillRect(rx - 6, ry - 38, 1, 3)
    ctx.beginPath()
    ctx.arc(rx + 5, ry - 41, 1.5, 0, Math.PI * 2)
    ctx.fillStyle = '#b44dff'
    ctx.globalAlpha = 0.5 + Math.sin(now * 0.004) * 0.3
    ctx.fill()
    ctx.globalAlpha = 1
    ctx.globalAlpha = 1

    // ── Eye laser beams (drawn in front of robot) ──
    if (hasTarget) {
      // Glow
      for (const ex of [eyeLX, eyeRX]) {
        ctx.beginPath()
        ctx.moveTo(ex, eyeY)
        ctx.lineTo(targetX, targetY)
        ctx.strokeStyle = 'rgba(255,68,68,0.06)'
        ctx.lineWidth = 8
        ctx.stroke()
      }
      // Beam core
      ctx.globalAlpha = 0.7 + Math.sin(now * 0.02) * 0.3
      for (const ex of [eyeLX, eyeRX]) {
        ctx.beginPath()
        ctx.moveTo(ex, eyeY)
        ctx.lineTo(targetX, targetY)
        ctx.strokeStyle = '#ff4444'
        ctx.lineWidth = 1.5
        ctx.lineCap = 'round'
        ctx.stroke()
      }
      // Bright center
      for (const ex of [eyeLX, eyeRX]) {
        ctx.beginPath()
        ctx.moveTo(ex, eyeY)
        ctx.lineTo(targetX, targetY)
        ctx.strokeStyle = '#ff8888'
        ctx.lineWidth = 0.6
        ctx.stroke()
      }
      ctx.lineCap = 'butt'
      // Impact point
      ctx.beginPath()
      ctx.arc(targetX, targetY, 5, 0, Math.PI * 2)
      ctx.fillStyle = 'rgba(255,68,68,0.15)'
      ctx.fill()
      ctx.globalAlpha = 1
    }

    ctx.restore()

    // ─── COLLECTION ZONE (bottom) ────────────────────────────────

    const fillH = collectionH * fillRef.current
    const surfaceY = h - 4 - fillH

    if (fillH > 2) {
      // Liquid fill
      const liqGrad = ctx.createLinearGradient(0, surfaceY, 0, h)
      liqGrad.addColorStop(0, 'rgba(0,255,136,0.25)')
      liqGrad.addColorStop(0.3, 'rgba(0,255,136,0.15)')
      liqGrad.addColorStop(1, 'rgba(0,255,136,0.35)')
      ctx.fillStyle = liqGrad
      ctx.fillRect(railW, surfaceY, W - railW * 2, fillH + 4)

      // Surface wave
      ctx.beginPath()
      ctx.moveTo(railW, surfaceY)
      for (let x = railW; x < W - railW; x += 2) {
        const wave = Math.sin(x * 0.08 + now * 0.002) * 1.5 + Math.sin(x * 0.15 + now * 0.003) * 0.8
        ctx.lineTo(x, surfaceY + wave)
      }
      ctx.lineTo(W - railW, surfaceY)
      ctx.strokeStyle = 'rgba(0,255,136,0.5)'
      ctx.lineWidth = 1
      ctx.stroke()

      // Surface glow upward
      const glowGrad = ctx.createLinearGradient(0, surfaceY - 15, 0, surfaceY)
      glowGrad.addColorStop(0, 'transparent')
      glowGrad.addColorStop(1, 'rgba(0,255,136,0.08)')
      ctx.fillStyle = glowGrad
      ctx.fillRect(railW, surfaceY - 15, W - railW * 2, 15)
    }

    // ─── PARTICLES ───────────────────────────────────────────────
    // Spawn asteroids — always keep some alive
    if (now - lastSpawnRef.current > nextSpawnDelay.current || particlesRef.current.length === 0) {
      if (particlesRef.current.length < 12) {
        const p = makeParticle(h)
        p.y = 5 // start visible inside canvas
        particlesRef.current.push(p)
        lastSpawnRef.current = now
        nextSpawnDelay.current = 1000 + Math.random() * 1500
      }
    }


    const surfaceLimit = h - 4 - collectionH * fillRef.current

    // Update & draw
    const alive: Particle[] = []
    for (const p of particlesRef.current) {
      p.x += p.vx
      p.y += p.vy
      p.rotation += p.rotSpeed
      // Keep inside tube rails
      if (p.x < 10 + p.size) { p.x = 10 + p.size; p.vx = Math.abs(p.vx) }
      if (p.x > W - 10 - p.size) { p.x = W - 10 - p.size; p.vx = -Math.abs(p.vx) }

      // Asteroid hits either lightsaber blade → shatter into dots
      if (p.phase === 'intake') {
        let hit = false
        for (const blade of blades) {
          const dx = blade.bx - blade.ax, dy = blade.by - blade.ay
          const lenSq = dx * dx + dy * dy
          let t = lenSq > 0 ? ((p.x - blade.ax) * dx + (p.y - blade.ay) * dy) / lenSq : 0
          t = Math.max(0, Math.min(1, t))
          const cx = blade.ax + t * dx, cy = blade.ay + t * dy
          const dist = Math.sqrt((p.x - cx) ** 2 + (p.y - cy) ** 2)
          if (dist < p.size + 12) { hit = true; break }
        }
        if (hit) {
          // Destroyed! Create fragments and mark done immediately
          p.phase = 'done' as any
          p.size = 0
          const dotCount = 6 + Math.floor(Math.random() * 5)
          p.fragments = Array.from({ length: dotCount }, () => ({
            x: p.x + (Math.random() - 0.5) * p.size * 0.8,
            y: p.y,
            vx: (Math.random() - 0.5) * 1.5,
            vy: 0.8 + Math.random() * 1.2,
            size: 1.5 + Math.random() * 2,
            glow: 0.3,
          }))
        }
      }

      // Update fragments (for any phase that has them)
      if (p.fragments) {
        for (const f of p.fragments) {
          f.x += f.vx
          f.y += f.vy
          f.vy += 0.02
          f.vx *= 0.98
          f.glow = Math.min(1, f.glow + 0.03)
          if (f.x < 8) { f.x = 8; f.vx = Math.abs(f.vx) * 0.5 }
          if (f.x > W - 8) { f.x = W - 8; f.vx = -Math.abs(f.vx) * 0.5 }
          if (f.y > surfaceLimit) f.size *= 0.92
        }
        p.fragments = p.fragments.filter(f => f.size > 0.4 && f.y < h)
      }

      // Draw intact asteroid
      if (p.phase === 'intake' && p.size > 1) {
        ctx.save()
        ctx.translate(p.x, p.y)
        ctx.rotate(p.rotation)
        ctx.beginPath()
        const s = p.shape
        ctx.moveTo(s[0][0], s[0][1])
        for (let i = 1; i < s.length; i++) ctx.lineTo(s[i][0], s[i][1])
        ctx.closePath()
        ctx.fillStyle = p.color
        ctx.globalAlpha = p.opacity
        ctx.fill()
        ctx.globalAlpha = 1
        ctx.restore()
      }

      // Draw dot fragments
      if (p.fragments) {
        for (const f of p.fragments) {
          const t = f.glow
          const r = Math.floor(180 * (1 - t))
          const g = Math.floor(120 * (1 - t) + 255 * t)
          const b = Math.floor(80 * (1 - t) + 136 * t)
          ctx.beginPath()
          ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${r},${g},${b},${0.7 + t * 0.3})`
          ctx.fill()
          if (t > 0.4) {
            ctx.beginPath()
            ctx.arc(f.x, f.y, f.size + 2, 0, Math.PI * 2)
            ctx.fillStyle = `rgba(0,255,136,${(t - 0.4) * 0.12})`
            ctx.fill()
          }
        }
      }

      // Keep alive if intake OR has fragments still falling
      const hasFragments = p.fragments && p.fragments.length > 0
      if (p.phase === 'intake' || hasFragments) alive.push(p)
    }
    particlesRef.current = alive

    // ─── OUTER GLOW ──────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(180,77,255,0.12)'
    ctx.lineWidth = 1
    ctx.strokeRect(0.5, 0.5, W - 1, h - 1)
  }, [totalPerSecond])

  // Animation loop
  useEffect(() => {
    if (totalPerHour <= 0) return
    let running = true
    const loop = () => {
      if (!running) return
      draw()
      requestAnimationFrame(loop)
    }
    loop()
    return () => { running = false }
  }, [draw, totalPerHour])

  // Resize canvas to container
  const containerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = containerRef.current
    const canvas = canvasRef.current
    if (!el || !canvas) return
    const obs = new ResizeObserver(entries => {
      for (const e of entries) {
        canvas.height = Math.floor(e.contentRect.height)
        canvas.width = W
      }
    })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])

  if (totalPerHour <= 0) return null

  const dailyRate = totalPerHour * 24

  return (
    <div className="flex flex-col items-center justify-between relative" style={{ width: W, minHeight: '100%' }}>

      {/* Top: live accumulation counter */}
      <div className="text-center z-10 flex-shrink-0 w-full py-1">
        <div className="mono text-xs font-bold neon-value" style={{ color: 'var(--lavender)' }}>
          ${displayTotal.toFixed(4)}
        </div>
        <div className="hud-label" style={{ fontSize: '7px', color: 'var(--lavender)', opacity: 0.6 }}>TOTAL EARNED</div>
      </div>

      {/* Ore density meter — earning velocity + live APR */}
      <OreDensityMeter ratePerHour={totalPerHour} positionValue={positionValue} pendingTotal={pendingFees + pendingRewards} snapshots={snapshots} />

      {/* Refinery column — canvas fills all remaining height */}
      <div ref={containerRef} className="relative flex-1 w-full" style={{ minHeight: 250 }}>
        <canvas
          ref={canvasRef}
          width={W}
          height={400}
          className="absolute inset-0"
          style={{ width: '100%', height: '100%' }}
        />
      </div>

      {/* Bottom stats */}
      <div className="text-center z-10 flex-shrink-0 py-1 space-y-0.5">
        {harvestThreshold > 0 && (
          <div className="mono font-bold" style={{ fontSize: '10px', color: '#00ff88', textShadow: '0 0 6px rgba(0,255,136,0.4)' }}>
            ${displayTotal.toFixed(2)} / ${harvestThreshold.toFixed(2)}
          </div>
        )}
        <div className="hud-label" style={{ fontSize: '7px', color: '#00ff88' }}>REFINING RATE</div>
        <div className="mono text-xs font-bold" style={{ color: '#00ff88', textShadow: '0 0 6px rgba(0,255,136,0.4)' }}>
          ${dailyRate.toFixed(2)}/d
        </div>
        {harvestSec !== null && harvestSec > 0 && (
          <div className="mono" style={{ color: harvestSec < 300 ? '#00ff88' : 'var(--text-muted)', fontSize: '9px' }}>
            {Math.floor(harvestSec / 60)}:{String(Math.floor(harvestSec % 60)).padStart(2, '0')}
          </div>
        )}
      </div>
    </div>
  )
}
