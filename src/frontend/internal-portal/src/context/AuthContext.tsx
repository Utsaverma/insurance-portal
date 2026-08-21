import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AuthUser } from '../types'
import { profileToUser, tokenToUser } from '../lib/user'

interface AuthContextValue {
  currentUser: AuthUser | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const stored = localStorage.getItem('internal_token')
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(
    stored ? tokenToUser(stored) : null
  )

  // Reconcile against the authoritative profile once per boot. This picks up a
  // name changed via PATCH /users/me since the token was minted, and doubles as
  // an early token-validity check. Failures are swallowed: the axios 401
  // interceptor in api/client.ts already handles expiry. Boot-only: login()
  // below already stores the authoritative profile from the login response.
  useEffect(() => {
    if (!localStorage.getItem('internal_token')) return
    let cancelled = false
    import('../api/auth')
      .then(({ me }) => me())
      .then((profile) => {
        if (!cancelled) setCurrentUser(profileToUser(profile))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const { loginApi } = await import('../api/auth')
    const data = await loginApi(email, password)
    localStorage.setItem('internal_token', data.access_token)
    // Prefer the embedded profile when present; fall back to the token claims.
    const user = data.user ? profileToUser(data.user) : tokenToUser(data.access_token)
    setCurrentUser(user)
    navigate('/dashboard')
  }, [navigate])

  const logout = useCallback(() => {
    localStorage.removeItem('internal_token')
    setCurrentUser(null)
    navigate('/login')
  }, [navigate])

  return (
    <AuthContext.Provider value={{ currentUser, login, logout, isAuthenticated: !!currentUser }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
