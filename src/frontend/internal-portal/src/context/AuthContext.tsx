import React, { createContext, useContext, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import type { AuthUser, UserRole } from '../types'

interface AuthContextValue {
  currentUser: AuthUser | null
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  isAuthenticated: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

function decodePayload(token: string): Record<string, string> {
  try {
    return JSON.parse(atob(token.split('.')[1]))
  } catch {
    return {}
  }
}

function tokenToUser(token: string): AuthUser | null {
  const p = decodePayload(token)
  if (!p.sub) return null
  return {
    id: p.sub,
    email: p.email ?? '',
    name: p.full_name ?? p.email ?? '',
    role: (p.role as UserRole) ?? 'AUDITOR',
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate()
  const stored = localStorage.getItem('internal_token')
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(
    stored ? tokenToUser(stored) : null
  )

  const login = useCallback(async (email: string, password: string) => {
    const { loginApi } = await import('../api/auth')
    const data = await loginApi(email, password)
    localStorage.setItem('internal_token', data.access_token)
    const user = tokenToUser(data.access_token)
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
