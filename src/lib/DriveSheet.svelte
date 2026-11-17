<script>
  import { onMount } from 'svelte'
  import { drive, connectDrive, disconnectDrive, syncNow } from './drive.svelte.js'

  let { onclose } = $props()
  let now = $state(Date.now())

  onMount(() => {
    const timer = setInterval(() => (now = Date.now()), 15_000)
    return () => clearInterval(timer)
  })

  const status = $derived.by(() => {
    if (!drive.configured) {
      return {
        tone: 'error',
        title: 'Not configured',
        detail: 'Add a Google client ID to enable Drive sync.',
      }
    }
    if (drive.status === 'connecting') {
      return {
        tone: 'busy',
        title: 'Connecting',
        detail: 'Finish signing in with Google.',
      }
    }
    if (drive.status === 'connected') {
      if (drive.error) {
        return { tone: 'error', title: 'Sync issue', detail: drive.error }
      }
      if (drive.busy) {
        return {
          tone: 'busy',
          title: 'Syncing',
          detail: `Updating ${drive.fileName} in your Google Drive.`,
        }
      }
      return {
        tone: 'ok',
        title: 'Connected',
        detail: 'Changes sync automatically.',
      }
    }
    if (drive.error) {
      return { tone: 'error', title: 'Not connected', detail: drive.error }
    }
    return {
      tone: 'off',
      title: 'Not connected',
      detail: 'Your maps are saved on this device only.',
    }
  })

  const lastSync = $derived.by(() => {
    now
    if (!drive.lastSyncAt) return 'Not synced yet'
    const diff = Math.max(0, now - drive.lastSyncAt)
    if (diff < 60_000) return 'Just now'
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} min ago`
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} h ago`
    return new Date(drive.lastSyncAt).toLocaleString()
  })

  function onKeydown(e) {
    if (e.key === 'Escape') onclose()
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="scrim" role="presentation" onclick={onclose}></div>

<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="drive-title">
  <div class="head">
    <div class="brand">
      <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
        <path
          d="M7.5 18.5h9.2a3.8 3.8 0 0 0 .6-7.55A5.7 5.7 0 0 0 6.3 9.2a4.65 4.65 0 0 0 1.2 9.3z"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linejoin="round"
        />
      </svg>
      <div>
        <h2 id="drive-title">Google Drive</h2>
        <p class="file">{drive.fileName}</p>
      </div>
    </div>
    <button class="close" onclick={onclose} aria-label="Close">×</button>
  </div>

  <div class="status {status.tone}">
    <span class="dot" aria-hidden="true"></span>
    <div class="status-copy">
      <strong>{status.title}</strong>
      <span>{status.detail}</span>
    </div>
  </div>

  {#if drive.status === 'connected'}
    <dl>
      <div>
        <dt>Account</dt>
        <dd>{drive.email || 'Google account'}</dd>
      </div>
      <div>
        <dt>Last sync</dt>
        <dd>{lastSync}</dd>
      </div>
      <div>
        <dt>Local copy</dt>
        <dd>Always saved on this device</dd>
      </div>
    </dl>

    <div class="buttons">
      <button class="btn primary" onclick={() => syncNow()} disabled={drive.busy}>
        {drive.busy ? 'Syncing…' : 'Sync now'}
      </button>
      <button class="btn ghost" onclick={disconnectDrive}>Disconnect</button>
    </div>
  {:else}
    <p class="note">
      Your mind maps stay in this browser and are copied to
      <strong>{drive.fileName}</strong> in Google Drive. When you connect, the
      newest copy wins.
    </p>

    <div class="buttons">
      <button
        class="btn primary"
        onclick={connectDrive}
        disabled={drive.status === 'connecting' || !drive.configured}
      >
        {drive.status === 'connecting' ? 'Connecting…' : 'Connect Google Drive'}
      </button>
      <button class="btn ghost" onclick={onclose}>Not now</button>
    </div>
  {/if}
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
    gap: 14px;
    padding: 18px 16px calc(16px + env(safe-area-inset-bottom, 0px));
    background: var(--panel);
    border-radius: 18px 18px 0 0;
    border-top: 1px solid var(--border);
    box-shadow: 0 -8px 30px rgb(0 0 0 / 0.2);
    max-height: calc(100dvh - 32px);
    overflow-y: auto;
  }

  .head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--accent);
  }

  h2 {
    margin: 0;
    font-size: 17px;
    font-weight: 600;
    color: var(--text-h);
    letter-spacing: -0.2px;
  }

  .file {
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

  .status {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 12px;
    border-radius: 12px;
    border: 1px solid var(--border);
    background: color-mix(in srgb, var(--bg) 65%, transparent);
  }

  .dot {
    flex: none;
    width: 9px;
    height: 9px;
    margin-top: 5px;
    border-radius: 50%;
    background: #9ca3af;
  }

  .status.ok {
    border-color: color-mix(in srgb, #10b981 40%, var(--border));
  }

  .status.ok .dot {
    background: #10b981;
  }

  .status.busy .dot {
    background: #f59e0b;
    animation: pulse 1s ease-in-out infinite;
  }

  .status.error {
    border-color: color-mix(in srgb, #ef4444 40%, var(--border));
  }

  .status.error .dot {
    background: #ef4444;
  }

  .status-copy {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .status-copy strong {
    font-size: 14px;
    color: var(--text-h);
  }

  .status-copy span {
    font-size: 12.5px;
    color: var(--text);
    line-height: 1.4;
  }

  dl {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 0;
  }

  dl > div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    font-size: 13px;
  }

  dt {
    color: var(--text);
  }

  dd {
    margin: 0;
    color: var(--text-h);
    text-align: right;
    overflow-wrap: anywhere;
  }

  .note {
    margin: 0;
    font-size: 13px;
    line-height: 1.5;
    color: var(--text);
  }

  .note strong {
    color: var(--text-h);
    font-weight: 600;
  }

  .buttons {
    display: flex;
    gap: 8px;
  }

  .btn {
    flex: 1;
    border: none;
    border-radius: 10px;
    padding: 12px 16px;
    font: inherit;
    font-size: 15px;
    font-weight: 500;
    cursor: pointer;
    min-height: 46px;
  }

  .btn:disabled {
    opacity: 0.6;
    cursor: default;
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

  @keyframes pulse {
    50% {
      opacity: 0.35;
    }
  }

  @media (min-width: 640px) {
    .sheet {
      left: 50%;
      right: auto;
      bottom: 50%;
      width: min(460px, calc(100vw - 32px));
      transform: translate(-50%, 50%);
      border-radius: 18px;
      border: 1px solid var(--border);
      padding-bottom: 18px;
    }
  }
</style>
