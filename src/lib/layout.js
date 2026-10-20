import { sizes } from './sizes.svelte.js'

export const MIN_W = 96
export const MAX_W = 240
const H_GAP = 56
const V_GAP = 14
const PAD = 40
const PAD_X = 28 // node horizontal padding + border
const PAD_Y = 20 // node vertical padding + border
const LINE_H = 19
const CHAR_W = 7.6
const MIN_H = 40

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v))
}

function estimate(text) {
  const len = (text || ' ').length
  const w = clamp(len * CHAR_W + PAD_X, MIN_W, MAX_W)
  const charsPerLine = Math.max(1, Math.floor((w - PAD_X) / CHAR_W))
  const lines = Math.max(1, Math.ceil(len / charsPerLine))
  return { w, h: Math.max(MIN_H, lines * LINE_H + PAD_Y) }
}

function measure(id, text) {
  const m = sizes[id]
  if (m) return m
  return estimate(text)
}

export function computeLayout(nodes, rootId) {
  const positions = new Map()
  let cursor = 0

  if (!nodes[rootId]) {
    return { positions, bounds: { minX: 0, minY: 0, maxX: MAX_W, maxY: MIN_H } }
  }

  function visit(id, depth) {
    const node = nodes[id]
    const { w, h } = measure(id, node.text)
    const x = PAD + depth * (MAX_W + H_GAP)
    const kids = node.collapsed ? [] : node.childrenIds.filter((c) => nodes[c])
    let cy
    if (kids.length === 0) {
      cy = cursor + h / 2
      cursor += h + V_GAP
    } else {
      const centers = kids.map((c) => visit(c, depth + 1))
      cy = (centers[0] + centers[centers.length - 1]) / 2
    }
    positions.set(id, { x, y: cy - h / 2, cx: x + w / 2, cy, w, h, depth })
    return cy
  }

  visit(rootId, 0)

  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (const p of positions.values()) {
    minX = Math.min(minX, p.x)
    minY = Math.min(minY, p.y)
    maxX = Math.max(maxX, p.x + p.w)
    maxY = Math.max(maxY, p.y + p.h)
  }

  return { positions, bounds: { minX, minY, maxX, maxY } }
}

export function computeEdges(nodes, positions) {
  const edges = []
  for (const [id, p] of positions) {
    const node = nodes[id]
    if (!node || node.collapsed) continue
    for (const cid of node.childrenIds) {
      const c = positions.get(cid)
      if (!c) continue
      const x1 = p.x + p.w
      const y1 = p.cy
      const x2 = c.x
      const y2 = c.cy
      const dx = (x2 - x1) / 2
      edges.push({
        id: `${id}:${cid}`,
        cid,
        d: `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`,
      })
    }
  }
  return edges
}
