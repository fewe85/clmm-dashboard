import { useState, useEffect, useRef, useMemo } from 'react'

interface Snapshot { t: string; feesUsd: number; rewardsUsd: number; posUsd: number }
interface LiveEarningsProps {
  snapshots: Snapshot[]; pendingFees: number; pendingRewards: number
  nextHarvestAt: string | null; harvestThreshold: number; positionValue: number
}

const W = 140

function calcRate(ss: Snapshot[]): number {
  if (ss.length < 3) return 0
  const r = ss.slice(-6), o = r[0], n = r[r.length - 1]
  const h = (new Date(n.t).getTime() - new Date(o.t).getTime()) / 3_600_000
  return h < 1 ? 0 : Math.max(0, ((n.feesUsd - o.feesUsd) + (n.rewardsUsd - o.rewardsUsd)) / h)
}

function OreDensityMeter({ positionValue, pendingTotal, initialRate }: {
  positionValue: number; pendingTotal: number; initialRate: number
}) {
  const histRef = useRef<{ v: number; t: number }[]>([])
  const rateRef = useRef(initialRate)
  useEffect(() => {
    const now = Date.now()
    histRef.current.push({ v: pendingTotal, t: now })
    histRef.current = histRef.current.filter(h => h.t > now - 600_000)
    const h = histRef.current
    if (h.length >= 2) {
      const dt = (h[h.length - 1].t - h[0].t) / 3_600_000, dv = h[h.length - 1].v - h[0].v
      if (dt > 0.005 && dv > 0) rateRef.current = rateRef.current * 0.4 + (dv / dt) * 0.6
    }
  }, [pendingTotal])
  const apr = positionValue > 0 ? (rateRef.current * 24 * 365 / positionValue) * 100 : 0
  const tier = apr > 10000 ? 'ULTRA RICH' : apr > 3000 ? 'RICH VEIN' : apr > 1000 ? 'GOOD' : 'SPARSE'
  const col = apr > 10000 ? '#ff2a6d' : apr > 3000 ? '#ffcc00' : apr > 1000 ? '#00ff88' : '#9a9ab0'
  return (
    <div className="w-full flex-shrink-0 px-1">
      <div className="flex items-center justify-between">
        <span className="mono font-bold" style={{ fontSize: '9px', color: '#b0b8cc' }}>ORE DENSITY</span>
        <span className="mono font-bold" style={{ fontSize: '9px', color: col }}>
          {tier} {apr > 0 ? `${apr >= 1000 ? `${(apr / 1000).toFixed(1)}k` : apr.toFixed(0)}%` : '—'}
        </span>
      </div>
    </div>
  )
}

// ─── Particle ─────────────────────────────────────────────────────────────
interface Ore {
  x: number; y: number; vx: number; vy: number; size: number; rot: number; rotV: number
  phase: 'fall' | 'b1' | 'f1' | 'b2' | 'f2' | 'b3' | 'melt' | 'drop'
  shape: number[][]; progress: number // 0=raw purple, 1=green liquid
}

function mkShape(s: number): number[][] {
  const n = 5 + Math.floor(Math.random() * 3)
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2, r = s * (0.4 + Math.random() * 0.6)
    return [Math.cos(a) * r, Math.sin(a) * r]
  })
}

// ─── Draw helpers ─────────────────────────────────────────────────────────
function drawBelt(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, dir: number, now: number) {
  const bh = 6, depth = 4
  // Top surface (lighter)
  ctx.fillStyle = '#444455'
  ctx.fillRect(x, y, w, bh)
  // Moving ridges on surface
  const speed = ((now * 0.04 * dir) % 8)
  ctx.fillStyle = 'rgba(199,125,255,0.07)'
  for (let rx = 0; rx < w; rx += 8) {
    const ox = rx + speed
    if (ox >= 0 && ox < w - 2) ctx.fillRect(x + ox, y + 1, 4, bh - 2)
  }
  // Front face (darker = depth)
  ctx.fillStyle = '#2a2a3a'
  ctx.fillRect(x, y + bh, w, depth)
  // Shadow underneath
  ctx.fillStyle = 'rgba(0,0,0,0.15)'
  ctx.fillRect(x + 2, y + bh + depth, w - 4, 2)
  // Rollers at ends
  for (const rx of [x + 3, x + w - 3]) {
    ctx.beginPath(); ctx.arc(rx, y + bh / 2, 4, 0, Math.PI * 2)
    ctx.fillStyle = '#3a3a4a'; ctx.fill()
    ctx.beginPath(); ctx.arc(rx, y + bh / 2, 1.5, 0, Math.PI * 2)
    ctx.fillStyle = '#555566'; ctx.fill()
  }
}

function drawRock(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, rot: number, shape: number[][], progress: number) {
  // Color: purple (#b44dff) → green (#00ff88)
  const t = progress
  const r = Math.floor(180 * (1 - t))
  const g = Math.floor(77 * (1 - t) + 255 * t)
  const b = Math.floor(255 * (1 - t) + 136 * t)
  const effectiveSize = size * (1 - t * 0.4) // shrinks as it transforms

  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(rot)
  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)'
  ctx.beginPath()
  ctx.moveTo(shape[0][0] * effectiveSize / size + 1.5, shape[0][1] * effectiveSize / size + 1.5)
  for (let i = 1; i < shape.length; i++) ctx.lineTo(shape[i][0] * effectiveSize / size + 1.5, shape[i][1] * effectiveSize / size + 1.5)
  ctx.closePath(); ctx.fill()
  // Body
  ctx.beginPath()
  ctx.moveTo(shape[0][0] * effectiveSize / size, shape[0][1] * effectiveSize / size)
  for (let i = 1; i < shape.length; i++) ctx.lineTo(shape[i][0] * effectiveSize / size, shape[i][1] * effectiveSize / size)
  ctx.closePath()
  ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.fill()
  // Highlight (top-left light)
  ctx.fillStyle = `rgba(255,255,255,${0.15 - t * 0.1})`
  ctx.beginPath(); ctx.arc(-effectiveSize * 0.2, -effectiveSize * 0.2, effectiveSize * 0.35, 0, Math.PI * 2); ctx.fill()
  // Glow when becoming green
  if (t > 0.5) {
    ctx.beginPath(); ctx.arc(0, 0, effectiveSize + 3, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(0,255,136,${(t - 0.5) * 0.12})`; ctx.fill()
  }
  ctx.restore()
}

function drawDrop(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  // 3D green drop
  ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,255,136,0.8)'; ctx.fill()
  // Highlight
  ctx.beginPath(); ctx.arc(x - size * 0.3, y - size * 0.3, size * 0.4, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(255,255,255,0.25)'; ctx.fill()
  // Glow
  ctx.beginPath(); ctx.arc(x, y, size + 3, 0, Math.PI * 2)
  ctx.fillStyle = 'rgba(0,255,136,0.08)'; ctx.fill()
}

// ─── Main ─────────────────────────────────────────────────────────────────
export function LiveEarnings({ snapshots, pendingFees, pendingRewards, nextHarvestAt, harvestThreshold, positionValue }: LiveEarningsProps) {
  const totalPerHour = useMemo(() => calcRate(snapshots), [snapshots])
  const totalPerSecond = totalPerHour / 3600

  const [displayTotal, setDisplayTotal] = useState(pendingFees + pendingRewards)
  const baseRef = useRef({ value: pendingFees + pendingRewards, time: Date.now() })
  useEffect(() => { baseRef.current = { value: pendingFees + pendingRewards, time: Date.now() } }, [pendingFees, pendingRewards])

  const [harvestSec, setHarvestSec] = useState<number | null>(null)
  useEffect(() => {
    if (!nextHarvestAt) return
    const u = () => { const ms = new Date(nextHarvestAt).getTime() - Date.now(); setHarvestSec(ms > 0 ? ms / 1000 : 0) }
    u(); const t = setInterval(u, 1000); return () => clearInterval(t)
  }, [nextHarvestAt])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const oresRef = useRef<Ore[]>([])
  const lastSpawnRef = useRef(0)
  const nextDelayRef = useRef(600)
  const fillRef = useRef(0)
  const splashRef = useRef<{ x: number; y: number; t: number }[]>([])

  useEffect(() => {
    const el = containerRef.current, cv = canvasRef.current
    if (!el || !cv) return
    const obs = new ResizeObserver(e => { for (const en of e) { cv.height = Math.floor(en.contentRect.height); cv.width = W } })
    obs.observe(el); return () => obs.disconnect()
  }, [])

  useEffect(() => {
    if (totalPerHour <= 0) return
    let run = true
    const loop = () => {
      if (!run) return
      const cv = canvasRef.current; if (!cv) { requestAnimationFrame(loop); return }
      const ctx = cv.getContext('2d'); if (!ctx) { requestAnimationFrame(loop); return }
      const h = cv.height, now = Date.now()

      const elapsed = (now - baseRef.current.time) / 1000
      const curTotal = baseRef.current.value + elapsed * totalPerSecond
      setDisplayTotal(curTotal)
      const ft = harvestThreshold > 0 ? harvestThreshold : 200
      fillRef.current += (Math.min(curTotal / ft, 1) - fillRef.current) * 0.02

      ctx.clearRect(0, 0, W, h)

      // ─── LAYOUT ────────────────────────────────────────────
      const pad = 6
      const innerW = W - pad * 2
      const crushH = h * 0.12
      const beltZoneTop = crushH + 4
      const beltZoneH = h * 0.38
      const meltZoneTop = beltZoneTop + beltZoneH
      const meltZoneH = h * 0.12
      const basinTop = meltZoneTop + meltZoneH
      const basinH = h - basinTop - 3

      // 3 belts: zigzag across width
      const belt1Y = beltZoneTop + beltZoneH * 0.1
      const belt2Y = beltZoneTop + beltZoneH * 0.42
      const belt3Y = beltZoneTop + beltZoneH * 0.74
      const beltW = innerW - 16
      // Belt 1: left→right, Belt 2: right→left, Belt 3: left→right
      const belt1X = pad + 8
      const belt2X = pad + 8
      const belt3X = pad + 8

      // ─── BACKGROUND ────────────────────────────────────────
      ctx.fillStyle = '#08080f'; ctx.fillRect(0, 0, W, h)
      // Back wall with depth
      ctx.fillStyle = '#0c0c16'; ctx.fillRect(pad, 0, innerW, h)
      // Stars
      for (let i = 0; i < 10; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.05 + (i % 3) * 0.03})`
        ctx.beginPath(); ctx.arc((i * 41 + 5) % innerW + pad, (i * 67 + 9) % h, 0.4, 0, Math.PI * 2); ctx.fill()
      }
      // Side walls (3D depth)
      const wallGrad = ctx.createLinearGradient(0, 0, pad, 0)
      wallGrad.addColorStop(0, '#1a1a2a'); wallGrad.addColorStop(1, '#0e0e18')
      ctx.fillStyle = wallGrad; ctx.fillRect(0, 0, pad, h)
      const wallGradR = ctx.createLinearGradient(W - pad, 0, W, 0)
      wallGradR.addColorStop(0, '#0e0e18'); wallGradR.addColorStop(1, '#1a1a2a')
      ctx.fillStyle = wallGradR; ctx.fillRect(W - pad, 0, pad, h)

      // ─── CRUSHER (top) ─────────────────────────────────────
      const cx = W / 2
      const jawPhase = Math.sin(now * 0.005)
      // Hopper 3D
      ctx.fillStyle = '#3a3a4a'
      ctx.beginPath(); ctx.moveTo(cx - 20, 2); ctx.lineTo(cx - 9, crushH); ctx.lineTo(cx + 9, crushH); ctx.lineTo(cx + 20, 2); ctx.closePath(); ctx.fill()
      // Hopper front face
      ctx.fillStyle = '#2a2a3a'
      ctx.beginPath(); ctx.moveTo(cx - 20, 2); ctx.lineTo(cx - 9, crushH); ctx.lineTo(cx - 9, crushH + 3); ctx.lineTo(cx - 22, 5); ctx.closePath(); ctx.fill()
      ctx.beginPath(); ctx.moveTo(cx + 20, 2); ctx.lineTo(cx + 9, crushH); ctx.lineTo(cx + 9, crushH + 3); ctx.lineTo(cx + 22, 5); ctx.closePath(); ctx.fill()
      // Inner dark
      ctx.fillStyle = '#111'
      ctx.beginPath(); ctx.moveTo(cx - 16, 4); ctx.lineTo(cx - 7, crushH - 1); ctx.lineTo(cx + 7, crushH - 1); ctx.lineTo(cx + 16, 4); ctx.closePath(); ctx.fill()
      // Jaws
      const jw = 2 + jawPhase * 1.5
      ctx.fillStyle = '#6a6a7a'; ctx.fillRect(cx - jw - 5, crushH - 3, 5, 3); ctx.fillRect(cx + jw, crushH - 3, 5, 3)
      if (jawPhase > 0.6) { ctx.fillStyle = 'rgba(255,170,0,0.4)'; ctx.beginPath(); ctx.arc(cx, crushH, 2, 0, Math.PI * 2); ctx.fill() }

      // ─── BELTS (3 horizontal, zigzag) ──────────────────────
      drawBelt(ctx, belt1X, belt1Y, beltW, 1, now)
      drawBelt(ctx, belt2X, belt2Y, beltW, -1, now)
      drawBelt(ctx, belt3X, belt3Y, beltW, 1, now)

      // ─── CRUSHER ROLLERS (between belt 1 → 2) ─────────────
      const crush1Y = (belt1Y + 10 + belt2Y) / 2
      const crushRollerR = 8
      const crushSpin = (now * 0.004) % (Math.PI * 2)
      // Machine housing
      ctx.fillStyle = '#2a2a3a'
      ctx.fillRect(pad + 6, crush1Y - 12, innerW - 12, 24)
      ctx.fillStyle = '#333344'
      ctx.fillRect(pad + 8, crush1Y - 10, innerW - 16, 20)
      // Two counter-rotating toothed rollers
      for (const side of [-1, 1]) {
        const ry = crush1Y + side * 5
        ctx.save(); ctx.translate(cx, ry); ctx.rotate(crushSpin * side)
        // Teeth
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2
          ctx.fillStyle = '#6a6a7a'
          ctx.fillRect(Math.cos(a) * crushRollerR - 2, Math.sin(a) * crushRollerR - 1.5, 4, 3)
        }
        // Hub
        ctx.beginPath(); ctx.arc(0, 0, crushRollerR - 2, 0, Math.PI * 2)
        ctx.fillStyle = '#4a4a5a'; ctx.fill()
        ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2)
        ctx.fillStyle = '#555566'; ctx.fill()
        ctx.restore()
      }
      // Crusher bolts
      for (const bx of [pad + 9, W - pad - 11]) {
        for (const by of [crush1Y - 9, crush1Y + 8]) {
          ctx.beginPath(); ctx.arc(bx, by, 1.5, 0, Math.PI * 2); ctx.fillStyle = '#1a1a2a'; ctx.fill()
        }
      }
      // Crusher sparks
      if (Math.sin(now * 0.008) > 0.3) {
        for (let i = 0; i < 2; i++) {
          const sx = cx + (Math.random() - 0.5) * 20
          const sy = crush1Y + (Math.random() - 0.5) * 6
          ctx.fillStyle = `rgba(255,170,0,${0.3 + Math.random() * 0.4})`
          ctx.beginPath(); ctx.arc(sx, sy, 1 + Math.random(), 0, Math.PI * 2); ctx.fill()
        }
      }
      // Crusher LED
      ctx.fillStyle = '#00ff88'; ctx.globalAlpha = 0.3 + Math.sin(now * 0.003) * 0.3
      ctx.beginPath(); ctx.arc(pad + 10, crush1Y - 10, 1.5, 0, Math.PI * 2); ctx.fill()
      ctx.globalAlpha = 1

      // ─── LASER SMELTER (between belt 2 → 3) ───────────────
      const laser1Y = (belt2Y + 10 + belt3Y) / 2
      // Machine box
      ctx.fillStyle = '#2a2a3a'
      ctx.fillRect(pad + 6, laser1Y - 8, innerW - 12, 16)
      ctx.fillStyle = '#333344'
      ctx.fillRect(pad + 8, laser1Y - 6, innerW - 16, 12)
      // Laser beam — horizontal, pulsing
      const laserAlpha = 0.6 + Math.sin(now * 0.006) * 0.3
      ctx.globalAlpha = laserAlpha
      // Glow
      ctx.fillStyle = 'rgba(0,255,136,0.08)'
      ctx.fillRect(pad + 14, laser1Y - 4, innerW - 28, 8)
      // Beam
      ctx.strokeStyle = '#00ff88'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(pad + 14, laser1Y); ctx.lineTo(W - pad - 14, laser1Y); ctx.stroke()
      // Bright core
      ctx.strokeStyle = '#aaffcc'; ctx.lineWidth = 0.8
      ctx.beginPath(); ctx.moveTo(pad + 14, laser1Y); ctx.lineTo(W - pad - 14, laser1Y); ctx.stroke()
      ctx.globalAlpha = 1
      // Emitter boxes (left + right)
      ctx.fillStyle = '#444455'
      ctx.fillRect(pad + 8, laser1Y - 4, 6, 8); ctx.fillRect(W - pad - 14, laser1Y - 4, 6, 8)
      // Emitter LEDs
      ctx.fillStyle = '#00ff88'; ctx.globalAlpha = 0.5 + Math.sin(now * 0.005) * 0.3
      ctx.beginPath(); ctx.arc(pad + 11, laser1Y, 1.5, 0, Math.PI * 2); ctx.fill()
      ctx.beginPath(); ctx.arc(W - pad - 11, laser1Y, 1.5, 0, Math.PI * 2); ctx.fill()
      ctx.globalAlpha = 1
      // Smelter bolts
      for (const bx of [pad + 9, W - pad - 11]) {
        ctx.beginPath(); ctx.arc(bx, laser1Y - 6, 1.2, 0, Math.PI * 2); ctx.fillStyle = '#1a1a2a'; ctx.fill()
        ctx.beginPath(); ctx.arc(bx, laser1Y + 5, 1.2, 0, Math.PI * 2); ctx.fill()
      }

      // ─── SIDE MACHINERY (pipes, gears, details) ────────────
      const gearSpin = (now * 0.003) % (Math.PI * 2)
      // Left side gears (3 sizes)
      for (const [gy, gr, spd] of [[belt1Y + 6, 5, 1], [crush1Y + 2, 4, -1.5], [laser1Y + 6, 3, 2]] as [number, number, number][]) {
        ctx.save(); ctx.translate(pad + 3, gy); ctx.rotate(gearSpin * spd)
        for (let i = 0; i < (gr > 4 ? 6 : 4); i++) {
          const a = (i / (gr > 4 ? 6 : 4)) * Math.PI * 2
          ctx.fillStyle = '#555566'; ctx.fillRect(Math.cos(a) * gr - 1, Math.sin(a) * gr - 1, 2, 2)
        }
        ctx.beginPath(); ctx.arc(0, 0, gr * 0.4, 0, Math.PI * 2); ctx.fillStyle = '#3a3a4a'; ctx.fill()
        ctx.restore()
      }
      // Right side gears
      for (const [gy, gr, spd] of [[belt2Y + 6, 4, -1], [laser1Y - 4, 5, 1.5], [belt3Y + 6, 3, -2]] as [number, number, number][]) {
        ctx.save(); ctx.translate(W - pad - 3, gy); ctx.rotate(gearSpin * spd)
        for (let i = 0; i < (gr > 4 ? 6 : 4); i++) {
          const a = (i / (gr > 4 ? 6 : 4)) * Math.PI * 2
          ctx.fillStyle = '#555566'; ctx.fillRect(Math.cos(a) * gr - 1, Math.sin(a) * gr - 1, 2, 2)
        }
        ctx.beginPath(); ctx.arc(0, 0, gr * 0.4, 0, Math.PI * 2); ctx.fillStyle = '#3a3a4a'; ctx.fill()
        ctx.restore()
      }
      // Connecting pipes (vertical, left side)
      ctx.strokeStyle = 'rgba(199,125,255,0.08)'; ctx.lineWidth = 2
      ctx.beginPath(); ctx.moveTo(pad + 3, belt1Y + 12); ctx.lineTo(pad + 3, belt3Y + 10); ctx.stroke()
      // Right pipe
      ctx.beginPath(); ctx.moveTo(W - pad - 3, belt1Y + 12); ctx.lineTo(W - pad - 3, belt3Y + 10); ctx.stroke()
      // Pipe glow
      ctx.strokeStyle = 'rgba(199,125,255,0.03)'; ctx.lineWidth = 5
      ctx.beginPath(); ctx.moveTo(pad + 3, belt1Y + 12); ctx.lineTo(pad + 3, belt3Y + 10); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(W - pad - 3, belt1Y + 12); ctx.lineTo(W - pad - 3, belt3Y + 10); ctx.stroke()

      // ─── STEAM VENTS (periodic puffs) ──────────────────────
      const steamPhase = (now * 0.001) % 5
      if (steamPhase < 0.8) {
        const steamAlpha = (0.8 - steamPhase) * 0.08
        for (let i = 0; i < 3; i++) {
          const sy = crush1Y - 14 - steamPhase * 15 - i * 5
          const sx = pad + 20 + i * 3
          ctx.fillStyle = `rgba(200,200,220,${steamAlpha * (1 - i * 0.3)})`
          ctx.beginPath(); ctx.arc(sx, sy, 3 + steamPhase * 2, 0, Math.PI * 2); ctx.fill()
        }
      }
      const steamPhase2 = ((now * 0.001) + 2.5) % 5
      if (steamPhase2 < 0.8) {
        const sa = (0.8 - steamPhase2) * 0.08
        for (let i = 0; i < 3; i++) {
          const sy = laser1Y - 10 - steamPhase2 * 15 - i * 5
          const sx = W - pad - 20 - i * 3
          ctx.fillStyle = `rgba(200,200,220,${sa * (1 - i * 0.3)})`
          ctx.beginPath(); ctx.arc(sx, sy, 3 + steamPhase2 * 2, 0, Math.PI * 2); ctx.fill()
        }
      }

      // ─── BELT SUPPORT STRUTS ───────────────────────────────
      ctx.fillStyle = '#2a2a3a'
      for (const by of [belt1Y + 10, belt2Y + 10, belt3Y + 10]) {
        ctx.fillRect(pad + 12, by, 2, 4); ctx.fillRect(W - pad - 14, by, 2, 4)
      }

      // ─── BACKGROUND GRID (factory wall) ────────────────────
      ctx.strokeStyle = 'rgba(199,125,255,0.015)'; ctx.lineWidth = 0.5
      for (let gy = 0; gy < h; gy += 20) { ctx.beginPath(); ctx.moveTo(pad, gy); ctx.lineTo(W - pad, gy); ctx.stroke() }
      for (let gx = pad; gx < W - pad; gx += 20) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke() }

      // ─── RANDOM AMBIENT SPARKS ─────────────────────────────
      if (Math.random() < 0.03) {
        const rx = pad + 10 + Math.random() * (innerW - 20)
        const ry = beltZoneTop + Math.random() * beltZoneH
        ctx.fillStyle = 'rgba(255,200,0,0.3)'
        ctx.beginPath(); ctx.arc(rx, ry, 1 + Math.random(), 0, Math.PI * 2); ctx.fill()
      }

      // ─── COLLECT FUNNEL (between belt 3 and basin) ─────────
      ctx.fillStyle = '#3a3a4a'
      ctx.beginPath()
      ctx.moveTo(cx - 25, belt3Y + 12); ctx.lineTo(cx - 8, meltZoneTop + meltZoneH - 2)
      ctx.lineTo(cx + 8, meltZoneTop + meltZoneH - 2); ctx.lineTo(cx + 25, belt3Y + 12)
      ctx.closePath(); ctx.fill()
      // Funnel inner
      ctx.fillStyle = '#1a1a2a'
      ctx.beginPath()
      ctx.moveTo(cx - 21, belt3Y + 14); ctx.lineTo(cx - 6, meltZoneTop + meltZoneH - 3)
      ctx.lineTo(cx + 6, meltZoneTop + meltZoneH - 3); ctx.lineTo(cx + 21, belt3Y + 14)
      ctx.closePath(); ctx.fill()

      // ─── MELT ZONE heat haze ───────────────────────────────
      const meltPulse = 0.4 + Math.sin(now * 0.003) * 0.2
      ctx.fillStyle = `rgba(0,255,136,${0.02 * meltPulse})`
      ctx.fillRect(pad, meltZoneTop, innerW, meltZoneH)

      // ─── BASIN (3D aquarium style) ─────────────────────────
      const fillH = basinH * fillRef.current
      const surfY = h - 3 - fillH

      // Back wall
      ctx.fillStyle = '#0a0a14'; ctx.fillRect(pad + 2, basinTop, innerW - 4, basinH)
      // Liquid
      if (fillH > 2) {
        const lG = ctx.createLinearGradient(0, surfY, 0, h)
        lG.addColorStop(0, 'rgba(0,255,136,0.25)'); lG.addColorStop(1, 'rgba(0,255,136,0.4)')
        ctx.fillStyle = lG; ctx.fillRect(pad + 3, surfY, innerW - 6, fillH + 2)
        // Wave
        ctx.beginPath(); ctx.moveTo(pad + 3, surfY)
        for (let x = pad + 3; x < W - pad - 3; x += 2) ctx.lineTo(x, surfY + Math.sin(x * 0.07 + now * 0.002) * 1.5)
        ctx.lineTo(W - pad - 3, surfY); ctx.strokeStyle = 'rgba(0,255,136,0.5)'; ctx.lineWidth = 1; ctx.stroke()
        // Surface reflection
        ctx.fillStyle = 'rgba(255,255,255,0.04)'
        ctx.fillRect(pad + 10, surfY + 2, 20, 2)
        // Glow up
        const gG = ctx.createLinearGradient(0, surfY - 10, 0, surfY)
        gG.addColorStop(0, 'transparent'); gG.addColorStop(1, 'rgba(0,255,136,0.05)')
        ctx.fillStyle = gG; ctx.fillRect(pad + 3, surfY - 10, innerW - 6, 10)
      }
      // Front glass (semi-transparent)
      ctx.fillStyle = 'rgba(199,125,255,0.03)'; ctx.fillRect(pad + 2, basinTop, innerW - 4, basinH)
      // Tank frame
      ctx.strokeStyle = '#2a2a3a'; ctx.lineWidth = 1.5
      ctx.strokeRect(pad + 1.5, basinTop - 0.5, innerW - 3, basinH + 1)
      // Tank rim (3D top edge)
      ctx.fillStyle = '#444455'; ctx.fillRect(pad, basinTop - 2, innerW, 3)
      ctx.fillStyle = '#333344'; ctx.fillRect(pad, basinTop, innerW, 1)

      // ─── SPLASH EFFECTS ────────────────────────────────────
      const aliveSplash: typeof splashRef.current = []
      for (const s of splashRef.current) {
        const age = (now - s.t) / 1000; if (age > 0.5) continue
        aliveSplash.push(s)
        const alpha = 1 - age * 2
        for (let i = 0; i < 3; i++) {
          const sx = s.x + (Math.random() - 0.5) * 8 * age * 4
          const sy = s.y - age * 12 * (1 + i * 0.5)
          ctx.beginPath(); ctx.arc(sx, sy, 1.5 * (1 - age), 0, Math.PI * 2)
          ctx.fillStyle = `rgba(0,255,136,${alpha * 0.5})`; ctx.fill()
        }
      }
      splashRef.current = aliveSplash

      // ─── PARTICLES ─────────────────────────────────────────
      if (now - lastSpawnRef.current > nextDelayRef.current || oresRef.current.length === 0) {
        if (oresRef.current.length < 15) {
          const size = 3 + Math.random() * 7
          oresRef.current.push({
            x: cx + (Math.random() - 0.5) * 8, y: crushH + 2,
            vx: 0, vy: 0.5 + Math.random() * 0.4,
            size, rot: Math.random() * Math.PI * 2, rotV: (Math.random() - 0.5) * 0.04,
            phase: 'fall', shape: mkShape(size), progress: 0,
          })
          lastSpawnRef.current = now; nextDelayRef.current = 800 + Math.random() * 1400
        }
      }

      const alive: Ore[] = []
      for (const o of oresRef.current) {
        o.rot += o.rotV

        if (o.phase === 'fall') {
          o.y += o.vy; o.vy += 0.02
          if (o.y >= belt1Y - 2) { o.phase = 'b1'; o.vy = 0; o.vx = 0.5; o.y = belt1Y - o.size * 0.4 }
        } else if (o.phase === 'b1') {
          o.x += o.vx; o.progress = Math.min(1, o.progress + 0.001)
          if (o.x >= belt1X + beltW - 8) { o.phase = 'f1'; o.vx = 0; o.vy = 0.5 }
        } else if (o.phase === 'f1') {
          o.y += o.vy; o.vy += 0.02; o.progress = Math.min(1, o.progress + 0.003)
          if (o.y >= belt2Y - 2) { o.phase = 'b2'; o.vy = 0; o.vx = -0.5; o.y = belt2Y - o.size * 0.4 }
        } else if (o.phase === 'b2') {
          o.x += o.vx; o.progress = Math.min(1, o.progress + 0.002)
          if (o.x <= belt2X + 8) { o.phase = 'f2'; o.vx = 0; o.vy = 0.5 }
        } else if (o.phase === 'f2') {
          o.y += o.vy; o.vy += 0.02; o.progress = Math.min(1, o.progress + 0.004)
          if (o.y >= belt3Y - 2) { o.phase = 'b3'; o.vy = 0; o.vx = 0.5; o.y = belt3Y - o.size * 0.4 }
        } else if (o.phase === 'b3') {
          o.x += o.vx; o.progress = Math.min(1, o.progress + 0.003)
          if (o.x >= belt3X + beltW - 8) { o.phase = 'melt'; o.vx = 0; o.vy = 0.3; o.progress = 0.8 }
        } else if (o.phase === 'melt') {
          o.y += o.vy; o.progress = Math.min(1, o.progress + 0.01); o.size *= 0.995
          if (o.progress >= 1 && o.y >= meltZoneTop + meltZoneH * 0.3) {
            o.phase = 'drop'; o.size = 2 + Math.random() * 2; o.vy = 0.4
          }
        } else if (o.phase === 'drop') {
          o.y += o.vy; o.vy += 0.02
          if (o.y >= surfY && fillH > 1) {
            splashRef.current.push({ x: o.x, y: surfY, t: now })
            o.phase = 'drop'; o.size *= 0.7
          }
          if (o.size < 0.3 || o.y > h) continue
        }

        // Clamp x
        o.x = Math.max(pad + 4, Math.min(W - pad - 4, o.x))

        // Draw
        if (o.phase === 'drop') {
          drawDrop(ctx, o.x, o.y, o.size)
        } else {
          drawRock(ctx, o.x, o.y, o.size, o.rot, o.shape, o.progress)
        }

        alive.push(o)
      }
      oresRef.current = alive

      // Frame
      ctx.strokeStyle = 'rgba(199,125,255,0.08)'; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, W - 1, h - 1)
      requestAnimationFrame(loop)
    }
    loop(); return () => { run = false }
  }, [totalPerHour, totalPerSecond, harvestThreshold])

  if (totalPerHour <= 0) return null

  return (
    <div className="flex flex-col items-center justify-between relative" style={{ width: W, minHeight: '100%' }}>
      <div className="text-center z-10 flex-shrink-0 w-full py-1">
        <div className="mono text-xs font-bold neon-value" style={{ color: 'var(--lavender)' }}>${displayTotal.toFixed(4)}</div>
        <div className="hud-label" style={{ fontSize: '7px', color: 'var(--lavender)', opacity: 0.6 }}>TOTAL EARNED</div>
      </div>
      <OreDensityMeter positionValue={positionValue} pendingTotal={pendingFees + pendingRewards} initialRate={totalPerHour} />
      <div ref={containerRef} className="relative flex-1 w-full" style={{ minHeight: 280 }}>
        <canvas ref={canvasRef} width={W} height={400} className="absolute inset-0" style={{ width: '100%', height: '100%' }} />
      </div>
      <div className="text-center z-10 flex-shrink-0 py-1 space-y-0.5">
        {harvestThreshold > 0 && (
          <div className="mono font-bold" style={{ fontSize: '10px', color: '#00ff88', textShadow: '0 0 6px rgba(0,255,136,0.4)' }}>
            ${displayTotal.toFixed(2)} / ${harvestThreshold.toFixed(2)}
          </div>
        )}
        <div className="hud-label" style={{ fontSize: '7px', color: '#00ff88' }}>REFINING RATE</div>
        <div className="mono text-xs font-bold" style={{ color: '#00ff88', textShadow: '0 0 6px rgba(0,255,136,0.4)' }}>
          ${(totalPerHour * 24).toFixed(2)}/d
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
