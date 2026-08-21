import React, { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Alert, Button, Card, CardBody, Input, Logo } from '../components/ui'

export function Login() {
  const { login, isAuthenticated } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  if (isAuthenticated) return <Navigate to="/dashboard" replace />

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, password)
    } catch {
      setError('Invalid email or password.')
    } finally {
      setLoading(false)
    }
  }

  return (
    // min-h-dvh rather than min-h-screen: 100vh is clipped by the iOS Safari
    // toolbar, dvh is not.
    <div className="min-h-dvh bg-app">
      <div className="mx-auto grid min-h-dvh max-w-content-lg items-center gap-10 px-4 py-12 lg:grid-cols-2 lg:gap-16">
        {/* Brand panel — decorative, so it stays out of the way on mobile. */}
        <div className="hidden lg:block">
          <Logo className="h-12 w-12 text-brand-600" />
          <h2 className="mt-6 text-3xl font-semibold tracking-tight text-fg">
            Every claim, fully audited.
          </h2>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-fg-muted">
            Triage the queue, run surveys and adjudicate claims — with a full
            audit trail behind every status change.
          </p>
        </div>

        <Card className="w-full justify-self-center sm:max-w-md">
          <CardBody size="lg">
            <div className="mb-6 flex items-center gap-2">
              <Logo className="h-7 w-7 text-brand-600 lg:hidden" />
              <div>
                <h1 className="text-2xl font-semibold text-fg">eClaims Internal</h1>
                <p className="text-sm text-fg-muted">Sign in to continue</p>
              </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <Input
                label="Email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
              <Input
                label="Password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              {error && <Alert tone="danger">{error}</Alert>}
              <Button type="submit" size="lg" fullWidth loading={loading}>
                {loading ? 'Signing in…' : 'Sign In'}
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </div>
  )
}
