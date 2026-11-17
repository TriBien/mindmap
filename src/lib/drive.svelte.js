import config from './config.json'
import { applyRemote, map, snapshotData, storage } from './store.svelte.js'

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
const API = 'https://www.googleapis.com/drive/v3'
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3'
const TOKEN_KEY = 'mindmap.drive.token.v1'
const ENABLED_KEY = 'mindmap.drive.enabled'
const POLL_MS = 30_000
const PUSH_DEBOUNCE_MS = 1_200
const TOKEN_REFRESH_MARGIN = 60_000

export const drive = $state({
  configured: Boolean(config.googleClientId),
  status: 'disconnected', // disconnected | connecting | connected
  busy: false,
  email: null,
  fileName: config.driveFileName,
  lastSyncAt: 0,
  error: null,
})

let accessToken = null
let tokenExpiresAt = 0
let fileId = null
let pushTimer = null
let pollTimer = null
let currentSync = null
let queued = false
let lastPulledAt = null
let listenersBound = false
let gisPromise = null

class AuthError extends Error {
  constructor(message = 'Google Drive session expired') {
    super(message)
    this.name = 'AuthError'
  }
}

function readSession() {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    if (!raw) return
    const data = JSON.parse(raw)
    accessToken = data?.accessToken || null
    tokenExpiresAt = Number(data?.expiresAt) || 0
    fileId = data?.fileId || null
  } catch {
    // ignore corrupt session
  }
}

function persistSession() {
  try {
    localStorage.setItem(
      TOKEN_KEY,
      JSON.stringify({ accessToken, expiresAt: tokenExpiresAt, fileId }),
    )
  } catch {
    // storage may be unavailable
  }
}

function clearSession() {
  accessToken = null
  tokenExpiresAt = 0
  fileId = null
  drive.email = null
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // ignore
  }
}

function tokenValid() {
  return Boolean(accessToken) && tokenExpiresAt - TOKEN_REFRESH_MARGIN > Date.now()
}

function setToken(resp) {
  accessToken = resp.access_token
  tokenExpiresAt = Date.now() + (Number(resp.expires_in) || 3600) * 1000
  persistSession()
}

function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Could not load Google sign-in'))
      document.head.appendChild(script)
    })
  }
  return gisPromise
}

// `prompt` omitted → normal interactive consent flow.
// `prompt: ''` → silent refresh; fails instead of showing any UI.
function requestToken(prompt) {
  return loadGis().then(
    () =>
      new Promise((resolve, reject) => {
        let settled = false
        const options = {
          client_id: config.googleClientId,
          scope: DRIVE_SCOPE,
          callback: (resp) => {
            if (settled) return
            settled = true
            if (resp?.error) reject(new Error(resp.error_description || resp.error))
            else resolve(resp)
          },
          error_callback: (err) => {
            if (settled) return
            settled = true
            reject(new Error(err?.message || err?.type || 'Google authorization failed'))
          },
        }
        if (prompt !== undefined) options.prompt = prompt
        window.google.accounts.oauth2.initTokenClient(options).requestAccessToken()
      }),
  )
}

async function refreshToken() {
  try {
    const resp = await requestToken('')
    setToken(resp)
    return true
  } catch {
    return false
  }
}

async function authorizedFetch(url, options = {}) {
  if (!tokenValid() && !(await refreshToken())) {
    throw new AuthError()
  }
  const send = () =>
    fetch(url, {
      ...options,
      headers: {
        ...(options.headers || {}),
        Authorization: `Bearer ${accessToken}`,
      },
    })

  let res = await send()
  if (res.status === 401) {
    if (!(await refreshToken())) throw new AuthError()
    res = await send()
  }
  return res
}

async function ensureOk(res) {
  if (res.ok) return res
  let message = `Google Drive request failed (${res.status})`
  try {
    const data = await res.json()
    message = data?.error?.message || message
  } catch {
    // response had no JSON body
  }
  if (res.status === 401) throw new AuthError(message)
  throw new Error(message)
}

async function fetchEmail() {
  try {
    const res = await authorizedFetch(`${API}/about?fields=user(emailAddress)`)
    if (!res.ok) return null
    const data = await res.json()
    return data?.user?.emailAddress || null
  } catch {
    return null
  }
}

async function findFile() {
  const name = config.driveFileName.replace(/\\/g, '\\\\').replace(/'/g, "\\'")
  const q = encodeURIComponent(`name = '${name}' and trashed = false`)
  const res = await authorizedFetch(
    `${API}/files?q=${q}&spaces=drive&orderBy=modifiedTime%20desc&pageSize=10` +
      '&fields=files(id,name,modifiedTime)',
  )
  await ensureOk(res)
  const data = await res.json()
  return data?.files?.[0] || null
}

async function readRemote(id) {
  const res = await authorizedFetch(
    `${API}/files/${encodeURIComponent(id)}?alt=media`,
  )
  if (res.status === 404) return { notFound: true }
  await ensureOk(res)
  const text = await res.text()
  if (!text.trim()) return null
  try {
    const data = JSON.parse(text)
    if (Array.isArray(data?.maps)) {
      const valid = data.maps.some(
        (m) => m?.rootId && m?.nodes?.[m.rootId],
      )
      return valid ? data : null
    }
    if (!data?.rootId || !data.nodes?.[data.rootId]) return null
    return data
  } catch {
    return null
  }
}

async function uploadLocal(existingId) {
  const payload = {
    ...snapshotData(),
    app: 'mindmap',
    version: 1,
  }
  const body = JSON.stringify(payload)

  if (existingId) {
    const res = await authorizedFetch(
      `${UPLOAD_API}/files/${encodeURIComponent(existingId)}` +
        '?uploadType=media&fields=id,name,modifiedTime',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body,
      },
    )
    await ensureOk(res)
    const data = await res.json()
    fileId = data?.id || existingId
  } else {
    const boundary = `mindmap-${Date.now().toString(36)}`
    const metadata = {
      name: config.driveFileName,
      mimeType: 'application/json',
    }
    const multipart = new Blob([
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      JSON.stringify(metadata),
      `\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n`,
      body,
      `\r\n--${boundary}--`,
    ])
    const res = await authorizedFetch(
      `${UPLOAD_API}/files?uploadType=multipart&fields=id,name,modifiedTime`,
      {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipart,
      },
    )
    await ensureOk(res)
    const data = await res.json()
    fileId = data?.id || null
  }

  persistSession()
  return payload.savedAt
}

function pullRemote(remote, remoteTime) {
  if (!applyRemote(remote, remoteTime)) return false
  lastPulledAt = Number(storage.savedAt) || 0
  return true
}

async function withBusy(fn) {
  drive.busy = true
  try {
    return await fn()
  } finally {
    drive.busy = false
  }
}

async function runSync({ initial = false } = {}) {
  if (!navigator.onLine) throw new Error('You are offline')
  if (initial) drive.busy = true
  drive.error = null
  try {
    const file = await findFile()
    const localTime = Number(storage.savedAt) || 0

    if (!file) {
      const savedAt = await withBusy(() => uploadLocal(null))
      lastPulledAt = savedAt
      drive.lastSyncAt = Date.now()
      return
    }

    fileId = file.id
    persistSession()

    const remote = await readRemote(file.id)
    if (remote?.notFound) {
      const savedAt = await withBusy(() => uploadLocal(null))
      lastPulledAt = savedAt
      drive.lastSyncAt = Date.now()
      return
    }

    if (!remote) {
      const savedAt = await withBusy(() => uploadLocal(file.id))
      lastPulledAt = savedAt
      drive.lastSyncAt = Date.now()
      return
    }

    const remoteTime = Number.isFinite(Number(remote.savedAt))
      ? Number(remote.savedAt)
      : Date.parse(file.modifiedTime) || 0

    if (initial) {
      // A fresh device starts with savedAt 0, so an existing Drive copy
      // always wins over the seeded placeholder map.
      if (localTime === 0 || remoteTime > localTime) {
        await withBusy(() => pullRemote(remote, remoteTime))
      } else {
        const savedAt = await withBusy(() => uploadLocal(file.id))
        lastPulledAt = savedAt
      }
    } else if (remoteTime > localTime + 500) {
      // Don't yank the map out from under an open editor.
      if (!map.editingId) await withBusy(() => pullRemote(remote, remoteTime))
    } else if (localTime > remoteTime + 500) {
      const savedAt = await withBusy(() => uploadLocal(file.id))
      lastPulledAt = savedAt
    }

    drive.lastSyncAt = Date.now()
  } finally {
    drive.busy = false
  }
}

function stopPolling() {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = null
}

function startPolling() {
  stopPolling()
  pollTimer = setInterval(() => {
    if (document.visibilityState === 'visible') {
      syncNow({ background: true })
    }
  }, POLL_MS)
}

function handleAuthLoss() {
  clearSession()
  stopPolling()
  clearTimeout(pushTimer)
  pushTimer = null
  drive.status = 'disconnected'
  drive.busy = false
  drive.error = 'Google Drive session expired. Connect again to resume syncing.'
}

function bindListeners() {
  if (listenersBound) return
  listenersBound = true
  window.addEventListener('online', () => {
    if (drive.status === 'connected') syncNow({ background: true })
  })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && drive.status === 'connected') {
      syncNow({ background: true })
    }
  })
}

export function notifyLocalSave(savedAt) {
  if (drive.status !== 'connected') return
  if (savedAt === lastPulledAt) return
  schedulePush()
}

export function schedulePush(delay = PUSH_DEBOUNCE_MS) {
  if (drive.status !== 'connected') return
  clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    syncNow({ background: true })
  }, delay)
}

export function syncNow({ initial = false, background = false } = {}) {
  if (drive.status !== 'connected') return Promise.resolve()
  if (currentSync) {
    queued = true
    return currentSync
  }

  currentSync = runSync({ initial })
    .catch((err) => {
      if (err instanceof AuthError) {
        handleAuthLoss()
      } else if (!background) {
        drive.error = err?.message || 'Sync failed'
      }
    })
    .finally(() => {
      currentSync = null
      if (queued) {
        queued = false
        schedulePush(100)
      }
    })
  return currentSync
}

export async function connectDrive() {
  if (!drive.configured) {
    drive.error = 'Google Drive is not configured.'
    return
  }
  if (drive.status === 'connecting') return
  drive.status = 'connecting'
  drive.error = null
  try {
    const resp = await requestToken()
    setToken(resp)
    localStorage.setItem(ENABLED_KEY, '1')
    drive.status = 'connected'
    drive.email = await fetchEmail()
    bindListeners()
    startPolling()
    await syncNow({ initial: true })
  } catch (err) {
    clearSession()
    drive.status = 'disconnected'
    drive.error = friendlyError(err)
  }
}

export async function initDrive() {
  if (!drive.configured) return
  // Warm up Google Identity Services so the first Connect click can open
  // its popup while the browser still has user activation.
  loadGis().catch(() => {})
  bindListeners()
  readSession()

  if (tokenValid()) {
    drive.status = 'connected'
    drive.email = await fetchEmail()
    startPolling()
    await syncNow({ initial: true, background: true })
    return
  }

  clearSession()
  if (localStorage.getItem(ENABLED_KEY) === '1') {
    try {
      const resp = await requestToken('')
      setToken(resp)
      drive.status = 'connected'
      drive.email = await fetchEmail()
      startPolling()
      await syncNow({ initial: true, background: true })
    } catch {
      drive.status = 'disconnected'
    }
  }
}

export function disconnectDrive() {
  const token = accessToken
  clearSession()
  stopPolling()
  clearTimeout(pushTimer)
  pushTimer = null
  queued = false
  lastPulledAt = null
  drive.status = 'disconnected'
  drive.busy = false
  drive.error = null
  try {
    localStorage.removeItem(ENABLED_KEY)
  } catch {
    // ignore
  }
  if (token && window.google?.accounts?.oauth2?.revoke) {
    try {
      window.google.accounts.oauth2.revoke(token, () => {})
    } catch {
      // token revoke is best-effort
    }
  }
}

function friendlyError(err) {
  const message = err?.message || String(err)
  if (/popup|access_denied|denied|cancel|closed/i.test(message)) {
    return 'Connection cancelled.'
  }
  return message
}
