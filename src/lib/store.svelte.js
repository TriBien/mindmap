const LEGACY_KEY = 'mindmap.v1'
const LIBRARY_KEY = 'mindmap.library.v1'
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

function seed(rootText = 'My Map') {
  const root = makeNode(rootText)
  const nodes = { [root.id]: root }
  for (const t of ['Ideas', 'Tasks', 'Notes']) {
    const n = makeNode(t, root.id)
    nodes[n.id] = n
    root.childrenIds.push(n.id)
  }
  return { nodes, rootId: root.id }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value))
}

function normalizeMap(raw, fallbackName) {
  if (!raw || typeof raw !== 'object') return null
  const nodes = raw.nodes
  const rootId = raw.rootId
  if (!nodes || typeof nodes !== 'object' || !nodes[rootId]) return null
  const now = Date.now()
  return {
    id: typeof raw.id === 'string' && raw.id ? raw.id : createId(),
    name:
      (typeof raw.name === 'string' && raw.name.trim()) ||
      fallbackName ||
      nodes[rootId].text ||
      'Untitled map',
    createdAt: Number(raw.createdAt) || now,
    updatedAt: Number(raw.updatedAt) || Number(raw.savedAt) || now,
    nodes,
    rootId,
  }
}

function makeMap(name) {
  const s = seed(name)
  const now = Date.now()
  return {
    id: createId(),
    name,
    createdAt: now,
    updatedAt: now,
    nodes: s.nodes,
    rootId: s.rootId,
  }
}

function loadLibrary() {
  try {
    const raw = localStorage.getItem(LIBRARY_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      const maps = Array.isArray(data?.maps)
        ? data.maps.map((m) => normalizeMap(m)).filter(Boolean)
        : []
      if (maps.length) {
        const activeId = maps.some((m) => m.id === data.activeId)
          ? data.activeId
          : maps[0].id
        return {
          maps,
          activeId,
          savedAt: Number(data.savedAt) || 0,
        }
      }
    }
  } catch {
    // fall through to legacy / seed
  }

  try {
    const raw = localStorage.getItem(LEGACY_KEY)
    if (raw) {
      const data = JSON.parse(raw)
      const record = normalizeMap(data, data?.nodes?.[data.rootId]?.text)
      if (record) {
        return {
          maps: [record],
          activeId: record.id,
          savedAt: Number(data.savedAt) || 0,
        }
      }
    }
  } catch {
    // fall through to seed
  }

  const record = makeMap('My Map')
  return { maps: [record], activeId: record.id, savedAt: 0 }
}

const initial = loadLibrary()
const initialActive =
  initial.maps.find((m) => m.id === initial.activeId) || initial.maps[0]

export const library = $state({
  maps: initial.maps,
  activeId: initialActive.id,
})

// Timestamp of the last committed local change. It is included in the
// Drive payload so two devices can pick the newest copy.
export const storage = $state({ savedAt: initial.savedAt })

export const map = $state({
  nodes: clone(initialActive.nodes),
  rootId: initialActive.rootId,
  selectedId: initialActive.rootId,
  editingId: null,
})

let lastSaved = JSON.stringify({ nodes: map.nodes, rootId: map.rootId })

function currentEntry() {
  return library.maps.find((m) => m.id === library.activeId) || null
}

function writeLocal() {
  try {
    localStorage.setItem(
      LIBRARY_KEY,
      JSON.stringify({
        version: 2,
        activeId: library.activeId,
        savedAt: storage.savedAt,
        maps: library.maps,
      }),
    )
    localStorage.removeItem(LEGACY_KEY)
  } catch {
    // storage full or unavailable — ignore
  }
}

function activate(entry) {
  library.activeId = entry.id
  map.nodes = clone(entry.nodes)
  map.rootId = entry.rootId
  map.selectedId = entry.rootId
  map.editingId = null
  lastSaved = JSON.stringify({ nodes: map.nodes, rootId: map.rootId })
  writeLocal()
}

export function save() {
  const entry = currentEntry()
  if (!entry) return
  const current = JSON.stringify({ nodes: map.nodes, rootId: map.rootId })
  if (current === lastSaved) return
  lastSaved = current
  const now = Date.now()
  entry.nodes = clone(map.nodes)
  entry.rootId = map.rootId
  entry.updatedAt = now
  storage.savedAt = now
  writeLocal()
}

export function snapshotData() {
  const maps = library.maps.map((entry) => {
    if (entry.id !== library.activeId) return clone(entry)
    return {
      id: entry.id,
      name: entry.name,
      createdAt: entry.createdAt,
      updatedAt: entry.updatedAt,
      nodes: clone(map.nodes),
      rootId: map.rootId,
    }
  })
  return {
    version: 2,
    app: 'mindmap',
    activeId: library.activeId,
    savedAt: storage.savedAt,
    maps,
  }
}

function normalizeLibrary(data, fallbackSavedAt) {
  if (Array.isArray(data?.maps)) {
    const maps = data.maps.map((m) => normalizeMap(m)).filter(Boolean)
    if (maps.length) {
      return {
        maps,
        activeId: maps.some((m) => m.id === data.activeId)
          ? data.activeId
          : maps[0].id,
        savedAt: Number.isFinite(Number(data.savedAt))
          ? Number(data.savedAt)
          : fallbackSavedAt,
      }
    }
  }

  // Older Drive payloads stored a single { nodes, rootId, savedAt } map.
  const legacy = normalizeMap(data)
  if (legacy) {
    return {
      maps: [legacy],
      activeId: legacy.id,
      savedAt: Number.isFinite(Number(data?.savedAt))
        ? Number(data.savedAt)
        : fallbackSavedAt,
    }
  }

  return null
}

// Apply a remote snapshot without treating it as a new local edit
// (lastSaved is updated before the autosave effect runs).
export function applyRemote(data, fallbackSavedAt = 0) {
  const next = normalizeLibrary(data, fallbackSavedAt)
  if (!next) return false

  library.maps = next.maps
  library.activeId = next.activeId
  const active = next.maps.find((m) => m.id === next.activeId) || next.maps[0]
  map.nodes = clone(active.nodes)
  map.rootId = active.rootId
  map.selectedId = active.rootId
  map.editingId = null
  storage.savedAt = next.savedAt
  lastSaved = JSON.stringify({ nodes: map.nodes, rootId: map.rootId })
  writeLocal()
  return true
}

export function getActiveMap() {
  return currentEntry()
}

export function switchMap(id) {
  if (id === library.activeId) return true
  const entry = library.maps.find((m) => m.id === id)
  if (!entry) return false
  save()
  activate(entry)
  return true
}

export function createMap(name) {
  save()
  const clean = String(name ?? '').trim()
  const finalName = clean || uniqueName('Untitled map')
  const entry = makeMap(finalName)
  library.maps.unshift(entry)
  storage.savedAt = Date.now()
  activate(entry)
  return entry.id
}

export function renameMap(id, name) {
  const entry = library.maps.find((m) => m.id === id)
  if (!entry) return false
  const clean = String(name ?? '').trim()
  if (!clean) return false
  if (entry.name === clean) return true
  entry.name = clean
  const now = Date.now()
  entry.updatedAt = now
  storage.savedAt = now
  writeLocal()
  return true
}

export function deleteMap(id) {
  const index = library.maps.findIndex((m) => m.id === id)
  if (index < 0 || library.maps.length <= 1) return false

  const wasActive = library.activeId === id
  if (!wasActive) save()

  library.maps.splice(index, 1)
  storage.savedAt = Date.now()

  if (wasActive) {
    const next = library.maps[Math.min(index, library.maps.length - 1)]
    activate(next)
  } else {
    writeLocal()
  }
  return true
}

function uniqueName(base) {
  const names = new Set(library.maps.map((m) => m.name))
  if (!names.has(base)) return base
  let i = 2
  while (names.has(`${base} ${i}`)) i++
  return `${base} ${i}`
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
  const s = seed(currentEntry()?.name || 'My Map')
  map.nodes = s.nodes
  map.rootId = s.rootId
  map.selectedId = s.rootId
  map.editingId = null
}

// Persist the freshly loaded/migrated library immediately so map IDs and
// the active selection are stable across reloads.
writeLocal()
