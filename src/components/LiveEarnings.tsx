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
  const hrs = (new Date(n.t).getTime() - new Date(o.t).getTime()) / 3_600_000
  return hrs < 1 ? 0 : Math.max(0, ((n.feesUsd - o.feesUsd) + (n.rewardsUsd - o.rewardsUsd)) / hrs)
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
          {tier} {apr > 0 ? (apr >= 1000 ? `${(apr / 1000).toFixed(1)}k` : `${apr.toFixed(0)}`) + '%' : '—'}
        </span>
      </div>
    </div>
  )
}

// ─── Particle ─────────────────────────────────────────────────────────────
interface P {
  x: number; y: number; vx: number; vy: number; size: number; rot: number
  type: 'stone' | 'frag' | 'bubble' | 'drop'
  shape: number[][]; t: number; life: number
}
function mkShape(s: number): number[][] {
  const n = 5 + Math.floor(Math.random() * 3)
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2, r = s * (0.4 + Math.random() * 0.6)
    return [Math.cos(a) * r, Math.sin(a) * r]
  })
}

// ─── Neon line helper ─────────────────────────────────────────────────────
function neonStroke(c: CanvasRenderingContext2D, color: string, glowColor: string, width: number) {
  // Glow pass
  c.strokeStyle = glowColor; c.lineWidth = width + 4; c.stroke()
  // Core pass
  c.strokeStyle = color; c.lineWidth = width; c.stroke()
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
    const u = () => setHarvestSec(Math.max(0, (new Date(nextHarvestAt).getTime() - Date.now()) / 1000))
    u(); const iv = setInterval(u, 1000); return () => clearInterval(iv)
  }, [nextHarvestAt])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const partsRef = useRef<P[]>([])
  const spawnRef = useRef({ last: 0, delay: 2500 })
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
      const c = cv.getContext('2d'); if (!c) { requestAnimationFrame(loop); return }
      const H = cv.height, now = Date.now(), CX = W / 2

      const elapsed = (now - baseRef.current.time) / 1000
      const curTotal = baseRef.current.value + elapsed * totalPerSec
      setDisplayTotal(curTotal)
      const ft = harvestThreshold > 0 ? harvestThreshold : 200
      fillRef.current += (Math.min(curTotal / ft, 1) - fillRef.current) * 0.02

      c.clearRect(0, 0, W, H)

      // Hologram flicker
      c.globalAlpha = 0.96 + Math.sin(now * 0.02) * 0.04

      // Colors
      const PURPLE = '#b44dff'
      const PURPLEG = 'rgba(180,77,255,0.08)'
      const GREEN = '#00ff88'
      const GREENG = 'rgba(0,255,136,0.08)'
      const RED = '#ff3366'
      const REDG = 'rgba(255,51,102,0.08)'
      const ORANGE = '#ff6b35'

      // ═══ LAYOUT ═══════════════════════════════════════════
      const BELT_Y = H * 0.10
      const BELT_H = 4
      const BELT_L = 8, BELT_R = W - 8
      const LASER_X = BELT_R - 10
      const LASER_TOP = BELT_Y + BELT_H + 3
      const LASER_BOT = H * 0.22
      const FUNNEL_TOP = LASER_BOT + 2
      const FUNNEL_BOT = H * 0.27
      const FLASK_CX = CX
      const FLASK_CY = H * 0.40
      const FLASK_R = 20
      const FLASK_NECK_TOP = FUNNEL_BOT + 2
      const FLASK_BOT = FLASK_CY + FLASK_R + 2
      const COND_SX = FLASK_CX + FLASK_R - 3
      const COND_SY = FLASK_CY - 6
      const COND_EX = W - 16
      const COND_EY = H * 0.56
      const TUBE_Y = H * 0.60
      const TUBE_H = H * 0.08
      const BASIN_TOP = H * 0.72
      const BASIN_H = H - BASIN_TOP - 3

      // ═══ BACKGROUND ═══════════════════════════════════════
      c.fillStyle = '#08080f'; c.fillRect(0, 0, W, H)

      // ═══ 1. CONVEYOR BELT (wireframe) ═════════════════════
      const dashOff = (now * 0.03) % 20
      // Top rail
      c.beginPath(); c.moveTo(BELT_L, BELT_Y); c.lineTo(BELT_R, BELT_Y)
      c.setLineDash([5, 3]); c.lineDashOffset = -dashOff
      neonStroke(c, PURPLE, PURPLEG, 1.5)
      c.setLineDash([])
      // Bottom rail
      c.beginPath(); c.moveTo(BELT_L, BELT_Y + BELT_H); c.lineTo(BELT_R, BELT_Y + BELT_H)
      c.setLineDash([5, 3]); c.lineDashOffset = -dashOff
      neonStroke(c, PURPLE, PURPLEG, 1)
      c.setLineDash([])
      // Rollers (wireframe circles)
      const rollAngle = (now * 0.006) % (Math.PI * 2)
      for (const rx of [BELT_L + 4, BELT_R - 4]) {
        c.beginPath(); c.arc(rx, BELT_Y + BELT_H / 2, 4, 0, Math.PI * 2)
        neonStroke(c, PURPLE, PURPLEG, 1)
        // Spoke
        c.beginPath()
        c.moveTo(rx + Math.cos(rollAngle) * 3, BELT_Y + BELT_H / 2 + Math.sin(rollAngle) * 3)
        c.lineTo(rx - Math.cos(rollAngle) * 3, BELT_Y + BELT_H / 2 - Math.sin(rollAngle) * 3)
        neonStroke(c, PURPLE, PURPLEG, 0.5)
      }

      // ═══ LASER (vertical, at belt right) ══════════════════
      const lp = 0.7 + Math.sin(now * 0.005) * 0.3
      c.globalAlpha = lp
      c.beginPath(); c.moveTo(LASER_X, LASER_TOP); c.lineTo(LASER_X, LASER_BOT)
      neonStroke(c, RED, REDG, 1.5)
      c.globalAlpha = 0.96 + Math.sin(now * 0.02) * 0.04
      // Emitter dot
      c.beginPath(); c.arc(LASER_X, LASER_TOP - 1, 2.5, 0, Math.PI * 2)
      c.fillStyle = RED; c.fill()

      // ═══ FUNNEL (wireframe V) ═════════════════════════════
      c.beginPath()
      c.moveTo(LASER_X - 12, FUNNEL_TOP); c.lineTo(CX, FUNNEL_BOT)
      c.lineTo(LASER_X + 12, FUNNEL_TOP)
      neonStroke(c, PURPLE, PURPLEG, 1.2)

      // ═══ 2. DISTILLATION FLASK (wireframe, centered) ═════
      // Neck
      c.beginPath()
      c.moveTo(CX - 5, FLASK_NECK_TOP); c.lineTo(CX - 5, FLASK_CY - FLASK_R + 6)
      neonStroke(c, PURPLE, PURPLEG, 1.2)
      c.beginPath()
      c.moveTo(CX + 5, FLASK_NECK_TOP); c.lineTo(CX + 5, FLASK_CY - FLASK_R + 6)
      neonStroke(c, PURPLE, PURPLEG, 1.2)
      // Bulb
      c.beginPath(); c.arc(FLASK_CX, FLASK_CY, FLASK_R, -Math.PI * 0.78, Math.PI * 1.78)
      neonStroke(c, GREEN, GREENG, 1.5)

      // Liquid level in flask
      const flkFill = Math.min(1, fillRef.current * 2.5)
      if (flkFill > 0.05) {
        const liqH = FLASK_R * 1.5 * flkFill
        const liqTop = FLASK_CY + FLASK_R - liqH
        c.save()
        c.beginPath(); c.arc(FLASK_CX, FLASK_CY, FLASK_R - 1.5, 0, Math.PI * 2); c.clip()
        c.fillStyle = `rgba(0,255,136,${0.08 + flkFill * 0.12})`
        c.fillRect(FLASK_CX - FLASK_R, liqTop, FLASK_R * 2, liqH + 4)
        // Surface wave
        c.beginPath()
        for (let x = FLASK_CX - FLASK_R + 3; x < FLASK_CX + FLASK_R - 3; x += 2) {
          const wy = liqTop + Math.sin(x * 0.12 + now * 0.003) * 1
          if (x === FLASK_CX - FLASK_R + 3) c.moveTo(x, wy); else c.lineTo(x, wy)
        }
        c.strokeStyle = 'rgba(0,255,136,0.35)'; c.lineWidth = 0.8; c.stroke()
        c.restore()
      }

      // Flame under flask (wireframe zigzag)
      for (let i = 0; i < 3; i++) {
        const fx = CX - 6 + i * 6
        const fh = 5 + Math.sin(now * 0.012 + i * 2) * 2
        const fa = 0.5 + Math.sin(now * 0.015 + i) * 0.3
        c.globalAlpha = fa
        c.beginPath(); c.moveTo(fx - 2, FLASK_BOT + 3); c.lineTo(fx, FLASK_BOT + 3 - fh); c.lineTo(fx + 2, FLASK_BOT + 3)
        c.strokeStyle = ORANGE; c.lineWidth = 1.2; c.stroke()
        c.globalAlpha = 0.96 + Math.sin(now * 0.02) * 0.04
      }
      // Heater base wireframe
      c.beginPath(); c.moveTo(CX - 14, FLASK_BOT + 3); c.lineTo(CX + 14, FLASK_BOT + 3)
      neonStroke(c, 'rgba(255,107,53,0.4)', 'rgba(255,107,53,0.05)', 1)

      // ═══ CONDENSER TUBE (diagonal wireframe + coil) ═══════
      // Outer tube (two parallel lines)
      c.beginPath(); c.moveTo(COND_SX, COND_SY); c.lineTo(COND_EX, COND_EY)
      neonStroke(c, GREEN, GREENG, 1.2)
      c.beginPath(); c.moveTo(COND_SX, COND_SY + 5); c.lineTo(COND_EX, COND_EY + 5)
      neonStroke(c, GREEN, GREENG, 0.8)
      // Cooling coil (zigzag)
      const condDx = COND_EX - COND_SX, condDy = COND_EY - COND_SY
      const condLen = Math.sqrt(condDx * condDx + condDy * condDy)
      c.beginPath()
      c.strokeStyle = 'rgba(100,180,255,0.12)'; c.lineWidth = 0.6
      for (let d = 0; d < condLen; d += 3) {
        const t = d / condLen
        const bx = COND_SX + t * condDx, by = COND_SY + t * condDy + 2.5
        const zig = Math.sin(d * 0.9) * 2.5
        const nx = -condDy / condLen, ny = condDx / condLen
        if (d === 0) c.moveTo(bx + nx * zig, by + ny * zig)
        else c.lineTo(bx + nx * zig, by + ny * zig)
      }
      c.stroke()
      // Drip nozzle
      c.beginPath(); c.arc(COND_EX, COND_EY + 6, 2, 0, Math.PI * 2)
      neonStroke(c, GREEN, GREENG, 0.8)

      // ═══ 3. REAGENT TUBES (wireframe) ═════════════════════
      const tubeW = 8, tubeGap = 5, tubeN = 3
      const tubeSX = CX - ((tubeN * tubeW + (tubeN - 1) * tubeGap) / 2)
      for (let i = 0; i < tubeN; i++) {
        const tx = tubeSX + i * (tubeW + tubeGap)
        const tf = [0.7, 0.45, 0.25][i] * Math.min(1, fillRef.current * 2)
        // Tube outline
        c.beginPath()
        c.moveTo(tx, TUBE_Y); c.lineTo(tx, TUBE_Y + TUBE_H - tubeW / 2)
        c.arc(tx + tubeW / 2, TUBE_Y + TUBE_H - tubeW / 2, tubeW / 2, Math.PI, 0, true)
        c.lineTo(tx + tubeW, TUBE_Y)
        neonStroke(c, GREEN, GREENG, 0.8)
        // Rim
        c.beginPath(); c.moveTo(tx - 1, TUBE_Y); c.lineTo(tx + tubeW + 1, TUBE_Y)
        neonStroke(c, GREEN, GREENG, 1)
        // Fill
        if (tf > 0) {
          const fH = (TUBE_H - tubeW / 2) * tf
          c.fillStyle = `rgba(0,255,136,${0.12 + tf * 0.1 + Math.sin(now * 0.003 + i) * 0.03})`
          c.fillRect(tx + 1, TUBE_Y + TUBE_H - tubeW / 2 - fH, tubeW - 2, fH)
        }
      }

      // ═══ 4. BASIN (wireframe tank) ════════════════════════
      const fillH = BASIN_H * fillRef.current, surfY = H - 3 - fillH
      // Tank outline (U shape)
      c.beginPath()
      c.moveTo(10, BASIN_TOP); c.lineTo(10, H - 3); c.lineTo(W - 10, H - 3); c.lineTo(W - 10, BASIN_TOP)
      neonStroke(c, GREEN, GREENG, 1.5)
      // Rim
      c.beginPath(); c.moveTo(8, BASIN_TOP); c.lineTo(W - 8, BASIN_TOP)
      neonStroke(c, GREEN, GREENG, 1.2)
      // Liquid
      if (fillH > 2) {
        c.fillStyle = `rgba(0,255,136,${0.12 + fillRef.current * 0.18})`
        c.fillRect(11, surfY, W - 22, fillH + 2)
        // Wave
        c.beginPath(); c.moveTo(11, surfY)
        for (let x = 11; x < W - 11; x += 2) c.lineTo(x, surfY + Math.sin(x * 0.08 + now * 0.002) * 1.2)
        c.lineTo(W - 11, surfY)
        c.strokeStyle = 'rgba(0,255,136,0.45)'; c.lineWidth = 0.8; c.stroke()
        // Glow up
        const gG = c.createLinearGradient(0, surfY - 8, 0, surfY)
        gG.addColorStop(0, 'transparent'); gG.addColorStop(1, 'rgba(0,255,136,0.04)')
        c.fillStyle = gG; c.fillRect(11, surfY - 8, W - 22, 8)
      }

      c.globalAlpha = 1

      // ═══ SPLASHES ═════════════════════════════════════════
      splashRef.current = splashRef.current.filter(s => {
        const age = (now - s.t) / 1000; if (age > 0.4) return false
        for (let i = 0; i < 3; i++) {
          c.beginPath(); c.arc(s.x + (Math.random() - 0.5) * 8 * age * 3, s.y - age * 8 * (1 + i * 0.3), 1 * (1 - age * 2.5), 0, Math.PI * 2)
          c.fillStyle = `rgba(0,255,136,${(1 - age * 2.5) * 0.4})`; c.fill()
        }
        return true
      })

      // ═══ PARTICLES ════════════════════════════════════════
      // Spawn stone on belt
      if (now - spawnRef.current.last > spawnRef.current.delay || partsRef.current.filter(p => p.type === 'stone').length === 0) {
        if (partsRef.current.length < 30) {
          const sz = 5 + Math.random() * 7
          partsRef.current.push({
            x: BELT_L + 8, y: BELT_Y - sz * 0.3,
            vx: 0.35, vy: 0, size: sz, rot: Math.random() * Math.PI * 2,
            type: 'stone', shape: mkShape(sz), t: 0, life: 1,
          })
          spawnRef.current = { last: now, delay: 2000 + Math.random() * 2000 }
        }
      }
      // Spawn bubbles in flask
      if (Math.random() < 0.02 && partsRef.current.filter(p => p.type === 'bubble').length < 5) {
        partsRef.current.push({
          x: FLASK_CX + (Math.random() - 0.5) * FLASK_R,
          y: FLASK_CY + FLASK_R - 4, vx: 0, vy: -0.2 - Math.random() * 0.3,
          size: 1.5 + Math.random() * 2, rot: 0, type: 'bubble', shape: [], t: 0, life: 1,
        })
      }

      const alive: P[] = []
      for (const p of partsRef.current) {
        if (p.type === 'stone') {
          p.x += p.vx
          if (p.x >= LASER_X - 3) {
            // Flash
            c.fillStyle = 'rgba(255,100,100,0.4)'; c.beginPath(); c.arc(LASER_X, BELT_Y + BELT_H + 6, 8, 0, Math.PI * 2); c.fill()
            // Fragments
            for (let i = 0; i < 6; i++) {
              partsRef.current.push({
                x: LASER_X + (Math.random() - 0.5) * 8,
                y: LASER_BOT + Math.random() * 6,
                vx: (Math.random() - 0.5) * 0.8, vy: 0.3 + Math.random() * 0.4,
                size: 2 + Math.random() * 2, rot: Math.random() * Math.PI * 2,
                type: 'frag', shape: mkShape(3), t: 0.1, life: 1,
              })
            }
            continue
          }
          // Draw wireframe stone
          c.save(); c.translate(p.x, p.y); c.rotate(p.rot)
          c.beginPath(); c.moveTo(p.shape[0][0], p.shape[0][1])
          for (let i = 1; i < p.shape.length; i++) c.lineTo(p.shape[i][0], p.shape[i][1])
          c.closePath(); neonStroke(c, PURPLE, PURPLEG, 1.2)
          c.restore()

        } else if (p.type === 'frag') {
          p.y += p.vy; p.vy += 0.008; p.x += p.vx; p.vx *= 0.99; p.rot += 0.03
          p.t = Math.min(1, p.t + 0.004)
          // Funnel toward flask neck
          if (p.y > FUNNEL_TOP) p.x += (CX - p.x) * 0.03
          // Inside flask bulb → fade
          if (p.y > FLASK_CY - FLASK_R + 5 && Math.abs(p.x - CX) < FLASK_R * 0.8) {
            p.life -= 0.02; p.size *= 0.98
          }
          if (p.life <= 0 || p.y > FLASK_BOT + 5) {
            // Chance to become a drop at condenser
            if (Math.random() < 0.4) {
              partsRef.current.push({
                x: COND_EX, y: COND_EY + 8,
                vx: 0, vy: 0.3, size: 2 + Math.random() * 1.5, rot: 0,
                type: 'drop', shape: [], t: 1, life: 1,
              })
            }
            continue
          }
          // Draw — color transitions purple → green
          const t = p.t
          const r = Math.floor(180 * (1 - t))
          const g = Math.floor(77 * (1 - t) + 255 * t)
          const b = Math.floor(255 * (1 - t) + 136 * t)
          const col = `rgb(${r},${g},${b})`
          const glow = `rgba(${r},${g},${b},0.08)`
          c.save(); c.translate(p.x, p.y); c.rotate(p.rot)
          const sc = p.size * (1 - t * 0.3) / 3
          c.beginPath(); c.moveTo(p.shape[0][0] * sc, p.shape[0][1] * sc)
          for (let i = 1; i < p.shape.length; i++) c.lineTo(p.shape[i][0] * sc, p.shape[i][1] * sc)
          c.closePath(); neonStroke(c, col, glow, 1)
          c.restore()

        } else if (p.type === 'bubble') {
          p.y += p.vy; p.x += Math.sin(now * 0.005 + p.x) * 0.1; p.life -= 0.005
          if (p.life <= 0 || p.y < FLASK_CY - FLASK_R + 8) continue
          c.beginPath(); c.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          c.strokeStyle = `rgba(0,255,136,${p.life * 0.2})`; c.lineWidth = 0.6; c.stroke()

        } else if (p.type === 'drop') {
          p.y += p.vy; p.vy += 0.015
          if (p.y >= surfY && fillH > 0) { splashRef.current.push({ x: p.x, y: surfY, t: now }); p.size *= 0.3 }
          if (p.size < 0.3 || p.y > H) continue
          // Neon drop
          c.beginPath(); c.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          c.fillStyle = 'rgba(0,255,136,0.7)'; c.fill()
          c.beginPath(); c.arc(p.x, p.y, p.size + 2.5, 0, Math.PI * 2)
          c.fillStyle = 'rgba(0,255,136,0.06)'; c.fill()
          c.beginPath(); c.arc(p.x - p.size * 0.2, p.y - p.size * 0.2, p.size * 0.3, 0, Math.PI * 2)
          c.fillStyle = 'rgba(255,255,255,0.15)'; c.fill()
        }
        alive.push(p)
      }
      partsRef.current = alive

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
