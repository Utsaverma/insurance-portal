import React, { createContext, useContext, useState, useEffect } from 'react'
import type { AuthUser } from '../types'
import { canUsePortal, profileToUser, tokenToUser } from '../lib/user'
import { me } from '../api/auth'

interface AuthContextValue {
  token: string | null
  currentUser: AuthUser | null
  login: (token: string) => void
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** The stored session, if it is one this portal accepts. An unreadable token,
 *  or one for a staff account, is dropped rather than half-trusted. */
function readSession(): { token: string; user: AuthUser } | null {
  const token = localStorage.getItem('eclaims_token')
  const user = token ? tokenToUser(token) : null
  if (!token || !user || !canUsePortal(user.role)) {
    localStorage.removeItem('eclaims_token')
    return null
  }
  return { token, user }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Hydrated from the stored token in the initialiser so the header has a name
  // on the very first render, with no loading flash and no round trip.
  const [initial] = useState(readSession)
  const [token, setToken] = useState<string | null>(initial?.token ?? null)
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(initial?.user ?? null)

  // Reconcile against the authoritative profile once per boot. This picks up a
  // name changed via PATCH /users/me since the token was minted, and doubles as
  // an early token-validity check. Failures are swallowed: the axios 401
  // interceptor in api/client.ts already handles expiry.
  useEffect(() => {
    if (!token) return
    let cancelled = false
    me()
      .then((profile) => {
        if (!cancelled) setCurrentUser(profileToUser(profile))
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [token])

  const login = (newToken: string) => {
    localStorage.setItem('eclaims_token', newToken)
    setToken(newToken)
    setCurrentUser(tokenToUser(newToken))
  }

  const logout = () => {
    localStorage.removeItem('eclaims_token')
    setToken(null)
    setCurrentUser(null)
  }

  return (
    <AuthContext.Provider
      value={{ token, currentUser, login, logout, isAuthenticated: !!token }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
