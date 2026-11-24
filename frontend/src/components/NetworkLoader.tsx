import { useEffect, useRef } from 'react'

interface NetworkLoaderProps {
  /** Visible caption under the globe; also its accessible name. */
  readonly label?: string
  /** Working (pulsing, rotating, bright) or at rest (dim and still). Changing it eases between the two. */
  readonly active?: boolean
  /** Fade the loader out (the parent unmounts it afterwards). */
  readonly leaving?: boolean
  readonly className?: string
}

const NODE_COUNT = 72
const LINK_DISTANCE = 0.62          // on a unit sphere
const PERIOD_MS = 2600              // one expand/contract cycle
const PULSE = 0.06                  // ±6 % radius
const SPIN_RAD_PER_MS = 0.00028

type Vec = readonly [number, number, number]

/** Evenly spread points on a unit sphere, and the links between close pairs. Computed once. */
function buildGraph() {
  const nodes: Vec[] = []
  const golden = Math.PI * (3 - Math.sqrt(5))
  for (let i = 0; i < NODE_COUNT; i++) {
    const y = 1 - (i / (NODE_COUNT - 1)) * 2
    const r = Math.sqrt(1 - y * y)
    nodes.push([Math.cos(golden * i) * r, y, Math.sin(golden * i) * r])
  }
  const links: [number, number][] = []
  for (let a = 0; a < nodes.length; a++) {
    for (let b = a + 1; b < nodes.length; b++) {
      if (Math.hypot(nodes[a][0] - nodes[b][0], nodes[a][1] - nodes[b][1], nodes[a][2] - nodes[b][2]) < LINK_DISTANCE) links.push([a, b])
    }
  }
  return { nodes, links }
}
const GRAPH = buildGraph()

function parseColor(value: string): [number, number, number] {
  const probe = document.createElement('canvas').getContext('2d')
  if (!probe) return [96, 165, 250]
  probe.fillStyle = '#000'
  probe.fillStyle = value
  const hex = probe.fillStyle as string
  if (hex.startsWith('#') && hex.length === 7) return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
  const m = hex.match(/\d+/g)
  return m && m.length >= 3 ? [Number(m[0]), Number(m[1]), Number(m[2])] : [96, 165, 250]
}

/**
 * A blue particle globe drawn on a canvas: pulsing and rotating while `active`, dim and still at rest.
 * Theme-aware (reads --accent / --bg), pauses when the tab is hidden, honors
 * prefers-reduced-motion (never moves), stops its frame loop entirely at rest, and costs ~70 nodes + ~200 lines per frame.
 */
export function NetworkLoader({ label = 'Loading…', active = true, leaving = false, className = '' }: NetworkLoaderProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const targetEnergy = useRef(active ? 1 : 0)
  const wake = useRef<() => void>(() => {})
  useEffect(() => {
    targetEnergy.current = active ? 1 : 0
    wake.current()           // restart the frame loop if it had settled at rest
  }, [active])

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
    let size = 0
    let dpr = 1
    let raf = 0
    let colorKey = ''
    let rgb: [number, number, number] = [96, 165, 250]
    let dark = true
    let glow: HTMLCanvasElement | null = null
    let frames = 0
    // energy: 0 = at rest (dim, still), 1 = working. Eased toward the target so mode changes aren't abrupt.
    let energy = targetEnergy.current
    let yaw = 0.6
    let phase = 0
    let last = 0

    function refreshTheme() {
      const css = getComputedStyle(canvas!)
      const accent = css.getPropertyValue('--accent').trim() || '#60a5fa'
      const bg = css.getPropertyValue('--bg').trim() || '#0f141b'
      if (accent + bg === colorKey) return
      colorKey = accent + bg
      rgb = parseColor(accent)
      const [br, bgc, bb] = parseColor(bg)
      dark = (br * 299 + bgc * 587 + bb * 114) / 1000 < 128
      // Pre-rendered soft dot, stamped per node: far cheaper than shadowBlur.
      const g = document.createElement('canvas')
      g.width = g.height = 64
      const gc = g.getContext('2d')
      if (gc) {
        const grad = gc.createRadialGradient(32, 32, 0, 32, 32, 32)
        grad.addColorStop(0, `rgba(${rgb.join(',')},1)`)
        grad.addColorStop(0.25, `rgba(${rgb.join(',')},0.55)`)
        grad.addColorStop(1, `rgba(${rgb.join(',')},0)`)
        gc.fillStyle = grad
        gc.fillRect(0, 0, 64, 64)
      }
      glow = g
    }

    function resize() {
      const w = canvas!.clientWidth
      if (!w) return
      dpr = Math.min(window.devicePixelRatio || 1, 2)
      size = w
      canvas!.width = Math.round(w * dpr)
      canvas!.height = Math.round(w * dpr)
    }

    /** Advance the animation clock by the time since the last frame; returns true while still moving. */
    function step(now: number) {
      const dt = last ? Math.min(now - last, 100) : 16
      last = now
      const target = targetEnergy.current
      energy += (target - energy) * (1 - Math.exp(-dt / 350))
      if (Math.abs(target - energy) < 0.003) energy = target
      if (!reduced) {
        yaw += dt * SPIN_RAD_PER_MS * energy
        phase += (dt / PERIOD_MS) * Math.PI * 2 * energy
      }
      return energy !== 0 || target !== 0
    }

    function draw() {
      if (!size || !ctx) return
      if (++frames % 60 === 0) refreshTheme()   // pick up a theme switch without reading styles every frame
      const pulse = 1 + (reduced ? 0 : PULSE * energy * Math.sin(phase))
      const bright = 0.45 + 0.55 * energy
      const tilt = 0.38
      const cy = Math.cos(yaw), sy = Math.sin(yaw), ct = Math.cos(tilt), st = Math.sin(tilt)
      const radius = size * 0.36 * pulse
      const c = size / 2
      const [r, g, b] = rgb

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, size, size)

      // Core halo.
      const halo = ctx.createRadialGradient(c, c, 0, c, c, radius * 1.5)
      halo.addColorStop(0, `rgba(${r},${g},${b},${(dark ? 0.2 : 0.12) * bright})`)
      halo.addColorStop(1, `rgba(${r},${g},${b},0)`)
      ctx.fillStyle = halo
      ctx.fillRect(0, 0, size, size)

      ctx.globalCompositeOperation = dark ? 'lighter' : 'source-over'
      const pts = GRAPH.nodes.map(([x, y, z]) => {
        const x1 = x * cy + z * sy
        const z1 = -x * sy + z * cy
        const y2 = y * ct - z1 * st
        const z2 = y * st + z1 * ct
        const persp = 1 / (1 - z2 * 0.35)
        return { x: c + x1 * radius * persp, y: c + y2 * radius * persp, depth: (z2 + 1) / 2 }
      })

      ctx.lineWidth = 0.8
      for (const [a, bIdx] of GRAPH.links) {
        const p = pts[a], q = pts[bIdx]
        const alpha = (0.1 + 0.4 * ((p.depth + q.depth) / 2)) * (dark ? 1 : 0.9) * bright
        ctx.strokeStyle = `rgba(${r},${g},${b},${alpha})`
        ctx.beginPath()
        ctx.moveTo(p.x, p.y)
        ctx.lineTo(q.x, q.y)
        ctx.stroke()
      }
      for (const p of pts) {
        const s = (3 + 7 * p.depth) * (size / 220)
        ctx.globalAlpha = (0.35 + 0.65 * p.depth) * bright
        if (glow) ctx.drawImage(glow, p.x - s, p.y - s, s * 2, s * 2)
        ctx.globalAlpha = 1
      }
      ctx.globalCompositeOperation = 'source-over'
    }

    function frame(now: number) {
      const moving = step(now)
      draw()
      // At rest there is nothing to animate: stop the loop entirely (zero CPU) until `active` flips.
      raf = moving ? requestAnimationFrame(frame) : 0
      if (!moving) last = 0
    }
    function start() {
      if (raf) return
      raf = requestAnimationFrame(frame)
    }
    function stop() {
      cancelAnimationFrame(raf)
      raf = 0
    }
    function onVisibility() {
      if (document.hidden) stop()
      else start()
    }

    resize()
    refreshTheme()
    draw()
    wake.current = start
    start()
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { resize(); draw() }) : null
    ro?.observe(canvas)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      wake.current = () => {}
      stop()
      ro?.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return (
    <div className={`net-loader ${leaving ? 'net-loader--leaving' : ''} ${active ? '' : 'net-loader--idle'} ${className}`.replace(/\s+/g, ' ').trim()} role="status">
      <canvas ref={canvasRef} className="net-loader__canvas" aria-hidden="true" />
      <span className="net-loader__label">{label}</span>
    </div>
  )
}
