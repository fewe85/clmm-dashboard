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
}

// ─── Config ───────────────────────────────────────────────────────────────
const FILL_TARGET = 200 // $200 = 100% fill
const W = 120 // canvas width
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
  asteroid: ['#5a4a3a', '#6b5540', '#4a3a2e', '#7a5545', '#3d3028'],
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
  const size = 5 + Math.random() * 10
  return {
    x: 15 + Math.random() * (W - 30),
    y: -size,
    vx: (Math.random() - 0.5) * 0.3,
    vy: 0.4 + Math.random() * 0.6,
    size,
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.03,
    phase: 'intake',
    color: COL.asteroid[Math.floor(Math.random() * COL.asteroid.length)],
    opacity: 0.8 + Math.random() * 0.2,
    shape: makeShape(size),
  }
}

export function LiveEarnings({ snapshots, pendingFees, pendingRewards, nextHarvestAt }: LiveEarningsProps) {
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

    // Fill level
    const targetFill = Math.min(currentTotal / FILL_TARGET, 1)
    fillRef.current += (targetFill - fillRef.current) * 0.02

    // Zone boundaries
    const intakeEnd = h * ZONE_INTAKE
    const processEnd = h * (ZONE_INTAKE + ZONE_PROCESS)

    ctx.clearRect(0, 0, W, h)

    // ─── BACKGROUND — space / starfield ────────────────────────────
    ctx.fillStyle = '#020210'
    ctx.fillRect(0, 0, W, h)

    // Stars (deterministic from seed, drawn each frame for simplicity)
    for (let i = 0; i < 25; i++) {
      const sx = ((i * 47 + 13) % (W - 8)) + 4
      const sy = ((i * 73 + 29) % (h - 8)) + 4
      const sr = i % 6 === 0 ? 0.9 : 0.4
      const sa = 0.12 + (i % 4) * 0.06 + Math.sin(now * 0.001 + i) * 0.04
      ctx.beginPath()
      ctx.arc(sx, sy, sr, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(255,255,255,${sa})`
      ctx.fill()
    }

    // Subtle nebula tint
    const nebula = ctx.createRadialGradient(W / 2, h * 0.4, 0, W / 2, h * 0.4, h * 0.5)
    nebula.addColorStop(0, 'rgba(180,77,255,0.03)')
    nebula.addColorStop(1, 'transparent')
    ctx.fillStyle = nebula
    ctx.fillRect(0, 0, W, h)

    // ─── METAL FRAME ─────────────────────────────────────────────
    // Side rails
    const railW = 4
    const grad = ctx.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, '#3a3a4a')
    grad.addColorStop(0.5, '#2a2a3a')
    grad.addColorStop(1, '#3a3a4a')
    ctx.fillStyle = grad
    ctx.fillRect(0, 0, railW, h)
    ctx.fillRect(W - railW, 0, railW, h)

    // Pre-calculate collection dimensions (used by particles too)
    const collectionH = h - processEnd - 7

    // Rail inner highlight
    ctx.fillStyle = 'rgba(180,77,255,0.08)'
    ctx.fillRect(railW, 0, 1, h)
    ctx.fillRect(W - railW - 1, 0, 1, h)

    // Zone separator bands
    for (const y of [intakeEnd, processEnd]) {
      ctx.fillStyle = COL.metalLight
      ctx.fillRect(0, y - 3, W, 6)
      ctx.fillStyle = COL.metal
      ctx.fillRect(0, y - 2, W, 4)
      // bolts
      for (const bx of [6, W - 10]) {
        ctx.beginPath()
        ctx.arc(bx + 2, y, 2.5, 0, Math.PI * 2)
        ctx.fillStyle = '#1e1e2e'
        ctx.fill()
        ctx.strokeStyle = 'rgba(180,77,255,0.15)'
        ctx.lineWidth = 0.5
        ctx.stroke()
      }
    }

    // ─── INTAKE ZONE (top) ───────────────────────────────────────
    // Hatch opening
    ctx.fillStyle = '#1a1a2a'
    ctx.fillRect(railW + 8, 0, W - railW * 2 - 16, 4)
    ctx.strokeStyle = 'rgba(180,77,255,0.25)'
    ctx.lineWidth = 0.5
    ctx.strokeRect(railW + 8, 0, W - railW * 2 - 16, 4)

    // ─── PROCESS ZONE (middle) ───────────────────────────────────
    // Heat glow background
    const heatGrad = ctx.createLinearGradient(0, intakeEnd, 0, processEnd)
    heatGrad.addColorStop(0, 'rgba(255,107,53,0.02)')
    heatGrad.addColorStop(0.5, `rgba(255,107,53,${0.04 + Math.sin(now * 0.003) * 0.02})`)
    heatGrad.addColorStop(1, 'rgba(0,255,136,0.03)')
    ctx.fillStyle = heatGrad
    ctx.fillRect(railW, intakeEnd + 3, W - railW * 2, processEnd - intakeEnd - 6)

    // LED indicators
    const ledY = intakeEnd + (processEnd - intakeEnd) * 0.5
    for (const [lx, col, phase] of [[8, COL.neonGreen, 0], [8, COL.warn, 1.5], [W - 12, COL.neonGreen, 0.7]] as [number, string, number][]) {
      const brightness = 0.3 + Math.sin(now * 0.004 + phase) * 0.3
      ctx.beginPath()
      ctx.arc(lx, ledY + (phase * 12 - 10), 2, 0, Math.PI * 2)
      ctx.fillStyle = col
      ctx.globalAlpha = brightness
      ctx.fill()
      ctx.globalAlpha = 1
    }

    // ─── ROBOT WITH LIGHTSABER ─────────────────────────────────────
    // Robot stands on the zone 2/3 separator, swings blade left↔right
    const swingCycle = 3000
    const swingT = (now % swingCycle) / swingCycle
    // Swing angle: 0 = right, PI = left, smooth sine
    const swingAngle = Math.sin(swingT * Math.PI * 2) // -1 to 1

    const robotX = W / 2
    const robotY = processEnd - 8 // stands on the separator line
    const bladeLen = W / 2 - railW - 6
    const bladeAlpha = 0.7 + Math.sin(now * 0.01) * 0.2

    // Blade tip position (swings horizontally)
    const bladeTipX = robotX + swingAngle * bladeLen
    const bladeTipY = robotY - 4 - Math.abs(swingAngle) * 8 // slight arc upward at extremes

    // Blade Y for collision detection (approximate — horizontal band)
    const laserY = (robotY - 4 + bladeTipY) / 2
    const laser2Y = laserY

    ctx.save()

    // ── Lightsaber blade (drawn behind robot) ──
    // Glow
    ctx.beginPath()
    ctx.moveTo(robotX + 4 * Math.sign(swingAngle), robotY - 4)
    ctx.lineTo(bladeTipX, bladeTipY)
    ctx.strokeStyle = 'rgba(180,77,255,0.12)'
    ctx.lineWidth = 10
    ctx.stroke()

    // Blade core
    ctx.globalAlpha = bladeAlpha
    ctx.beginPath()
    ctx.moveTo(robotX + 3 * Math.sign(swingAngle), robotY - 4)
    ctx.lineTo(bladeTipX, bladeTipY)
    ctx.strokeStyle = '#d494ff'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.stroke()

    // Blade bright center
    ctx.strokeStyle = '#e8c0ff'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(robotX + 3 * Math.sign(swingAngle), robotY - 4)
    ctx.lineTo(bladeTipX, bladeTipY)
    ctx.stroke()
    ctx.lineCap = 'butt'

    // Blade tip glow
    ctx.beginPath()
    ctx.arc(bladeTipX, bladeTipY, 3, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(180,77,255,0.25)'
    ctx.fill()

    ctx.globalAlpha = 1

    // ── Robot body (pixel art, centered on separator) ──
    // Legs (standing on separator)
    ctx.fillStyle = '#3a3a4a'
    ctx.fillRect(robotX - 4, robotY + 1, 2, 4)
    ctx.fillRect(robotX + 2, robotY + 1, 2, 4)

    // Body
    ctx.fillStyle = '#4a4a5a'
    ctx.fillRect(robotX - 5, robotY - 6, 10, 8)
    ctx.fillStyle = '#5a5a6a'
    ctx.fillRect(robotX - 4, robotY - 5, 8, 2)

    // Chest light
    ctx.fillStyle = '#b44dff'
    ctx.fillRect(robotX - 1, robotY - 3, 2, 2)
    ctx.globalAlpha = 0.3 + Math.sin(now * 0.005) * 0.2
    ctx.fillStyle = 'rgba(180,77,255,0.4)'
    ctx.fillRect(robotX - 2, robotY - 4, 4, 4)
    ctx.globalAlpha = 1

    // Head
    ctx.fillStyle = '#5a5a6a'
    ctx.fillRect(robotX - 3, robotY - 11, 6, 5)
    // Eyes (looks in swing direction)
    const eyeOff = swingAngle > 0 ? 1 : -2
    ctx.fillStyle = '#ff4444'
    ctx.fillRect(robotX + eyeOff, robotY - 10, 2, 2)
    ctx.fillStyle = 'rgba(255,68,68,0.3)'
    ctx.fillRect(robotX + eyeOff - 1, robotY - 11, 4, 4)
    // Antenna
    ctx.fillStyle = '#6a6a7a'
    ctx.fillRect(robotX, robotY - 14, 1, 3)
    ctx.fillStyle = '#b44dff'
    ctx.fillRect(robotX - 1, robotY - 15, 3, 2)

    // Arm (points in blade direction)
    ctx.fillStyle = '#4a4a5a'
    const armDir = Math.sign(swingAngle) || 1
    ctx.fillRect(robotX + armDir * 4, robotY - 5, armDir * 4, 2)
    // Handle
    ctx.fillStyle = '#6a6a7a'
    ctx.fillRect(robotX + armDir * 7, robotY - 6, 3, 4)

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
    // Spawn asteroids
    if (now - lastSpawnRef.current > 2500 + Math.random() * 3000) {
      if (particlesRef.current.length < 8) {
        particlesRef.current.push(makeParticle(h))
        lastSpawnRef.current = now
      }
    }

    const surfaceLimit = h - 4 - collectionH * fillRef.current

    // Update & draw
    const alive: Particle[] = []
    for (const p of particlesRef.current) {
      p.x += p.vx
      p.y += p.vy
      p.rotation += p.rotSpeed

      // Asteroid hits lightsaber blade → shatter into dots
      if (p.phase === 'intake') {
        // Check if asteroid is near the blade's Y position and within the swing arc
        const bladeMinX = Math.min(robotX, bladeTipX) - 4
        const bladeMaxX = Math.max(robotX, bladeTipX) + 4
        const nearBladeY = Math.abs(p.y - laserY) < 6
        const inBladeX = p.x > bladeMinX && p.x < bladeMaxX
        if (nearBladeY && inBladeX && p.y > intakeEnd + 10) {
          p.phase = 'process'
          // Spawn small dot particles
          const dotCount = 6 + Math.floor(Math.random() * 5)
          p.fragments = Array.from({ length: dotCount }, () => ({
            x: p.x + (Math.random() - 0.5) * p.size * 0.8,
            y: p.y,
            vx: (Math.random() - 0.5) * 0.8,
            vy: 0.5 + Math.random() * 0.8,
            size: 1.5 + Math.random() * 2,
            glow: 0,
          }))
        }
      }

      if (p.phase === 'process') {
        // Asteroid fades fast
        p.size *= 0.88
        p.opacity *= 0.9

        // Dots fall down with gravity
        if (p.fragments) {
          for (const f of p.fragments) {
            f.x += f.vx
            f.y += f.vy
            f.vy += 0.015
            f.vx *= 0.99
            f.glow = Math.min(1, f.glow + 0.01)
            // Shrink when hitting liquid
            if (f.y > surfaceLimit) f.size *= 0.92
          }
          p.fragments = p.fragments.filter(f => f.size > 0.4 && f.y < h)
        }

        if (p.size < 0.5 && (!p.fragments || p.fragments.length === 0)) {
          p.phase = 'done'
        }
      }

      if (p.phase as string === 'done') continue

      // Draw asteroid (intact or shrinking)
      if (p.size > 1) {
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
          // Start grey/orange, transition to neon green
          const r = Math.floor(180 * (1 - t))
          const g = Math.floor(120 * (1 - t) + 255 * t)
          const b = Math.floor(80 * (1 - t) + 136 * t)

          // Dot
          ctx.beginPath()
          ctx.arc(f.x, f.y, f.size, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${r},${g},${b},${0.7 + t * 0.3})`
          ctx.fill()

          // Glow halo when green
          if (t > 0.4) {
            ctx.beginPath()
            ctx.arc(f.x, f.y, f.size + 2, 0, Math.PI * 2)
            ctx.fillStyle = `rgba(0,255,136,${(t - 0.4) * 0.12})`
            ctx.fill()
          }
        }
      }

      if (p.phase !== 'done') alive.push(p)
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
        <div className="earning-pulse mx-auto mb-1" />
        <div className="mono text-xs font-bold neon-value" style={{ color: 'var(--lavender)' }}>
          ${displayTotal.toFixed(4)}
        </div>
        <div className="hud-label" style={{ fontSize: '7px', color: 'var(--lavender)', opacity: 0.6 }}>TOTAL EARNED</div>
      </div>

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
