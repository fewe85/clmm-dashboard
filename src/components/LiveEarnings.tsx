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

// ─── Sprite functions ─────────────────────────────────────────────────────

function drawBelt(c: CanvasRenderingContext2D, y: number, dir: number, now: number) {
  const x = 8, w = W - 16
  const g = c.createLinearGradient(0, y, 0, y + 8)
  g.addColorStop(0, '#4a4a5a'); g.addColorStop(0.5, '#3a3a4a'); g.addColorStop(1, '#2a2a3a')
  c.fillStyle = g; c.fillRect(x, y, w, 8)
  c.fillStyle = 'rgba(255,255,255,0.03)'; c.fillRect(x + 2, y, w - 4, 1)
  const off = ((now * 0.025 * dir) % 12 + 12) % 12
  c.fillStyle = 'rgba(199,125,255,0.04)'
  for (let sx = 0; sx < w; sx += 12) { const ox = (sx + off) % w; if (ox < w - 6) c.fillRect(x + ox, y + 2, 6, 4) }
  c.fillStyle = 'rgba(0,0,0,0.15)'; c.fillRect(x + 3, y + 8, w - 6, 2)
  for (const rx of [x + 4, x + w - 4]) {
    const rg = c.createRadialGradient(rx - 1, y + 3, 0, rx, y + 4, 4)
    rg.addColorStop(0, '#5a5a6a'); rg.addColorStop(1, '#2a2a3a')
    c.beginPath(); c.arc(rx, y + 4, 4, 0, Math.PI * 2); c.fillStyle = rg; c.fill()
    c.strokeStyle = 'rgba(199,125,255,0.08)'; c.lineWidth = 0.5; c.stroke()
    c.beginPath(); c.arc(rx, y + 4, 1.5, 0, Math.PI * 2); c.fillStyle = '#555566'; c.fill()
  }
}

function drawLaser(c: CanvasRenderingContext2D, x: number, y: number, now: number) {
  const pulse = 0.6 + Math.sin(now * 0.005) * 0.35
  // Emitter
  const eg = c.createLinearGradient(x, y, x + 10, y)
  eg.addColorStop(0, '#3a3a4a'); eg.addColorStop(1, '#4a4a5a')
  c.fillStyle = eg; c.fillRect(x, y - 4, 10, 10)
  c.strokeStyle = 'rgba(199,125,255,0.08)'; c.lineWidth = 0.5; c.strokeRect(x, y - 4, 10, 10)
  // LED
  c.beginPath(); c.arc(x + 5, y - 2, 1.5, 0, Math.PI * 2)
  c.fillStyle = `rgba(255,51,102,${0.4 + pulse * 0.6})`; c.fill()
  // Beam
  c.globalAlpha = pulse
  c.fillStyle = 'rgba(255,51,102,0.05)'; c.fillRect(x - 28, y - 3, 28, 8)
  c.fillStyle = '#ff3366'; c.fillRect(x - 26, y, 26, 2)
  c.fillStyle = '#ff8899'; c.fillRect(x - 24, y + 0.5, 22, 1)
  c.globalAlpha = 1
}

function drawFlask(c: CanvasRenderingContext2D, cx: number, topY: number, fill: number, now: number) {
  const nW = 14, nH = 20, bR = 40, bCY = topY + nH + bR * 0.55
  // Neck
  const ng = c.createLinearGradient(cx - nW / 2, 0, cx + nW / 2, 0)
  ng.addColorStop(0, 'rgba(140,160,200,0.14)'); ng.addColorStop(0.5, 'rgba(200,220,255,0.06)'); ng.addColorStop(1, 'rgba(100,120,160,0.1)')
  c.fillStyle = ng; c.fillRect(cx - nW / 2, topY, nW, nH)
  // Bulb
  c.beginPath(); c.arc(cx, bCY, bR, 0, Math.PI * 2)
  const bg = c.createRadialGradient(cx - 6, bCY - 6, 0, cx, bCY, bR)
  bg.addColorStop(0, 'rgba(200,220,255,0.05)'); bg.addColorStop(0.7, 'rgba(140,160,200,0.02)'); bg.addColorStop(1, 'rgba(100,120,160,0.08)')
  c.fillStyle = bg; c.fill()
  c.strokeStyle = 'rgba(140,160,200,0.18)'; c.lineWidth = 1.2; c.stroke()
  // Highlight
  c.beginPath(); c.arc(cx - 9, bCY - 9, 5, 0, Math.PI * 2)
  c.fillStyle = 'rgba(255,255,255,0.025)'; c.fill()
  // Liquid
  if (fill > 0.05) {
    const lH = bR * 1.6 * fill, lTop = bCY + bR - lH
    c.save(); c.beginPath(); c.arc(cx, bCY, bR - 1.5, 0, Math.PI * 2); c.clip()
    const lg = c.createLinearGradient(0, lTop, 0, bCY + bR)
    lg.addColorStop(0, 'rgba(0,255,136,0.18)'); lg.addColorStop(1, 'rgba(0,255,136,0.35)')
    c.fillStyle = lg; c.fillRect(cx - bR, lTop, bR * 2, lH + 4)
    c.beginPath()
    for (let sx = cx - bR + 3; sx < cx + bR - 3; sx += 2) {
      const wy = lTop + Math.sin(sx * 0.1 + now * 0.003) * 1
      if (sx === cx - bR + 3) c.moveTo(sx, wy); else c.lineTo(sx, wy)
    }
    c.strokeStyle = 'rgba(0,255,136,0.35)'; c.lineWidth = 0.7; c.stroke()
    c.restore()
  }
  c.beginPath(); c.arc(cx, bCY, bR * 0.35, 0, Math.PI * 2)
  c.fillStyle = `rgba(0,255,136,${0.015 + Math.sin(now * 0.003) * 0.01})`; c.fill()

  // Tripod
  const tY = bCY + bR + 2
  c.fillStyle = '#444455'; c.fillRect(cx - 18, tY, 36, 2)
  c.fillStyle = 'rgba(255,255,255,0.02)'; c.fillRect(cx - 17, tY, 34, 1)
  for (const lx of [-16, 0, 14]) {
    c.fillStyle = '#3a3a4a'; c.fillRect(cx + lx, tY + 2, 2, 8)
    c.fillStyle = '#333344'; c.fillRect(cx + lx - 1, tY + 9, 4, 2)
  }
  // Flame — purple core, green tips, bigger
  // Glow halo
  c.beginPath(); c.arc(cx, tY - 6, 16, 0, Math.PI * 2)
  c.fillStyle = `rgba(180,77,255,${0.03 + Math.sin(now * 0.004) * 0.015})`; c.fill()
  for (let i = 0; i < 5; i++) {
    const fx = cx - 12 + i * 6, fh = 7 + Math.sin(now * 0.011 + i * 1.3) * 3
    c.globalAlpha = 0.45 + Math.sin(now * 0.013 + i) * 0.2
    // Outer flame — green tips
    c.fillStyle = '#00ff88'
    c.beginPath(); c.moveTo(fx - 3, tY); c.lineTo(fx, tY - fh); c.lineTo(fx + 3, tY); c.fill()
    // Inner flame — purple core
    c.fillStyle = '#b44dff'
    c.beginPath(); c.moveTo(fx - 1.5, tY); c.lineTo(fx, tY - fh * 0.6); c.lineTo(fx + 1.5, tY); c.fill()
    // Bright center
    c.fillStyle = '#d494ff'
    c.beginPath(); c.moveTo(fx - 0.8, tY); c.lineTo(fx, tY - fh * 0.3); c.lineTo(fx + 0.8, tY); c.fill()
  }
  c.globalAlpha = 1
  return { bCY, bR, topY }
}

function drawUTube(c: CanvasRenderingContext2D, lx: number, rx: number, topY: number, startY: number, botY: number, _now: number) {
  const tw = 6 // tube inner width
  const glass = (x1: number, y1: number, x2: number, y2: number, vert: boolean) => {
    if (vert) {
      const minY = Math.min(y1, y2), h = Math.abs(y2 - y1)
      c.fillStyle = 'rgba(10,10,20,0.7)'; c.fillRect(x1 + 1, minY, tw, h)
      const wg = c.createLinearGradient(x1, 0, x1 + tw + 2, 0)
      wg.addColorStop(0, 'rgba(140,160,200,0.18)'); wg.addColorStop(0.5, 'rgba(180,200,230,0.04)'); wg.addColorStop(1, 'rgba(100,120,160,0.12)')
      c.fillStyle = wg; c.fillRect(x1, minY, 1, h); c.fillRect(x1 + tw + 1, minY, 1, h)
    } else {
      const minX = Math.min(x1, x2), w = Math.abs(x2 - x1)
      c.fillStyle = 'rgba(10,10,20,0.7)'; c.fillRect(minX, y1 + 1, w, tw)
      c.fillStyle = 'rgba(140,160,200,0.18)'; c.fillRect(minX, y1, w, 1)
      c.fillStyle = 'rgba(100,120,160,0.12)'; c.fillRect(minX, y1 + tw + 1, w, 1)
    }
  }
  // Left vertical (up to near top)
  const arcR = 10 // bend radius
  glass(lx, startY, lx, topY + arcR, true)
  // Right vertical (down from near top)
  glass(rx, topY + arcR, rx, botY, true)
  // Horizontal middle (between arcs)
  glass(lx + arcR, topY, rx - arcR + tw + 2, topY, false)

  // Rounded bend — LEFT corner (going from up→right)
  c.strokeStyle = 'rgba(140,160,200,0.18)'; c.lineWidth = 1
  // Outer arc
  c.beginPath(); c.arc(lx + arcR, topY + arcR, arcR, Math.PI, Math.PI * 1.5); c.stroke()
  // Inner arc
  c.strokeStyle = 'rgba(100,120,160,0.12)'
  c.beginPath(); c.arc(lx + arcR, topY + arcR, arcR - tw, Math.PI, Math.PI * 1.5); c.stroke()
  // Fill bend interior
  c.fillStyle = 'rgba(10,10,20,0.7)'
  c.beginPath(); c.arc(lx + arcR, topY + arcR, arcR - 1, Math.PI, Math.PI * 1.5)
  c.arc(lx + arcR, topY + arcR, arcR - tw + 1, Math.PI * 1.5, Math.PI, true)
  c.closePath(); c.fill()

  // Rounded bend — RIGHT corner (going from right→down)
  c.strokeStyle = 'rgba(140,160,200,0.18)'; c.lineWidth = 1
  c.beginPath(); c.arc(rx + tw + 2 - arcR, topY + arcR, arcR, Math.PI * 1.5, Math.PI * 2); c.stroke()
  c.strokeStyle = 'rgba(100,120,160,0.12)'
  c.beginPath(); c.arc(rx + tw + 2 - arcR, topY + arcR, arcR - tw, Math.PI * 1.5, Math.PI * 2); c.stroke()
  c.fillStyle = 'rgba(10,10,20,0.7)'
  c.beginPath(); c.arc(rx + tw + 2 - arcR, topY + arcR, arcR - 1, Math.PI * 1.5, Math.PI * 2)
  c.arc(rx + tw + 2 - arcR, topY + arcR, arcR - tw + 1, Math.PI * 2, Math.PI * 1.5, true)
  c.closePath(); c.fill()

  // Metal joints at start and end
  for (const [jx, jy] of [[lx, startY], [rx, botY]] as [number, number][]) {
    c.fillStyle = '#3a3a4a'; c.fillRect(jx - 1, jy - 1, tw + 4, 3)
  }
  // Cooling coil — continuous S-wave wrapping the right tube
  c.strokeStyle = 'rgba(0,204,255,0.15)'; c.lineWidth = 1.2
  c.beginPath()
  let first = true
  for (let y = topY + tw + 6; y < botY - 4; y += 5) {
    const xOff = Math.sin(y * 0.3) * 4 // oscillates left-right of tube
    const px = rx + tw / 2 + 1 + xOff
    if (first) { c.moveTo(px, y); first = false } else c.lineTo(px, y)
  }
  c.stroke()
  // Nozzle
  c.fillStyle = '#3a3a4a'; c.fillRect(rx + 1, botY, tw, 3)
  c.fillStyle = 'rgba(0,255,136,0.08)'; c.fillRect(rx + 2, botY + 2, tw - 2, 2)
  return { tw, lx, rx }
}

function drawTank(c: CanvasRenderingContext2D, y: number, h: number, fill: number, now: number) {
  const x = 8, w = W - 16
  const tg = c.createLinearGradient(x, y, x, y + h)
  tg.addColorStop(0, '#333344'); tg.addColorStop(0.5, '#2a2a3a'); tg.addColorStop(1, '#222233')
  c.fillStyle = tg; c.fillRect(x, y, w, h)
  const rg = c.createLinearGradient(0, y - 2, 0, y + 2)
  rg.addColorStop(0, '#555566'); rg.addColorStop(1, '#3a3a4a')
  c.fillStyle = rg; c.fillRect(x - 1, y - 2, w + 2, 3)
  c.fillStyle = '#0a0a14'; c.fillRect(x + 2, y + 1, w - 4, h - 3)
  const fH = (h - 5) * fill, sY = y + h - 2 - fH
  if (fH > 2) {
    const lg = c.createLinearGradient(0, sY, 0, y + h)
    lg.addColorStop(0, 'rgba(0,255,136,0.22)'); lg.addColorStop(1, 'rgba(0,255,136,0.38)')
    c.fillStyle = lg; c.fillRect(x + 3, sY, w - 6, fH + 1)
    c.beginPath(); c.moveTo(x + 3, sY)
    for (let sx = x + 3; sx < x + w - 3; sx += 2) c.lineTo(sx, sY + Math.sin(sx * 0.08 + now * 0.002) * 1.2)
    c.lineTo(x + w - 3, sY); c.strokeStyle = 'rgba(0,255,136,0.45)'; c.lineWidth = 0.7; c.stroke()
    const gg = c.createLinearGradient(0, sY - 6, 0, sY)
    gg.addColorStop(0, 'transparent'); gg.addColorStop(1, 'rgba(0,255,136,0.04)')
    c.fillStyle = gg; c.fillRect(x + 3, sY - 6, w - 6, 6)
    c.fillStyle = 'rgba(255,255,255,0.025)'; c.fillRect(x + 6, sY + 1, 14, 1)
  }
  c.fillStyle = '#333344'; c.fillRect(x, y + h - 2, w, 2)
  return { surfY: sY }
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
      fillRef.current += (Math.min(curTotal / (harvestThreshold > 0 ? harvestThreshold : 200), 1) - fillRef.current) * 0.02
      c.clearRect(0, 0, W, H)

      // ═══ FIXED Y POSITIONS ════════════════════════════════
      const B1Y = H * 0.08          // Band 1
      const LASER_RX = W - 18       // Laser emitter X
      const LASER_Y = H * 0.15      // Laser Y
      const B2Y = H * 0.19          // Band 2
      const FUNNEL_X = 18           // Funnel X (left end of band 2)
      const FUNNEL_Y = H * 0.27     // Funnel Y
      const FK_CX = 30              // Flask center X (left side)
      const FK_TOP = H * 0.40       // Flask neck top
      // U-tube ∩ shape: starts from right side of flask, goes UP, across, DOWN
      const UT_LX = FK_CX + 22      // Left tube X (right side of flask)
      const UT_RX = W - 22          // Right tube X
      const UT_TOP = H * 0.30       // Top of ∩ (ABOVE flask)
      const UT_START = H * 0.48     // Where tube exits flask (right side, mid-bulb)
      const UT_BOT = H * 0.64       // Bottom of right descent
      const TANK_Y = H * 0.72       // Tank top
      const TANK_H = H * 0.24       // Tank height

      // ═══ BACKGROUND ═══════════════════════════════════════
      c.fillStyle = '#08080f'; c.fillRect(0, 0, W, H)

      // ═══ SPRITES ══════════════════════════════════════════
      drawBelt(c, B1Y, 1, now)         // Band 1 → right
      drawLaser(c, LASER_RX, LASER_Y, now) // Laser emitter
      drawBelt(c, B2Y, -1, now)        // Band 2 ← left

      // Funnel (catches fragments from band 2 left end)
      c.fillStyle = '#3a3a4a'
      c.beginPath(); c.moveTo(FUNNEL_X - 10, FUNNEL_Y); c.lineTo(FUNNEL_X, FUNNEL_Y + 10); c.lineTo(FUNNEL_X + 10, FUNNEL_Y); c.fill()
      c.fillStyle = '#1a1a2a'
      c.beginPath(); c.moveTo(FUNNEL_X - 7, FUNNEL_Y + 1); c.lineTo(FUNNEL_X, FUNNEL_Y + 8); c.lineTo(FUNNEL_X + 7, FUNNEL_Y + 1); c.fill()
      // DIAGONAL pipe from funnel → flask neck (goes left-down to flask)
      c.strokeStyle = '#3a3a4a'; c.lineWidth = 4
      c.beginPath(); c.moveTo(FUNNEL_X, FUNNEL_Y + 10); c.lineTo(FK_CX, FK_TOP); c.stroke()
      c.strokeStyle = '#1a1a2a'; c.lineWidth = 2
      c.beginPath(); c.moveTo(FUNNEL_X, FUNNEL_Y + 11); c.lineTo(FK_CX, FK_TOP + 1); c.stroke()

      // Wall shelf / platform for flask
      const flask = drawFlask(c, FK_CX, FK_TOP, Math.min(1, fillRef.current * 2.5), now)
      const shelfY = flask.bCY + flask.bR + 24 // below tripod feet
      const shelfW = W * 0.55
      // Shelf surface
      const sg = c.createLinearGradient(0, shelfY, 0, shelfY + 4)
      sg.addColorStop(0, '#4a4a5a'); sg.addColorStop(1, '#333344')
      c.fillStyle = sg; c.fillRect(0, shelfY, shelfW, 4)
      c.fillStyle = 'rgba(255,255,255,0.03)'; c.fillRect(2, shelfY, shelfW - 4, 1)
      // Shadow under shelf
      c.fillStyle = 'rgba(0,0,0,0.15)'; c.fillRect(2, shelfY + 4, shelfW - 4, 2)
      // Wall brackets (2 angled supports)
      for (const bx of [6, shelfW - 10]) {
        c.fillStyle = '#3a3a4a'
        c.beginPath(); c.moveTo(bx, shelfY + 4); c.lineTo(bx, shelfY + 12); c.lineTo(0, shelfY + 12); c.lineTo(0, shelfY + 10); c.lineTo(bx - 3, shelfY + 4); c.closePath(); c.fill()
      }

      // Connection: flask right side → U-tube left start (short horizontal)
      c.fillStyle = '#3a3a4a'; c.fillRect(FK_CX + flask.bR - 2, UT_START - 2, UT_LX - FK_CX - flask.bR + 4, 4)
      c.fillStyle = '#1a1a2a'; c.fillRect(FK_CX + flask.bR, UT_START - 1, UT_LX - FK_CX - flask.bR + 2, 2)

      drawUTube(c, UT_LX, UT_RX, UT_TOP, UT_START, UT_BOT, now)
      const tank = drawTank(c, TANK_Y, TANK_H, fillRef.current, now)

      // ═══ PARTICLES ════════════════════════════════════════

      // Path A: Stones on belt 1
      if (now - spawnRef.current.last > spawnRef.current.delay || partsRef.current.filter(p => p.type === 'stone').length === 0) {
        if (partsRef.current.length < 40) {
          partsRef.current.push({
            x: 14, y: B1Y - 3, vx: 0.4, vy: 0, size: 4 + Math.random() * 4,
            type: 'stone', color: '#b44dff', life: 1, phase: 0,
          })
          spawnRef.current = { last: now, delay: 2000 + Math.random() * 2000 }
        }
      }
      // Bubbles in flask
      if (Math.random() < 0.025 && partsRef.current.filter(p => p.type === 'bubble').length < 5) {
        partsRef.current.push({
          x: FK_CX + (Math.random() - 0.5) * flask.bR, y: flask.bCY + flask.bR - 4,
          vx: 0, vy: -0.15 - Math.random() * 0.2, size: 1.5 + Math.random() * 2,
          type: 'bubble', color: '#00ff88', life: 1, phase: 0,
        })
      }
      // Path E: Steam in U-tube
      if (Math.random() < 0.05 && partsRef.current.filter(p => p.type === 'steam').length < 12) {
        partsRef.current.push({
          x: UT_LX + 4, y: UT_START, vx: 0, vy: -0.25 - Math.random() * 0.15,
          size: 2 + Math.random(), type: 'steam', color: '#b44dff', life: 1, phase: 0,
        })
      }

      const alive: P[] = []
      for (const p of partsRef.current) {
        if (p.type === 'stone') {
          // Path A: ride belt 1 right
          p.x += p.vx
          if (p.x >= W - 30) {
            // Laser hit → Path B: fragments
            c.fillStyle = 'rgba(255,80,80,0.3)'; c.beginPath(); c.arc(W - 26, LASER_Y, 8, 0, Math.PI * 2); c.fill()
            for (let i = 0; i < 4; i++) {
              partsRef.current.push({
                x: W - 26 + (Math.random() - 0.5) * 6, y: LASER_Y + 4,
                vx: (Math.random() - 0.5) * 0.5, vy: 0.2 + Math.random() * 0.3,
                size: 2 + Math.random() * 2, type: 'frag', color: '#cc7733', life: 1, phase: 0,
              })
            }
            for (let i = 0; i < 3; i++) partsRef.current.push({
              x: W - 26, y: LASER_Y, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 1.5,
              size: 2, type: 'spark', color: '#ffaa00', life: 0.4, phase: 0,
            })
            continue
          }
          c.beginPath(); c.arc(p.x, p.y, p.size / 2, 0, Math.PI * 2)
          c.fillStyle = '#b44dff'; c.fill()
          c.fillStyle = 'rgba(180,77,255,0.06)'; c.beginPath(); c.arc(p.x, p.y, p.size, 0, Math.PI * 2); c.fill()
          c.fillStyle = 'rgba(255,255,255,0.08)'; c.beginPath(); c.arc(p.x - 1, p.y - 1, p.size * 0.25, 0, Math.PI * 2); c.fill()

        } else if (p.type === 'frag') {
          // Path B→C: fall to band 2, ride left, fall to flask
          if (p.phase === 0) {
            p.y += p.vy; p.vy += 0.008
            if (p.y >= B2Y - 2) { p.phase = 1; p.vy = 0; p.vx = -0.4; p.y = B2Y - 3 }
          } else if (p.phase === 1) {
            p.x += p.vx
            if (p.x <= FUNNEL_X + 2) { p.phase = 2; p.vx = 0; p.vy = 0.5; p.x = FUNNEL_X }
          } else {
            // Path D: fall diagonally through pipe into flask
            p.y += p.vy; p.vy += 0.008
            // Follow diagonal pipe toward flask center
            const pipeProgress = Math.min(1, (p.y - FUNNEL_Y) / (FK_TOP - FUNNEL_Y))
            p.x = FUNNEL_X + (FK_CX - FUNNEL_X) * pipeProgress
            const dist = Math.sqrt((p.x - FK_CX) ** 2 + (p.y - flask.bCY) ** 2)
            if (dist < flask.bR) p.life -= 0.02
          }
          if (p.life <= 0 || p.y > flask.bCY + flask.bR + 10) continue
          const t = 1 - p.life
          c.beginPath(); c.arc(p.x, p.y, p.size * 0.4, 0, Math.PI * 2)
          c.fillStyle = `rgba(${Math.floor(200 * (1 - t))},${Math.floor(130 * (1 - t) + 200 * t)},${Math.floor(50 + 80 * t)},${p.life})`; c.fill()

        } else if (p.type === 'spark') {
          p.x += p.vx; p.y += p.vy; p.life -= 0.025
          if (p.life <= 0) continue
          c.globalAlpha = p.life
          c.beginPath(); c.arc(p.x, p.y, 1.5, 0, Math.PI * 2); c.fillStyle = p.color; c.fill()
          c.globalAlpha = 1

        } else if (p.type === 'bubble') {
          p.y += p.vy; p.x += Math.sin(now * 0.005 + p.x) * 0.08; p.life -= 0.004
          if (p.life <= 0 || p.y < flask.bCY - flask.bR + 5) continue
          c.beginPath(); c.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          c.strokeStyle = `rgba(0,255,136,${p.life * 0.2})`; c.lineWidth = 0.6; c.stroke()

        } else if (p.type === 'steam') {
          // Path E: 3-phase through U-tube
          if (p.phase === 0) { // rise left
            p.y += p.vy; p.x = UT_LX + 4 + Math.sin(now * 0.003 + p.y) * 1.5
            if (p.y <= UT_TOP + 4) { p.phase = 1; p.vy = 0; p.vx = 0.3 }
          } else if (p.phase === 1) { // across top
            p.x += p.vx; p.y = UT_TOP + 4 + Math.sin(now * 0.004 + p.x) * 1
            if (p.x >= UT_RX + 4) { p.phase = 2; p.vx = 0; p.vy = 0.3 }
          } else { // descend right
            p.y += p.vy; p.vy += 0.004; p.x = UT_RX + 4 + Math.sin(now * 0.003 + p.y) * 1
            if (p.y >= UT_BOT) {
              // Path F: become drop
              partsRef.current.push({
                x: UT_RX + 5, y: UT_BOT + 5, vx: (Math.random() - 0.5) * 0.15, vy: 0.3 + Math.random() * 0.2,
                size: 2.5 + Math.random(), type: 'drop', color: '#00ff88', life: 1, phase: 0,
              })
              continue
            }
          }
          let prog = 0
          if (p.phase === 1) prog = Math.min(1, (p.x - UT_LX) / (UT_RX - UT_LX))
          else if (p.phase === 2) prog = 1
          const sr = Math.floor(180 * (1 - prog)), sg = Math.floor(77 * (1 - prog) + 255 * prog), sb = Math.floor(255 * (1 - prog) + 136 * prog)
          c.beginPath(); c.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2)
          c.fillStyle = `rgba(${sr},${sg},${sb},0.55)`; c.fill()
          if (prog > 0.3 && prog < 0.7) {
            c.beginPath(); c.arc(p.x, p.y, p.size + 2, 0, Math.PI * 2)
            c.fillStyle = 'rgba(0,255,136,0.05)'; c.fill()
          }

        } else if (p.type === 'drop') {
          // Path F: fall into tank
          p.y += p.vy; p.vy += 0.012; p.x += p.vx
          if (p.y >= tank.surfY && fillRef.current > 0) {
            for (let i = 0; i < 2; i++) partsRef.current.push({
              x: p.x + (Math.random() - 0.5) * 6, y: tank.surfY,
              vx: (Math.random() - 0.5) * 0.6, vy: -0.4 - Math.random() * 0.3,
              size: 1.5, type: 'spark', color: '#00ff88', life: 0.3, phase: 0,
            })
            p.size *= 0.15
          }
          if (p.size < 0.3 || p.y > H) continue
          c.beginPath(); c.arc(p.x, p.y, p.size, 0, Math.PI * 2)
          c.fillStyle = 'rgba(0,255,136,0.75)'; c.fill()
          c.beginPath(); c.arc(p.x, p.y, p.size + 2, 0, Math.PI * 2)
          c.fillStyle = 'rgba(0,255,136,0.05)'; c.fill()
          c.beginPath(); c.arc(p.x - 0.4, p.y - 0.4, p.size * 0.3, 0, Math.PI * 2)
          c.fillStyle = 'rgba(255,255,255,0.12)'; c.fill()
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
