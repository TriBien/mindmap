<script>
  import { map, select, branchColor } from './store.svelte.js'
  import { computeLayout, computeEdges } from './layout.js'
  import { gestures } from './gestures.js'
  import { ui } from './sizes.svelte.js'
  import Node from './Node.svelte'

  let el = $state(null)
  let tx = $state(0)
  let ty = $state(0)
  let scale = $state(1)

  const layout = $derived(computeLayout(map.nodes, map.rootId))
  const edges = $derived(computeEdges(map.nodes, layout.positions))
  const nodeList = $derived(
    [...layout.positions.entries()].map(([id, pos]) => ({ id, pos })),
  )

  const transform = $derived(`translate(${tx}px, ${ty}px) scale(${scale})`)

  const pointers = new Map()
  let panStart = null
  let pinchStart = null
  let lastTapBg = 0

  function screenToWorld(cx, cy) {
    const r = el.getBoundingClientRect()
    return { x: (cx - r.left - tx) / scale, y: (cy - r.top - ty) / scale }
  }

  function onPointerDown(e) {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
    gestures.moved = false

    if (pointers.size === 1) {
      panStart = { x: e.clientX, y: e.clientY, tx, ty, id: e.pointerId }
      pinchStart = null
    } else if (pointers.size === 2) {
      el.setPointerCapture(e.pointerId)
      const [a, b] = [...pointers.values()]
      pinchStart = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        cx: (a.x + b.x) / 2,
        cy: (a.y + b.y) / 2,
        tx,
        ty,
        scale,
      }
      panStart = null
    }
  }

  function onPointerMove(e) {
    if (!pointers.has(e.pointerId)) return
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.size >= 2 && pinchStart) {
      gestures.moved = true
      const [a, b] = [...pointers.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      const cx = (a.x + b.x) / 2
      const cy = (a.y + b.y) / 2
      const factor = dist / (pinchStart.dist || 1)
      const next = clamp(pinchStart.scale * factor, 0.25, 2.5)
      const r = el.getBoundingClientRect()
      // keep world point under pinch center fixed
      const wx = (pinchStart.cx - r.left - pinchStart.tx) / pinchStart.scale
      const wy = (pinchStart.cy - r.top - pinchStart.ty) / pinchStart.scale
      scale = next
      tx = cx - r.left - wx * next
      ty = cy - r.top - wy * next
    } else if (panStart) {
      const dx = e.clientX - panStart.x
      const dy = e.clientY - panStart.y
      if (!gestures.moved && Math.hypot(dx, dy) > 4) {
        gestures.moved = true
        // capture only once a pan actually starts, so taps still reach nodes
        el.setPointerCapture(panStart.id)
      }
      if (gestures.moved) {
        tx = panStart.tx + dx
        ty = panStart.ty + dy
      }
    }
  }

  function onPointerUp(e) {
    pointers.delete(e.pointerId)
    if (pointers.size < 2) pinchStart = null
    if (pointers.size === 0) {
      const wasTap = !gestures.moved
      panStart = null
      if (wasTap && !e.target.closest('.node')) onBackgroundTap(e)
    } else if (pointers.size === 1) {
      const [a] = [...pointers.values()]
      panStart = { x: a.x, y: a.y, tx, ty, id: e.pointerId }
    }
  }

  function onBackgroundTap(e) {
    const now = Date.now()
    if (now - lastTapBg < 350) {
      centerOnTap(e.clientX, e.clientY)
      lastTapBg = 0
    } else {
      select(null)
      lastTapBg = now
    }
  }

  function centerOnTap(cx, cy) {
    const w = screenToWorld(cx, cy)
    const r = el.getBoundingClientRect()
    tx = r.width / 2 - w.x * scale
    ty = r.height / 2 - w.y * scale
  }

  function onWheel(e) {
    e.preventDefault()
    const factor = Math.exp(-e.deltaY * 0.0015)
    const next = clamp(scale * factor, 0.25, 2.5)
    const r = el.getBoundingClientRect()
    const wx = (e.clientX - r.left - tx) / scale
    const wy = (e.clientY - r.top - ty) / scale
    scale = next
    tx = e.clientX - r.left - wx * next
    ty = e.clientY - r.top - wy * next
  }

  export function zoom(factor) {
    if (!el) return
    const r = el.getBoundingClientRect()
    const cx = r.width / 2
    const cy = r.height / 2
    const next = clamp(scale * factor, 0.25, 2.5)
    const wx = (cx - tx) / scale
    const wy = (cy - ty) / scale
    scale = next
    tx = cx - wx * next
    ty = cy - wy * next
  }

  export function fit() {
    const b = layout.bounds
    if (!el) return
    const r = el.getBoundingClientRect()
    const pad = 48
    const bw = b.maxX - b.minX
    const bh = b.maxY - b.minY
    const next = clamp(Math.min((r.width - pad * 2) / bw, (r.height - pad * 2) / bh), 0.25, 1.2)
    scale = next
    tx = r.width / 2 - ((b.minX + b.maxX) / 2) * next
    ty = r.height / 2 - ((b.minY + b.maxY) / 2) * next
  }

  // Pan minimally so a node sits inside the free area above the
  // editor sheet / toolbar. No-op if it's already visible.
  export function ensureVisible(id) {
    const p = layout.positions.get(id)
    if (!p || !el) return
    const r = el.getBoundingClientRect()
    const pad = 16
    const bottom = r.height - (ui.sheetHeight || 0) - 88 // sheet + toolbar
    const left = p.x * scale + tx
    const right = (p.x + p.w) * scale + tx
    const top = p.y * scale + ty
    const bot = (p.y + p.h) * scale + ty

    if (right - left > r.width - pad * 2) return // too wide; fit() handles it
    if (left < pad) tx += pad - left
    else if (right > r.width - pad) tx -= right - (r.width - pad)
    if (top < pad) ty += pad - top
    else if (bot > bottom) ty -= bot - bottom
  }

  function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v))
  }
</script>

<div
  class="canvas"
  bind:this={el}
  onpointerdown={onPointerDown}
  onpointermove={onPointerMove}
  onpointerup={onPointerUp}
  onpointercancel={onPointerUp}
  onwheel={onWheel}
  role="application"
  aria-label="Mind map canvas"
>
  <div class="world" style:transform={transform}>
    <svg class="edges" aria-hidden="true">
      {#each edges as edge (edge.id)}
        <path d={edge.d} class="edge" style:--c={branchColor(edge.cid)} />
      {/each}
    </svg>
    {#each nodeList as n (n.id)}
      <Node id={n.id} pos={n.pos} />
    {/each}
  </div>
</div>

<style>
  .canvas {
    position: absolute;
    inset: 0;
    overflow: hidden;
    touch-action: none;
    cursor: grab;
    background:
      radial-gradient(circle, var(--dot) 1px, transparent 1px) 0 0 / 24px 24px;
  }

  .canvas:active {
    cursor: grabbing;
  }

  .world {
    position: absolute;
    top: 0;
    left: 0;
    transform-origin: 0 0;
    will-change: transform;
  }

  .edges {
    position: absolute;
    top: 0;
    left: 0;
    width: 1px;
    height: 1px;
    overflow: visible;
    pointer-events: none;
  }

  .edge {
    fill: none;
    stroke: var(--c, var(--border-strong));
    stroke-width: 1.75;
    opacity: 0.65;
  }
</style>
