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
    <div style={{ maxWidth: 900, margin: '40px auto', padding: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24 }}>My Claims</h1>
        <div>
          <button onClick={() => navigate('/submit-claim')} style={{ marginRight: 12, padding: '8px 16px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
            Submit Claim
          </button>
          <button onClick={() => { logout(); navigate('/login') }} style={{ padding: '8px 16px', background: '#f3f4f6', border: '1px solid #d1d5db', borderRadius: 6, cursor: 'pointer' }}>
            Logout
          </button>
        </div>
      </div>
      {loading && <p>Loading…</p>}
      {!loading && claims.length === 0 && (
        <div style={{ textAlign: 'center', color: '#6b7280', padding: 48 }}>
          <p>You have no claims yet.</p>
          <button onClick={() => navigate('/submit-claim')} style={{ padding: '10px 24px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer' }}>
            Submit your first claim
          </button>
        </div>
      )}
      <div style={{ display: 'grid', gap: 12 }}>
        {claims.map((c) => (
          <div key={c.id} onClick={() => navigate(`/claims/${c.id}`)}
            style={{ padding: 20, border: '1px solid #e5e7eb', borderRadius: 8, cursor: 'pointer', background: '#fff' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{c.claim_number}</div>
                <div style={{ fontSize: 13, color: '#6b7280' }}>Policy: {c.policy_number} · Incident: {c.incident_date}</div>
              </div>
              <ClaimStatusBadge status={c.status} />
            </div>
            <div style={{ marginTop: 8, color: '#374151', fontSize: 14 }}>₹{Number(c.claimed_amount).toLocaleString('en-IN')}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
