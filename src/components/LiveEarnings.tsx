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

// Particle
interface P {
  x: number; y: number; vx: number; vy: number; size: number; rot: number
  type: 'stone' | 'frag' | 'bubble' | 'drop'
  shape: number[][]; color: number; life: number
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
    const u = () => setHarvestSec(Math.max(0, (new Date(nextHarvestAt).getTime() - Date.now()) / 1000))
    u(); const t = setInterval(u, 1000); return () => clearInterval(t)
  }, [nextHarvestAt])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const partsRef = useRef<P[]>([])
  const spawnRef = useRef({ last: 0, delay: 2000 })
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

      // ═══ LAYOUT ═══════════════════════════════════════════
      const BELT_Y = H * 0.08          // belt surface Y
      const LASER_Y = H * 0.18         // laser beam Y
      const FLASK_TOP = H * 0.26       // round flask starts
      const FLASK_CY = H * 0.36        // flask center Y
      const FLASK_R = 18               // flask bulb radius
      const FLASK_BOT = FLASK_CY + FLASK_R + 2
      const COND_START_Y = FLASK_CY - 4 // condenser exits flask side
      const COND_END_X = W - 22        // condenser end X (right side)
      const COND_END_Y = H * 0.52      // condenser drip point
      const TUBE_Y = H * 0.56          // reagent tubes top
      const TUBE_H = H * 0.08
      const BASIN_TOP = H * 0.68
      const BASIN_H = H - BASIN_TOP - 3

      // ═══ BACKGROUND ═══════════════════════════════════════
      c.fillStyle = '#0a0a18'; c.fillRect(0, 0, W, H)
      c.strokeStyle = 'rgba(199,125,255,0.01)'; c.lineWidth = 0.5
      for (let y = 0; y < H; y += 14) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke() }
      for (let x = 0; x < W; x += 14) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke() }

      // ═══ 1. CRUSHER HOPPER + CONVEYOR BELT + LASER ═════════
      const beltL = 10
      const hopperW = 36
      c.fillStyle = '#3a3a4a'
      c.beginPath(); c.moveTo(beltL + 4 - hopperW / 2 + 10, 2); c.lineTo(beltL + 4 - 4, BELT_Y - 2); c.lineTo(beltL + 4 + 8, BELT_Y - 2); c.lineTo(beltL + 4 + hopperW / 2 + 10, 2); c.closePath(); c.fill()
      c.fillStyle = '#1a1a2a'
      c.beginPath(); c.moveTo(beltL + 4 - hopperW / 2 + 14, 4); c.lineTo(beltL + 4 - 2, BELT_Y - 3); c.lineTo(beltL + 4 + 6, BELT_Y - 3); c.lineTo(beltL + 4 + hopperW / 2 + 6, 4); c.closePath(); c.fill()
      // Hopper jaws
      const jaw = Math.sin(now * 0.005)
      c.fillStyle = '#6a6a7a'
      c.fillRect(beltL + 4 - 2 - jaw, BELT_Y - 5, 4, 3)
      c.fillRect(beltL + 4 + 2 + jaw, BELT_Y - 5, 4, 3)
      if (jaw > 0.5) { c.fillStyle = 'rgba(255,170,0,0.35)'; c.beginPath(); c.arc(beltL + 4 + 2, BELT_Y - 2, 2, 0, Math.PI * 2); c.fill() }

      // Belt surface
      const beltR = W - 10, beltH = 5
      c.fillStyle = '#333344'; c.fillRect(beltL, BELT_Y, beltR - beltL, beltH)
      // Moving segments
      const segSpd = (now * 0.03) % 10
      c.fillStyle = 'rgba(199,125,255,0.06)'
      for (let sx = beltL; sx < beltR; sx += 10) {
        const ox = sx + segSpd; if (ox < beltR - 2) c.fillRect(ox, BELT_Y + 1, 5, beltH - 2)
      }
      // Belt shadow
      c.fillStyle = 'rgba(0,0,0,0.15)'; c.fillRect(beltL + 2, BELT_Y + beltH, beltR - beltL - 4, 2)
      // Rollers
      const rollSpin = (now * 0.006) % (Math.PI * 2)
      for (const rx of [beltL + 3, beltR - 3]) {
        c.save(); c.translate(rx, BELT_Y + beltH / 2); c.rotate(rollSpin)
        c.beginPath(); c.arc(0, 0, 4, 0, Math.PI * 2); c.fillStyle = '#3a3a4a'; c.fill()
        c.fillStyle = '#555566'; c.fillRect(-0.5, -3.5, 1, 7) // spoke
        c.beginPath(); c.arc(0, 0, 1.5, 0, Math.PI * 2); c.fillStyle = '#4a4a5a'; c.fill()
        c.restore()
      }

      // Laser beam (vertical, at belt right end)
      const laserX = beltR - 8
      const lPulse = 0.7 + Math.sin(now * 0.005) * 0.3
      // Glow
      c.fillStyle = `rgba(255,51,102,${0.04 * lPulse})`
      c.fillRect(laserX - 6, BELT_Y + beltH + 2, 12, LASER_Y - BELT_Y - beltH + 8)
      // Beam
      c.globalAlpha = lPulse
      c.strokeStyle = '#ff3366'; c.lineWidth = 2
      c.beginPath(); c.moveTo(laserX, BELT_Y + beltH + 3); c.lineTo(laserX, LASER_Y + 8); c.stroke()
      c.strokeStyle = '#ff8899'; c.lineWidth = 0.6
      c.beginPath(); c.moveTo(laserX, BELT_Y + beltH + 3); c.lineTo(laserX, LASER_Y + 8); c.stroke()
      c.globalAlpha = 1
      // Emitter (top)
      c.fillStyle = '#ff3366'; c.beginPath(); c.arc(laserX, BELT_Y + beltH + 2, 2.5, 0, Math.PI * 2); c.fill()
      c.fillStyle = 'rgba(255,51,102,0.12)'; c.beginPath(); c.arc(laserX, BELT_Y + beltH + 2, 5, 0, Math.PI * 2); c.fill()

      // ═══ 2. DISTILLATION APPARATUS ════════════════════════
      const GL = 'rgba(140,160,190,0.2)' // glass color
      const GLH = 'rgba(255,255,255,0.04)' // glass highlight

      // Round flask (left side)
      c.strokeStyle = GL; c.lineWidth = 1.2
      c.beginPath()
      // Neck
      c.moveTo(CX - 12, FLASK_TOP); c.lineTo(CX - 5, FLASK_TOP)
      c.lineTo(CX - 5, FLASK_CY - FLASK_R + 4)
      // Bulb
      c.arc(CX - 12, FLASK_CY, FLASK_R, -Math.PI * 0.35, Math.PI * 0.85, false)
      c.lineTo(CX - 12 - FLASK_R * 0.2, FLASK_CY - FLASK_R + 4)
      c.lineTo(CX - 19, FLASK_TOP)
      c.lineTo(CX - 12, FLASK_TOP)
      c.stroke()
      // Highlight
      c.strokeStyle = GLH; c.lineWidth = 1
      c.beginPath(); c.arc(CX - 15, FLASK_CY - 4, FLASK_R * 0.5, -0.8, 0.4); c.stroke()

      // Liquid in flask (fills from bottom)
      const flkFill = Math.min(1, fillRef.current * 3)
      if (flkFill > 0.05) {
        const liqH = FLASK_R * 1.4 * flkFill
        const liqTop = FLASK_CY + FLASK_R - 2 - liqH
        c.save()
        c.beginPath(); c.arc(CX - 12, FLASK_CY, FLASK_R - 2, 0, Math.PI * 2); c.clip()
        const lG = c.createLinearGradient(0, liqTop, 0, FLASK_CY + FLASK_R)
        lG.addColorStop(0, 'rgba(0,255,136,0.15)'); lG.addColorStop(1, 'rgba(0,255,136,0.3)')
        c.fillStyle = lG; c.fillRect(CX - 12 - FLASK_R, liqTop, FLASK_R * 2, liqH + 4)
        c.restore()
        // Liquid surface wave
        c.strokeStyle = 'rgba(0,255,136,0.3)'; c.lineWidth = 0.8
        c.beginPath()
        for (let x = CX - 12 - FLASK_R + 4; x < CX - 12 + FLASK_R - 4; x += 2) {
          const wy = liqTop + Math.sin(x * 0.12 + now * 0.003) * 1
          if (x === CX - 12 - FLASK_R + 4) c.moveTo(x, wy); else c.lineTo(x, wy)
        }
        c.stroke()
      }
      // Flask glow
      c.beginPath(); c.arc(CX - 12, FLASK_CY, FLASK_R * 0.5, 0, Math.PI * 2)
      c.fillStyle = `rgba(0,255,136,${0.02 + Math.sin(now * 0.003) * 0.01})`; c.fill()

      // Flame under flask
      for (let i = 0; i < 3; i++) {
        const fx = CX - 16 + i * 4, fh = 3 + Math.sin(now * 0.01 + i * 2) * 1.5
        c.fillStyle = `rgba(255,120,0,${0.3 + Math.sin(now * 0.012 + i) * 0.15})`
        c.beginPath(); c.moveTo(fx - 1.5, FLASK_BOT + 1); c.lineTo(fx, FLASK_BOT + 1 - fh); c.lineTo(fx + 1.5, FLASK_BOT + 1); c.fill()
        c.fillStyle = `rgba(255,220,80,${0.2 + Math.sin(now * 0.015 + i) * 0.1})`
        c.beginPath(); c.moveTo(fx - 0.8, FLASK_BOT + 1); c.lineTo(fx, FLASK_BOT + 1 - fh * 0.5); c.lineTo(fx + 0.8, FLASK_BOT + 1); c.fill()
      }
      c.fillStyle = '#3a3a4a'; c.fillRect(CX - 20, FLASK_BOT + 1, 16, 2)

      // Condenser tube (from flask right side, angling down-right)
      c.strokeStyle = GL; c.lineWidth = 1.2
      c.beginPath()
      c.moveTo(CX - 12 + FLASK_R - 2, COND_START_Y)
      c.lineTo(COND_END_X, COND_END_Y)
      c.stroke()
      // Outer tube (parallel)
      c.beginPath()
      c.moveTo(CX - 12 + FLASK_R - 2, COND_START_Y + 4)
      c.lineTo(COND_END_X, COND_END_Y + 4)
      c.stroke()
      // Cooling coil (zigzag between tubes)
      c.strokeStyle = 'rgba(100,140,200,0.12)'; c.lineWidth = 0.6
      const condLen = Math.sqrt((COND_END_X - (CX - 12 + FLASK_R)) ** 2 + (COND_END_Y - COND_START_Y) ** 2)
      const condAngle = Math.atan2(COND_END_Y - COND_START_Y, COND_END_X - (CX - 12 + FLASK_R))
      c.beginPath()
      for (let d = 0; d < condLen; d += 4) {
        const t = d / condLen
        const bx = (CX - 12 + FLASK_R - 2) + t * (COND_END_X - (CX - 12 + FLASK_R - 2))
        const by = COND_START_Y + t * (COND_END_Y - COND_START_Y) + 2
        const zigY = Math.sin(d * 0.8) * 2
        const px = bx + Math.sin(condAngle + Math.PI / 2) * zigY
        const py = by + Math.cos(condAngle + Math.PI / 2) * zigY
        if (d === 0) c.moveTo(px, py); else c.lineTo(px, py)
      }
      c.stroke()
      // Drip point
      c.fillStyle = '#3a3a4a'; c.fillRect(COND_END_X - 2, COND_END_Y + 2, 5, 4)

      // ═══ 3. REAGENT TUBES ═════════════════════════════════
      const tubeW = 8, tubeGap = 6, tubeCount = 3
      const tubeStartX = CX - ((tubeCount * tubeW + (tubeCount - 1) * tubeGap) / 2)
      for (let i = 0; i < tubeCount; i++) {
        const tx = tubeStartX + i * (tubeW + tubeGap)
        const fill = [0.8, 0.5, 0.3][i] * Math.min(1, fillRef.current * 2)
        // Tube outline
        c.strokeStyle = GL; c.lineWidth = 0.8
        c.beginPath()
        c.moveTo(tx, TUBE_Y); c.lineTo(tx, TUBE_Y + TUBE_H - 3)
        c.arc(tx + tubeW / 2, TUBE_Y + TUBE_H - 3, tubeW / 2, Math.PI, 0, true)
        c.lineTo(tx + tubeW, TUBE_Y)
        c.stroke()
        // Tube rim
        c.strokeStyle = 'rgba(140,160,190,0.25)'; c.lineWidth = 1.5
        c.beginPath(); c.moveTo(tx - 1, TUBE_Y); c.lineTo(tx + tubeW + 1, TUBE_Y); c.stroke()
        // Fill
        if (fill > 0) {
          const fH = (TUBE_H - 3) * fill
          c.fillStyle = `rgba(0,255,136,${0.2 + fill * 0.15})`
          c.fillRect(tx + 1, TUBE_Y + TUBE_H - 3 - fH, tubeW - 2, fH)
          // Glow
          c.fillStyle = `rgba(0,255,136,${0.03 + Math.sin(now * 0.003 + i) * 0.02})`
          c.fillRect(tx, TUBE_Y + TUBE_H - 3 - fH - 2, tubeW, fH + 4)
        }
      }

      // ═══ 4. BASIN ═════════════════════════════════════════
      const fillH = BASIN_H * fillRef.current, surfY = H - 3 - fillH
      c.fillStyle = '#0a0a14'; c.fillRect(10, BASIN_TOP, W - 20, BASIN_H)
      if (fillH > 2) {
        const lG = c.createLinearGradient(0, surfY, 0, H)
        lG.addColorStop(0, 'rgba(0,255,136,0.25)'); lG.addColorStop(1, 'rgba(0,255,136,0.4)')
        c.fillStyle = lG; c.fillRect(11, surfY, W - 22, fillH + 2)
        c.beginPath(); c.moveTo(11, surfY)
        for (let x = 11; x < W - 11; x += 2) c.lineTo(x, surfY + Math.sin(x * 0.08 + now * 0.002) * 1.2)
        c.lineTo(W - 11, surfY); c.strokeStyle = 'rgba(0,255,136,0.5)'; c.lineWidth = 0.8; c.stroke()
        c.fillStyle = 'rgba(255,255,255,0.03)'; c.fillRect(14, surfY + 2, 16, 1.5)
        const gG = c.createLinearGradient(0, surfY - 6, 0, surfY)
        gG.addColorStop(0, 'transparent'); gG.addColorStop(1, 'rgba(0,255,136,0.04)')
        c.fillStyle = gG; c.fillRect(11, surfY - 6, W - 22, 6)
      }
      c.strokeStyle = '#2a2a3a'; c.lineWidth = 1.5; c.strokeRect(9.5, BASIN_TOP - 0.5, W - 19, BASIN_H + 1)
      c.fillStyle = '#444455'; c.fillRect(8, BASIN_TOP - 2, W - 16, 3)

      // ═══ SPLASHES ═════════════════════════════════════════
      splashRef.current = splashRef.current.filter(s => {
        const age = (now - s.t) / 1000; if (age > 0.4) return false
        for (let i = 0; i < 3; i++) {
          c.beginPath(); c.arc(s.x + (Math.random() - 0.5) * 8 * age * 3, s.y - age * 8 * (1 + i * 0.4), 1 * (1 - age * 2.5), 0, Math.PI * 2)
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
            x: beltL + 6 + (Math.random() - 0.5) * 4, y: BELT_Y - sz * 0.5 - 1,
            vx: 0.4, vy: 0, size: sz, rot: Math.random() * Math.PI * 2,
            type: 'stone', shape: mkShape(sz), color: 0, life: 1,
          })
          spawnRef.current.last = now
          spawnRef.current.delay = 2000 + Math.random() * 2000
        }
      }
      // Spawn bubbles
      if (Math.random() < 0.025 && partsRef.current.filter(p => p.type === 'bubble').length < 5) {
        partsRef.current.push({
          x: CX - 12 + (Math.random() - 0.5) * FLASK_R * 1.2,
          y: FLASK_CY + FLASK_R - 4, vx: 0, vy: -0.2 - Math.random() * 0.3,
          size: 1.5 + Math.random() * 2.5, rot: 0, type: 'bubble',
          shape: [], color: 0, life: 1,
        })
      }

      const alive: P[] = []
      for (const p of partsRef.current) {
        if (p.type === 'stone') {
          p.x += p.vx // move with belt
          // Reached laser?
          if (p.x >= laserX - 3) {
            // Flash
            c.fillStyle = 'rgba(255,255,255,0.5)'; c.beginPath(); c.arc(p.x, BELT_Y + beltH + 4, p.size + 5, 0, Math.PI * 2); c.fill()
            // Spawn fragments
            for (let i = 0; i < 6; i++) {
              partsRef.current.push({
                x: p.x + (Math.random() - 0.5) * 6, y: LASER_Y + Math.random() * 4,
                vx: (Math.random() - 0.5) * 1, vy: 0.3 + Math.random() * 0.4,
                size: 2 + Math.random() * 2.5, rot: Math.random() * Math.PI * 2,
                type: 'frag', shape: mkShape(3), color: 0.15, life: 1,
              })
            }
            continue // stone destroyed
          }
          // Draw on belt
          c.save(); c.translate(p.x, p.y); c.rotate(p.rot)
          c.fillStyle = 'rgba(0,0,0,0.2)'; c.beginPath()
          c.moveTo(p.shape[0][0] + 1, p.shape[0][1] + 1)
          for (let i = 1; i < p.shape.length; i++) c.lineTo(p.shape[i][0] + 1, p.shape[i][1] + 1)
          c.closePath(); c.fill()
          c.fillStyle = '#b44dff'; c.beginPath()
          c.moveTo(p.shape[0][0], p.shape[0][1])
          for (let i = 1; i < p.shape.length; i++) c.lineTo(p.shape[i][0], p.shape[i][1])
          c.closePath(); c.fill()
          c.fillStyle = 'rgba(255,255,255,0.1)'; c.beginPath(); c.arc(-p.size * 0.2, -p.size * 0.2, p.size * 0.3, 0, Math.PI * 2); c.fill()
          c.restore()

        } else if (p.type === 'frag') {
          p.y += p.vy; p.vy += 0.008; p.x += p.vx; p.vx *= 0.99; p.rot += 0.03
          p.color = Math.min(1, p.color + 0.004)
          // Funnel toward flask
          if (p.y > FLASK_TOP - 5) p.x += ((CX - 12) - p.x) * 0.04
          // Enter flask
          if (p.y > FLASK_CY && Math.abs(p.x - (CX - 12)) < FLASK_R) { p.life -= 0.03; p.size *= 0.97 }
          // Become drop at condenser output
          if (p.y > COND_END_Y - 5 && p.color > 0.7 && p.x > CX + 5) {
            p.type = 'drop'; p.x = COND_END_X; p.y = COND_END_Y + 6; p.vy = 0.4; p.vx = 0; p.size = 2 + Math.random() * 1.5
            continue
          }
          if (p.life <= 0 || p.y > FLASK_BOT + 10) continue

          const t = p.color
          const r = Math.floor(180 * (1 - t) + 0 * t)
          const g = Math.floor(77 * (1 - t) + 255 * t)
          const b = Math.floor(255 * (1 - t) + 136 * t)
          c.save(); c.translate(p.x, p.y); c.rotate(p.rot)
          c.fillStyle = `rgba(${r},${g},${b},${p.life})`
          c.beginPath()
          const sc = p.size * (1 - t * 0.3) / 3
          c.moveTo(p.shape[0][0] * sc, p.shape[0][1] * sc)
          for (let i = 1; i < p.shape.length; i++) c.lineTo(p.shape[i][0] * sc, p.shape[i][1] * sc)
          c.closePath(); c.fill()
          if (t > 0.5) { c.beginPath(); c.arc(0, 0, p.size, 0, Math.PI * 2); c.fillStyle = `rgba(0,255,136,${(t - 0.5) * 0.08})`; c.fill() }
          c.restore()

        } else if (p.type === 'bubble') {
          p.y += p.vy; p.x += Math.sin(now * 0.005 + p.x) * 0.1; p.life -= 0.006
          if (p.life <= 0 || p.y < FLASK_CY - FLASK_R + 6) continue
          c.beginPath(); c.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          c.strokeStyle = `rgba(0,255,136,${p.life * 0.25})`; c.lineWidth = 0.5; c.stroke()

        } else if (p.type === 'drop') {
          p.y += p.vy; p.vy += 0.015
          if (p.y >= surfY && fillH > 0) { splashRef.current.push({ x: p.x, y: surfY, t: now }); p.size *= 0.4 }
          if (p.size < 0.3 || p.y > H) continue
          c.beginPath(); c.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          c.fillStyle = 'rgba(0,255,136,0.8)'; c.fill()
          c.beginPath(); c.arc(p.x - p.size * 0.25, p.y - p.size * 0.25, p.size * 0.35, 0, Math.PI * 2)
          c.fillStyle = 'rgba(255,255,255,0.2)'; c.fill()
          c.beginPath(); c.arc(p.x, p.y, p.size + 2, 0, Math.PI * 2)
          c.fillStyle = 'rgba(0,255,136,0.06)'; c.fill()
        }
        alive.push(p)
      }
      partsRef.current = alive

      c.strokeStyle = 'rgba(199,125,255,0.05)'; c.lineWidth = 1; c.strokeRect(0.5, 0.5, W - 1, H - 1)
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
