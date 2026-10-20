# Mind Map

A simple mobile-first mind map web app built with Svelte 5 (runes) + Vite.

## Features

- Tap a node to select, double-tap to edit inline
- Bottom toolbar: edit, add child, add sibling, delete
- One-finger pan, two-finger pinch zoom, mouse wheel zoom (desktop)
- Double-tap the background to recentre; fit-to-screen button
- Collapse/expand branches via the toggle on nodes with children
- Auto-layout (tidy tree) with per-branch colors
- Autosaves to `localStorage`
- Keyboard (desktop): `Enter` edit, `Tab` child, `Delete` remove, `Escape` deselect
- Light/dark theme via `prefers-color-scheme`

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
