import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { FileQuestion } from 'lucide-react'
import {
  getClaim, getClaimHistory, getClaimDocuments, downloadDocument,
  type Claim, type ClaimHistoryEntry, type ClaimDocument,
} from '../api/claims'
import { ClaimStatusBadge } from '../components/ClaimStatusBadge'
import { StatusTimeline } from '../components/StatusTimeline'
import { DocumentList, type DocumentListItem } from '../components/DocumentList'
import { CONTENT_WIDTH } from '../components/layout/shell'
import { formatINR, formatDate } from '../lib/format'
import {
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

export function ClaimDetail() {
  const { id } = useParams<{ id: string }>()
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

  const handleDownload = async (doc: DocumentListItem) => {
    const blob = await downloadDocument(id!, doc.id)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = doc.filename; a.click()
    URL.revokeObjectURL(url)
  }

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
        backLabel="Back to Dashboard"
        meta={<ClaimStatusBadge status={claim.status} />}
      />

      <div className="space-y-8">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
          <DocumentList documents={docs} onDownload={handleDownload} />
        </div>

        <div>
          <SectionHeading>Status History</SectionHeading>
          <StatusTimeline history={history} />
        </div>
      </div>
    </PageContainer>
  )
}
