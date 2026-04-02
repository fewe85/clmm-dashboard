import { useState, useEffect, useRef, useMemo } from 'react'

interface Snapshot { t: string; feesUsd: number; rewardsUsd: number; posUsd: number }

interface LiveEarningsProps {
  snapshots: Snapshot[]
  pendingFees: number
  pendingRewards: number
  nextHarvestAt: string | null
  harvestThreshold: number
  positionValue: number
}

const W = 140
const FILL_TARGET = 200

function calcRate(snapshots: Snapshot[]): number {
  if (snapshots.length < 3) return 0
  const recent = snapshots.slice(-6)
  const oldest = recent[0], newest = recent[recent.length - 1]
  const hours = (new Date(newest.t).getTime() - new Date(oldest.t).getTime()) / 3_600_000
  if (hours < 1) return 0
  return Math.max(0, ((newest.feesUsd - oldest.feesUsd) + (newest.rewardsUsd - oldest.rewardsUsd)) / hours)
}

// ─── Ore Density (text only) ──────────────────────────────────────────────
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
      const dt = (h[h.length - 1].t - h[0].t) / 3_600_000
      const dv = h[h.length - 1].v - h[0].v
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

// ─── Particle types ───────────────────────────────────────────────────────
interface Rock {
  x: number; y: number; vx: number; vy: number
  size: number; rot: number; phase: 'fall' | 'belt' | 'melt' | 'drop' | 'done'
  color: string; opacity: number; shape: number[][]; beltX?: number
}

function makeShape(s: number): number[][] {
  const pts = 5 + Math.floor(Math.random() * 3)
  return Array.from({ length: pts }, (_, i) => {
    const a = (i / pts) * Math.PI * 2
    const r = s * (0.5 + Math.random() * 0.5)
    return [Math.cos(a) * r, Math.sin(a) * r]
  })
}

const ROCK_COLORS = ['#888', '#999', '#777', '#aaa', '#707070']

// ─── Main Component ───────────────────────────────────────────────────────
export function LiveEarnings({ snapshots, pendingFees, pendingRewards, nextHarvestAt, harvestThreshold, positionValue }: LiveEarningsProps) {
  const totalPerHour = useMemo(() => calcRate(snapshots), [snapshots])
  const totalPerSecond = totalPerHour / 3600

  const [displayTotal, setDisplayTotal] = useState(pendingFees + pendingRewards)
  const baseRef = useRef({ value: pendingFees + pendingRewards, time: Date.now() })
  useEffect(() => { baseRef.current = { value: pendingFees + pendingRewards, time: Date.now() } }, [pendingFees, pendingRewards])

  const [harvestSec, setHarvestSec] = useState<number | null>(null)
  useEffect(() => {
    if (!nextHarvestAt) return
    const update = () => { const ms = new Date(nextHarvestAt).getTime() - Date.now(); setHarvestSec(ms > 0 ? ms / 1000 : 0) }
    update(); const t = setInterval(update, 1000); return () => clearInterval(t)
  }, [nextHarvestAt])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rocksRef = useRef<Rock[]>([])
  const lastSpawnRef = useRef(0)
  const nextDelayRef = useRef(800)
  const fillRef = useRef(0)

  // Resize
  useEffect(() => {
    const el = containerRef.current, canvas = canvasRef.current
    if (!el || !canvas) return
    const obs = new ResizeObserver(entries => { for (const e of entries) { canvas.height = Math.floor(e.contentRect.height); canvas.width = W } })
    obs.observe(el); return () => obs.disconnect()
  }, [])

  // Animation loop
  useEffect(() => {
    if (totalPerHour <= 0) return
    let running = true
    const loop = () => {
      if (!running) return
      const canvas = canvasRef.current
      if (!canvas) { requestAnimationFrame(loop); return }
      const ctx = canvas.getContext('2d')
      if (!ctx) { requestAnimationFrame(loop); return }
      const h = canvas.height, now = Date.now()

      // Update counter
      const elapsed = (now - baseRef.current.time) / 1000
      setDisplayTotal(baseRef.current.value + elapsed * totalPerSecond)

      // Fill
      const ft = harvestThreshold > 0 ? harvestThreshold : FILL_TARGET
      fillRef.current += (Math.min((baseRef.current.value + elapsed * totalPerSecond) / ft, 1) - fillRef.current) * 0.02

      ctx.clearRect(0, 0, W, h)

      // ─── Layout zones ──────────────────────────────────────────
      // Crusher: top 15%
      // Left belt: 15%-50% (left third)
      // Processor: 50% center
      // Right drops: 50%-85% (right side)
      // Collection: bottom 15%
      const crushEnd = h * 0.15
      const procY = h * 0.48
      const collectTop = h * 0.82
      const beltLeft = 18 // x position of left belt
      const procX = W / 2
      const dropRight = W - 25 // x position of right drops

      // ─── BACKGROUND — station interior ─────────────────────────
      ctx.fillStyle = '#08080f'
      ctx.fillRect(0, 0, W, h)
      // Stars
      for (let i = 0; i < 15; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.08 + (i % 3) * 0.04})`
        ctx.beginPath()
        ctx.arc((i * 47 + 7) % (W - 8) + 4, (i * 73 + 11) % (h - 8) + 4, i % 5 === 0 ? 0.8 : 0.4, 0, Math.PI * 2)
        ctx.fill()
      }
      // Wall panels
      ctx.fillStyle = 'rgba(199,125,255,0.03)'
      ctx.fillRect(0, 0, 6, h); ctx.fillRect(W - 6, 0, 6, h)

      // ─── CRUSHER (top center) ──────────────────────────────────
      const crushPhase = Math.sin(now * 0.005)
      // Hopper
      ctx.fillStyle = '#3a3a4a'
      ctx.beginPath()
      ctx.moveTo(procX - 24, 2); ctx.lineTo(procX - 12, crushEnd - 4)
      ctx.lineTo(procX + 12, crushEnd - 4); ctx.lineTo(procX + 24, 2)
      ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#1a1a2a'
      ctx.beginPath()
      ctx.moveTo(procX - 20, 4); ctx.lineTo(procX - 10, crushEnd - 6)
      ctx.lineTo(procX + 10, crushEnd - 6); ctx.lineTo(procX + 20, 4)
      ctx.closePath(); ctx.fill()
      // Jaw
      const jaw = 2 + crushPhase * 1.5
      ctx.fillStyle = '#6a6a7a'
      ctx.fillRect(procX - jaw - 6, crushEnd - 6, 6, 4)
      ctx.fillRect(procX + jaw, crushEnd - 6, 6, 4)
      // Sparks
      if (crushPhase > 0.5) {
        ctx.fillStyle = `rgba(255,170,0,${0.4 + Math.random() * 0.3})`
        ctx.beginPath(); ctx.arc(procX + (Math.random() - 0.5) * 8, crushEnd - 3, 1.5, 0, Math.PI * 2); ctx.fill()
      }

      // ─── LEFT CONVEYOR BELT (rocks fall left, move down) ───────
      // Belt track
      ctx.fillStyle = '#2a2a3a'
      ctx.fillRect(beltLeft - 6, crushEnd + 2, 14, procY - crushEnd - 6)
      // Belt surface
      ctx.fillStyle = '#333344'
      ctx.fillRect(beltLeft - 4, crushEnd + 3, 10, procY - crushEnd - 8)
      // Moving ridges on belt
      const ridgeSpeed = (now * 0.03) % 12
      for (let ry = crushEnd + 5; ry < procY - 5; ry += 12) {
        const oy = ry + ridgeSpeed
        if (oy > procY - 5) continue
        ctx.fillStyle = 'rgba(199,125,255,0.06)'
        ctx.fillRect(beltLeft - 3, oy, 8, 2)
      }
      // Belt gears (top + bottom)
      for (const gy of [crushEnd + 2, procY - 4]) {
        ctx.beginPath(); ctx.arc(beltLeft + 1, gy, 4, 0, Math.PI * 2)
        ctx.fillStyle = '#444455'; ctx.fill()
        ctx.beginPath(); ctx.arc(beltLeft + 1, gy, 1.5, 0, Math.PI * 2)
        ctx.fillStyle = '#555566'; ctx.fill()
      }

      // ─── PROCESSOR (center, horizontal) ────────────────────────
      // Machine body — spans left to right
      ctx.fillStyle = '#3a3a4a'
      ctx.fillRect(beltLeft + 8, procY - 10, dropRight - beltLeft - 8, 22)
      ctx.fillStyle = '#444455'
      ctx.fillRect(beltLeft + 10, procY - 8, dropRight - beltLeft - 12, 4)
      // Center reactor
      const pulse = 0.5 + Math.sin(now * 0.004) * 0.3
      ctx.beginPath(); ctx.arc(procX, procY + 1, 6, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(0,255,136,${pulse * 0.4})`; ctx.fill()
      ctx.beginPath(); ctx.arc(procX, procY + 1, 3, 0, Math.PI * 2)
      ctx.fillStyle = '#00ff88'; ctx.globalAlpha = pulse; ctx.fill(); ctx.globalAlpha = 1
      // Glow
      ctx.beginPath(); ctx.arc(procX, procY + 1, 14, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(0,255,136,${pulse * 0.04})`; ctx.fill()
      // Input arrow (left)
      ctx.fillStyle = 'rgba(199,125,255,0.15)'
      ctx.beginPath(); ctx.moveTo(beltLeft + 10, procY - 2); ctx.lineTo(beltLeft + 16, procY + 1); ctx.lineTo(beltLeft + 10, procY + 4); ctx.fill()
      // Output arrow (right)
      ctx.fillStyle = 'rgba(0,255,136,0.15)'
      ctx.beginPath(); ctx.moveTo(dropRight - 2, procY - 2); ctx.lineTo(dropRight + 4, procY + 1); ctx.lineTo(dropRight - 2, procY + 4); ctx.fill()
      // Status LEDs
      ctx.fillStyle = '#00ff88'; ctx.globalAlpha = 0.4 + Math.sin(now * 0.004) * 0.3
      ctx.beginPath(); ctx.arc(procX - 14, procY - 6, 1.5, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#b44dff'
      ctx.beginPath(); ctx.arc(procX + 14, procY - 6, 1.5, 0, Math.PI * 2); ctx.fill()
      ctx.globalAlpha = 1
      // Bolts
      for (const bx of [beltLeft + 10, dropRight - 2]) {
        for (const by of [procY - 8, procY + 10]) {
          ctx.beginPath(); ctx.arc(bx, by, 1.5, 0, Math.PI * 2)
          ctx.fillStyle = '#1a1a2a'; ctx.fill()
        }
      }
      // Horizontal conveyor inside (moving dots)
      const convSpeed = (now * 0.04) % 8
      for (let cx2 = beltLeft + 18; cx2 < dropRight - 6; cx2 += 8) {
        const ox = cx2 + convSpeed
        if (ox > dropRight - 6) continue
        // Transition: grey on left, green on right
        const t = (ox - beltLeft - 18) / (dropRight - beltLeft - 24)
        const r = Math.floor(100 * (1 - t))
        const g = Math.floor(100 * (1 - t) + 255 * t)
        const b = Math.floor(80 * (1 - t) + 136 * t)
        ctx.fillStyle = `rgba(${r},${g},${b},0.3)`
        ctx.beginPath(); ctx.arc(ox, procY + 1, 2, 0, Math.PI * 2); ctx.fill()
      }

      // ─── RIGHT DROP ZONE (green drops fall) ────────────────────
      // Pipe from processor output
      ctx.fillStyle = '#2a2a3a'
      ctx.fillRect(dropRight - 4, procY + 12, 8, collectTop - procY - 14)
      ctx.fillStyle = '#1a1a2a'
      ctx.fillRect(dropRight - 2, procY + 14, 4, collectTop - procY - 18)

      // ─── COLLECTION (bottom) ───────────────────────────────────
      const collectH = h - collectTop - 4
      const fillH = collectH * fillRef.current
      const surfaceY = h - 4 - fillH
      if (fillH > 2) {
        const liqGrad = ctx.createLinearGradient(0, surfaceY, 0, h)
        liqGrad.addColorStop(0, 'rgba(0,255,136,0.25)')
        liqGrad.addColorStop(1, 'rgba(0,255,136,0.35)')
        ctx.fillStyle = liqGrad
        ctx.fillRect(8, surfaceY, W - 16, fillH + 4)
        // Wave
        ctx.beginPath(); ctx.moveTo(8, surfaceY)
        for (let x = 8; x < W - 8; x += 2) {
          ctx.lineTo(x, surfaceY + Math.sin(x * 0.08 + now * 0.002) * 1.5)
        }
        ctx.lineTo(W - 8, surfaceY); ctx.strokeStyle = 'rgba(0,255,136,0.5)'; ctx.lineWidth = 1; ctx.stroke()
        // Glow up
        const gGrad = ctx.createLinearGradient(0, surfaceY - 10, 0, surfaceY)
        gGrad.addColorStop(0, 'transparent'); gGrad.addColorStop(1, 'rgba(0,255,136,0.06)')
        ctx.fillStyle = gGrad; ctx.fillRect(8, surfaceY - 10, W - 16, 10)
      }
      // Tank walls
      ctx.fillStyle = '#2a2a3a'
      ctx.fillRect(6, collectTop, 3, collectH + 4); ctx.fillRect(W - 9, collectTop, 3, collectH + 4)
      ctx.fillRect(6, h - 4, W - 12, 3)

      // ─── PARTICLES ─────────────────────────────────────────────
      // Spawn
      if (now - lastSpawnRef.current > nextDelayRef.current || rocksRef.current.length === 0) {
        if (rocksRef.current.length < 15) {
          const size = 6 + Math.random() * 8
          rocksRef.current.push({
            x: procX + (Math.random() - 0.5) * 8,
            y: crushEnd,
            vx: -0.5 - Math.random() * 0.3, // drift left toward belt
            vy: 0.4 + Math.random() * 0.3,
            size, rot: Math.random() * Math.PI * 2,
            phase: 'fall',
            color: ROCK_COLORS[Math.floor(Math.random() * ROCK_COLORS.length)],
            opacity: 0.9, shape: makeShape(size),
          })
          lastSpawnRef.current = now
          nextDelayRef.current = 800 + Math.random() * 1200
        }
      }

      const alive: Rock[] = []
      for (const r of rocksRef.current) {
        // Phase: fall → belt → melt → drop → done
        if (r.phase === 'fall') {
          r.x += r.vx; r.y += r.vy; r.rot += 0.02
          // Reached belt?
          if (r.x <= beltLeft + 4 || r.y > crushEnd + 20) {
            r.phase = 'belt'; r.x = beltLeft + 1; r.vx = 0; r.vy = 0.5
          }
        } else if (r.phase === 'belt') {
          r.y += 0.5; r.x = beltLeft + 1 + Math.sin(r.y * 0.1) * 1 // slight wobble
          // Reached processor?
          if (r.y >= procY - 6) {
            r.phase = 'melt'; r.vy = 0; r.vx = 0.6; r.y = procY + 1
          }
        } else if (r.phase === 'melt') {
          r.x += r.vx
          // Shrink as it moves through processor
          const prog = (r.x - beltLeft) / (dropRight - beltLeft)
          r.size *= 0.995
          r.opacity = Math.max(0.2, 1 - prog * 0.8)
          // Reached output?
          if (r.x >= dropRight - 2) {
            r.phase = 'drop'; r.x = dropRight; r.vy = 0.8 + Math.random() * 0.5; r.vx = 0
            r.size = 2 + Math.random() * 2; r.color = '#00ff88'; r.opacity = 0.8
          }
        } else if (r.phase === 'drop') {
          r.y += r.vy; r.vy += 0.01
          r.x = dropRight + Math.sin(r.y * 0.05) * 2 // slight drift
          // Hit liquid?
          if (r.y > surfaceY) { r.size *= 0.85 }
          if (r.size < 0.3 || r.y > h) { r.phase = 'done'; continue }
        } else { continue }

        // Draw
        if (r.phase === 'fall' || r.phase === 'belt') {
          // Rock shape
          ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(r.rot)
          ctx.beginPath()
          ctx.moveTo(r.shape[0][0], r.shape[0][1])
          for (let i = 1; i < r.shape.length; i++) ctx.lineTo(r.shape[i][0], r.shape[i][1])
          ctx.closePath(); ctx.fillStyle = r.color; ctx.globalAlpha = r.opacity
          ctx.fill(); ctx.globalAlpha = 1; ctx.restore()
        } else if (r.phase === 'melt') {
          // Transitioning: rock → green dot
          const prog = (r.x - beltLeft) / (dropRight - beltLeft)
          const gr = Math.floor(128 * (1 - prog))
          const gg = Math.floor(128 * (1 - prog) + 255 * prog)
          const gb = Math.floor(100 * (1 - prog) + 136 * prog)
          ctx.beginPath(); ctx.arc(r.x, r.y, r.size * 0.7, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${gr},${gg},${gb},${r.opacity})`; ctx.fill()
          if (prog > 0.5) {
            ctx.beginPath(); ctx.arc(r.x, r.y, r.size + 2, 0, Math.PI * 2)
            ctx.fillStyle = `rgba(0,255,136,${(prog - 0.5) * 0.1})`; ctx.fill()
          }
        } else if (r.phase === 'drop') {
          // Green glowing drop
          ctx.beginPath(); ctx.arc(r.x, r.y, r.size, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(0,255,136,${r.opacity})`; ctx.fill()
          ctx.beginPath(); ctx.arc(r.x, r.y, r.size + 2, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(0,255,136,0.08)'; ctx.fill()
        }

        if (r.phase !== 'done') alive.push(r)
      }
      rocksRef.current = alive

      // Frame border
      ctx.strokeStyle = 'rgba(199,125,255,0.1)'; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, W - 1, h - 1)

      requestAnimationFrame(loop)
    }
    loop()
    return () => { running = false }
  }, [totalPerHour, totalPerSecond, harvestThreshold])

  if (totalPerHour <= 0) return null

  return (
    <div className="flex flex-col items-center justify-between relative" style={{ width: W, minHeight: '100%' }}>
      {/* Counter */}
      <div className="text-center z-10 flex-shrink-0 w-full py-1">
        <div className="mono text-xs font-bold neon-value" style={{ color: 'var(--lavender)' }}>
          ${displayTotal.toFixed(4)}
        </div>
        <div className="hud-label" style={{ fontSize: '7px', color: 'var(--lavender)', opacity: 0.6 }}>TOTAL EARNED</div>
      </div>

      <OreDensityMeter positionValue={positionValue} pendingTotal={pendingFees + pendingRewards} initialRate={totalPerHour} />

      {/* Canvas */}
      <div ref={containerRef} className="relative flex-1 w-full" style={{ minHeight: 280 }}>
        <canvas ref={canvasRef} width={W} height={400} className="absolute inset-0" style={{ width: '100%', height: '100%' }} />
      </div>

      {/* Stats */}
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
