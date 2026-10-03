import React, { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { FileQuestion } from 'lucide-react'
import {
  getClaim, getClaimHistory, getClaimDocuments, downloadDocument,
  type Claim, type ClaimHistoryEntry, type ClaimDocument,
} from '../api/claims'
import { apiErrorMessage, apiErrorStatus } from '../api/client'
import { ClaimStatusBadge } from '../components/ClaimStatusBadge'
import { StatusTimeline } from '../components/StatusTimeline'
import { DocumentList, type DocumentListItem } from '../components/DocumentList'
import { AddDocument } from '../components/AddDocument'
import { CONTENT_WIDTH } from '../components/layout/shell'
import { cn } from '../lib/cn'
import { formatCurrency, formatDate } from '../lib/format'
import {
  Alert,
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
  const [error, setError] = useState('')
  const [downloadError, setDownloadError] = useState('')

  useEffect(() => {
    if (!id) return
    Promise.all([getClaim(id), getClaimHistory(id), getClaimDocuments(id)])
      .then(([c, h, d]) => { setClaim(c); setHistory(h); setDocs(d) })
      .catch((e) => {
        // Unknown, malformed or someone else's claim id: the "not found" state below.
        // Anything else is a failure to say so, not a missing claim.
        const status = apiErrorStatus(e)
        if (status !== 403 && status !== 404 && status !== 422) {
          setError(apiErrorMessage(e, 'Could not load this claim. Please try again.'))
        }
      })
      .finally(() => setLoading(false))
  }, [id])

  const reloadDocs = () => {
    if (!id) return
    getClaimDocuments(id)
      .then(setDocs)
      .catch(() => setDownloadError('The document was uploaded, but the list could not be refreshed. Reload the page.'))
  }

  const handleDownload = async (doc: DocumentListItem) => {
    setDownloadError('')
    try {
      const blob = await downloadDocument(id!, doc.id)
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url; a.download = doc.filename; a.click()
      // Deferred: revoking in the same tick can cancel the download in some browsers.
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      setDownloadError(`Could not download ${doc.filename}. Please try again.`)
    }
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
        {error ? (
          <Alert tone="danger">{error}</Alert>
        ) : (
          <EmptyState
            icon={<FileQuestion aria-hidden className="h-8 w-8" />}
            title="Claim not found."
            description="It may have been removed, or you may not have access to it."
          />
        )}
      </PageContainer>
    )
  }

  // The approved amount only exists while the claim is approved or paid.
  const showApproved = claim.status === 'APPROVED' || claim.status === 'PAID'

  return (
    <PageContainer width={CONTENT_WIDTH}>
      <PageHeader
        title={claim.claim_number}
        backTo="/dashboard"
        backLabel="Back to Dashboard"
        meta={<ClaimStatusBadge status={claim.status} />}
      />

      <div className="space-y-8">
        <div className={cn('grid grid-cols-2 gap-3', showApproved ? 'md:grid-cols-5' : 'md:grid-cols-4')}>
          <StatCard label="Policy" value={claim.policy_number} size="sm" />
          <StatCard label="Incident Date" value={formatDate(claim.incident_date)} size="sm" numeric />
          <StatCard
            label="Claimed Amount"
            value={formatCurrency(claim.claimed_amount)}
            size="sm"
            numeric
          />
          {showApproved && (
            <StatCard
              label="Approved Amount"
              value={formatCurrency(claim.approved_amount)}
              size="sm"
              numeric
            />
          )}
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
          {downloadError && <Alert tone="danger" className="mt-3">{downloadError}</Alert>}
          {claim.allowed_actions.upload && (
            <AddDocument
              claimId={claim.id}
              hint="(photos, police report, repair estimate)"
              onUploaded={reloadDocs}
            />
          )}
        </div>

        <div>
          <SectionHeading>Status History</SectionHeading>
          <StatusTimeline history={history} />
        </div>
      </div>
    </PageContainer>
  )
}
