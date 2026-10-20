<script>
  import { untrack } from 'svelte'
  import { map, startEdit, toggleCollapse, branchColor } from './store.svelte.js'
  import { gestures } from './gestures.js'
  import { reportSize, clearSize } from './sizes.svelte.js'

  let { id, pos } = $props()

  const node = $derived(map.nodes[id])
  const selected = $derived(map.selectedId === id)
  const editing = $derived(map.editingId === id)
  const color = $derived(branchColor(id))
  const isRoot = $derived(id === map.rootId)
  const childCount = $derived(node?.childrenIds.length ?? 0)

  let el = $state(null)

  $effect(() => {
    if (!el) return
    // reading el must not track `sizes` — reportSize reads sizes[id],
    // which the layout derived also writes back into positions; an
    // untracked measure keeps this out of the reactive graph
    const target = el
    const ro = new ResizeObserver(() => {
      untrack(() => reportSize(id, target.offsetWidth, target.offsetHeight))
    })
    ro.observe(target)
    untrack(() => reportSize(id, target.offsetWidth, target.offsetHeight))
    return () => {
      ro.disconnect()
      untrack(() => clearSize(id))
    }
  })

  function onPointerUp() {
    if (gestures.moved || editing) return
    if (selected) startEdit(id)
    else map.selectedId = id
  }

  function onEditPointer(e) {
    e.stopPropagation()
    e.preventDefault()
    startEdit(id)
  }

  function onCollapsePointer(e) {
    e.stopPropagation()
    e.preventDefault()
    toggleCollapse(id)
  }

  function stop(e) {
    e.stopPropagation()
  }
</script>

{#if node}
  <div
    class="node"
    class:root={isRoot}
    class:selected
    class:editing
    bind:this={el}
    style:left="{pos.x}px"
    style:top="{pos.y}px"
    style:--c={color}
    onpointerup={onPointerUp}
    role="button"
    tabindex="-1"
  >
    <span class="label">{node.text || 'Untitled'}</span>

    {#if selected && !editing}
      <button class="badge edit" aria-label="Edit node" onpointerdown={onEditPointer}>
        <svg viewBox="0 0 24 24" width="12" height="12" aria-hidden="true">
          <path
            d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3z"
            stroke="currentColor"
            stroke-width="2.4"
            stroke-linejoin="round"
            fill="none"
          />
        </svg>
      </button>
    {/if}

    {#if childCount > 0}
      <button
        class="badge toggle"
        class:open={!node.collapsed}
        aria-label={node.collapsed ? 'Expand' : 'Collapse'}
        onpointerdown={onCollapsePointer}
        onpointerup={stop}
      >
        <svg viewBox="0 0 12 12" width="9" height="9" aria-hidden="true">
          <path d="M2 6h8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
          <path class="vert" d="M6 2v8" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
        </svg>
      </button>
    {/if}
  </div>
{/if}

<style>
  .node {
    position: absolute;
    box-sizing: border-box;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 96px;
    max-width: 240px;
    width: max-content;
    min-height: 40px;
    padding: 9px 14px;
    border-radius: 12px;
    background: var(--node-bg);
    color: var(--node-text);
    border: 1.5px solid color-mix(in srgb, var(--c) 35%, transparent);
    box-shadow: 0 1px 3px rgb(0 0 0 / 0.08);
    font-size: 14px;
    line-height: 1.35;
    text-align: center;
    cursor: default;
    user-select: none;
    -webkit-user-select: none;
    -webkit-tap-highlight-color: transparent;
    touch-action: manipulation;
    transition:
      border-color 0.15s,
      box-shadow 0.15s;
  }

  .node.root {
    font-size: 16px;
    font-weight: 600;
    background: color-mix(in srgb, var(--c) 14%, var(--node-bg));
    border-color: var(--c);
    border-radius: 14px;
  }

  .node.selected {
    border-color: var(--c);
    box-shadow:
      0 0 0 3px color-mix(in srgb, var(--c) 22%, transparent),
      0 2px 8px rgb(0 0 0 / 0.12);
  }

  .node.editing {
    border-color: var(--c);
    border-style: dashed;
  }

  .label {
    overflow: hidden;
    text-overflow: ellipsis;
    display: -webkit-box;
    -webkit-line-clamp: 5;
    -webkit-box-orient: vertical;
    overflow-wrap: anywhere;
    word-break: break-word;
    max-height: calc(5 * 1.35em);
  }

  .badge {
    position: absolute;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 1.5px solid color-mix(in srgb, var(--c) 45%, transparent);
    background: var(--node-bg);
    color: var(--c);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    cursor: pointer;
    touch-action: none;
  }

  .badge:active {
    background: color-mix(in srgb, var(--c) 15%, var(--node-bg));
  }

  .toggle {
    right: -12px;
    top: 50%;
    transform: translateY(-50%);
  }

  .toggle .vert {
    transition: opacity 0.15s;
  }

  .toggle:not(.open) .vert {
    opacity: 0;
  }

  .edit {
    left: -12px;
    top: -12px;
  }
</style>
