<script>
  import { map, addChild, addSibling, removeNode, startEdit } from './store.svelte.js'

  const selected = $derived(map.selectedId ? map.nodes[map.selectedId] : null)
  const isRoot = $derived(map.selectedId === map.rootId)

  const actions = $derived.by(() => {
    if (!selected) {
      return [{ label: 'New idea', icon: 'plus', primary: true, run: () => addChild(map.rootId) }]
    }
    const list = [
      { label: 'Edit', icon: 'pencil', run: () => startEdit(selected.id) },
      { label: 'Child', icon: 'plus', primary: true, run: () => addChild(selected.id) },
      { label: 'Sibling', icon: 'branch', run: () => addSibling(selected.id) },
    ]
    if (!isRoot) {
      list.push({ label: 'Delete', icon: 'trash', danger: true, run: () => removeNode(selected.id) })
    }
    return list
  })
</script>

<div class="toolbar" role="toolbar" aria-label="Node actions">
  {#each actions as a (a.label)}
    <button class="action" class:primary={a.primary} class:danger={a.danger} onclick={a.run}>
      {#if a.icon === 'plus'}
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" fill="none" />
        </svg>
      {:else if a.icon === 'pencil'}
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z" stroke="currentColor" stroke-width="2" stroke-linejoin="round" fill="none" />
        </svg>
      {:else if a.icon === 'branch'}
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="M6 3v12a4 4 0 0 0 4 4h8M6 9h8a4 4 0 0 1 4 4v4" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none" />
          <circle cx="6" cy="3.5" r="2" fill="currentColor" />
          <circle cx="19" cy="18.5" r="2" fill="currentColor" />
        </svg>
      {:else}
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none" />
        </svg>
      {/if}
      <span>{a.label}</span>
    </button>
  {/each}
</div>

<style>
  .toolbar {
    position: fixed;
    left: 50%;
    bottom: calc(12px + env(safe-area-inset-bottom, 0px));
    transform: translateX(-50%);
    display: flex;
    gap: 6px;
    padding: 6px;
    border-radius: 16px;
    background: color-mix(in srgb, var(--panel) 88%, transparent);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
    border: 1px solid var(--border);
    box-shadow: 0 8px 28px rgb(0 0 0 / 0.18);
    z-index: 10;
    max-width: calc(100vw - 16px);
  }

  .action {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 3px;
    min-width: 62px;
    padding: 8px 10px;
    border: none;
    border-radius: 11px;
    background: transparent;
    color: var(--text-h);
    font: inherit;
    font-size: 11px;
    font-weight: 500;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
  }

  .action:active {
    background: var(--hover);
  }

  .action.primary {
    background: var(--accent);
    color: #fff;
  }

  .action.primary:active {
    background: color-mix(in srgb, var(--accent) 85%, #000);
  }

  .action.danger {
    color: #ef4444;
  }
</style>
