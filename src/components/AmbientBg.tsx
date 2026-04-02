import { useEffect, useRef } from 'react'

interface AmbientBgProps {
  profit: number
}

/** Cyberpunk dot-grid with occasional data streams */
export function AmbientBg({ profit }: AmbientBgProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let animId = 0
    let w = 0, h = 0

    interface Stream {
      x: number; y: number; speed: number; length: number; alpha: number; hue: string
    }
    const streams: Stream[] = []
    const MAX_STREAMS = 6

    function resize() {
      w = canvas!.width = window.innerWidth
      h = canvas!.height = window.innerHeight
    }

    function spawnStream() {
      if (streams.length >= MAX_STREAMS) return
      const horizontal = Math.random() > 0.3
      const hues = ['255, 170, 0', '57, 255, 20', '194, 74, 255']
      const hue = hues[Math.floor(Math.random() * hues.length)]
      if (horizontal) {
        streams.push({
          x: -100,
          y: Math.random() * h,
          speed: 3 + Math.random() * 5,
          length: 60 + Math.random() * 120,
          alpha: 0.06 + Math.random() * 0.08,
          hue,
        })
      } else {
        streams.push({
          x: Math.random() * w,
          y: -100,
          speed: 2 + Math.random() * 4,
          length: 40 + Math.random() * 80,
          alpha: 0.05 + Math.random() * 0.06,
          hue,
        })
      }
    }

    function draw() {
      ctx!.clearRect(0, 0, w, h)

      // Dot grid
      const spacing = 40
      const dotAlpha = 0.06
      const t = Date.now() / 1000
      for (let x = spacing; x < w; x += spacing) {
        for (let y = spacing; y < h; y += spacing) {
          // Subtle wave
          const wave = Math.sin(x * 0.01 + t * 0.5) * Math.cos(y * 0.01 + t * 0.3) * 0.03
          ctx!.beginPath()
          ctx!.arc(x, y, 0.6, 0, Math.PI * 2)
          ctx!.fillStyle = `rgba(255, 170, 0, ${dotAlpha + wave})`
          ctx!.fill()
        }
      }

      // Data streams
      if (Math.random() < 0.008) spawnStream()

      for (let i = streams.length - 1; i >= 0; i--) {
        const s = streams[i]
        const isHorizontal = s.y > 0 && s.x <= 0 || s.speed > 3

        if (isHorizontal) {
          s.x += s.speed
          const grad = ctx!.createLinearGradient(s.x - s.length, s.y, s.x, s.y)
          grad.addColorStop(0, `rgba(${s.hue}, 0)`)
          grad.addColorStop(1, `rgba(${s.hue}, ${s.alpha})`)
          ctx!.strokeStyle = grad
          ctx!.lineWidth = 1
          ctx!.beginPath()
          ctx!.moveTo(s.x - s.length, s.y)
          ctx!.lineTo(s.x, s.y)
          ctx!.stroke()
          if (s.x - s.length > w) streams.splice(i, 1)
        } else {
          s.y += s.speed
          const grad = ctx!.createLinearGradient(s.x, s.y - s.length, s.x, s.y)
          grad.addColorStop(0, `rgba(${s.hue}, 0)`)
          grad.addColorStop(1, `rgba(${s.hue}, ${s.alpha})`)
          ctx!.strokeStyle = grad
          ctx!.lineWidth = 1
          ctx!.beginPath()
          ctx!.moveTo(s.x, s.y - s.length)
          ctx!.lineTo(s.x, s.y)
          ctx!.stroke()
          if (s.y - s.length > h) streams.splice(i, 1)
        }
      }

      // Vignette — profit-reactive
      const intensity = Math.min(Math.abs(profit) / 50, 1) * 0.25
      const hue = profit >= 0 ? '255, 208, 0' : '255, 42, 109'
      const grad = ctx!.createRadialGradient(w / 2, h * 0.3, 0, w / 2, h * 0.3, w * 0.7)
      grad.addColorStop(0, `rgba(${hue}, ${0.02 * intensity})`)
      grad.addColorStop(1, 'transparent')
      ctx!.fillStyle = grad
      ctx!.fillRect(0, 0, w, h)

      animId = requestAnimationFrame(draw)
    }

    resize()
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
