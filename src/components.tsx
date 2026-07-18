import { useEffect, useRef } from 'react'

export function TrendChart({
  points,
  color = '#aef62f',
}: {
  points: { label: string; value: number }[]
  color?: string
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || points.length === 0) return
    const ratio = window.devicePixelRatio || 1
    const width = canvas.clientWidth
    const height = canvas.clientHeight
    canvas.width = width * ratio
    canvas.height = height * ratio
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.scale(ratio, ratio)
    const pad = { top: 18, right: 12, bottom: 28, left: 38 }
    const chartW = width - pad.left - pad.right
    const chartH = height - pad.top - pad.bottom
    const values = points.map((point) => point.value)
    const min = Math.min(...values)
    const max = Math.max(...values)
    const spread = Math.max(max - min, 0.1)
    const x = (index: number) =>
      pad.left + (points.length === 1 ? chartW / 2 : (index / (points.length - 1)) * chartW)
    const y = (value: number) => pad.top + chartH - ((value - min) / spread) * chartH

    ctx.strokeStyle = 'rgba(255,255,255,.09)'
    ctx.lineWidth = 1
    ctx.fillStyle = 'rgba(255,255,255,.45)'
    ctx.font = '10px ui-monospace, monospace'
    for (let i = 0; i < 3; i += 1) {
      const gridY = pad.top + (chartH * i) / 2
      ctx.beginPath()
      ctx.moveTo(pad.left, gridY)
      ctx.lineTo(width - pad.right, gridY)
      ctx.stroke()
      const value = max - (spread * i) / 2
      ctx.fillText(value.toFixed(3), 2, gridY + 3)
    }

    const gradient = ctx.createLinearGradient(0, pad.top, 0, height - pad.bottom)
    gradient.addColorStop(0, `${color}55`)
    gradient.addColorStop(1, `${color}00`)
    ctx.beginPath()
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(x(index), y(point.value))
      else ctx.lineTo(x(index), y(point.value))
    })
    ctx.lineTo(x(points.length - 1), height - pad.bottom)
    ctx.lineTo(x(0), height - pad.bottom)
    ctx.closePath()
    ctx.fillStyle = gradient
    ctx.fill()

    ctx.beginPath()
    points.forEach((point, index) => {
      if (index === 0) ctx.moveTo(x(index), y(point.value))
      else ctx.lineTo(x(index), y(point.value))
    })
    ctx.strokeStyle = color
    ctx.lineWidth = 2.5
    ctx.lineJoin = 'round'
    ctx.stroke()

    const lastIndex = points.length - 1
    ctx.beginPath()
    ctx.arc(x(lastIndex), y(points[lastIndex].value), 4, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,.55)'
    ctx.textAlign = 'center'
    ctx.fillText(points[0].label, x(0), height - 8)
    if (points.length > 1) ctx.fillText(points[lastIndex].label, x(lastIndex), height - 8)
  }, [points, color])

  return <canvas ref={canvasRef} className="trend-canvas" aria-label="VOLFORCEの推移グラフ" />
}

const donutColors: Record<string, string> = {
  'FULLCOMBO CLEAR': '#d7f7ff',
  'EX HARD CLEAR': '#ff4d78',
  'HARD CLEAR': '#ff3c54',
  'EASY CLEAR': '#74f0b6',
  CLEAR: '#63aaff',
  'ASSIST CLEAR': '#b58cff',
  FAILED: '#596073',
  'NO PLAY': '#242a38',
}

export function ClearDonut({ level, values }: { level: number; values: Record<string, number> }) {
  const total = Object.values(values).reduce((sum, value) => sum + value, 0)
  let position = 0
  const stops = Object.entries(values).map(([key, value]) => {
    const start = position
    position += total ? (value / total) * 360 : 0
    return `${donutColors[key] ?? '#8c94a6'} ${start}deg ${position}deg`
  })
  const cleared = Object.entries(values)
    .filter(([key]) => key !== 'NO PLAY' && key !== 'FAILED')
    .reduce((sum, [, value]) => sum + value, 0)

  return (
    <article className="donut-card">
      <div className="donut" style={{ background: `conic-gradient(${stops.join(',')})` }}>
        <div>
          <strong>☆{level}</strong>
          <span>{total}譜面</span>
        </div>
      </div>
      <div>
        <strong>{cleared}</strong>
        <span> CLEAR</span>
      </div>
    </article>
  )
}

export function Badge({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: string }) {
  return <span className={`badge badge-${tone}`}>{children}</span>
}
