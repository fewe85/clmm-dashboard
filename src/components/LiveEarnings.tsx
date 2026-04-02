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
interface P {
  x: number; y: number; vx: number; vy: number; size: number; rot: number
  phase: 'rock' | 'frag' | 'bubble' | 'drop'
  shape: number[][]; progress: number; life: number
}

function mkShape(s: number): number[][] {
  const n = 5 + Math.floor(Math.random() * 3)
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2, r = s * (0.4 + Math.random() * 0.6)
    return [Math.cos(a) * r, Math.sin(a) * r]
  })
}

export function LiveEarnings({ snapshots, pendingFees, pendingRewards, nextHarvestAt, harvestThreshold, positionValue }: LiveEarningsProps) {
  const totalPerHour = useMemo(() => calcRate(snapshots), [snapshots])
  const totalPerSec = totalPerHour / 3600

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
  const partsRef = useRef<P[]>([])
  const lastSpawnRef = useRef(0)
  const nextDelayRef = useRef(800)
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
      const h = cv.height, now = Date.now(), cx = W / 2

      const elapsed = (now - baseRef.current.time) / 1000
      const curTotal = baseRef.current.value + elapsed * totalPerSec
      setDisplayTotal(curTotal)
      const ft = harvestThreshold > 0 ? harvestThreshold : 200
      fillRef.current += (Math.min(curTotal / ft, 1) - fillRef.current) * 0.02

      ctx.clearRect(0, 0, W, h)

      // ─── LAYOUT ──────────────────────────────────────────
      const laserY1 = h * 0.12
      const laserY2 = h * 0.22
      const laserZoneEnd = h * 0.30
      const flaskTop = h * 0.32
      const flaskBottom = h * 0.62
      const flaskNeckY = flaskTop + (flaskBottom - flaskTop) * 0.15
      const flaskBulbCY = flaskTop + (flaskBottom - flaskTop) * 0.6
      const flaskBulbR = 22
      const flaskOutY = flaskBottom + 8
      const basinTop = h * 0.70
      const basinH = h - basinTop - 3

      // ─── BACKGROUND ──────────────────────────────────────
      ctx.fillStyle = '#06060e'; ctx.fillRect(0, 0, W, h)
      // Subtle grid
      ctx.strokeStyle = 'rgba(199,125,255,0.012)'; ctx.lineWidth = 0.5
      for (let gy = 0; gy < h; gy += 16) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke() }
      for (let gx = 0; gx < W; gx += 16) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, h); ctx.stroke() }

      // ─── LASER CHAMBER ───────────────────────────────────
      // Chamber frame (glass box outline)
      ctx.strokeStyle = 'rgba(199,125,255,0.1)'; ctx.lineWidth = 0.8
      ctx.strokeRect(12, laserY1 - 8, W - 24, laserZoneEnd - laserY1 + 16)
      // Corner brackets
      for (const [bx, by] of [[12, laserY1 - 8], [W - 18, laserY1 - 8], [12, laserZoneEnd + 4], [W - 18, laserZoneEnd + 4]]) {
        ctx.fillStyle = '#3a3a4a'; ctx.fillRect(bx, by, 6, 2); ctx.fillRect(bx, by, 2, 6)
      }

      // Laser beam 1 — red
      const lPulse1 = 0.7 + Math.sin(now * 0.005) * 0.3
      ctx.globalAlpha = lPulse1
      // Glow
      ctx.fillStyle = 'rgba(255,51,102,0.06)'
      ctx.fillRect(16, laserY1 - 3, W - 32, 6)
      // Beam
      ctx.strokeStyle = '#ff3366'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(16, laserY1); ctx.lineTo(W - 16, laserY1); ctx.stroke()
      ctx.strokeStyle = '#ff8899'; ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(16, laserY1); ctx.lineTo(W - 16, laserY1); ctx.stroke()
      ctx.globalAlpha = 1
      // Emitters
      for (const ex of [14, W - 16]) {
        ctx.fillStyle = '#ff3366'; ctx.beginPath(); ctx.arc(ex, laserY1, 2.5, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = 'rgba(255,51,102,0.15)'; ctx.beginPath(); ctx.arc(ex, laserY1, 5, 0, Math.PI * 2); ctx.fill()
      }

      // Laser beam 2 — green
      const lPulse2 = 0.7 + Math.sin(now * 0.006 + 1) * 0.3
      ctx.globalAlpha = lPulse2
      ctx.fillStyle = 'rgba(0,255,136,0.05)'
      ctx.fillRect(16, laserY2 - 3, W - 32, 6)
      ctx.strokeStyle = '#00ff88'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(16, laserY2); ctx.lineTo(W - 16, laserY2); ctx.stroke()
      ctx.strokeStyle = '#88ffcc'; ctx.lineWidth = 0.5
      ctx.beginPath(); ctx.moveTo(16, laserY2); ctx.lineTo(W - 16, laserY2); ctx.stroke()
      ctx.globalAlpha = 1
      for (const ex of [14, W - 16]) {
        ctx.fillStyle = '#00ff88'; ctx.beginPath(); ctx.arc(ex, laserY2, 2.5, 0, Math.PI * 2); ctx.fill()
        ctx.fillStyle = 'rgba(0,255,136,0.12)'; ctx.beginPath(); ctx.arc(ex, laserY2, 5, 0, Math.PI * 2); ctx.fill()
      }

      // ─── FLASK / KOLBEN (Erlenmeyer silhouette) ──────────
      // Neck (narrow top)
      ctx.strokeStyle = 'rgba(150,170,200,0.2)'; ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(cx - 6, flaskTop); ctx.lineTo(cx - 6, flaskNeckY)
      // Bulb (widens out)
      ctx.quadraticCurveTo(cx - flaskBulbR - 2, flaskBulbCY - 10, cx - flaskBulbR, flaskBulbCY)
      ctx.quadraticCurveTo(cx - flaskBulbR, flaskBottom + 2, cx, flaskBottom + 2)
      ctx.quadraticCurveTo(cx + flaskBulbR, flaskBottom + 2, cx + flaskBulbR, flaskBulbCY)
      ctx.quadraticCurveTo(cx + flaskBulbR + 2, flaskBulbCY - 10, cx + 6, flaskNeckY)
      ctx.lineTo(cx + 6, flaskTop)
      ctx.stroke()
      // Glass reflection (highlight line on left)
      ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(cx - 5, flaskTop + 4); ctx.lineTo(cx - 5, flaskNeckY)
      ctx.quadraticCurveTo(cx - flaskBulbR + 2, flaskBulbCY - 8, cx - flaskBulbR + 3, flaskBulbCY)
      ctx.stroke()
      // Liquid inside flask (partial fill, green)
      const flaskFillH = (flaskBottom - flaskBulbCY + flaskBulbR * 0.6) * Math.min(1, fillRef.current * 3)
      if (flaskFillH > 2) {
        const flaskLiqY = flaskBottom + 1 - flaskFillH
        ctx.fillStyle = 'rgba(0,255,136,0.15)'
        ctx.beginPath()
        ctx.moveTo(cx - flaskBulbR + 3, Math.max(flaskLiqY, flaskBulbCY - flaskBulbR * 0.3))
        ctx.quadraticCurveTo(cx - flaskBulbR + 1, flaskBottom, cx, flaskBottom + 1)
        ctx.quadraticCurveTo(cx + flaskBulbR - 1, flaskBottom, cx + flaskBulbR - 3, Math.max(flaskLiqY, flaskBulbCY - flaskBulbR * 0.3))
        ctx.closePath(); ctx.fill()
        // Surface glow
        ctx.strokeStyle = 'rgba(0,255,136,0.3)'; ctx.lineWidth = 0.8
        ctx.beginPath()
        const slY = Math.max(flaskLiqY, flaskBulbCY - flaskBulbR * 0.3)
        ctx.moveTo(cx - flaskBulbR + 4, slY)
        for (let x = cx - flaskBulbR + 4; x < cx + flaskBulbR - 4; x += 3) {
          ctx.lineTo(x, slY + Math.sin(x * 0.1 + now * 0.003) * 1)
        }
        ctx.stroke()
      }
      // Glow inside flask
      ctx.beginPath(); ctx.arc(cx, flaskBulbCY, flaskBulbR * 0.6, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(0,255,136,${0.02 + Math.sin(now * 0.003) * 0.01})`; ctx.fill()

      // Heater under flask (orange flame)
      const flamePhase = now * 0.01
      for (let i = 0; i < 3; i++) {
        const fx = cx - 4 + i * 4
        const fh = 4 + Math.sin(flamePhase + i * 2) * 2
        const fa = 0.3 + Math.sin(flamePhase + i) * 0.15
        ctx.fillStyle = `rgba(255,140,0,${fa})`
        ctx.beginPath(); ctx.moveTo(fx - 2, flaskBottom + 4); ctx.lineTo(fx, flaskBottom + 4 - fh); ctx.lineTo(fx + 2, flaskBottom + 4); ctx.fill()
        ctx.fillStyle = `rgba(255,220,100,${fa * 0.5})`
        ctx.beginPath(); ctx.moveTo(fx - 1, flaskBottom + 4); ctx.lineTo(fx, flaskBottom + 4 - fh * 0.6); ctx.lineTo(fx + 1, flaskBottom + 4); ctx.fill()
      }
      // Heater base
      ctx.fillStyle = '#3a3a4a'; ctx.fillRect(cx - 10, flaskBottom + 4, 20, 3)

      // Flask outlet — small pipe down
      ctx.fillStyle = '#3a3a4a'; ctx.fillRect(cx - 2, flaskBottom + 6, 4, flaskOutY - flaskBottom - 5)
      ctx.fillStyle = 'rgba(0,255,136,0.1)'; ctx.fillRect(cx - 1, flaskBottom + 7, 2, flaskOutY - flaskBottom - 7)

      // ─── BASIN ───────────────────────────────────────────
      const fillH = basinH * fillRef.current
      const surfY = h - 3 - fillH
      // Back
      ctx.fillStyle = '#0a0a14'; ctx.fillRect(10, basinTop, W - 20, basinH)
      // Liquid
      if (fillH > 2) {
        const lG = ctx.createLinearGradient(0, surfY, 0, h)
        lG.addColorStop(0, 'rgba(0,255,136,0.28)'); lG.addColorStop(1, 'rgba(0,255,136,0.4)')
        ctx.fillStyle = lG; ctx.fillRect(11, surfY, W - 22, fillH + 2)
        // Wave
        ctx.beginPath(); ctx.moveTo(11, surfY)
        for (let x = 11; x < W - 11; x += 2) ctx.lineTo(x, surfY + Math.sin(x * 0.08 + now * 0.002) * 1.2)
        ctx.lineTo(W - 11, surfY); ctx.strokeStyle = 'rgba(0,255,136,0.5)'; ctx.lineWidth = 1; ctx.stroke()
        // Reflection
        ctx.fillStyle = 'rgba(255,255,255,0.03)'; ctx.fillRect(14, surfY + 2, 18, 2)
        // Glow up
        const gG = ctx.createLinearGradient(0, surfY - 8, 0, surfY)
        gG.addColorStop(0, 'transparent'); gG.addColorStop(1, 'rgba(0,255,136,0.04)')
        ctx.fillStyle = gG; ctx.fillRect(11, surfY - 8, W - 22, 8)
      }
      // Tank frame
      ctx.strokeStyle = '#2a2a3a'; ctx.lineWidth = 1.5; ctx.strokeRect(9.5, basinTop - 0.5, W - 19, basinH + 1)
      ctx.fillStyle = '#444455'; ctx.fillRect(8, basinTop - 2, W - 16, 3)

      // ─── SPLASHES ────────────────────────────────────────
      const aliveSplash: typeof splashRef.current = []
      for (const s of splashRef.current) {
        const age = (now - s.t) / 1000; if (age > 0.4) continue
        aliveSplash.push(s)
        for (let i = 0; i < 3; i++) {
          const sx = s.x + (Math.random() - 0.5) * 10 * age * 3
          const sy = s.y - age * 10 * (1 + i * 0.4)
          ctx.beginPath(); ctx.arc(sx, sy, 1.2 * (1 - age * 2), 0, Math.PI * 2)
          ctx.fillStyle = `rgba(0,255,136,${(1 - age * 2.5) * 0.5})`; ctx.fill()
        }
      }
      splashRef.current = aliveSplash

      // ─── PARTICLES ───────────────────────────────────────
      // Spawn rocks
      if (now - lastSpawnRef.current > nextDelayRef.current || partsRef.current.filter(p => p.phase === 'rock').length === 0) {
        if (partsRef.current.length < 20) {
          const size = 5 + Math.random() * 7
          partsRef.current.push({
            x: cx + (Math.random() - 0.5) * 30, y: -size,
            vx: (Math.random() - 0.5) * 0.2, vy: 0.4 + Math.random() * 0.3,
            size, rot: Math.random() * Math.PI * 2,
            phase: 'rock', shape: mkShape(size), progress: 0, life: 1,
          })
          lastSpawnRef.current = now; nextDelayRef.current = 2000 + Math.random() * 2000
        }
      }
      // Spawn bubbles in flask
      if (Math.random() < 0.02) {
        partsRef.current.push({
          x: cx + (Math.random() - 0.5) * (flaskBulbR * 1.2),
          y: flaskBottom - 2, vx: (Math.random() - 0.5) * 0.2, vy: -0.3 - Math.random() * 0.3,
          size: 1.5 + Math.random() * 2, rot: 0, phase: 'bubble',
          shape: [], progress: 0, life: 1,
        })
      }

      const alive: P[] = []
      for (const p of partsRef.current) {
        if (p.phase === 'rock') {
          p.y += p.vy; p.vy += 0.01; p.x += p.vx; p.rot += 0.02
          // Hit laser 1?
          if (Math.abs(p.y - laserY1) < p.size && p.y > laserY1 - 4) {
            // Flash
            ctx.fillStyle = 'rgba(255,255,255,0.4)'; ctx.beginPath(); ctx.arc(p.x, p.y, p.size + 4, 0, Math.PI * 2); ctx.fill()
            // Spawn fragments
            for (let i = 0; i < 5; i++) {
              partsRef.current.push({
                x: p.x + (Math.random() - 0.5) * p.size,
                y: p.y + Math.random() * 4,
                vx: (Math.random() - 0.5) * 1.2, vy: 0.3 + Math.random() * 0.5,
                size: 2 + Math.random() * 3, rot: Math.random() * Math.PI * 2,
                phase: 'frag', shape: mkShape(3), progress: 0.2, life: 1,
              })
            }
            continue // rock destroyed
          }
          // Draw rock
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot)
          // Shadow
          ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.beginPath()
          ctx.moveTo(p.shape[0][0] + 1.5, p.shape[0][1] + 1.5)
          for (let i = 1; i < p.shape.length; i++) ctx.lineTo(p.shape[i][0] + 1.5, p.shape[i][1] + 1.5)
          ctx.closePath(); ctx.fill()
          // Body
          ctx.fillStyle = '#b44dff'; ctx.beginPath()
          ctx.moveTo(p.shape[0][0], p.shape[0][1])
          for (let i = 1; i < p.shape.length; i++) ctx.lineTo(p.shape[i][0], p.shape[i][1])
          ctx.closePath(); ctx.fill()
          // Highlight
          ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath()
          ctx.arc(-p.size * 0.2, -p.size * 0.2, p.size * 0.3, 0, Math.PI * 2); ctx.fill()
          ctx.restore()
        } else if (p.phase === 'frag') {
          p.y += p.vy; p.vy += 0.012; p.x += p.vx; p.vx *= 0.99; p.rot += 0.03
          p.progress = Math.min(1, p.progress + 0.005)
          // Hit laser 2 → accelerate color change
          if (Math.abs(p.y - laserY2) < 4) p.progress = Math.min(1, p.progress + 0.15)
          // Enter flask neck → become part of flask liquid
          if (p.y > flaskTop && Math.abs(p.x - cx) < 8) {
            p.vx *= 0.5 // funnel toward center
            p.x += (cx - p.x) * 0.05
          }
          // Below flask → become drop
          if (p.y > flaskBottom - 5 && p.progress > 0.7) {
            p.phase = 'drop'; p.size = 2 + Math.random() * 1.5; p.vy = 0.5
            p.x = cx; p.y = flaskOutY
            continue
          }
          if (p.y > flaskBottom + 20) continue // cleanup

          // Draw fragment
          const t = p.progress
          const r = Math.floor(180 * (1 - t))
          const g = Math.floor(77 * (1 - t) + 255 * t)
          const b = Math.floor(255 * (1 - t) + 136 * t)
          const sz = p.size * (1 - t * 0.3)
          ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot)
          ctx.fillStyle = `rgb(${r},${g},${b})`; ctx.beginPath()
          ctx.moveTo(p.shape[0][0] * sz / 3, p.shape[0][1] * sz / 3)
          for (let i = 1; i < p.shape.length; i++) ctx.lineTo(p.shape[i][0] * sz / 3, p.shape[i][1] * sz / 3)
          ctx.closePath(); ctx.fill()
          if (t > 0.4) {
            ctx.beginPath(); ctx.arc(0, 0, sz + 2, 0, Math.PI * 2)
            ctx.fillStyle = `rgba(0,255,136,${(t - 0.4) * 0.1})`; ctx.fill()
          }
          ctx.restore()
        } else if (p.phase === 'bubble') {
          p.y += p.vy; p.x += Math.sin(now * 0.005 + p.x) * 0.15
          p.life -= 0.008
          if (p.life <= 0 || p.y < flaskNeckY) continue
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          ctx.strokeStyle = `rgba(0,255,136,${p.life * 0.3})`; ctx.lineWidth = 0.6; ctx.stroke()
          ctx.fillStyle = `rgba(0,255,136,${p.life * 0.05})`; ctx.fill()
        } else if (p.phase === 'drop') {
          p.y += p.vy; p.vy += 0.02
          if (p.y >= surfY && fillH > 0) {
            splashRef.current.push({ x: p.x, y: surfY, t: now })
            p.size *= 0.5
          }
          if (p.size < 0.3 || p.y > h) continue
          // Draw drop
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(0,255,136,0.8)'; ctx.fill()
          ctx.beginPath(); ctx.arc(p.x - p.size * 0.3, p.y - p.size * 0.3, p.size * 0.3, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fill()
          ctx.beginPath(); ctx.arc(p.x, p.y, p.size + 2, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(0,255,136,0.06)'; ctx.fill()
        }
        alive.push(p)
      }
      partsRef.current = alive

      // Frame
      ctx.strokeStyle = 'rgba(199,125,255,0.06)'; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, W - 1, h - 1)
      requestAnimationFrame(loop)
    }
    loop(); return () => { run = false }
  }, [totalPerHour, totalPerSec, harvestThreshold])

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
