import React, { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  getClaim, getClaimHistory, getClaimDocuments, downloadDocument,
  type Claim, type ClaimHistoryEntry, type ClaimDocument,
} from '../api/claims'
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

  if (loading) return <div className="p-10 text-gray-500 text-sm">Loading…</div>
  if (!claim) return <div className="p-10 text-gray-500 text-sm">Claim not found.</div>

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 py-8 md:px-8">
        <button
          onClick={() => navigate('/dashboard')}
          className="mb-5 text-sm text-blue-500 hover:text-blue-700 font-medium"
        >
          ← Back to Dashboard
        </button>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">{claim.claim_number}</h1>
          <ClaimStatusBadge status={claim.status} />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
          {[
            ['Policy', claim.policy_number],
            ['Incident Date', claim.incident_date],
            ['Claimed Amount', `₹${Number(claim.claimed_amount).toLocaleString('en-IN')}`],
            ['Submitted', new Date(claim.created_at).toLocaleDateString()],
          ].map(([label, value]) => (
            <div key={label} className="p-4 bg-white border border-gray-200 rounded-xl">
              <div className="text-xs text-gray-500 mb-1">{label}</div>
              <div className="text-sm font-semibold text-gray-900">{value}</div>
            </div>
          ))}
        </div>

        <p className="text-gray-700 text-sm leading-relaxed mb-8">{claim.incident_description}</p>

        <h2 className="text-lg font-semibold text-gray-900 mb-4">Documents</h2>
        {docs.length === 0 ? (
          <p className="text-sm text-gray-500 mb-8">No documents attached.</p>
        ) : (
          <ul className="mb-8 bg-white border border-gray-200 rounded-xl overflow-hidden divide-y divide-gray-100">
            {docs.map((doc) => (
              <li key={doc.id} className="flex items-center justify-between px-4 py-3">
                <span className="text-sm text-gray-700">{doc.filename}</span>
                <button
                  onClick={() => handleDownload(doc)}
                  className="text-sm text-blue-500 hover:text-blue-700 font-medium"
                >
                  Download
                </button>
              </li>
            ))}
          </ul>
        )}

        <h2 className="text-lg font-semibold text-gray-900 mb-4">Status History</h2>
        <StatusTimeline history={history} />
      </div>
    </div>
  )
}
