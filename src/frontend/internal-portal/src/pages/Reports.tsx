import React, { useEffect, useState, useMemo } from 'react'
import { listClaims } from '../api/claims'
import { apiErrorMessage } from '../api/client'
import { ClaimStatusBadge } from '../components/ClaimStatusBadge'
import { CONTENT_WIDTH } from '../components/layout/shell'
import { formatCurrency } from '../lib/format'
import {
  Alert,
  Cell,
  HeaderCell,
  LoadingBlock,
  PageContainer,
  PageHeader,
  Row,
  StatCard,
  TableBody,
  TableEmpty,
  TableHead,
  TableRoot,
} from '../components/ui'
import type { Claim, ClaimStatus } from '../types'

/* Priority column hiding rather than a card-stack — a deliberate difference
   from ClaimsTable. Reports is an analyst screen and comparison-oriented; five
   columns x N rows rendered as cards is unreadable.
   The className must land on the <th> AND the <td>, which is why the header is
   an array of objects rather than the bare string array it used to be. */
const COLUMNS = [
  { label: 'Claim #', className: '' },
  { label: 'Policy', className: 'hidden sm:table-cell' },
  { label: 'Status', className: '' },
  { label: 'Claimed', className: '' },
  { label: 'Processing (days)', className: 'hidden md:table-cell' },
]

// Every status gets a tile, zero or not.
const ALL_STATUSES: ClaimStatus[] = [
  'SUBMITTED', 'ASSIGNED', 'UNDER_SURVEY', 'SURVEYED',
  'UNDER_ADJUDICATION', 'APPROVED', 'REJECTED', 'PAID',
]

/** Submission to close, in days; null while the claim is still open. A closed
 *  claim's last update is its closing status change. */
function processingDays(c: Claim): number | null {
  if (c.status !== 'PAID' && c.status !== 'REJECTED') return null
  return (new Date(c.updated_at).getTime() - new Date(c.created_at).getTime()) / 86400000
}

const sumApproved = (list: Claim[]) => list.reduce((s, c) => s + Number(c.approved_amount ?? 0), 0)

export function Reports() {
  const [claims, setClaims] = useState<Claim[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    listClaims({ limit: 1000 })
      .then((r) => {
        setClaims(r.items)
        setTotal(r.total)
      })
      // Without this a failed load rendered as a report on zero claims.
      .catch((e) => setError(apiErrorMessage(e, 'Could not load the report data. Please try again.')))
      .finally(() => setLoading(false))
  }, [])

  const stats = useMemo(() => {
    const byStatus = Object.fromEntries(ALL_STATUSES.map((s) => [s, 0])) as Record<ClaimStatus, number>
    for (const c of claims) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1
    // Paid claims were approved first, so they count towards the approved total too.
    const totalApproved = sumApproved(claims.filter((c) => c.status === 'APPROVED' || c.status === 'PAID'))
    const totalPaid = sumApproved(claims.filter((c) => c.status === 'PAID'))
    const closedDays = claims.map(processingDays).filter((d): d is number => d !== null)
    const avgProcessingDays = closedDays.length
      ? closedDays.reduce((s, d) => s + d, 0) / closedDays.length
      : null
    return { byStatus, totalApproved, totalPaid, avgProcessingDays }
  }, [claims])

  if (loading) {
    return (
      <PageContainer width={CONTENT_WIDTH}>
        <LoadingBlock />
      </PageContainer>
    )
  }
  if (error) {
    return (
      <PageContainer width={CONTENT_WIDTH}>
        <PageHeader title="Claims Reports" />
        <Alert tone="danger">{error}</Alert>
      </PageContainer>
    )
  }

  return (
    <PageContainer width={CONTENT_WIDTH}>
      {/* The API returns newest first, and at most 1000 claims per call. */}
      <PageHeader
        title="Claims Reports"
        subtitle={
          claims.length < total
            ? `Based on the ${claims.length} most recent of ${total} claims`
            : `Based on all ${total} claims`
        }
      />

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {ALL_STATUSES.map((status) => (
          <StatCard key={status} label={status.replace(/_/g, ' ')} value={stats.byStatus[status]} numeric />
        ))}
        {/* These hardcoded bg-green-50 / bg-blue-50, which are unreadable
            in dark mode. The tone prop resolves to tokens that flip. */}
        <StatCard
          label="Total Approved Amount"
          value={formatCurrency(stats.totalApproved)}
          tone="success"
          size="lg"
          numeric
          className="col-span-2 sm:col-span-1"
        />
        <StatCard
          label="Total Paid Amount"
          value={formatCurrency(stats.totalPaid)}
          tone="success"
          size="lg"
          numeric
          className="col-span-2 sm:col-span-1"
        />
        <StatCard
          label="Avg Processing, Closed Claims (days)"
          value={stats.avgProcessingDays === null ? '—' : stats.avgProcessingDays.toFixed(1)}
          tone="brand"
          numeric
          className="col-span-2 sm:col-span-1"
        />
      </div>

      <TableRoot>
        <TableHead>
          <tr>
            {COLUMNS.map(({ label, className }) => (
              <HeaderCell key={label} className={className}>
                {label}
              </HeaderCell>
            ))}
          </tr>
        </TableHead>
        <TableBody>
          {claims.map((c) => {
            const days = processingDays(c)
            return (
              <Row key={c.id}>
                <Cell strong>{c.claim_number}</Cell>
                <Cell className="hidden sm:table-cell">{c.policy_number}</Cell>
                <Cell><ClaimStatusBadge status={c.status} /></Cell>
                <Cell numeric>{formatCurrency(c.claimed_amount)}</Cell>
                <Cell numeric className="hidden md:table-cell">
                  {days === null ? '—' : days.toFixed(1)}
                </Cell>
              </Row>
            )
          })}
          {claims.length === 0 && (
            <TableEmpty colSpan={COLUMNS.length}>No claims found.</TableEmpty>
          )}
        </TableBody>
      </TableRoot>
    </PageContainer>
  )
}
