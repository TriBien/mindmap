// Measured node sizes + small shared UI state.
// Nodes report their real rendered size here; layout prefers these
// over text estimates so long/multi-line text positions correctly.

export const sizes = $state({})

export const ui = $state({ sheetHeight: 0 })

export function reportSize(id, w, h) {
  const prev = sizes[id]
  if (prev && Math.abs(prev.w - w) < 0.5 && Math.abs(prev.h - h) < 0.5) return
  sizes[id] = { w, h }
}

export function clearSize(id) {
  delete sizes[id]
}
