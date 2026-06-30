import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { listClaims } from '../api/claims'
import { ClaimsTable } from '../components/ClaimsTable'
import type { Claim, UserRole } from '../types'

export function Dashboard() {
  const { currentUser, logout } = useAuth()
  const navigate = useNavigate()
  const [claims, setClaims] = useState<Claim[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listClaims().then((r) => setClaims(r.items)).finally(() => setLoading(false))
  }, [])

  const canViewReports = currentUser?.role === 'CASE_MANAGER' || currentUser?.role === 'REGIONAL_MANAGER'

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, padding: '12px 0', borderBottom: '1px solid #e5e7eb' }}>
        <span style={{ fontWeight: 700, fontSize: 18 }}>eClaims Internal</span>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          <span style={{ color: '#6b7280', fontSize: 14 }}>{currentUser?.name} · {currentUser?.role}</span>
          {canViewReports && (
            <button onClick={() => navigate('/reports')}
              style={{ padding: '6px 14px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer' }}>
              Reports
            </button>
          )}
          <button onClick={logout}
            style={{ padding: '6px 14px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer' }}>
            Logout
          </button>
        </div>
      </nav>
      <h1 style={{ fontSize: 22, marginBottom: 20 }}>Claims Queue</h1>
      {loading ? <p>Loading…</p> : (
        <ClaimsTable
          claims={claims}
          onRowClick={(id) => navigate(`/claims/${id}`)}
          roleVisibility={currentUser?.role ?? 'AUDITOR'}
        />
      )}
    </div>
  )
}
