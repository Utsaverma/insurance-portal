import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getClaims, type Claim } from '../api/claims'
import { ClaimStatusBadge } from '../components/ClaimStatusBadge'

export function Dashboard() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const [claims, setClaims] = useState<Claim[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getClaims().then(setClaims).finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8 md:px-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">My Claims</h1>
          <div className="flex gap-3">
            <button
              onClick={() => navigate('/submit-claim')}
              className="flex-1 sm:flex-none px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-md transition-colors"
            >
              Submit Claim
            </button>
            <button
              onClick={() => { logout(); navigate('/login') }}
              className="flex-1 sm:flex-none px-4 py-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm font-medium rounded-md transition-colors"
            >
              Logout
            </button>
          </div>
        </div>

        {loading && <p className="text-gray-500 text-sm">Loading…</p>}

        {!loading && claims.length === 0 && (
          <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
            <p className="text-gray-500 mb-4">You have no claims yet.</p>
            <button
              onClick={() => navigate('/submit-claim')}
              className="px-6 py-2.5 bg-blue-500 hover:bg-blue-600 text-white text-sm font-medium rounded-md transition-colors"
            >
              Submit your first claim
            </button>
          </div>
        )}

        <div className="grid gap-3">
          {claims.map((c) => (
            <div
              key={c.id}
              onClick={() => navigate(`/claims/${c.id}`)}
              className="p-5 bg-white border border-gray-200 rounded-xl cursor-pointer hover:border-blue-300 hover:shadow-sm transition-all"
            >
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-semibold text-gray-900">{c.claim_number}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    Policy: {c.policy_number} · Incident: {c.incident_date}
                  </div>
                </div>
                <ClaimStatusBadge status={c.status} />
              </div>
              <div className="mt-2 text-sm font-medium text-gray-700">
                ₹{Number(c.claimed_amount).toLocaleString('en-IN')}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
