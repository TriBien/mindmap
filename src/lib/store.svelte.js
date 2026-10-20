const STORAGE_KEY = 'mindmap.v1'
const PALETTE = [
  '#6366f1',
  '#ec4899',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#ef4444',
  '#14b8a6',
]

function createId() {
  return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4)
}

function makeNode(text, parentId = null) {
  return { id: createId(), text, parentId, childrenIds: [], collapsed: false }
}

function seed() {
  const root = makeNode('My Map')
  const nodes = { [root.id]: root }
  for (const t of ['Ideas', 'Tasks', 'Notes']) {
    const n = makeNode(t, root.id)
    nodes[n.id] = n
    root.childrenIds.push(n.id)
  }
  return { nodes, rootId: root.id }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      if (data?.rootId && data.nodes?.[data.rootId]) return data
    }
  } catch {
    // fall through to seed
  }
  return seed()
}

const initial = load()

export const map = $state({
  nodes: initial.nodes,
  rootId: initial.rootId,
  selectedId: initial.rootId,
  editingId: null,
})

export function save() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ nodes: map.nodes, rootId: map.rootId }),
    )
  } catch {
    // storage full or unavailable — ignore
  }
}

export function select(id) {
  map.selectedId = id
}

export function startEdit(id) {
  if (!map.nodes[id]) return
  map.selectedId = id
  map.editingId = id
}

export function stopEdit(text) {
  const id = map.editingId
  map.editingId = null
  if (!id) return
  const node = map.nodes[id]
  if (!node) return
  const t = text.trim()
  if (!t) {
    // empty on a brand-new node → discard it; empty on an
    // existing node → keep its previous text (destructive-free)
    if (!node.text && node.childrenIds.length === 0 && node.parentId) {
      removeNode(id)
    }
  } else {
    node.text = t
  }
}

export function cancelEdit() {
  const id = map.editingId
  map.editingId = null
  const node = id ? map.nodes[id] : null
  if (node && !node.text && node.childrenIds.length === 0 && node.parentId) {
    removeNode(id)
  }
}

export function addChild(parentId) {
  const parent = map.nodes[parentId]
  if (!parent) return
  if (parent.collapsed) parent.collapsed = false
  const node = makeNode('', parentId)
  map.nodes[node.id] = node
  parent.childrenIds.push(node.id)
  startEdit(node.id)
}

export function addSibling(id) {
  const node = map.nodes[id]
  if (!node) return
  addChild(node.parentId ?? id)
}

function collectIds(id, out) {
  const n = map.nodes[id]
  if (!n) return
  out.push(id)
  for (const c of n.childrenIds) collectIds(c, out)
}

export function removeNode(id) {
  const node = map.nodes[id]
  if (!node || !node.parentId) return
  const parent = map.nodes[node.parentId]
  const doomed = []
  collectIds(id, doomed)
  for (const nid of doomed) delete map.nodes[nid]
  parent.childrenIds = parent.childrenIds.filter((c) => c !== id)
  map.selectedId = parent.id
  if (map.editingId && !map.nodes[map.editingId]) map.editingId = null
}

export function toggleCollapse(id) {
  const node = map.nodes[id]
  if (node && node.childrenIds.length) node.collapsed = !node.collapsed
}

export function branchColor(id) {
  let cur = map.nodes[id]
  if (!cur) return PALETTE[0]
  while (cur.parentId && map.nodes[cur.parentId]?.parentId) {
    cur = map.nodes[cur.parentId]
  }
  if (!cur.parentId) return PALETTE[0]
  const root = map.nodes[map.rootId]
  const idx = root ? root.childrenIds.indexOf(cur.id) : 0
  return PALETTE[(idx < 0 ? 0 : idx) % PALETTE.length]
}

export function resetMap() {
  const s = seed()
  map.nodes = s.nodes
  map.rootId = s.rootId
  map.selectedId = s.rootId
  map.editingId = null
}
