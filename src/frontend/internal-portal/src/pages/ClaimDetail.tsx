import React, { useEffect, useState, useCallback } from 'react'
import { useParams } from 'react-router-dom'
import { FileQuestion } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { getClaim, listDocuments } from '../api/claims'
import { ClaimStatusBadge } from '../components/ClaimStatusBadge'
import { StatusActionPanel } from '../components/StatusActionPanel'
import { ClaimDocumentViewer } from '../components/ClaimDocumentViewer'
import { CONTENT_WIDTH } from '../components/layout/shell'
import { formatINR, formatDate } from '../lib/format'
import {
  Avatar,
  Card,
  CardBody,
  CardTitle,
  EmptyState,
  LoadingBlock,
  PageContainer,
  PageHeader,
  SectionHeading,
  StatCard,
} from '../components/ui'
import type { Claim, ClaimDocument } from '../types'

export function ClaimDetail() {
  const { id } = useParams<{ id: string }>()
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

  // These early returns used to bypass all page chrome. Inside AppShell the
  // header survives, but they still need a container or the body looks broken.
  if (loading) {
    return (
      <PageContainer width={CONTENT_WIDTH}>
        <LoadingBlock />
      </PageContainer>
    )
  }
  if (!claim) {
    return (
      <PageContainer width={CONTENT_WIDTH}>
        <EmptyState
          icon={<FileQuestion aria-hidden className="h-8 w-8" />}
          title="Claim not found."
          description="It may have been removed, or you may not have access to it."
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer width={CONTENT_WIDTH}>
      <PageHeader
        title={claim.claim_number}
        backTo="/dashboard"
        backLabel="Back to Queue"
        meta={<ClaimStatusBadge status={claim.status} />}
      />

      {claim.assigned_to && currentUser?.role !== 'AUDITOR' && (
        <div className="mb-4 flex items-center gap-2 text-sm text-fg-muted">
          <Avatar name={claim.assigned_staff_name} seed={claim.assigned_to} size="sm" />
          <span>Assigned to {claim.assigned_staff_name ?? 'staff member'}</span>
        </div>
      )}

      {/* lg, not md: at 768px a one-third rail is ~230px, too narrow for the
          panel's buttons + textarea + select, so tablets stay single-column. */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Action rail first in DOM order on mobile — a surveyor's primary
            action was previously three screens below the stat tiles, the
            description card and the document list.
            top-20 (5rem) must track the header: h-16 (4rem) + 1rem of air. */}
        <div className="order-1 lg:order-2 lg:sticky lg:top-20 lg:self-start">
          {currentUser && (
            <StatusActionPanel
              claim={claim}
              role={currentUser.role}
              onActionComplete={loadData}
            />
          )}
        </div>

        <div className="order-2 space-y-8 lg:order-1 lg:col-span-2">
          <div className="grid grid-cols-2 gap-3">
            <StatCard label="Policy" value={claim.policy_number} size="sm" />
            <StatCard label="Incident Date" value={formatDate(claim.incident_date)} size="sm" numeric />
            <StatCard
              label="Claimed Amount"
              value={formatINR(claim.claimed_amount)}
              size="sm"
              numeric
            />
            <StatCard
              label="Submitted"
              value={formatDate(claim.created_at)}
              size="sm"
              numeric
            />
          </div>

          <Card>
            <CardBody>
              <CardTitle className="mb-2">Incident Description</CardTitle>
              <p className="text-sm leading-relaxed text-fg">{claim.incident_description}</p>
            </CardBody>
          </Card>

          <div>
            <SectionHeading>Documents</SectionHeading>
            <ClaimDocumentViewer claimId={claim.id} documents={docs} />
          </div>
        </div>
      </div>
    </PageContainer>
  )
}
