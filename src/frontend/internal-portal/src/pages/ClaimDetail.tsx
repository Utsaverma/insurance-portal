import React, { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { getClaim, listDocuments } from '../api/claims'
import { ClaimStatusBadge } from '../components/ClaimStatusBadge'
import { StatusActionPanel } from '../components/StatusActionPanel'
import { ClaimDocumentViewer } from '../components/ClaimDocumentViewer'
import type { Claim, ClaimDocument } from '../types'

export function ClaimDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { currentUser } = useAuth()
  const [claim, setClaim] = useState<Claim | null>(null)
  const [docs, setDocs] = useState<ClaimDocument[]>([])
  const [loading, setLoading] = useState(true)

  const loadData = useCallback(async () => {
    if (!id) return
    const [c, d] = await Promise.all([getClaim(id), listDocuments(id)])
    setClaim(c)
    setDocs(d)
    setLoading(false)
  }, [id])

  useEffect(() => { loadData() }, [loadData])

  if (loading) return <div style={{ padding: 40 }}>Loading…</div>
  if (!claim) return <div style={{ padding: 40 }}>Claim not found.</div>

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>
      <button onClick={() => navigate('/dashboard')} style={{ marginBottom: 20, background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6' }}>← Back</button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 22 }}>{claim.claim_number}</h1>
        <ClaimStatusBadge status={claim.status} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 24 }}>
        <div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
            {[['Policy', claim.policy_number], ['Incident Date', claim.incident_date],
              ['Claimed Amount', `₹${Number(claim.claimed_amount).toLocaleString('en-IN')}`],
              ['Submitted', new Date(claim.created_at).toLocaleDateString()]]
              .map(([label, value]) => (
                <div key={label} style={{ padding: 14, background: '#f9fafb', borderRadius: 8 }}>
                  <div style={{ fontSize: 12, color: '#6b7280' }}>{label}</div>
                  <div style={{ fontWeight: 600, marginTop: 4 }}>{value}</div>
                </div>
              ))}
          </div>
          <p style={{ color: '#374151', marginBottom: 20 }}>{claim.incident_description}</p>
          <h2 style={{ fontSize: 16, marginBottom: 12 }}>Documents</h2>
          <ClaimDocumentViewer claimId={claim.id} documents={docs} />
        </div>
        <div>
          {currentUser && (
            <StatusActionPanel
              claim={claim}
              role={currentUser.role}
              onActionComplete={loadData}
            />
          )}
        </div>
      </div>
    </div>
  )
}
