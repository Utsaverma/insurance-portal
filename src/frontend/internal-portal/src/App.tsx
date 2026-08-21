import React, { Suspense, lazy } from 'react'
import { Routes, Route, Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import type { UserRole } from './types'
import { AppShell } from './components/layout/AppShell'
import { LoadingBlock, PageContainer } from './components/ui'
import { Login } from './pages/Login'

const Dashboard = lazy(() => import('./pages/Dashboard').then((m) => ({ default: m.Dashboard })))
const ClaimDetail = lazy(() => import('./pages/ClaimDetail').then((m) => ({ default: m.ClaimDetail })))
const Reports = lazy(() => import('./pages/Reports').then((m) => ({ default: m.Reports })))

function PrivateRoute({ allowedRoles }: { allowedRoles?: UserRole[] }) {
  const { isAuthenticated, currentUser } = useAuth()
  if (!isAuthenticated) return <Navigate to="/login" replace />
  // Fail closed: a null currentUser must not skip the role check entirely.
  if (allowedRoles && (!currentUser || !allowedRoles.includes(currentUser.role))) {
    return <Navigate to="/dashboard" replace />
  }
  return <Outlet />
}

export default function App() {
  return (
    // Cold-boot fallback only. The boundary that matters during navigation
    // lives inside AppShell's <main>, so a lazy chunk load no longer blanks
    // the header.
    <Suspense
      fallback={
        <PageContainer>
          <LoadingBlock />
        </PageContainer>
      }
    >
      <Routes>
        <Route path="/login" element={<Login />} />
        {/* AppShell nests INSIDE each PrivateRoute, repeated rather than
            hoisted above both — hoisting would render the shell during an
            unauthenticated redirect. React reconciles the two as the same
            component type at the same tree position, so /dashboard -> /reports
            does not remount the shell. */}
        <Route element={<PrivateRoute />}>
          <Route element={<AppShell />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/claims/:id" element={<ClaimDetail />} />
          </Route>
        </Route>
        <Route element={<PrivateRoute allowedRoles={['CASE_MANAGER', 'REGIONAL_MANAGER']} />}>
          <Route element={<AppShell />}>
            <Route path="/reports" element={<Reports />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  )
}
