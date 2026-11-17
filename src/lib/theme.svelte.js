const THEME_KEY = 'mindmap.theme.v1'
const MODES = ['light', 'dark', 'system']

function loadMode() {
  try {
    const value = localStorage.getItem(THEME_KEY)
    if (MODES.includes(value)) return value
  } catch {
    // storage unavailable — fall back to system
  }
  return 'system'
}

export const theme = $state({ mode: loadMode(), dark: false })

const darkQuery =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null

const THEME_COLORS = {
  light: '#f6f7fb',
  dark: '#12141a',
}

function resolved() {
  if (theme.mode === 'system') {
    return darkQuery?.matches ? 'dark' : 'light'
  }
  return theme.mode
}

function apply() {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const value = resolved()
  theme.dark = value === 'dark'
  root.dataset.theme = value
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLORS[value])
}

export function setTheme(mode) {
  if (!MODES.includes(mode)) return
  theme.mode = mode
  try {
    localStorage.setItem(THEME_KEY, mode)
  } catch {
    // storage unavailable — still apply in memory
  }
  apply()
}

export function toggleTheme() {
  setTheme(resolved() === 'dark' ? 'light' : 'dark')
}

export function initTheme() {
  apply()
  darkQuery?.addEventListener('change', apply)
}
