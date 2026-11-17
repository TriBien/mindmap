# Mind Map

A mobile-first mind map web app. Tap to select, tap again to edit in a
bottom sheet, pinch to zoom, and everything autosaves to `localStorage`.

**Live:** https://tribien.github.io/mindmap/

## Features

- Tap a node to select, tap it again (or the pencil badge) to edit
- Bottom toolbar: edit, add child, add sibling, delete
- One-finger pan, two-finger pinch zoom, mouse wheel zoom (desktop)
- Double-tap the background to recentre; fit-to-screen button
- Collapse/expand branches via the toggle on nodes with children
- Auto-layout (tidy tree) with per-branch colors
- Bottom-sheet text editor designed for long text on phones
- Multiple mind maps: create, rename, switch, and delete from the map title
- Export a map as JSON; import JSON to add maps (single maps or library backups)
- Autosaves to `localStorage`
- Optional Google Drive sync (connect from the status button in the header)
- Keyboard (desktop): `Enter` edit, `Tab` child, `Delete` remove, `Escape` deselect
- Light/dark theme via `prefers-color-scheme`

## Tech stack

| Layer     | Choice                 | Why                                                            |
| --------- | ---------------------- | -------------------------------------------------------------- |
| Framework | Svelte 5 (runes)       | Fine-grained reactivity with no virtual DOM or memoization     |
| Build     | Vite 8                 | Instant HMR, zero-config for Svelte, small production bundles  |
| Language  | JavaScript + jsconfig  | The app is ~3.1k lines; TypeScript would be overhead here      |
| State     | `$state` module store  | One reactive object shared by components, no external library  |
| Storage   | `localStorage` + Drive | Offline persistence, optionally synced to Google Drive        |
| Deploy    | GitHub Actions → Pages | Free static hosting; every push to `main` redeploys            |

No UI kit, no CSS framework, no state library, no router — the whole app
is **15 source files / ~3,100 lines** and bundles to ~75 KB JS (27 KB gzip).

## High-level design

```
┌──────────────────────────── App.svelte ─────────────────────────────┐
│  header (map switcher, Drive status, reset)                         │
│  ┌──────────────────────── stage ─────────────────────────┐         │
│  │  Canvas.svelte          pan/zoom viewport              │         │
│  │   └─ world (transform: translate·scale)                │         │
│  │       ├─ <svg>  bezier edges                          │         │
│  │       └─ Node.svelte × N   absolutely positioned      │         │
│  │  zoom controls (+ − ⤢)                                 │         │
│  │  Toolbar.svelte        contextual actions             │         │
│  │  EditorSheet.svelte    bottom-sheet text editor       │         │
│  └────────────────────────────────────────────────────────┘         │
└─────────────────────────────────────────────────────────────────────┘

store.svelte.js   map = $state({...}); library = $state({ maps, activeId })
drive.svelte.js   Google OAuth + Drive upload/pull, sync status
sizes.svelte.js   measured node dimensions (ResizeObserver reports)
layout.js         pure: nodes + sizes → positions + bezier edges
gestures.js       shared { moved } flag (distinguishes tap from pan)
```

### Data model

The library holds every saved map, while `map` is the working copy of the
currently active one:

```js
library = {
  maps: [{ id, name, createdAt, updatedAt, nodes, rootId }],
  activeId,
}

map = {
  nodes: { [id]: { id, text, parentId, childrenIds, collapsed } },
  rootId,
  selectedId,
  editingId,
}
```

A map itself is a flat node map instead of a nested tree. Lookup by id is
O(1); structural edits (`addChild`, `removeNode`) only touch the parent's
`childrenIds`. Since `map` is a single `$state` proxy, any mutation
anywhere invalidates only the derived values that read the changed fields.
Saving copies the active working map back into its library entry.

### How the pieces work

**1. Auto-layout (`layout.js`) — pure, re-runnable**

`computeLayout()` walks the tree top-down for depth (x) and bottom-up
for vertical packing (y): leaves stack sequentially, parents center
themselves between their first and last child. Edges are cubic beziers
from `computeEdges()`.

Crucially, node sizes come from **measurement, not estimation**: each
`Node.svelte` reports its rendered `offsetWidth/offsetHeight` through a
`ResizeObserver` into `sizes.svelte.js`, and the layout prefers real
sizes over a character-count estimate (used only for first paint).
Because `$derived` tracks reads of `sizes`, committing long text
re-runs layout, re-positions siblings, and repaints edges — one
reactive chain, no manual DOM measuring in components.

**2. Reactivity (Svelte runes)**

```js
const layout = $derived(computeLayout(map.nodes, map.rootId))  // cached
$effect(() => { JSON.stringify(map.nodes); save() })            // runs after mutations
```

`$derived` is a lazy, cached computation — it recomputes only after a
value it actually read changed. `$effect` runs post-update for side
effects (persisting, focusing the editor, keeping the edited node
visible above the sheet). `untrack()` is used in the size-reporting
effect to break what would otherwise be a feedback loop (measurement
reads state that layout also reads).

**3. Gestures (`Canvas.svelte`)**

Pointer events with a `pointers` map: 1 pointer → pan, 2 pointers →
pinch zoom anchored at the pinch midpoint (world point under the
fingers stays fixed). Pointer capture is only claimed after 4 px of
movement, so taps still reach the nodes underneath. A shared
`gestures.moved` flag lets `Node` ignore pointer-ups that were really
pans — this is how "tap to select" and "drag to pan" coexist on the
same element.

**4. Editing (`EditorSheet.svelte`)**

Text input happens in a bottom sheet, not inline: a textarea at 16px+
(prevents iOS focus zoom), lifted above the keyboard via
`visualViewport` events, with safe-area padding. On open, an effect
asks the canvas to pan the node into the free area above the sheet.
Empty brand-new nodes are discarded on cancel; clearing an existing
node keeps its old text.

**5. Persistence**

A single `$effect` stringifies the active `map.nodes` on every mutation;
`save()` copies it into the active library entry and writes the whole
library to `localStorage`. Save is debounced only by the effect flush, so
a reload always restores the last committed state and active map.

Google Drive sync is optional and layered on top. The header status
button shows the connection state; opening it lets you connect, run a
manual sync, or disconnect. While connected, local changes are pushed
to `mindmap.json` after a short debounce, and the app checks Drive every
30 seconds (and when the tab becomes visible) for a newer copy. The file
contains the entire map library plus `activeId`; both copies carry a
`savedAt` timestamp, so last-write-wins. Local storage is always kept up
to date, even when Drive is disconnected.

The client ID and Drive file name live in `src/lib/config.json`:

```json
{
  "googleClientId": "…apps.googleusercontent.com",
  "driveFileName": "mindmap.json"
}
```

## Svelte vs React

### Pros of Svelte (why this project uses it)

- **Reactivity without ceremony.** Mutating `map.nodes[id].text`
  triggers exactly the components/derived values that read it. In React
  the same change needs immutable updates (`setNodes(...)`) plus either
  deep comparison, `useMemo`, or careful `useCallback`/`memo` wiring to
  avoid re-rendering the whole node list.
- **No virtual DOM.** The bundle is small (~21 KB gzip including the
  compiler output) and updates touch only changed nodes. React ships a
  larger runtime plus whatever `memo`/`useMemo` you add for parity —
  relevant for a smooth 60 fps canvas on mid-range phones.
- **Less boilerplate.** A component is a `<script>` + markup; CSS in it
  is scoped automatically. This app has zero component-state plumbing
  libraries — no Redux/Zustand, no React Query, no CSS-in-JS.
- **Runes are explicit and fine-grained.** `$state` / `$derived` /
  `$effect` make the reactive graph readable at a glance; effects run
  after DOM updates, so `$effect` + `ResizeObserver` composes cleanly
  with measured layout (as `sizes.svelte.js` does).
- **Small codebase stays maintainable.** ~1.2k lines across 10 files
  with no context providers, portals, or hook dependency arrays.

### Cons of Svelte (why React might be better)

- **Ecosystem and hiring.** React has vastly more libraries, guides,
  and experienced contributors. Anything niche (dnd-kit equivalents,
  complex form libraries, design-system maturity) is easier to find or
  outsource in React.
- **React is the safer long-term bet for larger teams.** Svelte's
  breaking changes (Svelte 4 → 5 runes reactivity model) require real
  migration work; React's incremental evolution and meta-framework
  (Next.js) path is more battle-tested at scale.
- **Server-side / full-stack story.** Next.js gives RSC, streaming, and
  route-level data conventions out of the box. SvelteKit is capable but
  less documented and less widely hosted by platform vendors.
- **Tooling depth.** React has richer devtools, visual editors, and
  codemods. Svelte DevTools are functional but shallower.
- **`$effect` is easy to misuse.** It must be kept free of reactive
  writes (the size-measurement loop in this repo is a real example).
  React's "props in, UI out" model makes side effects more predictable
  for newcomers, even if noisier to write.
- **Smaller talent pool.** For a commercial product, a React codebase
  is easier to staff; Svelte expertise is harder to hire for.

### Practical takeaway

For a small, interaction-heavy, client-only app like this one — a lot
of local state, direct DOM measurement, canvas-style gestures — Svelte
is a great fit: less code, less runtime, reactivity you can reason
about locally. If this were to grow into a multi-user product with
auth, SSR, complex forms, and a larger team, React + Next.js would
likely pay off through ecosystem and hiring despite more boilerplate.

## Develop

```sh
npm install
npm run dev
```

## Build

```sh
npm run build
npm run preview
```

## Deploy

Pushes to `main` trigger `.github/workflows/deploy.yml`, which runs
`npm run build` and publishes `dist/` to GitHub Pages. The Vite
`base: '/mindmap/'` option makes asset URLs match the project-site
path.
