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

// ─── Pixel drawing helper ─────────────────────────────────────────────────
const PX = 3 // each pixel = 3x3 canvas pixels
function px(c: CanvasRenderingContext2D, x: number, y: number, color: string, ox = 0, oy = 0) {
  c.fillStyle = color
  c.fillRect(ox + x * PX, oy + y * PX, PX, PX)
}

// ─── Pixel art sprites (defined as [row][col] color maps) ─────────────────
// Colors: . = transparent, p = purple, P = light purple, g = green, G = light green
//         m = metal, M = light metal, d = dark, r = red, o = orange, b = blue
const C: Record<string, string> = {
  '.': '', p: '#8833cc', P: '#b44dff', q: '#d494ff',
  g: '#00cc66', G: '#00ff88', h: '#88ffbb',
  m: '#2a2a3a', M: '#444455', L: '#5a5a6a', W: '#6a6a7a',
  d: '#1a1a2a', r: '#cc2244', R: '#ff3366', o: '#cc5500', O: '#ff6b35',
  b: '#004488', B: '#0066cc', w: '#ffffff', a: 'rgba(0,255,136,0.3)',
}

// Erlenmeyer flask (12x16 pixel art)
const FLASK = [
  '....PPPP....',
  '....P..P....',
  '....P..P....',
  '...P....P...',
  '..P......P..',
  '.P........P.',
  'P..........P',
  'P..........P',
  'P..........P',
  'P..........P',
  '.P........P.',
  '..PPPPPPPP..',
]

// Condenser tube sprite (20x6)
const CONDENSER = [
  '..MMMMMMMMMMMMMMMM..',
  '.M..................M',
  'M.bBbBbBbBbBbBbBbB.M',
  'M.BbBbBbBbBbBbBbBb.M',
  '.M..................M',
  '..MMMMMMMMMMMMMMMM..',
]

// Test tube (4x10)
const TUBE = [
  'M..M',
  'MLLM',
  'M..M',
  'M..M',
  'M..M',
  'M..M',
  'M..M',
  'M..M',
  '.MM.',
  '....',
]

function drawSprite(c: CanvasRenderingContext2D, sprite: string[], ox: number, oy: number, scale = 1) {
  const s = PX * scale
  for (let row = 0; row < sprite.length; row++) {
    for (let col = 0; col < sprite[row].length; col++) {
      const ch = sprite[row][col]
      if (ch === '.' || !C[ch]) continue
      c.fillStyle = C[ch]
      c.fillRect(ox + col * s, oy + row * s, s, s)
    }
  }
}

// Particle
interface P {
  x: number; y: number; vx: number; vy: number; size: number; rot: number
  type: 'stone' | 'frag' | 'bubble' | 'drop'; shape: number[][]; t: number; life: number
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
      c.imageSmoothingEnabled = false // crispy pixels

      // ═══ LAYOUT ═══════════════════════════════════════════
      const BELT_Y = H * 0.06
      const BELT_L = 6, BELT_R = W - 6
      const LASER_X = BELT_R - 12
      const LASER_END = H * 0.18
      const FLASK_OX = CX - 18, FLASK_OY = H * 0.24
      const FLASK_W = 12 * PX, FLASK_H = 12 * PX
      const COND_OX = CX + 2, COND_OY = FLASK_OY + 5 * PX
      const TUBE_Y = H * 0.60
      const BASIN_TOP = H * 0.72
      const BASIN_H = H - BASIN_TOP - 3

      // ═══ BACKGROUND ═══════════════════════════════════════
      c.fillStyle = '#08080f'; c.fillRect(0, 0, W, H)
      // Scanline grid
      c.fillStyle = 'rgba(199,125,255,0.008)'
      for (let y = 0; y < H; y += PX) c.fillRect(0, y, W, 1)

      // ═══ 1. CONVEYOR BELT (pixel art) ═════════════════════
      // Belt body
      c.fillStyle = '#333344'
      c.fillRect(BELT_L, BELT_Y, BELT_R - BELT_L, PX * 2)
      // Moving dashes
      const dashOff = Math.floor((now * 0.02) % (PX * 4))
      c.fillStyle = '#444455'
      for (let x = BELT_L + dashOff; x < BELT_R; x += PX * 4) {
        c.fillRect(x, BELT_Y + 1, PX * 2, PX * 2 - 2)
      }
      // Rollers (pixel circles)
      for (const rx of [BELT_L + 2, BELT_R - 4]) {
        c.fillStyle = '#3a3a4a'; c.fillRect(rx, BELT_Y - 1, PX * 2, PX * 2 + 2)
        c.fillStyle = '#555566'; c.fillRect(rx + 1, BELT_Y, PX, PX)
      }

      // ═══ LASER (vertical pixel beam) ══════════════════════
      const lPulse = 0.7 + Math.sin(now * 0.005) * 0.3
      c.globalAlpha = lPulse
      // Glow
      c.fillStyle = 'rgba(255,51,102,0.06)'
      c.fillRect(LASER_X - PX * 2, BELT_Y + PX * 2 + 2, PX * 5, LASER_END - BELT_Y - PX * 2)
      // Beam pixels
      c.fillStyle = '#ff3366'
      for (let y = BELT_Y + PX * 2 + 2; y < LASER_END; y += PX) {
        c.fillRect(LASER_X, y, PX, PX)
      }
      c.fillStyle = '#ff8899'
      for (let y = BELT_Y + PX * 2 + 2; y < LASER_END; y += PX * 2) {
        c.fillRect(LASER_X, y, PX, PX) // bright every other pixel
      }
      c.globalAlpha = 1
      // Emitter pixel
      c.fillStyle = '#ff3366'; c.fillRect(LASER_X - 1, BELT_Y + PX * 2, PX + 2, PX)

      // Funnel (pixel V)
      c.fillStyle = '#444455'
      for (let i = 0; i < 5; i++) {
        px(c, 0, 0, '#444455', LASER_X - (4 - i) * PX, LASER_END + i * PX)
        px(c, 0, 0, '#444455', LASER_X + (4 - i) * PX, LASER_END + i * PX)
      }
      c.fillStyle = '#333344'
      c.fillRect(LASER_X - PX, LASER_END + 5 * PX, PX * 3, PX * 2) // funnel neck

      // ═══ 2. FLASK (pixel art sprite) ══════════════════════
      drawSprite(c, FLASK, FLASK_OX, FLASK_OY)

      // Liquid in flask (fill from bottom)
      const flkFill = Math.min(1, fillRef.current * 2.5)
      if (flkFill > 0.05) {
        const fillRows = Math.floor(8 * flkFill) // bottom 8 rows of 12
        const startRow = 11 - fillRows
        for (let row = startRow; row <= 11; row++) {
          const line = FLASK[row]
          let left = -1, right = -1
          for (let col = 0; col < line.length; col++) {
            if (line[col] !== '.') { if (left === -1) left = col; right = col }
          }
          if (left >= 0) {
            c.fillStyle = `rgba(0,255,136,${0.15 + flkFill * 0.15})`
            c.fillRect(FLASK_OX + (left + 1) * PX, FLASK_OY + row * PX, (right - left - 1) * PX, PX)
          }
        }
      }

      // Flame under flask (pixel art, animated)
      const flameFrame = Math.floor((now / 150) % 3)
      const flameOX = FLASK_OX + 3 * PX, flameOY = FLASK_OY + 12 * PX + 2
      c.fillStyle = '#ff6b35'
      if (flameFrame === 0) {
        c.fillRect(flameOX + 1 * PX, flameOY, PX, PX)
        c.fillRect(flameOX + 3 * PX, flameOY, PX, PX)
        c.fillRect(flameOX + 5 * PX, flameOY, PX, PX)
        c.fillStyle = '#ffaa00'
        c.fillRect(flameOX + 1 * PX, flameOY - PX, PX, PX)
        c.fillRect(flameOX + 3 * PX, flameOY - PX * 2, PX, PX)
        c.fillRect(flameOX + 5 * PX, flameOY - PX, PX, PX)
      } else if (flameFrame === 1) {
        c.fillRect(flameOX + 0 * PX, flameOY, PX, PX)
        c.fillRect(flameOX + 2 * PX, flameOY, PX, PX)
        c.fillRect(flameOX + 4 * PX, flameOY, PX, PX)
        c.fillStyle = '#ffaa00'
        c.fillRect(flameOX + 2 * PX, flameOY - PX, PX, PX)
        c.fillRect(flameOX + 4 * PX, flameOY - PX * 2, PX, PX)
      } else {
        c.fillRect(flameOX + 1 * PX, flameOY, PX, PX)
        c.fillRect(flameOX + 4 * PX, flameOY, PX, PX)
        c.fillStyle = '#ffaa00'
        c.fillRect(flameOX + 2 * PX, flameOY - PX * 2, PX, PX)
        c.fillRect(flameOX + 3 * PX, flameOY - PX, PX, PX)
        c.fillRect(flameOX + 5 * PX, flameOY - PX, PX, PX)
      }
      // Base plate
      c.fillStyle = '#3a3a4a'; c.fillRect(flameOX - PX, flameOY + PX, PX * 8, PX)

      // ═══ CONDENSER (pixel art, diagonal) ══════════════════
      // Draw at angle using the sprite scaled small
      const condScale = 0.7
      const condW = 20 * PX * condScale, condH = 6 * PX * condScale
      c.save()
      c.translate(COND_OX, COND_OY)
      c.rotate(0.45) // ~25 degrees diagonal
      drawSprite(c, CONDENSER, 0, 0, condScale)
      c.restore()

      // Drip nozzle at condenser end
      const dripX = COND_OX + Math.cos(0.45) * condW
      const dripY = COND_OY + Math.sin(0.45) * condW + condH / 2
      c.fillStyle = '#444455'
      c.fillRect(dripX - PX, dripY, PX * 2, PX * 2)

      // ═══ 3. TEST TUBES (pixel art) ════════════════════════
      const tubeGap = PX * 6
      const tubeScale = 1
      for (let i = 0; i < 3; i++) {
        const tx = CX - tubeGap * 1.5 + i * tubeGap + PX
        drawSprite(c, TUBE, tx, TUBE_Y, tubeScale)
        // Fill level
        const tf = [0.7, 0.45, 0.25][i] * Math.min(1, fillRef.current * 2)
        if (tf > 0) {
          const fillPx = Math.floor(6 * tf)
          c.fillStyle = `rgba(0,255,136,${0.2 + tf * 0.15})`
          c.fillRect(tx + PX, TUBE_Y + (8 - fillPx) * PX, PX * 2, fillPx * PX)
        }
      }

      // ═══ 4. BASIN (pixel art tank) ════════════════════════
      const fillH = BASIN_H * fillRef.current, surfY = H - 3 - fillH
      // Pixel walls
      c.fillStyle = '#2a2a3a'
      for (let y = BASIN_TOP; y < H - 2; y += PX) {
        c.fillRect(8, y, PX, PX); c.fillRect(W - 8 - PX, y, PX, PX)
      }
      c.fillRect(8, H - 3, W - 16, PX) // bottom
      // Rim
      c.fillStyle = '#444455'; c.fillRect(6, BASIN_TOP - PX, W - 12, PX)
      // Liquid
      if (fillH > 2) {
        c.fillStyle = `rgba(0,255,136,${0.15 + fillRef.current * 0.2})`
        c.fillRect(8 + PX, surfY, W - 16 - PX * 2, fillH + 2)
        // Pixel wave
        for (let x = 8 + PX; x < W - 8 - PX; x += PX * 2) {
          const wy = Math.sin(x * 0.06 + now * 0.002) > 0 ? -PX : 0
          c.fillStyle = 'rgba(0,255,136,0.35)'
          c.fillRect(x, surfY + wy, PX * 2, PX)
        }
        // Glow
        c.fillStyle = 'rgba(0,255,136,0.03)'
        c.fillRect(8 + PX, surfY - PX * 3, W - 16 - PX * 2, PX * 3)
      }

      // ═══ SPLASHES ═════════════════════════════════════════
      splashRef.current = splashRef.current.filter(s => {
        const age = (now - s.t) / 1000; if (age > 0.3) return false
        c.fillStyle = `rgba(0,255,136,${(1 - age * 3) * 0.4})`
        c.fillRect(s.x - PX + Math.random() * PX * 2, s.y - age * 10, PX, PX)
        c.fillRect(s.x + PX + Math.random() * PX, s.y - age * 15, PX, PX)
        return true
      })

      // ═══ PARTICLES ════════════════════════════════════════
      if (now - spawnRef.current.last > spawnRef.current.delay || partsRef.current.filter(p => p.type === 'stone').length === 0) {
        if (partsRef.current.length < 25) {
          const sz = 4 + Math.random() * 5
          partsRef.current.push({
            x: BELT_L + PX * 3, y: BELT_Y - sz,
            vx: 0.35, vy: 0, size: sz, rot: 0,
            type: 'stone', shape: mkShape(sz), t: 0, life: 1,
          })
          spawnRef.current = { last: now, delay: 2000 + Math.random() * 2000 }
        }
      }
      // Bubbles in flask
      if (Math.random() < 0.02 && partsRef.current.filter(p => p.type === 'bubble').length < 4) {
        partsRef.current.push({
          x: FLASK_OX + (3 + Math.random() * 6) * PX,
          y: FLASK_OY + 10 * PX, vx: 0, vy: -0.15 - Math.random() * 0.2,
          size: PX, rot: 0, type: 'bubble', shape: [], t: 0, life: 1,
        })
      }

      const alive: P[] = []
      for (const p of partsRef.current) {
        if (p.type === 'stone') {
          p.x += p.vx
          if (p.x >= LASER_X - 2) {
            // Flash
            c.fillStyle = 'rgba(255,100,100,0.3)'
            c.fillRect(LASER_X - PX * 3, BELT_Y + PX * 2, PX * 7, PX * 4)
            // Fragments
            for (let i = 0; i < 5; i++) {
              partsRef.current.push({
                x: LASER_X + (Math.random() - 0.5) * 8,
                y: LASER_END + 2 + Math.random() * PX * 3,
                vx: (Math.random() - 0.5) * 0.6, vy: 0.3 + Math.random() * 0.3,
                size: PX, rot: 0, type: 'frag', shape: [], t: 0.1, life: 1,
              })
            }
            continue
          }
          // Draw pixel stone
          c.fillStyle = '#b44dff'
          c.fillRect(p.x, p.y, p.size, p.size)
          c.fillStyle = '#d494ff'
          c.fillRect(p.x, p.y, PX, PX) // highlight pixel

        } else if (p.type === 'frag') {
          p.y += p.vy; p.vy += 0.006; p.x += p.vx; p.vx *= 0.99
          p.t = Math.min(1, p.t + 0.004)
          // Funnel toward flask
          if (p.y > LASER_END + PX * 6) p.x += ((FLASK_OX + 6 * PX) - p.x) * 0.03
          // Inside flask → absorb
          if (p.y > FLASK_OY + 4 * PX && Math.abs(p.x - (FLASK_OX + 6 * PX)) < PX * 4) {
            p.life -= 0.015; p.size *= 0.98
          }
          // Chance to become drop at condenser
          if (p.life <= 0) {
            if (Math.random() < 0.5) {
              partsRef.current.push({
                x: dripX, y: dripY + PX, vx: 0, vy: 0.3,
                size: PX, rot: 0, type: 'drop', shape: [], t: 1, life: 1,
              })
            }
            continue
          }
          // Draw — pixel, color transitions
          const t = p.t
          const r = Math.floor(180 * (1 - t))
          const g = Math.floor(77 * (1 - t) + 255 * t)
          const b = Math.floor(255 * (1 - t) + 136 * t)
          c.fillStyle = `rgb(${r},${g},${b})`
          c.fillRect(p.x, p.y, p.size, p.size)

        } else if (p.type === 'bubble') {
          p.y += p.vy; p.x += Math.sin(now * 0.005 + p.x) * 0.08; p.life -= 0.004
          if (p.life <= 0 || p.y < FLASK_OY + 2 * PX) continue
          c.fillStyle = `rgba(0,255,136,${p.life * 0.3})`
          c.fillRect(p.x, p.y, PX, PX)

        } else if (p.type === 'drop') {
          p.y += p.vy; p.vy += 0.012
          if (p.y >= surfY && fillH > 0) { splashRef.current.push({ x: p.x, y: surfY, t: now }); p.size *= 0.3 }
          if (p.size < 1 || p.y > H) continue
          c.fillStyle = '#00ff88'
          c.fillRect(p.x, p.y, PX, PX)
          c.fillStyle = 'rgba(0,255,136,0.15)'
          c.fillRect(p.x - PX, p.y - PX, PX * 3, PX * 3)
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
        <canvas ref={canvasRef} width={W} height={400} className="absolute inset-0" style={{ width: '100%', height: '100%', imageRendering: 'pixelated' }} />
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
