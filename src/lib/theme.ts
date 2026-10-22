import { useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark'

const KEY = 'takitho-theme'
const listeners = new Set<() => void>()

function readStored(): Theme | null {
  try {
    const value = localStorage.getItem(KEY)
    return value === 'light' || value === 'dark' ? value : null
  } catch {
    return null
  }
}

function systemTheme(): Theme {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function getTheme(): Theme {
  const attr = document.documentElement.dataset.theme
  return attr === 'dark' || attr === 'light' ? attr : (readStored() ?? systemTheme())
}

export function setTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(KEY, theme)
  } catch {
    /* private mode: the choice just won't persist */
  }
  listeners.forEach((fn) => fn())
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange)
  // Follow the system while the visitor has not chosen explicitly.
  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const onSystem = () => {
    if (readStored() === null) {
      document.documentElement.dataset.theme = systemTheme()
      onChange()
    }
  }
  media.addEventListener('change', onSystem)
  return () => {
    listeners.delete(onChange)
    media.removeEventListener('change', onSystem)
  }
}

export function useTheme(): readonly [Theme, (theme: Theme) => void] {
  const theme = useSyncExternalStore(subscribe, getTheme, () => 'light' as const)
  return [theme, setTheme] as const
}
