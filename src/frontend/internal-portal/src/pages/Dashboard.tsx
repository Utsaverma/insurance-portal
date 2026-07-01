import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { listClaims } from '../api/claims'
import { ClaimsTable } from '../components/ClaimsTable'
import type { Claim } from '../types'

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
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 md:px-8">
          <div className="flex flex-col gap-3 py-4 sm:flex-row sm:items-center sm:justify-between">
            <span className="text-lg font-bold text-blue-900">eClaims Internal</span>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm text-gray-500">
                {currentUser?.name} · <span className="font-medium text-gray-700">{currentUser?.role}</span>
              </span>
              {canViewReports && (
                <button
                  onClick={() => navigate('/reports')}
                  className="px-3 py-1.5 text-sm border border-gray-300 bg-white hover:bg-gray-50 rounded-md transition-colors"
                >
                  Reports
                </button>
              )}
              <button
                onClick={logout}
                className="px-3 py-1.5 text-sm border border-gray-300 bg-white hover:bg-gray-50 rounded-md transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 md:px-8">
        <h1 className="text-xl font-semibold text-gray-900 mb-6">Claims Queue</h1>
        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : (
          <ClaimsTable
            claims={claims}
            onRowClick={(id) => navigate(`/claims/${id}`)}
            roleVisibility={currentUser?.role ?? 'AUDITOR'}
          />
        )}
      </main>
    </div>
  )
}
