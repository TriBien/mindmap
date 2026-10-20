<script>
  import { map, stopEdit, cancelEdit } from './store.svelte.js'
  import { ui } from './sizes.svelte.js'

  const node = $derived(map.editingId ? map.nodes[map.editingId] : null)

  let draft = $state('')
  let ta = $state(null)
  let sheetEl = $state(null)
  let kb = $state(0)

  const title = $derived(
    map.editingId === map.rootId ? 'Edit central idea' : 'Edit node',
  )

  $effect(() => {
    if (node) {
      draft = node.text
      requestAnimationFrame(() => {
        ta?.focus()
        if (node.text) ta?.setSelectionRange(node.text.length, node.text.length)
      })
    }
  })

  // report sheet height so the canvas can keep the edited node visible
  $effect(() => {
    if (!sheetEl || !node) return
    const ro = new ResizeObserver(() => {
      ui.sheetHeight = sheetEl.offsetHeight
    })
    ro.observe(sheetEl)
    ui.sheetHeight = sheetEl.offsetHeight
    return () => {
      ro.disconnect()
      ui.sheetHeight = 0
    }
  })

  // lift the sheet above the on-screen keyboard (iOS/Android)
  $effect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const update = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      kb = inset > 80 ? inset : 0
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
    }
  })

  function done() {
    stopEdit(draft)
  }

  function cancel() {
    cancelEdit()
  }

  function onKeydown(e) {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      done()
    }
  }

  function autosize(node) {
    node.style.height = 'auto'
    const max = Math.round(window.innerHeight * 0.3)
    node.style.height = Math.min(node.scrollHeight, max) + 'px'
  }
</script>

{#if node}
  <div class="scrim" role="presentation"></div>

  <div
    class="sheet"
    class:lifted={kb > 0}
    bind:this={sheetEl}
    style:--kb="{kb}px"
    role="dialog"
    aria-label={title}
  >
    <div class="grip" aria-hidden="true"></div>

    <div class="head">
      <span class="title">{title}</span>
      <div class="actions">
        <button class="btn ghost" onclick={cancel}>Cancel</button>
        <button class="btn primary" onclick={done}>Done</button>
      </div>
    </div>

    <textarea
      bind:this={ta}
      bind:value={draft}
      onkeydown={onKeydown}
      oninput={(e) => autosize(e.currentTarget)}
      placeholder="Type your idea…"
      rows="2"
      enterkeyhint="done"
      aria-label="Node text"
    ></textarea>

    <p class="hint">Esc to cancel · ⌘/Ctrl+Enter to save</p>
  </div>
{/if}

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: rgb(0 0 0 / 0.35);
    z-index: 20;
    -webkit-tap-highlight-color: transparent;
  }

  .sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 21;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 8px 16px calc(12px + env(safe-area-inset-bottom, 0px));
    background: var(--panel);
    border-radius: 18px 18px 0 0;
    border-top: 1px solid var(--border);
    box-shadow: 0 -8px 30px rgb(0 0 0 / 0.2);
    transform: translateY(calc(-1 * var(--kb, 0px)));
    transition: transform 0.18s ease;
  }

  .sheet.lifted {
    transition: none; /* keyboard movement should feel instant */
  }

  .grip {
    width: 36px;
    height: 4px;
    border-radius: 2px;
    background: var(--border-strong);
    margin: 0 auto 2px;
  }

  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-h);
  }

  .actions {
    display: flex;
    gap: 8px;
  }

  .btn {
    border: none;
    border-radius: 10px;
    padding: 10px 16px;
    font: inherit;
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
    min-height: 44px; /* comfortable touch target */
  }

  .btn.ghost {
    background: transparent;
    color: var(--text);
    border: 1px solid var(--border);
  }

  .btn.primary {
    background: var(--accent);
    color: #fff;
  }

  textarea {
    box-sizing: border-box;
    width: 100%;
    min-height: 72px;
    max-height: 30vh;
    resize: none;
    border: 1.5px solid var(--border);
    border-radius: 12px;
    padding: 12px 14px;
    background: var(--node-bg);
    color: var(--node-text);
    /* 16px+ prevents iOS auto-zoom on focus */
    font: inherit;
    font-size: 16px;
    line-height: 1.45;
    outline: none;
  }

  textarea:focus {
    border-color: var(--accent);
  }

  .hint {
    margin: 0;
    font-size: 11.5px;
    color: var(--text);
    text-align: center;
  }

  @media (min-width: 640px) {
    .sheet {
      left: 50%;
      right: auto;
      bottom: 24px;
      width: min(560px, calc(100vw - 32px));
      transform: translate(-50%, calc(-1 * var(--kb, 0px)));
      border-radius: 18px;
      border: 1px solid var(--border);
      padding-bottom: 16px;
    }
  }
</style>
