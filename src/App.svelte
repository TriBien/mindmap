<script>
  import { onMount, tick, untrack } from 'svelte'
  import Canvas from './lib/Canvas.svelte'
  import Toolbar from './lib/Toolbar.svelte'
  import EditorSheet from './lib/EditorSheet.svelte'
  import DriveSheet from './lib/DriveSheet.svelte'
  import MapsSheet from './lib/MapsSheet.svelte'
  import {
    map,
    library,
    storage,
    save,
    addChild,
    addSibling,
    removeNode,
    startEdit,
    resetMap,
  } from './lib/store.svelte.js'
  import {
    drive,
    initDrive,
    notifyLocalSave,
  } from './lib/drive.svelte.js'
  import { theme, toggleTheme, initTheme } from './lib/theme.svelte.js'

  let canvas = $state(null)
  let confirmReset = $state(false)
  let driveOpen = $state(false)
  let mapsOpen = $state(false)

  $effect(() => {
    // deep read of the tree to track every mutation
    JSON.stringify(map.nodes)
    save()
  })

  $effect(() => {
    // only react to local saves; connection changes must not re-trigger a push
    const savedAt = storage.savedAt
    untrack(() => notifyLocalSave(savedAt))
  })

  // fit the new tree when switching, creating or deleting maps
  $effect(() => {
    library.activeId
    tick().then(() => canvas?.fit())
  })

  // keep the edited node in view above the editor sheet
  $effect(() => {
    const id = map.editingId
    if (!id) return
    tick().then(() => canvas?.ensureVisible(id))
  })

  const activeName = $derived(
    library.maps.find((m) => m.id === library.activeId)?.name || 'Mind Map',
  )

  const driveLabel = $derived.by(() => {
    if (!drive.configured) return 'Drive off'
    if (drive.status === 'connecting') return 'Connecting'
    if (drive.status === 'connected') {
      if (drive.error) return 'Sync issue'
      return drive.busy ? 'Syncing' : 'Drive on'
    }
    return drive.error ? 'Drive issue' : 'Drive off'
  })

  const driveTone = $derived(
    drive.status === 'connecting' || drive.busy
      ? 'busy'
      : drive.error
        ? 'error'
        : drive.status === 'connected'
          ? 'ok'
          : 'off',
  )

  onMount(() => {
    initTheme()
    tick().then(() => canvas?.fit())
    initDrive()
  })

  function recenter() {
    canvas?.fit()
  }

  function onKeydown(e) {
    if (map.editingId || mapsOpen || driveOpen) return
    const sel = map.selectedId
    if (!sel) return
    if (e.key === 'Enter') {
      e.preventDefault()
      startEdit(sel)
    } else if (e.key === 'Tab') {
      e.preventDefault()
      addChild(sel)
    } else if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault()
      removeNode(sel)
    } else if (e.key === 'Escape') {
      map.selectedId = null
    }
  }

  function onReset() {
    if (confirmReset) {
      resetMap()
      confirmReset = false
      tick().then(() => canvas?.fit())
    } else {
      confirmReset = true
      setTimeout(() => (confirmReset = false), 3000)
    }
  }
</script>

<svelte:window onkeydown={onKeydown} />

<main>
  <header>
    <button
      class="map-title"
      onclick={() => (mapsOpen = true)}
      aria-label="Open mind maps"
    >
      <span class="app">Mind Map</span>
      <span class="name-row">
        <span class="name">{activeName}</span>
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">
          <path
            d="m6 9 6 6 6-6"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
            stroke-linejoin="round"
            fill="none"
          />
        </svg>
      </span>
    </button>
    <div class="header-actions">
      <button
        class="theme-toggle"
        onclick={toggleTheme}
        aria-label={theme.dark ? 'Switch to light theme' : 'Switch to dark theme'}
        title={theme.dark ? 'Light theme' : 'Dark theme'}
      >
        {#if theme.dark}
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="2" fill="none" />
            <path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none" />
          </svg>
        {:else}
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path d="M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
          </svg>
        {/if}
      </button>
      <button
        class="status {driveTone}"
        onclick={() => (driveOpen = true)}
        aria-label="Google Drive: {driveLabel}"
        title="Google Drive sync"
      >
        <span class="dot" aria-hidden="true"></span>
        <span class="status-text">{driveLabel}</span>
      </button>
      <button class="ghost" onclick={onReset} class:armed={confirmReset}>
        {confirmReset ? 'Tap to confirm' : 'Reset'}
      </button>
    </div>
  </header>

  <div class="stage">
    <Canvas bind:this={canvas} />
    <div class="zoom">
      <button aria-label="Zoom in" onclick={() => canvas?.zoom(1.25)}>+</button>
      <button aria-label="Zoom out" onclick={() => canvas?.zoom(0.8)}>−</button>
      <button aria-label="Fit to screen" onclick={recenter}>⤢</button>
    </div>
    {#if !map.editingId}
      <Toolbar />
    {/if}
    <EditorSheet />
  </div>

  {#if driveOpen}
    <DriveSheet onclose={() => (driveOpen = false)} />
  {/if}

  {#if mapsOpen}
    <MapsSheet onclose={() => (mapsOpen = false)} />
  {/if}
</main>

<style>
  main {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: calc(10px + env(safe-area-inset-top, 0px)) 16px 10px;
    background: var(--panel);
    border-bottom: 1px solid var(--border);
    z-index: 5;
  }

  .map-title {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 0;
    min-width: 0;
    max-width: min(42vw, 220px);
    padding: 0;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .map-title .app {
    font-size: 10.5px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--text);
  }

  .map-title .name-row {
    display: flex;
    align-items: center;
    gap: 4px;
    min-width: 0;
    max-width: 100%;
  }

  .map-title .name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 17px;
    font-weight: 600;
    color: var(--text-h);
    letter-spacing: -0.2px;
  }

  .map-title svg {
    flex: none;
    color: var(--text);
  }

  .map-title:active .name {
    opacity: 0.6;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .theme-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: transparent;
    color: var(--text-h);
    cursor: pointer;
  }

  .theme-toggle:active {
    background: var(--hover);
  }

  .status {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 9px;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
  }

  .status:active {
    background: var(--hover);
  }

  .status .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #9ca3af;
  }

  .status.ok {
    color: var(--text-h);
  }

  .status.ok .dot {
    background: #10b981;
  }

  .status.busy .dot {
    background: #f59e0b;
    animation: pulse 1s ease-in-out infinite;
  }

  .status.error .dot {
    background: #ef4444;
  }

  @keyframes pulse {
    50% {
      opacity: 0.35;
    }
  }

  .ghost {
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 13px;
    padding: 6px 12px;
    border-radius: 9px;
    cursor: pointer;
  }

  .ghost.armed {
    border-color: #ef4444;
    color: #ef4444;
  }

  .stage {
    position: relative;
    flex: 1;
    min-height: 0;
  }

  .zoom {
    position: absolute;
    top: 12px;
    right: 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    z-index: 10;
  }

  .zoom button {
    width: 40px;
    height: 40px;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: color-mix(in srgb, var(--panel) 88%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    color: var(--text-h);
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    box-shadow: 0 2px 10px rgb(0 0 0 / 0.12);
  }

  .zoom button:active {
    background: var(--hover);
  }
</style>
