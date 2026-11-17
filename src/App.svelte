<script>
  import { onMount, tick, untrack } from 'svelte'
  import Canvas from './lib/Canvas.svelte'
  import Toolbar from './lib/Toolbar.svelte'
  import EditorSheet from './lib/EditorSheet.svelte'
  import DriveSheet from './lib/DriveSheet.svelte'
  import {
    map,
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

  let canvas = $state(null)
  let confirmReset = $state(false)
  let driveOpen = $state(false)

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

  // keep the edited node in view above the editor sheet
  $effect(() => {
    const id = map.editingId
    if (!id) return
    tick().then(() => canvas?.ensureVisible(id))
  })

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
    tick().then(() => canvas?.fit())
    initDrive()
  })

  function recenter() {
    canvas?.fit()
  }

  function onKeydown(e) {
    if (map.editingId) return
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
    <h1>Mind Map</h1>
    <div class="header-actions">
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

  h1 {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
    color: var(--text-h);
    letter-spacing: -0.2px;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
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
