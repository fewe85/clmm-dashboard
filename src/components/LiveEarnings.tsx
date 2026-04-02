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
          {tier} {apr > 0 ? (apr >= 1000 ? `${(apr / 1000).toFixed(1)}k` : `${apr.toFixed(0)}`) + '%' : '—'}
        </span>
      </div>
    </div>
  )
}

// ─── Sprite drawing functions (ship-quality detail) ───────────────────────

function drawBeltSprite(c: CanvasRenderingContext2D, x: number, y: number, w: number, now: number) {
  // Metal body with gradient
  const g = c.createLinearGradient(x, y, x, y + 8)
  g.addColorStop(0, '#4a4a5a'); g.addColorStop(0.5, '#3a3a4a'); g.addColorStop(1, '#2a2a3a')
  c.fillStyle = g; c.fillRect(x, y, w, 8)
  // Top highlight
  c.fillStyle = 'rgba(255,255,255,0.04)'; c.fillRect(x + 2, y, w - 4, 1)
  // Moving segments
  const off = (now * 0.025) % 12
  c.fillStyle = 'rgba(199,125,255,0.05)'
  for (let sx = 0; sx < w; sx += 12) { const ox = (sx + off) % w; c.fillRect(x + ox, y + 2, 6, 4) }
  // Shadow under belt
  c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(x + 3, y + 8, w - 6, 2)
  // Rollers with highlight
  for (const rx of [x + 4, x + w - 4]) {
    c.beginPath(); c.arc(rx, y + 4, 4, 0, Math.PI * 2)
    const rg = c.createRadialGradient(rx - 1, y + 3, 0, rx, y + 4, 4)
    rg.addColorStop(0, '#5a5a6a'); rg.addColorStop(1, '#2a2a3a')
    c.fillStyle = rg; c.fill()
    c.strokeStyle = 'rgba(199,125,255,0.1)'; c.lineWidth = 0.5; c.stroke()
    // Axle
    c.beginPath(); c.arc(rx, y + 4, 1.5, 0, Math.PI * 2)
    c.fillStyle = '#555566'; c.fill()
  }
}

function drawLaserSprite(c: CanvasRenderingContext2D, x: number, y: number, now: number) {
  // Emitter box
  const eg = c.createLinearGradient(x, y, x, y + 12)
  eg.addColorStop(0, '#4a4a5a'); eg.addColorStop(1, '#2a2a3a')
  c.fillStyle = eg; c.fillRect(x, y, 10, 12)
  c.strokeStyle = 'rgba(199,125,255,0.1)'; c.lineWidth = 0.5; c.strokeRect(x, y, 10, 12)
  // LED
  const ledPulse = 0.5 + Math.sin(now * 0.004) * 0.5
  c.beginPath(); c.arc(x + 5, y + 3, 1.5, 0, Math.PI * 2)
  c.fillStyle = `rgba(255,51,102,${ledPulse})`; c.fill()
  // Beam
  const beamPulse = 0.6 + Math.sin(now * 0.005) * 0.35
  c.globalAlpha = beamPulse
  // Glow
  c.fillStyle = 'rgba(255,51,102,0.06)'; c.fillRect(x - 30, y + 4, 30, 4)
  // Core beam
  c.fillStyle = '#ff3366'; c.fillRect(x - 28, y + 5, 26, 2)
  c.fillStyle = '#ff8899'; c.fillRect(x - 26, y + 5.5, 22, 1)
  c.globalAlpha = 1
}

function drawFlaskSprite(c: CanvasRenderingContext2D, x: number, y: number, fillLevel: number, now: number) {
  const neckW = 8, neckH = 12, bulbR = 18, bulbCY = y + neckH + bulbR * 0.7

  // Neck
  const ng = c.createLinearGradient(x - neckW / 2, y, x + neckW / 2, y)
  ng.addColorStop(0, 'rgba(140,160,200,0.15)'); ng.addColorStop(0.5, 'rgba(200,220,255,0.08)'); ng.addColorStop(1, 'rgba(100,120,160,0.12)')
  c.fillStyle = ng; c.fillRect(x - neckW / 2, y, neckW, neckH)

  // Bulb
  c.beginPath(); c.arc(x, bulbCY, bulbR, 0, Math.PI * 2)
  const bg = c.createRadialGradient(x - 5, bulbCY - 5, 0, x, bulbCY, bulbR)
  bg.addColorStop(0, 'rgba(200,220,255,0.06)'); bg.addColorStop(0.7, 'rgba(140,160,200,0.03)'); bg.addColorStop(1, 'rgba(100,120,160,0.1)')
  c.fillStyle = bg; c.fill()
  c.strokeStyle = 'rgba(140,160,200,0.2)'; c.lineWidth = 1.2; c.stroke()
  // Glass highlight
  c.beginPath(); c.arc(x - 8, bulbCY - 8, 6, 0, Math.PI * 2)
  c.fillStyle = 'rgba(255,255,255,0.03)'; c.fill()

  // Liquid inside
  if (fillLevel > 0.05) {
    const liqH = bulbR * 1.6 * fillLevel
    const liqTop = bulbCY + bulbR - liqH
    c.save(); c.beginPath(); c.arc(x, bulbCY, bulbR - 1.5, 0, Math.PI * 2); c.clip()
    const lg = c.createLinearGradient(0, liqTop, 0, bulbCY + bulbR)
    lg.addColorStop(0, 'rgba(0,255,136,0.2)'); lg.addColorStop(1, 'rgba(0,255,136,0.35)')
    c.fillStyle = lg; c.fillRect(x - bulbR, liqTop, bulbR * 2, liqH + 4)
    // Surface
    c.beginPath()
    for (let sx = x - bulbR + 3; sx < x + bulbR - 3; sx += 2) {
      const wy = liqTop + Math.sin(sx * 0.1 + now * 0.003) * 1
      if (sx === x - bulbR + 3) c.moveTo(sx, wy); else c.lineTo(sx, wy)
    }
    c.strokeStyle = 'rgba(0,255,136,0.4)'; c.lineWidth = 0.8; c.stroke()
    c.restore()
  }
  // Inner glow
  c.beginPath(); c.arc(x, bulbCY, bulbR * 0.4, 0, Math.PI * 2)
  c.fillStyle = `rgba(0,255,136,${0.02 + Math.sin(now * 0.003) * 0.01})`; c.fill()

  // Stativ (tripod)
  const tripodTop = bulbCY + bulbR + 2
  // Cross bar
  c.fillStyle = '#444455'; c.fillRect(x - 16, tripodTop, 32, 2)
  c.fillStyle = 'rgba(255,255,255,0.03)'; c.fillRect(x - 15, tripodTop, 30, 1)
  // Legs
  for (const lx of [x - 14, x + 12]) {
    c.fillStyle = '#3a3a4a'; c.fillRect(lx, tripodTop + 2, 2, 8)
    c.fillStyle = '#333344'; c.fillRect(lx - 1, tripodTop + 9, 4, 2) // feet
  }

  // Flame
  const flameY = tripodTop - 4
  for (let i = 0; i < 4; i++) {
    const fx = x - 6 + i * 4, fh = 4 + Math.sin(now * 0.01 + i * 1.5) * 2
    const fa = 0.4 + Math.sin(now * 0.012 + i) * 0.2
    c.globalAlpha = fa
    c.fillStyle = '#ff6b35'
    c.beginPath(); c.moveTo(fx - 2, flameY + 3); c.lineTo(fx, flameY + 3 - fh); c.lineTo(fx + 2, flameY + 3); c.fill()
    c.fillStyle = '#ffaa44'
    c.beginPath(); c.moveTo(fx - 1, flameY + 3); c.lineTo(fx, flameY + 3 - fh * 0.5); c.lineTo(fx + 1, flameY + 3); c.fill()
  }
  c.globalAlpha = 1

  return { bulbCY, bulbR, neckTop: y, neckX: x, tripodBot: tripodTop + 11 }
}

function drawUTubeSprite(c: CanvasRenderingContext2D, lx: number, topY: number, rx: number, botY: number, startY: number, now: number) {
  const tw = 5 // tube inner width

  // Helper: glass tube segment
  const glassTube = (x1: number, y1: number, x2: number, y2: number, vertical: boolean) => {
    if (vertical) {
      const minY = Math.min(y1, y2), maxY = Math.max(y1, y2), h = maxY - minY
      // Interior
      c.fillStyle = 'rgba(12,12,24,0.8)'; c.fillRect(x1 + 1, minY, tw, h)
      // Walls
      const lg = c.createLinearGradient(x1, 0, x1 + tw + 2, 0)
      lg.addColorStop(0, 'rgba(140,160,200,0.2)'); lg.addColorStop(0.5, 'rgba(200,220,255,0.05)'); lg.addColorStop(1, 'rgba(100,120,160,0.15)')
      c.fillStyle = lg; c.fillRect(x1, minY, 1, h); c.fillRect(x1 + tw + 1, minY, 1, h)
    } else {
      const minX = Math.min(x1, x2), maxX = Math.max(x1, x2), w = maxX - minX
      c.fillStyle = 'rgba(12,12,24,0.8)'; c.fillRect(minX, y1 + 1, w, tw)
      c.fillStyle = 'rgba(140,160,200,0.2)'; c.fillRect(minX, y1, w, 1)
      c.fillStyle = 'rgba(100,120,160,0.15)'; c.fillRect(minX, y1 + tw + 1, w, 1)
    }
  }

  // Left vertical (up from flask)
  glassTube(lx, startY, lx, topY, true)
  // Horizontal top
  glassTube(lx, topY, rx + tw + 2, topY, false)
  // Right vertical (down)
  glassTube(rx, topY + tw + 2, rx, botY, true)

  // Rounded corners
  c.fillStyle = 'rgba(12,12,24,0.8)'
  c.fillRect(lx + 1, topY + 1, tw, tw)
  c.fillRect(rx + 1, topY + 1, tw, tw)

  // Metal joints
  for (const jy of [startY, topY, botY]) {
    c.fillStyle = '#3a3a4a'
    c.fillRect(lx - 1, jy - 1, tw + 4, 2)
  }
  c.fillStyle = '#3a3a4a'
  c.fillRect(rx - 1, topY - 1, tw + 4, 2)
  c.fillRect(rx - 1, botY - 1, tw + 4, 2)

  // Cooling coil on right descent (spirals wrapping around)
  for (let y = topY + tw + 6; y < botY - 4; y += 6) {
    const phase = Math.sin(y * 0.15 + now * 0.001)
    c.strokeStyle = 'rgba(80,130,200,0.12)'; c.lineWidth = 1
    c.beginPath()
    c.moveTo(rx - 1, y); c.quadraticCurveTo(rx + tw / 2 + 1, y + 2 + phase, rx + tw + 2, y + 3)
    c.stroke()
  }

  // Nozzle at bottom
  c.fillStyle = '#3a3a4a'; c.fillRect(rx + 1, botY, tw, 3)
  c.fillStyle = 'rgba(0,255,136,0.1)'; c.fillRect(rx + 2, botY + 2, tw - 2, 2)

  return { tw }
}

function drawTankSprite(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fillLevel: number, now: number) {
  // Tank body
  const tg = c.createLinearGradient(x, y, x, y + h)
  tg.addColorStop(0, '#333344'); tg.addColorStop(0.5, '#2a2a3a'); tg.addColorStop(1, '#222233')
  c.fillStyle = tg; c.fillRect(x, y, w, h)
  // Rim
  const rg = c.createLinearGradient(x, y - 2, x, y + 2)
  rg.addColorStop(0, '#555566'); rg.addColorStop(1, '#3a3a4a')
  c.fillStyle = rg; c.fillRect(x - 1, y - 2, w + 2, 3)
  // Inner dark
  c.fillStyle = '#0a0a14'; c.fillRect(x + 2, y + 1, w - 4, h - 3)
  // Liquid
  const fillH = (h - 5) * fillLevel
  const surfY = y + h - 2 - fillH
  if (fillH > 2) {
    const lg = c.createLinearGradient(0, surfY, 0, y + h)
    lg.addColorStop(0, 'rgba(0,255,136,0.25)'); lg.addColorStop(1, 'rgba(0,255,136,0.4)')
    c.fillStyle = lg; c.fillRect(x + 3, surfY, w - 6, fillH + 1)
    // Wave
    c.beginPath(); c.moveTo(x + 3, surfY)
    for (let sx = x + 3; sx < x + w - 3; sx += 2) c.lineTo(sx, surfY + Math.sin(sx * 0.08 + now * 0.002) * 1.2)
    c.lineTo(x + w - 3, surfY); c.strokeStyle = 'rgba(0,255,136,0.5)'; c.lineWidth = 0.8; c.stroke()
    // Glow up
    const gg = c.createLinearGradient(0, surfY - 8, 0, surfY)
    gg.addColorStop(0, 'transparent'); gg.addColorStop(1, 'rgba(0,255,136,0.04)')
    c.fillStyle = gg; c.fillRect(x + 3, surfY - 8, w - 6, 8)
    // Surface reflection
    c.fillStyle = 'rgba(255,255,255,0.03)'; c.fillRect(x + 6, surfY + 1, 14, 1.5)
  }
  // Bottom line
  c.fillStyle = '#333344'; c.fillRect(x, y + h - 2, w, 2)
  return { surfY }
}

// ─── Particle ─────────────────────────────────────────────────────────────
interface P {
  x: number; y: number; vx: number; vy: number; size: number
  type: 'stone' | 'frag' | 'steam' | 'drop' | 'bubble' | 'spark'
  color: string; life: number; phase: number
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
      const H = cv.height, now = Date.now()

      const elapsed = (now - baseRef.current.time) / 1000
      const curTotal = baseRef.current.value + elapsed * totalPerSec
      setDisplayTotal(curTotal)
      const ft = harvestThreshold > 0 ? harvestThreshold : 200
      fillRef.current += (Math.min(curTotal / ft, 1) - fillRef.current) * 0.02

      c.clearRect(0, 0, W, H)

      // ═══ LAYOUT — 5 sprites at fixed Y% ═══════════════════
      const BELT_Y = H * 0.12
      const LASER_Y = H * 0.16
      const FLASK_X = 30, FLASK_Y = H * 0.30
      const UTUBE_LX = 48, UTUBE_RX = W - 24
      const UTUBE_TOP = H * 0.26, UTUBE_BOT = H * 0.56
      const UTUBE_START = H * 0.32
      const TANK_TOP = H * 0.68, TANK_H = H * 0.26

      // ═══ BACKGROUND ═══════════════════════════════════════
      c.fillStyle = '#08080f'; c.fillRect(0, 0, W, H)

      // ═══ SPRITE 1: BELT ═══════════════════════════════════
      drawBeltSprite(c, 8, BELT_Y, W - 16, now)

      // ═══ SPRITE 2: LASER EMITTER ══════════════════════════
      drawLaserSprite(c, W - 18, LASER_Y, now)

      // ═══ SPRITE 3: FLASK + STATIV + FLAME ═════════════════
      const flask = drawFlaskSprite(c, FLASK_X, FLASK_Y, Math.min(1, fillRef.current * 2.5), now)

      // ═══ SPRITE 4: U-TUBE ═════════════════════════════════
      drawUTubeSprite(c, UTUBE_LX, UTUBE_TOP, UTUBE_RX, UTUBE_BOT, UTUBE_START, now)

      // Connection line: flask neck → U-tube left
      c.strokeStyle = 'rgba(140,160,200,0.12)'; c.lineWidth = 1
      c.setLineDash([2, 3]); c.beginPath()
      c.moveTo(FLASK_X + 4, FLASK_Y); c.lineTo(UTUBE_LX + 3, UTUBE_START)
      c.stroke(); c.setLineDash([])

      // ═══ SPRITE 5: TANK ═══════════════════════════════════
      const tank = drawTankSprite(c, 8, TANK_TOP, W - 16, TANK_H, fillRef.current, now)

      // ═══ PARTICLES on fixed paths ═════════════════════════

      // Spawn stones on belt (Path A)
      if (now - spawnRef.current.last > spawnRef.current.delay || partsRef.current.filter(p => p.type === 'stone').length === 0) {
        if (partsRef.current.length < 30) {
          partsRef.current.push({
            x: 14, y: BELT_Y - 4, vx: 0.4, vy: 0, size: 4 + Math.random() * 4,
            type: 'stone', color: '#b44dff', life: 1, phase: 0,
          })
          spawnRef.current = { last: now, delay: 2000 + Math.random() * 2000 }
        }
      }
      // Spawn bubbles in flask
      if (Math.random() < 0.025 && partsRef.current.filter(p => p.type === 'bubble').length < 5) {
        partsRef.current.push({
          x: FLASK_X + (Math.random() - 0.5) * flask.bulbR * 1.2,
          y: flask.bulbCY + flask.bulbR - 4, vx: 0, vy: -0.15 - Math.random() * 0.2,
          size: 1.5 + Math.random() * 2, type: 'bubble', color: '#00ff88', life: 1, phase: 0,
        })
      }
      // Spawn steam in U-tube left (Path C)
      if (Math.random() < 0.05 && partsRef.current.filter(p => p.type === 'steam').length < 12) {
        partsRef.current.push({
          x: UTUBE_LX + 3, y: UTUBE_START - 2,
          vx: 0, vy: -0.25 - Math.random() * 0.15, size: 2 + Math.random(),
          type: 'steam', color: '#b44dff', life: 1, phase: 0, // 0=up, 1=across, 2=down
        })
      }

      const alive: P[] = []
      for (const p of partsRef.current) {
        if (p.type === 'stone') {
          p.x += p.vx
          if (p.x >= W - 28) {
            // Hit laser → flash + frags (Path B)
            c.fillStyle = 'rgba(255,80,80,0.3)'; c.beginPath(); c.arc(p.x, LASER_Y + 6, 8, 0, Math.PI * 2); c.fill()
            for (let i = 0; i < 4; i++) {
              partsRef.current.push({
                x: p.x - 4 + Math.random() * 8, y: LASER_Y + 8,
                vx: (Math.random() - 0.5) * 0.6,
                vy: 0.3 + Math.random() * 0.4,
                size: 2 + Math.random() * 2, type: 'frag', color: '#cc7733', life: 1, phase: 0,
              })
            }
            // Sparks
            for (let i = 0; i < 3; i++) {
              partsRef.current.push({
                x: p.x, y: LASER_Y + 6, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 1.5,
                size: 2, type: 'spark', color: '#ffaa00', life: 0.4, phase: 0,
              })
            }
            continue
          }
          // Draw stone with glow
          c.beginPath(); c.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2)
          c.fillStyle = '#b44dff'; c.fill()
          c.fillStyle = 'rgba(180,77,255,0.08)'; c.beginPath(); c.arc(p.x, p.y, p.size, 0, Math.PI * 2); c.fill()
          // Highlight
          c.fillStyle = 'rgba(255,255,255,0.1)'; c.beginPath(); c.arc(p.x - 1, p.y - 1, p.size * 0.25, 0, Math.PI * 2); c.fill()

        } else if (p.type === 'frag') {
          p.y += p.vy; p.vy += 0.008; p.x += p.vx; p.vx *= 0.99
          p.life -= 0.003
          // Guide toward flask
          if (p.y > FLASK_Y - 10) p.x += (FLASK_X - p.x) * 0.03
          // Absorb in flask
          const distToFlask = Math.sqrt((p.x - FLASK_X) ** 2 + (p.y - flask.bulbCY) ** 2)
          if (distToFlask < flask.bulbR) p.life -= 0.015
          if (p.life <= 0 || p.y > flask.bulbCY + flask.bulbR + 10) continue
          // Color transition
          const t = 1 - p.life
          const r = Math.floor(204 * (1 - t) + 0 * t)
          const g = Math.floor(119 * (1 - t) + 200 * t)
          const b = Math.floor(51 * (1 - t) + 100 * t)
          c.beginPath(); c.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2)
          c.fillStyle = `rgba(${r},${g},${b},${p.life})`; c.fill()

        } else if (p.type === 'spark') {
          p.x += p.vx; p.y += p.vy; p.life -= 0.025
          if (p.life <= 0) continue
          c.globalAlpha = p.life
          c.beginPath(); c.arc(p.x, p.y, 1.5, 0, Math.PI * 2)
          c.fillStyle = p.color; c.fill()
          c.globalAlpha = 1

        } else if (p.type === 'bubble') {
          p.y += p.vy; p.x += Math.sin(now * 0.005 + p.x) * 0.08; p.life -= 0.004
          if (p.life <= 0 || p.y < flask.bulbCY - flask.bulbR + 5) continue
          c.beginPath(); c.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          c.strokeStyle = `rgba(0,255,136,${p.life * 0.25})`; c.lineWidth = 0.6; c.stroke()

        } else if (p.type === 'steam') {
          // 3-phase path through U-tube
          if (p.phase === 0) {
            // Rising in left tube
            p.y += p.vy
            p.x = UTUBE_LX + 3 + Math.sin(now * 0.003 + p.y) * 1.5
            if (p.y <= UTUBE_TOP + 4) { p.phase = 1; p.vy = 0; p.vx = 0.3 }
          } else if (p.phase === 1) {
            // Moving right across top
            p.x += p.vx
            p.y = UTUBE_TOP + 3 + Math.sin(now * 0.004 + p.x) * 1
            if (p.x >= UTUBE_RX + 3) { p.phase = 2; p.vx = 0; p.vy = 0.35 }
          } else {
            // Descending in right tube
            p.y += p.vy; p.vy += 0.004
            p.x = UTUBE_RX + 3 + Math.sin(now * 0.003 + p.y) * 1
            if (p.y >= UTUBE_BOT) {
              // Become drop (Path D)
              partsRef.current.push({
                x: UTUBE_RX + 4, y: UTUBE_BOT + 4,
                vx: (Math.random() - 0.5) * 0.2, vy: 0.3 + Math.random() * 0.2,
                size: 2.5 + Math.random(), type: 'drop', color: '#00ff88', life: 1, phase: 0,
              })
              continue
            }
          }
          // Color: purple → green
          let progress = 0
          if (p.phase === 1) progress = Math.min(1, (p.x - UTUBE_LX) / (UTUBE_RX - UTUBE_LX))
          else if (p.phase === 2) progress = 1
          const sr = Math.floor(180 * (1 - progress))
          const sg = Math.floor(77 * (1 - progress) + 255 * progress)
          const sb = Math.floor(255 * (1 - progress) + 136 * progress)
          c.beginPath(); c.arc(p.x, p.y, p.size * 0.6, 0, Math.PI * 2)
          c.fillStyle = `rgba(${sr},${sg},${sb},0.6)`; c.fill()
          // Glow at transition
          if (progress > 0.3 && progress < 0.7) {
            c.beginPath(); c.arc(p.x, p.y, p.size + 2, 0, Math.PI * 2)
            c.fillStyle = 'rgba(0,255,136,0.06)'; c.fill()
          }

        } else if (p.type === 'drop') {
          p.y += p.vy; p.vy += 0.012; p.x += p.vx
          if (p.y >= tank.surfY && fillRef.current > 0) {
            // Splash sparks
            for (let i = 0; i < 2; i++) {
              partsRef.current.push({
                x: p.x + (Math.random() - 0.5) * 6, y: tank.surfY,
                vx: (Math.random() - 0.5) * 0.6, vy: -0.4 - Math.random() * 0.3,
                size: 1.5, type: 'spark', color: '#00ff88', life: 0.3, phase: 0,
              })
            }
            p.size *= 0.2
          }
          if (p.size < 0.3 || p.y > H) continue
          // Green drop with glow
          c.beginPath(); c.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          c.fillStyle = 'rgba(0,255,136,0.8)'; c.fill()
          c.beginPath(); c.arc(p.x, p.y, p.size + 2.5, 0, Math.PI * 2)
          c.fillStyle = 'rgba(0,255,136,0.06)'; c.fill()
          // Highlight
          c.beginPath(); c.arc(p.x - 0.5, p.y - 0.5, p.size * 0.3, 0, Math.PI * 2)
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
