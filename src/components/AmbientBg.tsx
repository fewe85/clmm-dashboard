import { useEffect, useRef } from 'react'

interface AmbientBgProps {
  /** Net profit — positive = green tint, negative = red tint */
  profit: number
}

/** Floating particle field that subtly shifts hue based on P&L */
export function AmbientBg({ profit }: AmbientBgProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId = 0
    let w = 0, h = 0

    const particles: { x: number; y: number; vx: number; vy: number; r: number; alpha: number; drift: number }[] = []
    const COUNT = 40

    function resize() {
      w = canvas!.width = window.innerWidth
      h = canvas!.height = window.innerHeight
    }

    function init() {
      resize()
      particles.length = 0
      for (let i = 0; i < COUNT; i++) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.15,
          vy: -0.05 - Math.random() * 0.15, // drift upward
          r: 1 + Math.random() * 2,
          alpha: 0.05 + Math.random() * 0.12,
          drift: Math.random() * Math.PI * 2,
        })
      }
    }

    function draw() {
      ctx!.clearRect(0, 0, w, h)

      // Hue: green when profit > 0, red when < 0, neutral when ~0
      const intensity = Math.min(Math.abs(profit) / 50, 1) * 0.4
      const hue = profit >= 0 ? '34, 197, 94' : '239, 68, 68'

      const t = Date.now() / 1000
      for (const p of particles) {
        p.x += p.vx + Math.sin(t * 0.3 + p.drift) * 0.08
        p.y += p.vy
        // wrap
        if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w }
        if (p.x < -10) p.x = w + 10
        if (p.x > w + 10) p.x = -10

        ctx!.beginPath()
        ctx!.arc(p.x, p.y, p.r, 0, Math.PI * 2)
        ctx!.fillStyle = `rgba(${hue}, ${p.alpha * intensity})`
        ctx!.fill()
      }

      // Subtle radial vignette glow at center-top
      const grad = ctx!.createRadialGradient(w / 2, 0, 0, w / 2, 0, w * 0.6)
      grad.addColorStop(0, `rgba(${hue}, ${0.03 * intensity})`)
      grad.addColorStop(1, 'transparent')
      ctx!.fillStyle = grad
      ctx!.fillRect(0, 0, w, h)

      animId = requestAnimationFrame(draw)
    }

    init()
    draw()
    window.addEventListener('resize', resize)
    return () => {
      cancelAnimationFrame(animId)
      window.removeEventListener('resize', resize)
    }
  }, [profit])

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: 0 }}
    />
  )
}
