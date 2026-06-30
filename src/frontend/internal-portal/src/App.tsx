import React, { Suspense, lazy } from 'react'
import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import type { UserRole } from './types'
import { Login } from './pages/Login'

const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })))
const ClaimDetail = lazy(() => import('./pages/ClaimDetail').then((m) => ({ default: m.ClaimDetail })))
const Reports = lazy(() => import('./pages/Reports').then((m) => ({ default: m.Reports })))

function PrivateRoute({ allowedRoles }: { allowedRoles?: UserRole[] }) {
  const { isAuthenticated, currentUser } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (allowedRoles && currentUser && !allowedRoles.includes(currentUser.role)) {
    return <Navigate to="/dashboard" replace />
  }
  return <Outlet />
}

export default function App() {
  return (
    <Suspense fallback={<div style={{ padding: 40 }}>Loading…</div>}>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<PrivateRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/claims/:id" element={<ClaimDetail />} />
        </Route>
        <Route element={<PrivateRoute allowedRoles={['CASE_MANAGER', 'REGIONAL_MANAGER']} />}>
          <Route path="/reports" element={<Reports />} />
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  )
}
