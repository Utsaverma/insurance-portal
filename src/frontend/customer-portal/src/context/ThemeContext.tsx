import React, { createContext, useCallback, useContext, useEffect, useState } from 'react'
import {
  apply,
  DARK_QUERY,
  readMode,
  resolve,
  type ResolvedTheme,
  type ThemeMode,
} from '../lib/theme'

interface ThemeContextValue {
  /** What the user chose. */
  mode: ThemeMode
  /** What is actually rendered — the toggle's trigger icon reflects this. */
  resolved: ResolvedTheme
  setMode: (mode: ThemeMode) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  // public/theme-init.js has already put the class on <html> before first
  // paint, so this only mirrors the decision into React state.
  const [mode, setModeState] = useState<ThemeMode>(() => readMode())
  const [resolved, setResolved] = useState<ResolvedTheme>(() => resolve(readMode()))

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next)
    setResolved(apply(next))
  }, [])

  useEffect(() => {
    if (mode !== 'auto') return
    const mq = window.matchMedia(DARK_QUERY)
    const onChange = () => setResolved(apply('auto'))
    mq.addEventListener('change', onChange)
    // The cleanup is mandatory: both main.tsx files use React.StrictMode, which
    // mounts effects twice in dev, so a missing cleanup accumulates listeners.
    return () => mq.removeEventListener('change', onChange)
  }, [mode])

  return (
    <ThemeContext.Provider value={{ mode, resolved, setMode }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
