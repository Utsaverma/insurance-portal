export type ThemeMode = 'light' | 'dark' | 'auto'
export type ResolvedTheme = 'light' | 'dark'

/** Same key in both portals. Deliberately not the token key — the 401 hard
 *  redirect in api/client.ts must clear the token and leave this alone. */
export const THEME_STORAGE_KEY = 'eclaims_theme'

export const DARK_QUERY = '(prefers-color-scheme: dark)'

export function prefersDark(): boolean {
  return typeof window !== 'undefined' && window.matchMedia(DARK_QUERY).matches
}

export function readMode(): ThemeMode {
  try {
    const raw = localStorage.getItem(THEME_STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'auto') return raw
  } catch {
    /* storage disabled */
  }
  return 'auto'
}

export function resolve(mode: ThemeMode): ResolvedTheme {
  if (mode === 'auto') return prefersDark() ? 'dark' : 'light'
  return mode
}

/**
 * Applies the mode to <html> and persists it.
 * Setting style.colorScheme is what fixes native scrollbars, form controls and
 * the default canvas colour — the `.dark` class alone does not.
 */
export function apply(mode: ThemeMode): ResolvedTheme {
  const resolved = resolve(mode)
  const root = document.documentElement
  root.classList.toggle('dark', resolved === 'dark')
  root.style.colorScheme = resolved
  try {
    localStorage.setItem(THEME_STORAGE_KEY, mode)
  } catch {
    /* storage disabled — the choice just won't survive a reload */
  }
  return resolved
}
