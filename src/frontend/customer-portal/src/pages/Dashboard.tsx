import React, { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { FileText, Plus } from 'lucide-react'
import { getClaims, type Claim } from '../api/claims'
import { ClaimStatusBadge } from '../components/ClaimStatusBadge'
import { CONTENT_WIDTH } from '../components/layout/shell'
import { formatINR, formatDate } from '../lib/format'
import {
  Button,
  Card,
  EmptyState,
  LoadingBlock,
  PageContainer,
  PageHeader,
  StatCard,
} from '../components/ui'

const OPEN_STATUSES = ['SUBMITTED', 'ASSIGNED', 'UNDER_SURVEY', 'SURVEYED', 'UNDER_ADJUDICATION']

export function Dashboard() {
  const navigate = useNavigate()
  const [claims, setClaims] = useState<Claim[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getClaims().then(setClaims).finally(() => setLoading(false))
  }, [])

  const stats = useMemo(() => {
    const open = claims.filter((c) => OPEN_STATUSES.includes(c.status)).length
    const settled = claims.filter((c) => c.status === 'PAID').length
    const total = claims.reduce((s, c) => s + Number(c.claimed_amount), 0)
    return { open, settled, total }
  }, [claims])

  return (
    <PageContainer width={CONTENT_WIDTH}>
      <PageHeader
        title="My Claims"
        actions={
          <Button
            onClick={() => navigate('/submit-claim')}
            icon={<Plus aria-hidden className="h-4 w-4" />}
          >
            Submit Claim
          </Button>
        }
      />

      {loading && <LoadingBlock />}

      {!loading && claims.length > 0 && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label="Total claims" value={claims.length} size="lg" numeric />
          <StatCard label="In progress" value={stats.open} size="lg" numeric tone="brand" />
          <StatCard
            label="Total claimed"
            value={formatINR(stats.total)}
            size="lg"
            numeric
            className="col-span-2 sm:col-span-1"
          />
        </div>
      )}

      {!loading && claims.length === 0 && (
        <EmptyState
          icon={<FileText aria-hidden className="h-8 w-8" />}
          title="You have no claims yet."
          description="Submit your first claim and track it here from start to settlement."
          action={
            <Button
              size="lg"
              onClick={() => navigate('/submit-claim')}
              icon={<Plus aria-hidden className="h-4 w-4" />}
            >
              Submit your first claim
            </Button>
          }
        />
      )}

      <div className="grid gap-3">
        {claims.map((c) => (
          // A real <Link>: these were `div onClick` and so unreachable by
          // keyboard. Markup-only change, same destination.
          <Card key={c.id} interactive>
            <Link to={`/claims/${c.id}`} className="block rounded-card p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="font-semibold text-fg">{c.claim_number}</div>
                  <div className="mt-0.5 text-xs text-fg-muted">
                    Policy: {c.policy_number} · Incident: {formatDate(c.incident_date)}
                  </div>
                </div>
                <ClaimStatusBadge status={c.status} />
              </div>
              <div className="mt-2 text-sm font-medium text-fg tabular-nums">
                {formatINR(c.claimed_amount)}
              </div>
            </Link>
          </Card>
        ))}
      </div>
    </PageContainer>
  )
}
