import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getClaim, getClaimHistory, getClaimDocuments, downloadDocument, type Claim, type ClaimHistoryEntry, type ClaimDocument } from '../api/claims'
import { ClaimStatusBadge } from '../components/ClaimStatusBadge'
import { StatusTimeline } from '../components/StatusTimeline'

export function ClaimDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [claim, setClaim] = useState<Claim | null>(null)
  const [history, setHistory] = useState<ClaimHistoryEntry[]>([])
  const [docs, setDocs] = useState<ClaimDocument[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
    Promise.all([getClaim(id), getClaimHistory(id), getClaimDocuments(id)])
      .then(([c, h, d]) => { setClaim(c); setHistory(h); setDocs(d) })
      .finally(() => setLoading(false))
  }, [id])

  const handleDownload = async (doc: ClaimDocument) => {
    const blob = await downloadDocument(id!, doc.id)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = doc.filename; a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) return <div style={{ padding: 40 }}>Loading…</div>
  if (!claim) return <div style={{ padding: 40 }}>Claim not found.</div>

  return (
    <div style={{ maxWidth: 900, margin: '40px auto', padding: 24 }}>
      <button onClick={() => navigate('/dashboard')} style={{ marginBottom: 20, background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6' }}>← Back to Dashboard</button>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <h1 style={{ fontSize: 24 }}>{claim.claim_number}</h1>
        <ClaimStatusBadge status={claim.status} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 32 }}>
        {[
          ['Policy', claim.policy_number],
          ['Incident Date', claim.incident_date],
          ['Claimed Amount', `₹${Number(claim.claimed_amount).toLocaleString('en-IN')}`],
          ['Submitted', new Date(claim.created_at).toLocaleDateString()],
        ].map(([label, value]) => (
          <div key={label} style={{ padding: 16, background: '#f9fafb', borderRadius: 8 }}>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{label}</div>
            <div style={{ fontWeight: 600, marginTop: 4 }}>{value}</div>
          </div>
        ))}
      </div>
      <p style={{ color: '#374151', marginBottom: 32 }}>{claim.incident_description}</p>
      <h2 style={{ fontSize: 18, marginBottom: 16 }}>Documents</h2>
      {docs.length === 0 ? <p style={{ color: '#6b7280' }}>No documents attached.</p> : (
        <ul style={{ listStyle: 'none', padding: 0, marginBottom: 32 }}>
          {docs.map((doc) => (
            <li key={doc.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #e5e7eb' }}>
              <span>{doc.filename}</span>
              <button onClick={() => handleDownload(doc)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#3b82f6' }}>Download</button>
            </li>
          ))}
        </ul>
      )}
      <h2 style={{ fontSize: 18, marginBottom: 16 }}>Status History</h2>
      <StatusTimeline history={history} />
    </div>
  )
}
