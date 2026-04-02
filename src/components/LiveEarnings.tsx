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

function calcRate(snapshots: Snapshot[]): number {
  if (snapshots.length < 3) return 0
  const recent = snapshots.slice(-6)
  const oldest = recent[0], newest = recent[recent.length - 1]
  const hours = (new Date(newest.t).getTime() - new Date(oldest.t).getTime()) / 3_600_000
  if (hours < 1) return 0
  return Math.max(0, ((newest.feesUsd - oldest.feesUsd) + (newest.rewardsUsd - oldest.rewardsUsd)) / hours)
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

// Particle
interface Rock {
  x: number; y: number; vx: number; vy: number; size: number; rot: number
  phase: 'pipe' | 'belt' | 'furnace' | 'drop' | 'done'
  opacity: number; shape: number[][]; glow: number
}

function makeShape(s: number): number[][] {
  const n = 5 + Math.floor(Math.random() * 3)
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2, r = s * (0.5 + Math.random() * 0.5)
    return [Math.cos(a) * r, Math.sin(a) * r]
  })
}

export function LiveEarnings({ snapshots, pendingFees, pendingRewards, nextHarvestAt, harvestThreshold, positionValue }: LiveEarningsProps) {
  const totalPerHour = useMemo(() => calcRate(snapshots), [snapshots])
  const totalPerSecond = totalPerHour / 3600

  const [displayTotal, setDisplayTotal] = useState(pendingFees + pendingRewards)
  const baseRef = useRef({ value: pendingFees + pendingRewards, time: Date.now() })
  useEffect(() => { baseRef.current = { value: pendingFees + pendingRewards, time: Date.now() } }, [pendingFees, pendingRewards])

  const [harvestSec, setHarvestSec] = useState<number | null>(null)
  useEffect(() => {
    if (!nextHarvestAt) return
    const upd = () => { const ms = new Date(nextHarvestAt).getTime() - Date.now(); setHarvestSec(ms > 0 ? ms / 1000 : 0) }
    upd(); const t = setInterval(upd, 1000); return () => clearInterval(t)
  }, [nextHarvestAt])

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rocksRef = useRef<Rock[]>([])
  const lastSpawnRef = useRef(0)
  const nextDelayRef = useRef(800)
  const fillRef = useRef(0)

  useEffect(() => {
    const el = containerRef.current, canvas = canvasRef.current
    if (!el || !canvas) return
    const obs = new ResizeObserver(entries => { for (const e of entries) { canvas.height = Math.floor(e.contentRect.height); canvas.width = W } })
    obs.observe(el); return () => obs.disconnect()
  }, [])

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

      const elapsed = (now - baseRef.current.time) / 1000
      const currentTotal = baseRef.current.value + elapsed * totalPerSecond
      setDisplayTotal(currentTotal)

      const ft = harvestThreshold > 0 ? harvestThreshold : 200
      fillRef.current += (Math.min(currentTotal / ft, 1) - fillRef.current) * 0.02

      ctx.clearRect(0, 0, W, h)

      // ─── LAYOUT ────────────────────────────────────────────────
      // Crusher + pipe: top 10%
      // Belt zone: 10%-35% (left side, rocks go down)
      // Furnace: 35%-45% (center, transformation)
      // Drop zone: 45%-55% (right side, drops fall freely)
      // Basin: 55%-100% (big collection tank)
      const cx = W / 2
      const crushEnd = h * 0.10
      const pipeBottom = h * 0.14
      const beltX = 20
      const beltTop = pipeBottom
      const beltBottom = h * 0.34
      const furnaceY = h * 0.38
      const furnaceLeft = 16
      const furnaceRight = W - 20
      const dropX = W - 26
      const basinTop = h * 0.55

      // ─── BACKGROUND ────────────────────────────────────────────
      ctx.fillStyle = '#08080f'
      ctx.fillRect(0, 0, W, h)
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = `rgba(255,255,255,${0.06 + (i % 3) * 0.04})`
        ctx.beginPath(); ctx.arc((i * 47 + 7) % (W - 6) + 3, (i * 73 + 11) % (h - 6) + 3, 0.5, 0, Math.PI * 2); ctx.fill()
      }
      ctx.fillStyle = 'rgba(199,125,255,0.025)'
      ctx.fillRect(0, 0, 5, h); ctx.fillRect(W - 5, 0, 5, h)

      // ─── CRUSHER (top center) ──────────────────────────────────
      const jaw = Math.sin(now * 0.005)
      ctx.fillStyle = '#3a3a4a'
      ctx.beginPath()
      ctx.moveTo(cx - 22, 2); ctx.lineTo(cx - 10, crushEnd); ctx.lineTo(cx + 10, crushEnd); ctx.lineTo(cx + 22, 2)
      ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#1a1a2a'
      ctx.beginPath()
      ctx.moveTo(cx - 18, 4); ctx.lineTo(cx - 8, crushEnd - 2); ctx.lineTo(cx + 8, crushEnd - 2); ctx.lineTo(cx + 18, 4)
      ctx.closePath(); ctx.fill()
      // Jaws
      ctx.fillStyle = '#6a6a7a'
      ctx.fillRect(cx - 6 - jaw, crushEnd - 4, 5, 4)
      ctx.fillRect(cx + 1 + jaw, crushEnd - 4, 5, 4)
      if (jaw > 0.5) { ctx.fillStyle = 'rgba(255,170,0,0.4)'; ctx.beginPath(); ctx.arc(cx, crushEnd - 1, 2, 0, Math.PI * 2); ctx.fill() }

      // ─── PIPE: crusher → belt (center down then left) ──────────
      // Vertical section
      ctx.fillStyle = '#2a2a3a'
      ctx.fillRect(cx - 4, crushEnd, 8, pipeBottom - crushEnd + 4)
      // Elbow
      ctx.fillRect(beltX - 2, pipeBottom, cx - beltX + 6, 6)
      // Pipe inner
      ctx.fillStyle = '#1a1a2a'
      ctx.fillRect(cx - 2, crushEnd + 2, 4, pipeBottom - crushEnd)
      ctx.fillRect(beltX, pipeBottom + 1, cx - beltX + 2, 4)

      // ─── LEFT CONVEYOR BELT (rocks move down) ──────────────────
      ctx.fillStyle = '#2a2a3a'
      ctx.fillRect(beltX - 5, beltTop + 4, 12, beltBottom - beltTop - 2)
      ctx.fillStyle = '#333344'
      ctx.fillRect(beltX - 3, beltTop + 5, 8, beltBottom - beltTop - 4)
      // Ridges
      const rSpd = (now * 0.03) % 10
      for (let ry = beltTop + 8; ry < beltBottom - 4; ry += 10) {
        const oy = ry + rSpd; if (oy > beltBottom - 4) continue
        ctx.fillStyle = 'rgba(199,125,255,0.06)'; ctx.fillRect(beltX - 2, oy, 6, 2)
      }
      // Gears
      for (const gy of [beltTop + 5, beltBottom - 2]) {
        ctx.beginPath(); ctx.arc(beltX + 1, gy, 4, 0, Math.PI * 2); ctx.fillStyle = '#444455'; ctx.fill()
        ctx.beginPath(); ctx.arc(beltX + 1, gy, 1.5, 0, Math.PI * 2); ctx.fillStyle = '#555566'; ctx.fill()
      }

      // ─── FURNACE / SMELTER (horizontal) ────────────────────────
      // Housing
      ctx.fillStyle = '#333344'
      ctx.fillRect(furnaceLeft, furnaceY - 8, furnaceRight - furnaceLeft, 20)
      // Inner chamber — heat gradient
      const heatPulse = 0.5 + Math.sin(now * 0.003) * 0.3
      const hGrad = ctx.createLinearGradient(furnaceLeft, 0, furnaceRight, 0)
      hGrad.addColorStop(0, `rgba(199,125,255,${0.06 * heatPulse})`)
      hGrad.addColorStop(0.3, `rgba(255,100,0,${0.08 * heatPulse})`)
      hGrad.addColorStop(0.6, `rgba(255,200,0,${0.06 * heatPulse})`)
      hGrad.addColorStop(1, `rgba(0,255,136,${0.08 * heatPulse})`)
      ctx.fillStyle = hGrad
      ctx.fillRect(furnaceLeft + 2, furnaceY - 6, furnaceRight - furnaceLeft - 4, 16)
      // Flame/plasma effect inside
      for (let fx = furnaceLeft + 10; fx < furnaceRight - 10; fx += 6) {
        const t = (fx - furnaceLeft) / (furnaceRight - furnaceLeft)
        const flicker = Math.sin(now * 0.008 + fx * 0.3) * 3
        const pr = Math.floor(199 * (1 - t))
        const pg = Math.floor(125 * (1 - t) + 255 * t)
        const pb = Math.floor(255 * (1 - t * 0.5) * (1 - t) + 136 * t)
        ctx.fillStyle = `rgba(${pr},${pg},${pb},${0.15 + Math.abs(flicker) * 0.03})`
        ctx.beginPath(); ctx.arc(fx, furnaceY + 2 + flicker, 3 + Math.random() * 2, 0, Math.PI * 2); ctx.fill()
      }
      // Top/bottom plates
      ctx.fillStyle = '#444455'
      ctx.fillRect(furnaceLeft, furnaceY - 9, furnaceRight - furnaceLeft, 2)
      ctx.fillRect(furnaceLeft, furnaceY + 11, furnaceRight - furnaceLeft, 2)
      // Bolts
      for (const bx of [furnaceLeft + 3, furnaceRight - 5]) {
        for (const by of [furnaceY - 8, furnaceY + 11]) {
          ctx.beginPath(); ctx.arc(bx, by, 1.5, 0, Math.PI * 2); ctx.fillStyle = '#1a1a2a'; ctx.fill()
        }
      }
      // Status LEDs
      ctx.fillStyle = '#c77dff'; ctx.globalAlpha = 0.3 + Math.sin(now * 0.004) * 0.2
      ctx.beginPath(); ctx.arc(furnaceLeft + 8, furnaceY - 6, 1.5, 0, Math.PI * 2); ctx.fill()
      ctx.fillStyle = '#00ff88'
      ctx.beginPath(); ctx.arc(furnaceRight - 8, furnaceY - 6, 1.5, 0, Math.PI * 2); ctx.fill()
      ctx.globalAlpha = 1

      // ─── DROP ZONE (right, free fall — no pipe) ────────────────
      // Just a small output nozzle at furnace exit
      ctx.fillStyle = '#2a2a3a'
      ctx.fillRect(dropX - 3, furnaceY + 11, 8, 5)
      ctx.fillStyle = '#00ff88'; ctx.globalAlpha = 0.15
      ctx.fillRect(dropX - 1, furnaceY + 14, 4, 3)
      ctx.globalAlpha = 1

      // ─── BASIN (bottom 45% — big tank) ─────────────────────────
      const basinH = h - basinTop - 3
      const fillH = basinH * fillRef.current
      const surfaceY = h - 3 - fillH
      // Tank walls
      ctx.fillStyle = '#2a2a3a'
      ctx.fillRect(6, basinTop, 3, basinH + 3); ctx.fillRect(W - 9, basinTop, 3, basinH + 3)
      ctx.fillRect(6, h - 3, W - 12, 3)
      // Tank rim
      ctx.fillStyle = '#444455'
      ctx.fillRect(5, basinTop - 2, W - 10, 3)
      if (fillH > 2) {
        const lGrad = ctx.createLinearGradient(0, surfaceY, 0, h)
        lGrad.addColorStop(0, 'rgba(0,255,136,0.3)'); lGrad.addColorStop(1, 'rgba(0,255,136,0.4)')
        ctx.fillStyle = lGrad; ctx.fillRect(9, surfaceY, W - 18, fillH + 3)
        // Wave
        ctx.beginPath(); ctx.moveTo(9, surfaceY)
        for (let x = 9; x < W - 9; x += 2) ctx.lineTo(x, surfaceY + Math.sin(x * 0.07 + now * 0.002) * 1.5 + Math.sin(x * 0.13 + now * 0.003) * 0.8)
        ctx.lineTo(W - 9, surfaceY); ctx.strokeStyle = 'rgba(0,255,136,0.5)'; ctx.lineWidth = 1; ctx.stroke()
        // Glow up
        const gGrad = ctx.createLinearGradient(0, surfaceY - 12, 0, surfaceY)
        gGrad.addColorStop(0, 'transparent'); gGrad.addColorStop(1, 'rgba(0,255,136,0.06)')
        ctx.fillStyle = gGrad; ctx.fillRect(9, surfaceY - 12, W - 18, 12)
      }

      // ─── PARTICLES ─────────────────────────────────────────────
      if (now - lastSpawnRef.current > nextDelayRef.current || rocksRef.current.length === 0) {
        if (rocksRef.current.length < 15) {
          const size = 5 + Math.random() * 6
          rocksRef.current.push({
            x: cx, y: crushEnd + 2, vx: 0, vy: 0.6, size, rot: Math.random() * Math.PI * 2,
            phase: 'pipe', opacity: 0.9, shape: makeShape(size), glow: 0,
          })
          lastSpawnRef.current = now; nextDelayRef.current = 800 + Math.random() * 1200
        }
      }

      const alive: Rock[] = []
      for (const r of rocksRef.current) {
        if (r.phase === 'pipe') {
          // Fall down center pipe, then go left through elbow
          if (r.y < pipeBottom) { r.y += r.vy }
          else { r.vx = -0.8; r.vy = 0; r.x += r.vx }
          if (r.x <= beltX + 2) { r.phase = 'belt'; r.vx = 0; r.vy = 0.4 }
        } else if (r.phase === 'belt') {
          r.y += r.vy; r.x = beltX + 1 + Math.sin(r.y * 0.1) * 0.8
          if (r.y >= beltBottom) { r.phase = 'furnace'; r.vx = 0.5; r.vy = 0; r.y = furnaceY + 2 }
        } else if (r.phase === 'furnace') {
          r.x += r.vx; r.glow = Math.min(1, r.glow + 0.008)
          r.size *= 0.998; r.rot += 0.01
          if (r.x >= dropX) {
            r.phase = 'drop'; r.vy = 0.6 + Math.random() * 0.4; r.vx = (Math.random() - 0.5) * 0.3
            r.size = 2 + Math.random() * 2; r.glow = 1; r.opacity = 0.9
          }
        } else if (r.phase === 'drop') {
          r.y += r.vy; r.vy += 0.015; r.x += r.vx
          r.x = Math.max(12, Math.min(W - 12, r.x))
          if (r.y > surfaceY) r.size *= 0.88
          if (r.size < 0.3 || r.y > h) { r.phase = 'done' as any; continue }
        } else { continue }

        // Draw
        if (r.phase === 'pipe' || r.phase === 'belt') {
          ctx.save(); ctx.translate(r.x, r.y); ctx.rotate(r.rot)
          ctx.beginPath(); ctx.moveTo(r.shape[0][0], r.shape[0][1])
          for (let i = 1; i < r.shape.length; i++) ctx.lineTo(r.shape[i][0], r.shape[i][1])
          ctx.closePath(); ctx.fillStyle = '#c77dff'; ctx.globalAlpha = r.opacity; ctx.fill(); ctx.globalAlpha = 1
          ctx.restore()
        } else if (r.phase === 'furnace') {
          const t = r.glow
          const pr = Math.floor(199 * (1 - t))
          const pg = Math.floor(125 * (1 - t) + 255 * t)
          const pb = Math.floor(255 * (1 - t) + 136 * t)
          // Rock shrinks, gets rounder, changes color
          ctx.beginPath(); ctx.arc(r.x, r.y, r.size * (0.5 + t * 0.5), 0, Math.PI * 2)
          ctx.fillStyle = `rgba(${pr},${pg},${pb},${r.opacity})`; ctx.fill()
          if (t > 0.3) {
            ctx.beginPath(); ctx.arc(r.x, r.y, r.size + 3, 0, Math.PI * 2)
            ctx.fillStyle = `rgba(0,255,136,${(t - 0.3) * 0.1})`; ctx.fill()
          }
          // Heat distortion shimmer
          if (t > 0.1 && t < 0.7) {
            ctx.fillStyle = `rgba(255,150,0,${0.15 * (1 - t)})`
            ctx.beginPath(); ctx.arc(r.x + Math.sin(now * 0.01 + r.x) * 3, r.y - 3, 2, 0, Math.PI * 2); ctx.fill()
          }
        } else if (r.phase === 'drop') {
          ctx.beginPath(); ctx.arc(r.x, r.y, r.size, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(0,255,136,${r.opacity})`; ctx.fill()
          ctx.beginPath(); ctx.arc(r.x, r.y, r.size + 2, 0, Math.PI * 2)
          ctx.fillStyle = 'rgba(0,255,136,0.08)'; ctx.fill()
        }

        if ((r.phase as string) !== 'done') alive.push(r)
      }
      rocksRef.current = alive

      ctx.strokeStyle = 'rgba(199,125,255,0.1)'; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, W - 1, h - 1)
      requestAnimationFrame(loop)
    }
    loop(); return () => { running = false }
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
