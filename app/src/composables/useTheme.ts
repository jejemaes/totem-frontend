import { ref } from 'vue'

/**
 * Light/dark switch.
 *
 * PrimeVue is configured with `darkModeSelector: '.app-dark'`, so toggling that
 * class on <html> is all it takes; our own stylesheet keys off the same class.
 * The choice is remembered, and falls back to the OS preference on first visit.
 */

const STORAGE_KEY = 'totem.theme'

type Theme = 'light' | 'dark'

function preferredTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

const theme = ref<Theme>('light')

function apply(next: Theme): void {
  theme.value = next
  document.documentElement.classList.toggle('app-dark', next === 'dark')
  localStorage.setItem(STORAGE_KEY, next)
}

/** Called once at boot, before the app mounts, to avoid a flash of the wrong theme. */
export function initTheme(): void {
  apply(preferredTheme())
}

export function useTheme() {
  return {
    theme,
    toggle: () => apply(theme.value === 'dark' ? 'light' : 'dark'),
  }
}
