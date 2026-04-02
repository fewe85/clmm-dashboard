import { useState, useEffect, useRef, useMemo } from 'react'

interface Snapshot { t: string; feesUsd: number; rewardsUsd: number; posUsd: number }
interface LiveEarningsProps {
  snapshots: Snapshot[]; pendingFees: number; pendingRewards: number
  nextHarvestAt: string | null; harvestThreshold: number; positionValue: number
}

const W = 140, PX = 3 // pixel size

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

// ─── Pixel helpers ────────────────────────────────────────────────────────
function pxRect(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, col: string) {
  c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h)
}
function pxBelt(c: CanvasRenderingContext2D, x: number, y: number, w: number, dir: number, now: number) {
  // Belt body
  pxRect(c, x, y, w, PX * 2, '#333344')
  // Moving segments
  const off = Math.floor(((now * 0.02 * dir) % (PX * 4)) + PX * 4) % (PX * 4)
  for (let sx = 0; sx < w; sx += PX * 4) {
    const ox = sx + (dir > 0 ? off : PX * 4 - off)
    if (ox >= 0 && ox < w - PX * 2) pxRect(c, x + ox, y + 1, PX * 2, PX * 2 - 2, '#444455')
  }
  // Rollers
  for (const rx of [x + PX, x + w - PX * 2]) {
    pxRect(c, rx, y - 1, PX * 2, PX * 2 + 2, '#3a3a4a')
    pxRect(c, rx + 1, y, PX, PX, '#555566')
  }
  // Shadow
  pxRect(c, x + PX, y + PX * 2, w - PX * 2, 1, 'rgba(0,0,0,0.2)')
}

// Erlenmeyer flask sprite (12 rows) — pixel art
const FLASK_SPRITE = [
  '....pppp....',
  '....p..p....',
  '....p..p....',
  '...p....p...',
  '..p......p..',
  '.p........p.',
  'p..........p',
  'p..........p',
  'p..........p',
  'p..........p',
  '.p........p.',
  '..pppppppp..',
]
function drawFlask(c: CanvasRenderingContext2D, ox: number, oy: number) {
  for (let r = 0; r < FLASK_SPRITE.length; r++) {
    for (let col = 0; col < FLASK_SPRITE[r].length; col++) {
      if (FLASK_SPRITE[r][col] === 'p') pxRect(c, ox + col * PX, oy + r * PX, PX, PX, '#b44dff')
    }
  }
}
function flaskInnerWidth(row: number): [number, number] {
  const line = FLASK_SPRITE[row]; let l = -1, r = -1
  for (let i = 0; i < line.length; i++) if (line[i] === 'p') { if (l === -1) l = i; r = i }
  return l >= 0 ? [l + 1, r - 1] : [0, 0]
}

// Particle
interface P {
  x: number; y: number; vx: number; vy: number; size: number
  type: 'stone' | 'frag' | 'steam' | 'drop' | 'bubble' | 'spark'
  color: string; life: number
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
      c.imageSmoothingEnabled = false

      const elapsed = (now - baseRef.current.time) / 1000
      const curTotal = baseRef.current.value + elapsed * totalPerSec
      setDisplayTotal(curTotal)
      const ft = harvestThreshold > 0 ? harvestThreshold : 200
      fillRef.current += (Math.min(curTotal / ft, 1) - fillRef.current) * 0.02

      c.clearRect(0, 0, W, H)

      // ═══ LAYOUT — compact, proportional ════════════════
      const B1Y = H * 0.06
      const B1L = 6, B1R = W - 6
      const LASER_HY = H * 0.13
      const B2Y = H * 0.18
      const B2L = 6, B2R = W - 6
      const FK_SCALE = 1.5                     // Flask bigger = visual hero
      const S = FK_SCALE
      const FK_W = 12 * PX, FK_H = 12 * PX
      const FK_OX = 10, FK_OY = H * 0.30      // Flask higher, centered-left
      const FK_BOT = FK_OY + FK_H * S
      // U-Rohr — compact, thin, glassy
      const TW = PX * 2                        // Thinner tubes (2px = 6 canvas px)
      const TWALL = 1                          // 1px walls = glass-thin
      const UTOP = FK_OY - PX * 3             // Barely above flask
      const UL_X = FK_OX + 5 * PX * S         // Left tube from flask neck
      const UR_X = Math.min(W - 16, UL_X + 50) // Right tube — compact, not too far
      const UBOT_R = FK_BOT + PX * 12         // Short descent below flask
      // Platform/flame below flask
      const PLAT_Y = FK_BOT + PX * 6          // Platform under flame
      const BASIN_TOP = UBOT_R + PX * 6       // Basin right after U-tube
      const BASIN_H = H - BASIN_TOP - 3

      // ═══ BACKGROUND ═══════════════════════════════════════
      c.fillStyle = '#08080f'; c.fillRect(0, 0, W, H)
      c.fillStyle = 'rgba(199,125,255,0.006)'
      for (let y = 0; y < H; y += PX) c.fillRect(0, y, W, 1)

      // ═══ BAND 1 (→ right) ════════════════════════════════
      pxBelt(c, B1L, B1Y, B1R - B1L, 1, now)

      // ═══ SHORT LASER (only where stones fall) ═════════════
      const laserPulse = 0.6 + Math.sin(now * 0.005) * 0.35
      const laserCX = B1R - PX * 6 // centered where stones drop off
      const laserHW = PX * 5 // half-width of laser
      c.globalAlpha = laserPulse
      pxRect(c, laserCX - laserHW, LASER_HY - PX, laserHW * 2, PX * 3, 'rgba(255,51,102,0.06)')
      for (let x = laserCX - laserHW; x < laserCX + laserHW; x += PX) {
        pxRect(c, x, LASER_HY, PX, PX, '#ff3366')
      }
      for (let x = laserCX - laserHW + PX; x < laserCX + laserHW; x += PX * 2) {
        pxRect(c, x, LASER_HY, PX, PX, '#ff8899')
      }
      // Small emitters
      pxRect(c, laserCX - laserHW - PX, LASER_HY - PX, PX * 2, PX * 3, '#cc2244')
      pxRect(c, laserCX + laserHW, LASER_HY - PX, PX * 2, PX * 3, '#cc2244')
      c.globalAlpha = 1

      // ═══ BAND 2 (← left, same style as band 1) ═══════════
      pxBelt(c, B2L, B2Y, B2R - B2L, -1, now)

      // ═══ PIPE: Band 2 left end → Flask neck ═════════════
      const pipeX = B2L + PX * 3
      const pipeTop = B2Y + PX * 2 + 2
      const pipeBot = FK_OY + 2 * PX * S  // reaches flask neck
      // Outer pipe
      pxRect(c, pipeX - PX, pipeTop, PX * 3, pipeBot - pipeTop, '#3a3a4a')
      // Inner dark
      pxRect(c, pipeX, pipeTop + PX, PX, pipeBot - pipeTop - PX, '#1a1a2a')
      // Funnel mouth at top
      pxRect(c, pipeX - PX * 2, pipeTop - PX, PX * 5, PX, '#444455')
      // Small nozzle at bottom
      pxRect(c, pipeX - PX, pipeBot - PX, PX * 3, PX, '#333344')

      // ═══ FLASK (pixel art, scaled) ════════════════════════
      c.save(); c.translate(FK_OX, FK_OY); c.scale(S, S); drawFlask(c, 0, 0); c.restore()
      // Liquid fill
      const flkFill = Math.min(1, fillRef.current * 2.5)
      if (flkFill > 0.05) {
        const fillRows = Math.floor(7 * flkFill)
        for (let fi = 0; fi < fillRows; fi++) {
          const row = 11 - fi
          const [l, r] = flaskInnerWidth(row)
          if (r > l) {
            const t = fi / Math.max(1, fillRows - 1)
            const cr = Math.floor(200 * (1 - t)), cg = Math.floor(120 * (1 - t) + 255 * t), cb = Math.floor(50 * (1 - t) + 136 * t)
            pxRect(c, FK_OX + l * PX * S, FK_OY + row * PX * S, (r - l) * PX * S, PX * S, `rgba(${cr},${cg},${cb},0.35)`)
          }
        }
      }
      // Flame directly under flask
      const ff = Math.floor((now / 180) % 3)
      const fOX = FK_OX + 3 * PX * S, fOY = FK_BOT + PX
      const flames = [[[1,0],[3,0],[5,0],[1,-1],[3,-2],[5,-1]],[[0,0],[2,0],[4,0],[2,-1],[4,-2]],[[1,0],[4,0],[2,-2],[3,-1],[5,-1]]]
      for (const [dx, dy] of flames[ff]) pxRect(c, fOX + dx * PX, fOY + dy * PX, PX, PX, dy < -1 ? '#ffaa00' : '#ff6b35')
      // Platform UNDER flame
      pxRect(c, FK_OX + PX * S, PLAT_Y, 10 * PX * S, PX, '#444455')
      pxRect(c, FK_OX + PX * S, PLAT_Y + 1, 10 * PX * S, PX - 1, '#3a3a4a')
      // 2 legs
      pxRect(c, FK_OX + 2 * PX * S, PLAT_Y + PX, PX, PX * 3, '#3a3a4a')
      pxRect(c, FK_OX + 9 * PX * S, PLAT_Y + PX, PX, PX * 3, '#3a3a4a')
      pxRect(c, FK_OX + 1.5 * PX * S, PLAT_Y + PX * 4, PX * 2, PX, '#333344')
      pxRect(c, FK_OX + 8.5 * PX * S, PLAT_Y + PX * 4, PX * 2, PX, '#333344')

      // ═══ U-ROHR — thin glass tubes ═══════════════════════
      // Draw glass tube: just two thin lines (walls) with dark interior
      const drawGlassV = (x: number, y1: number, y2: number) => {
        const minY = Math.min(y1, y2), maxY = Math.max(y1, y2)
        pxRect(c, x + TWALL, minY, TW - TWALL * 2, maxY - minY, '#0c0c18') // dark interior
        pxRect(c, x, minY, TWALL, maxY - minY, 'rgba(140,160,200,0.25)') // left glass wall
        pxRect(c, x + TW - TWALL, minY, TWALL, maxY - minY, 'rgba(100,120,160,0.2)') // right glass wall
      }
      const drawGlassH = (x1: number, x2: number, y: number) => {
        const minX = Math.min(x1, x2), maxX = Math.max(x1, x2)
        pxRect(c, minX, y + TWALL, maxX - minX, TW - TWALL * 2, '#0c0c18')
        pxRect(c, minX, y, maxX - minX, TWALL, 'rgba(140,160,200,0.25)') // top glass
        pxRect(c, minX, y + TW - TWALL, maxX - minX, TWALL, 'rgba(100,120,160,0.2)') // bottom glass
      }

      // Left vertical (up from flask)
      drawGlassV(UL_X, FK_OY - PX, UTOP)
      // Horizontal top
      drawGlassH(UL_X, UR_X + TW, UTOP)
      // Right vertical (down)
      drawGlassV(UR_X, UTOP + TW, UBOT_R)

      // Smooth corners (small pixel arcs)
      pxRect(c, UL_X + TWALL, UTOP + TWALL, TW - TWALL * 2, TW - TWALL * 2, '#0c0c18')
      pxRect(c, UR_X + TWALL, UTOP + TWALL, TW - TWALL * 2, TW - TWALL * 2, '#0c0c18')

      // Cooling coil — thin S-wraps on right descending tube
      for (let y = UTOP + TW + PX * 2; y < UBOT_R - PX * 2; y += PX * 3) {
        const wave = Math.sin(y * 0.2) * 2
        // Thin line wrapping across front of tube
        c.fillStyle = 'rgba(80,120,180,0.15)'
        c.fillRect(UR_X + wave * 0.5, y, TW, 1)
        // Side bumps (subtle)
        c.fillStyle = 'rgba(80,120,180,0.12)'
        c.fillRect(UR_X - 1 + wave, y, 1, PX)
        c.fillRect(UR_X + TW - wave, y + PX, 1, PX)
      }

      // Drip nozzle (small, glass-like)
      pxRect(c, UR_X + TWALL, UBOT_R, TW - TWALL * 2, PX * 2, 'rgba(140,160,200,0.2)')
      pxRect(c, UR_X + TW / 2 - 1, UBOT_R + PX * 2, 2, PX, 'rgba(140,160,200,0.15)')

      // ═══ BASIN ════════════════════════════════════════════
      const fillH = BASIN_H * fillRef.current, surfY = H - 3 - fillH
      for (let y = BASIN_TOP; y < H - 2; y += PX) { pxRect(c, 8, y, PX, PX, '#2a2a3a'); pxRect(c, W - 8 - PX, y, PX, PX, '#2a2a3a') }
      pxRect(c, 8, H - 3, W - 16, PX, '#2a2a3a')
      pxRect(c, 6, BASIN_TOP - PX, W - 12, PX, '#444455')
      if (fillH > 2) {
        c.fillStyle = `rgba(0,255,136,${0.15 + fillRef.current * 0.2})`
        c.fillRect(8 + PX, surfY, W - 16 - PX * 2, fillH + 2)
        for (let x = 8 + PX; x < W - 8 - PX; x += PX * 2) {
          pxRect(c, x, surfY + (Math.sin(x * 0.06 + now * 0.002) > 0 ? -PX : 0), PX * 2, PX, 'rgba(0,255,136,0.35)')
        }
        pxRect(c, 8 + PX, surfY - PX * 2, W - 16 - PX * 2, PX * 2, 'rgba(0,255,136,0.02)')
      }

      // ═══ PARTICLES ════════════════════════════════════════
      // Spawn stones on band 1
      if (now - spawnRef.current.last > spawnRef.current.delay || partsRef.current.filter(p => p.type === 'stone').length === 0) {
        if (partsRef.current.length < 30) {
          partsRef.current.push({
            x: B1L + PX * 3, y: B1Y - PX * 2, vx: 0.35, vy: 0,
            size: PX * 2 + Math.floor(Math.random() * PX), type: 'stone',
            color: '#b44dff', life: 1,
          })
          spawnRef.current = { last: now, delay: 2000 + Math.random() * 2000 }
        }
      }
      // Spawn bubbles in flask
      if (Math.random() < 0.025 && partsRef.current.filter(p => p.type === 'bubble').length < 5) {
        partsRef.current.push({
          x: FK_OX + (3 + Math.random() * 5) * PX * S, y: FK_OY + 10 * PX * S,
          vx: 0, vy: -0.12 - Math.random() * 0.15, size: PX,
          type: 'bubble', color: '#00ff88', life: 1,
        })
      }
      // Spawn steam in left U-tube — dense flow
      if (Math.random() < 0.06 && partsRef.current.filter(p => p.type === 'steam').length < 12) {
        partsRef.current.push({
          x: UL_X + TWALL + Math.random() * (TW - TWALL * 2), y: FK_OY - PX,
          vx: 0, vy: -0.25 - Math.random() * 0.2, size: PX,
          type: 'steam', color: '#b44dff', life: 1,
        })
      }

      const alive: P[] = []
      for (const p of partsRef.current) {
        if (p.type === 'stone') {
          // Riding belt 1 rightward, then falling
          if (p.vy === 0) {
            p.x += p.vx
            if (p.x >= B1R - PX * 4) { p.vx = 0; p.vy = 0.3 } // fall off right end
          } else {
            p.y += p.vy; p.vy += 0.01
          }
          // Hit short laser between bands?
          if (p.vy > 0 && Math.abs(p.y - LASER_HY) < PX * 2 && p.x > laserCX - laserHW - PX * 2 && p.x < laserCX + laserHW + PX * 2) {
            pxRect(c, p.x - PX * 2, LASER_HY - PX, PX * 5, PX * 3, 'rgba(255,100,100,0.4)')
            for (let i = 0; i < 4; i++) {
              partsRef.current.push({
                x: p.x, y: LASER_HY,
                vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 0.8,
                size: PX, type: 'spark', color: '#ffaa00', life: 0.4,
              })
            }
            for (let i = 0; i < 3; i++) {
              partsRef.current.push({
                x: p.x + (Math.random() - 0.5) * PX * 3, y: LASER_HY + PX * 2,
                vx: (Math.random() - 0.5) * 0.3, vy: 0.3 + Math.random() * 0.3,
                size: PX + Math.floor(Math.random() * PX), type: 'frag',
                color: '#cc6633', life: 1,
              })
            }
            continue
          }
          if (p.y > B2Y + PX * 4) continue
          // Draw pixel stone
          pxRect(c, p.x, p.y, p.size, p.size, '#b44dff')
          pxRect(c, p.x, p.y, PX, PX, '#d494ff')

        } else if (p.type === 'frag') {
          // Falls to band 2, then rides left
          if (p.vy > 0) {
            p.y += p.vy; p.vy += 0.01
            if (p.y >= B2Y - PX) { p.vy = 0; p.vx = -0.35; p.y = B2Y - PX } // land on band 2
          } else {
            p.x += p.vx
            p.life -= 0.001
            // Color transition: orange → yellowish
            const t = Math.min(1, (1 - p.life) * 3)
            const r = Math.floor(204 * (1 - t * 0.3))
            const g = Math.floor(102 * (1 - t * 0.3) + 150 * t)
            const b = Math.floor(51 + 50 * t)
            p.color = `rgb(${r},${g},${b})`
            // Reached left end → fall into pipe → flask
            if (p.x <= B2L + PX * 5) {
              p.vx = 0; p.vy = 0.4; p.x = pipeX
            }
          }
          // Inside pipe → funnel to center of flask
          if (p.vy > 0 && p.y > pipeBot - PX * 2) {
            p.x += ((FK_OX + 6 * PX * S) - p.x) * 0.05
          }
          // Below flask neck → absorb into liquid
          if (p.vy > 0 && p.y > FK_OY + 4 * PX * S && Math.abs(p.x - (FK_OX + 6 * PX * S)) < FK_W * S * 0.5) {
            p.life -= 0.025
          }
          if (p.y > FK_OY + FK_H * S + PX * 2 || p.life <= 0) continue
          pxRect(c, p.x, p.y, p.size, p.size, p.color)

        } else if (p.type === 'spark') {
          p.x += p.vx; p.y += p.vy; p.life -= 0.02
          if (p.life <= 0) continue
          c.globalAlpha = p.life
          pxRect(c, p.x, p.y, PX, PX, p.color)
          c.globalAlpha = 1

        } else if (p.type === 'bubble') {
          p.y += p.vy; p.x += Math.sin(now * 0.005 + p.x) * 0.06; p.life -= 0.004
          if (p.life <= 0 || p.y < FK_OY + 2 * PX * S) continue
          pxRect(c, p.x, p.y, PX, PX, `rgba(0,255,136,${p.life * 0.3})`)

        } else if (p.type === 'steam') {
          // Phase 1: rise in left tube
          if (p.vx === 0 && p.vy < 0) {
            p.y += p.vy; p.x = UL_X + TWALL + Math.sin(now * 0.003 + p.y) * (TW * 0.15)
            if (p.y <= UTOP + TW) { p.vy = 0; p.vx = 0.3 } // switch to horizontal
          }
          // Phase 2: move right across top
          else if (p.vx > 0 && p.vy === 0) {
            p.x += p.vx
            p.y = UTOP + TWALL + Math.sin(now * 0.004 + p.x) * (TW * 0.1)
            if (p.x >= UR_X + TWALL) { p.vx = 0; p.vy = 0.35 } // switch to descend
          }
          // Phase 3: descend in right tube (now as green condensed liquid)
          else if (p.vy > 0) {
            p.y += p.vy; p.vy += 0.005
            p.x = UR_X + TWALL + Math.sin(now * 0.003 + p.y) * (TW * 0.1)
            // Reached bottom → become free-falling drop
            if (p.y >= UBOT_R) {
              partsRef.current.push({
                x: UR_X + TW / 2, y: UBOT_R + PX * 2,
                vx: 0, vy: 0.3 + Math.random() * 0.2, size: PX,
                type: 'drop', color: '#00ff88', life: 1,
              })
              continue
            }
          }
          // Color: purple (left) → transition at top → green (right)
          let progress = 0
          if (p.vx > 0) progress = Math.min(1, (p.x - UL_X) / (UR_X - UL_X))
          else if (p.vy > 0) progress = 1 // fully green in right tube
          const sr = Math.floor(180 * (1 - progress))
          const sg = Math.floor(77 * (1 - progress) + 255 * progress)
          const sb = Math.floor(255 * (1 - progress) + 136 * progress)
          c.globalAlpha = 0.6
          pxRect(c, p.x, p.y, PX, PX, `rgb(${sr},${sg},${sb})`)
          // Glow at transition point (top of U)
          if (progress > 0.3 && progress < 0.7) {
            pxRect(c, p.x - PX, p.y - PX, PX * 3, PX * 3, `rgba(0,255,136,0.06)`)
          }
          c.globalAlpha = 1

        } else if (p.type === 'drop') {
          p.y += p.vy; p.vy += 0.012
          if (p.y >= surfY && fillH > 0) {
            // Splash pixel
            for (let i = 0; i < 2; i++) {
              partsRef.current.push({
                x: p.x + (Math.random() - 0.5) * PX * 3, y: surfY,
                vx: (Math.random() - 0.5) * 0.8, vy: -0.5 - Math.random() * 0.3,
                size: PX, type: 'spark', color: '#00ff88', life: 0.3,
              })
            }
            p.size *= 0.2
          }
          if (p.size < 1 || p.y > H) continue
          pxRect(c, p.x, p.y, PX, PX + 1, '#00ff88') // slightly tall = teardrop
          pxRect(c, p.x - PX, p.y - PX, PX * 3, PX * 3, 'rgba(0,255,136,0.04)') // glow
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
        <canvas ref={canvasRef} width={W} height={400} className="absolute inset-0"
          style={{ width: '100%', height: '100%', imageRendering: 'pixelated' }} />
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
