<script>
  import { onMount, tick } from 'svelte'
  import Canvas from './lib/Canvas.svelte'
  import Toolbar from './lib/Toolbar.svelte'
  import EditorSheet from './lib/EditorSheet.svelte'
  import {
    map,
    save,
    addChild,
    addSibling,
    removeNode,
    startEdit,
    resetMap,
  } from './lib/store.svelte.js'

  let canvas = $state(null)
  let confirmReset = $state(false)

  $effect(() => {
    // deep read of the tree to track every mutation
    JSON.stringify(map.nodes)
    save()
  })

  // keep the edited node in view above the editor sheet
  $effect(() => {
    const id = map.editingId
    if (!id) return
    tick().then(() => canvas?.ensureVisible(id))
  })

  onMount(() => {
    tick().then(() => canvas?.fit())
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
    <button class="ghost" onclick={onReset} class:armed={confirmReset}>
      {confirmReset ? 'Tap to confirm' : 'Reset'}
    </button>
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
