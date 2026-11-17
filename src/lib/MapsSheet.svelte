<script>
  import { onMount, tick } from 'svelte'
  import {
    library,
    createMap,
    switchMap,
    renameMap,
    deleteMap,
    exportMapData,
    importMaps,
  } from './store.svelte.js'

  let { onclose } = $props()

  let now = $state(Date.now())
  let renamingId = $state(null)
  let draftName = $state('')
  let nameInput = $state(null)
  let confirmId = $state(null)
  let confirmTimer = null
  let fileInput = $state(null)
  let importError = $state('')

  onMount(() => {
    const timer = setInterval(() => (now = Date.now()), 15_000)
    return () => {
      clearInterval(timer)
      clearTimeout(confirmTimer)
    }
  })

  const maps = $derived(
    [...library.maps].sort((a, b) => b.updatedAt - a.updatedAt),
  )
  const canDelete = $derived(library.maps.length > 1)

  function open(id) {
    if (switchMap(id)) onclose()
  }

  function add() {
    createMap()
    onclose()
  }

  function startRename(entry) {
    cancelDelete()
    renamingId = entry.id
    draftName = entry.name
    tick().then(() => {
      nameInput?.focus()
      nameInput?.select()
    })
  }

  function commitRename(id) {
    if (renameMap(id, draftName)) {
      renamingId = null
      draftName = ''
    }
  }

  function cancelRename() {
    renamingId = null
    draftName = ''
  }

  function askDelete(id) {
    cancelRename()
    confirmId = id
    clearTimeout(confirmTimer)
    confirmTimer = setTimeout(() => (confirmId = null), 4000)
  }

  function cancelDelete() {
    confirmId = null
    clearTimeout(confirmTimer)
  }

  function remove(id) {
    if (deleteMap(id)) cancelDelete()
  }

  function exportCurrent() {
    const data = exportMapData()
    if (!data) return
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${fileSlug(data.name)}.json`
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  async function onFileChange(e) {
    const input = e.currentTarget
    const file = input.files?.[0]
    input.value = ''
    if (!file) return
    importError = ''
    try {
      const data = JSON.parse(await file.text())
      if (!importMaps(data)) {
        importError = 'That JSON does not contain a valid mind map.'
        return
      }
      onclose()
    } catch {
      importError = 'Could not read that JSON file.'
    }
  }

  function fileSlug(name) {
    return (
      String(name || 'mindmap')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 60) || 'mindmap'
    )
  }

  function onRenameKey(e) {
    if (e.key === 'Escape') {
      e.preventDefault()
      e.stopPropagation()
      cancelRename()
    }
  }

  function onKeydown(e) {
    if (e.key === 'Escape') onclose()
  }

  function nodeCount(entry) {
    return Object.keys(entry.nodes || {}).length
  }

  function relative(ts) {
    now
    if (!ts) return 'just now'
    const diff = Math.max(0, now - ts)
    if (diff < 60_000) return 'just now'
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h ago`
    if (diff < 604_800_000) return `${Math.floor(diff / 86_400_000)} d ago`
    return new Date(ts).toLocaleDateString()
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="scrim" role="presentation" onclick={onclose}></div>

<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="maps-title">
  <div class="head">
    <div>
      <h2 id="maps-title">Mind maps</h2>
      <p>{library.maps.length} saved · choose one to open</p>
    </div>
    <button class="close" onclick={onclose} aria-label="Close">×</button>
  </div>

  <button class="new" onclick={add}>
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <path
        d="M12 5v14M5 12h14"
        stroke="currentColor"
        stroke-width="2.2"
        stroke-linecap="round"
        fill="none"
      />
    </svg>
    <span>New mind map</span>
  </button>

  <div class="tools">
    <button class="tool" onclick={exportCurrent}>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path
          d="M12 4v10m0 0 4-4m-4 4-4-4M5 19h14"
          stroke="currentColor"
          stroke-width="1.9"
          stroke-linecap="round"
          stroke-linejoin="round"
          fill="none"
        />
      </svg>
      <span>Export map</span>
    </button>
    <button class="tool" onclick={() => fileInput?.click()}>
      <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
        <path
          d="M12 20V10m0 0 4 4m-4-4-4 4M5 5h14"
          stroke="currentColor"
          stroke-width="1.9"
          stroke-linecap="round"
          stroke-linejoin="round"
          fill="none"
        />
      </svg>
      <span>Import JSON</span>
    </button>
    <input
      bind:this={fileInput}
      type="file"
      accept="application/json,.json"
      onchange={onFileChange}
      hidden
    />
  </div>

  {#if importError}
    <p class="error">{importError}</p>
  {/if}

  <div class="list">
    {#each maps as entry (entry.id)}
      <div class="card" class:active={entry.id === library.activeId}>
        <div class="row">
          {#if renamingId === entry.id}
            <form
              class="rename"
              onsubmit={(e) => {
                e.preventDefault()
                commitRename(entry.id)
              }}
            >
              <input
                bind:this={nameInput}
                bind:value={draftName}
                onkeydown={onRenameKey}
                maxlength="60"
                aria-label="Map name"
              />
              <button class="mini primary" type="submit">Save</button>
              <button class="mini" type="button" onclick={cancelRename}>
                Cancel
              </button>
            </form>
          {:else}
            <button class="main" onclick={() => open(entry.id)}>
              <span class="name">{entry.name}</span>
              <span class="meta">
                <span>{nodeCount(entry)} nodes</span>
                <span class="sep">·</span>
                <span>{relative(entry.updatedAt)}</span>
                {#if entry.id === library.activeId}
                  <span class="badge">Current</span>
                {/if}
              </span>
            </button>
            <div class="actions">
              <button
                class="icon"
                onclick={() => startRename(entry)}
                aria-label="Rename {entry.name}"
              >
                <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                  <path
                    d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z"
                    stroke="currentColor"
                    stroke-width="1.9"
                    stroke-linejoin="round"
                    fill="none"
                  />
                </svg>
              </button>
              <button
                class="icon danger"
                onclick={() => askDelete(entry.id)}
                aria-label="Delete {entry.name}"
                disabled={!canDelete}
              >
                <svg viewBox="0 0 24 24" width="17" height="17" aria-hidden="true">
                  <path
                    d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-9 0 1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"
                    stroke="currentColor"
                    stroke-width="1.9"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    fill="none"
                  />
                </svg>
              </button>
            </div>
          {/if}
        </div>

        {#if confirmId === entry.id}
          <div class="confirm">
            <span>Delete “{entry.name}”?</span>
            <div class="confirm-actions">
              <button class="mini danger" onclick={() => remove(entry.id)}>
                Delete
              </button>
              <button class="mini" onclick={cancelDelete}>Cancel</button>
            </div>
          </div>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 0.35);
    z-index: 30;
  }

  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 31;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 18px 16px calc(16px + env(safe-area-inset-bottom, 0px));
    background: var(--panel);
    border-radius: 18px 18px 0 0;
    border-top: 1px solid var(--border);
    box-shadow: 0 -8px 30px rgb(0 0 0 / 0.2);
    max-height: calc(100dvh - 32px);
  }

  .head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
    color: var(--text-h);
    letter-spacing: -0.2px;
  }

  .head p {
    margin: 1px 0 0;
    font-size: 12px;
    color: var(--text);
  }

  .close {
    flex: none;
    width: 36px;
    height: 36px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: transparent;
    color: var(--text);
    font-size: 22px;
    line-height: 1;
    cursor: pointer;
  }

  .close:active {
    background: var(--hover);
  }

  .new {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-height: 46px;
    border: none;
    border-radius: 12px;
    background: var(--accent);
    color: #fff;
    font: inherit;
    font-size: 15px;
    font-weight: 600;
    cursor: pointer;
  }

  .new:active {
    background: color-mix(in srgb, var(--accent) 85%, #000);
  }

  .tools {
    display: flex;
    gap: 8px;
  }

  .tool {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    min-height: 40px;
    border: 1px solid var(--border);
    border-radius: 10px;
    background: transparent;
    color: var(--text-h);
    font: inherit;
    font-size: 12.5px;
    font-weight: 500;
    cursor: pointer;
  }

  .tool:active {
    background: var(--hover);
  }

  .error {
    margin: -4px 0 0;
    font-size: 12.5px;
    color: #ef4444;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    overflow-y: auto;
    margin: 0 -4px;
    padding: 0 4px 2px;
  }

  .card {
    flex: none;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: color-mix(in srgb, var(--bg) 55%, transparent);
    overflow: hidden;
  }

  .card.active {
    border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  }

  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 8px 8px 12px;
  }

  .main {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 3px;
    padding: 4px 0;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;
  }

  .name {
    max-width: 100%;
    font-size: 14.5px;
    font-weight: 600;
    color: var(--text-h);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
    font-size: 11.5px;
    color: var(--text);
  }

  .sep {
    opacity: 0.6;
  }

  .badge {
    padding: 1px 6px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 600;
    color: var(--accent);
    background: color-mix(in srgb, var(--accent) 14%, transparent);
  }

  .actions {
    flex: none;
    display: flex;
    gap: 2px;
  }

  .icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: none;
    border-radius: 9px;
    background: transparent;
    color: var(--text);
    cursor: pointer;
  }

  .icon:active {
    background: var(--hover);
  }

  .icon.danger {
    color: #ef4444;
  }

  .icon:disabled {
    opacity: 0.3;
    cursor: default;
  }

  .rename {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .rename input {
    flex: 1;
    min-width: 0;
    box-sizing: border-box;
    padding: 8px 10px;
    border: 1.5px solid var(--accent);
    border-radius: 8px;
    background: var(--node-bg);
    color: var(--node-text);
    font: inherit;
    font-size: 16px;
    outline: none;
  }

  .mini {
    flex: none;
    padding: 7px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 12.5px;
    font-weight: 500;
    cursor: pointer;
    white-space: nowrap;
  }

  .mini.primary {
    border-color: var(--accent);
    background: var(--accent);
    color: #fff;
  }

  .mini.danger {
    border-color: #ef4444;
    background: #ef4444;
    color: #fff;
  }

  .confirm {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 12px;
    border-top: 1px solid var(--border);
    background: color-mix(in srgb, #ef4444 7%, transparent);
    font-size: 12.5px;
    color: var(--text-h);
  }

  .confirm-actions {
    flex: none;
    display: flex;
    gap: 6px;
  }

  @media (min-width: 640px) {
    .sheet {
      left: 50%;
      right: auto;
      bottom: 50%;
      width: min(520px, calc(100vw - 32px));
      transform: translate(-50%, 50%);
      border-radius: 18px;
      border: 1px solid var(--border);
      padding-bottom: 18px;
    }
  }
</style>
