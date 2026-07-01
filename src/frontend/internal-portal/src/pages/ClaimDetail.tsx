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

  if (loading) return <div className="p-10 text-sm text-gray-500">Loading…</div>
  if (!claim) return <div className="p-10 text-sm text-gray-500">Claim not found.</div>

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 py-8 md:px-8">
        <button
          onClick={() => navigate('/dashboard')}
          className="mb-5 text-sm text-blue-600 hover:text-blue-800 font-medium"
        >
          ← Back to Queue
        </button>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
          <h1 className="text-xl font-semibold text-gray-900">{claim.claim_number}</h1>
          <ClaimStatusBadge status={claim.status} />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <div className="grid grid-cols-2 gap-3">
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

            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <h2 className="text-sm font-semibold text-gray-700 mb-2">Incident Description</h2>
              <p className="text-sm text-gray-700 leading-relaxed">{claim.incident_description}</p>
            </div>

            <div>
              <h2 className="text-sm font-semibold text-gray-700 mb-3">Documents</h2>
              <ClaimDocumentViewer claimId={claim.id} documents={docs} />
            </div>
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
    </div>
  )
}
