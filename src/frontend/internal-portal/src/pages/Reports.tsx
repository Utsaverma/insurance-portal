import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { getReportSummary } from '../api/reports'
import { apiErrorMessage } from '../api/client'
import { ClaimStatusBadge } from '../components/ClaimStatusBadge'
import { CONTENT_WIDTH } from '../components/layout/shell'
import { formatCurrency, formatDate, formatDateTime } from '../lib/format'
import {
  Alert,
  Cell,
  HeaderCell,
  LoadingBlock,
  PageContainer,
  PageHeader,
  Row,
  SectionHeading,
  StatCard,
  TableBody,
  TableEmpty,
  TableHead,
  TableRoot,
} from '../components/ui'
import type { ClaimStatus, ReportSummary } from '../types'

/* Priority column hiding rather than a card-stack — a deliberate difference
   from ClaimsTable. Reports is an analyst screen and comparison-oriented; five
   columns x N rows rendered as cards is unreadable.
   The className must land on the <th> AND the <td>, which is why the header is
   an array of objects rather than a bare string array. */
const COLUMNS = [
  { label: 'Claim #', className: '' },
  { label: 'Policy', className: 'hidden sm:table-cell' },
  { label: 'Status', className: '' },
  { label: 'Approved', className: '' },
  { label: 'Closed', className: 'hidden md:table-cell' },
  { label: 'Processing (days)', className: 'hidden md:table-cell' },
]

// Every status gets a tile, zero or not, in workflow order.
const ALL_STATUSES: ClaimStatus[] = [
  'SUBMITTED', 'ASSIGNED', 'UNDER_SURVEY', 'SURVEYED',
  'UNDER_ADJUDICATION', 'APPROVED', 'REJECTED', 'PAID',
]

export function Reports() {
  const navigate = useNavigate()
  const [report, setReport] = useState<ReportSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    // Aggregated by the claims service across every claim; the browser only renders it.
    getReportSummary()
      .then(setReport)
      // Without this a failed load rendered as a report on zero claims.
      .catch((e) => setError(apiErrorMessage(e, 'Could not load the report data. Please try again.')))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <PageContainer width={CONTENT_WIDTH}>
        <LoadingBlock />
      </PageContainer>
    )
  }
  if (error || !report) {
    return (
      <PageContainer width={CONTENT_WIDTH}>
        <PageHeader title="Claims Reports" />
        <Alert tone="danger">{error || 'Could not load the report data. Please try again.'}</Alert>
      </PageContainer>
    )
  }

  return (
    <PageContainer width={CONTENT_WIDTH}>
      <PageHeader
        title="Claims Reports"
        subtitle={`All ${report.total_claims} claims, as of ${formatDateTime(report.as_of)}`}
      />

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {ALL_STATUSES.map((status) => (
          <StatCard key={status} label={status.replace(/_/g, ' ')} value={report.by_status[status] ?? 0} numeric />
        ))}
        {/* These hardcoded bg-green-50 / bg-blue-50, which are unreadable
            in dark mode. The tone prop resolves to tokens that flip. */}
        <StatCard
          label="Total Approved Amount"
          value={formatCurrency(report.total_approved_amount)}
          tone="success"
          size="lg"
          numeric
          className="col-span-2 sm:col-span-1"
        />
        <StatCard
          label="Total Paid Amount"
          value={formatCurrency(report.total_paid_amount)}
          tone="success"
          size="lg"
          numeric
          className="col-span-2 sm:col-span-1"
        />
        <StatCard
          label={`Avg Processing, ${report.closed_claims} Closed Claims (days)`}
          value={report.avg_processing_days === null ? '—' : report.avg_processing_days.toFixed(1)}
          tone="brand"
          numeric
          className="col-span-2 sm:col-span-1"
        />
      </div>

      <SectionHeading>Open Claims by Age</SectionHeading>
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {report.open_ageing.map((b) => (
          <StatCard
            key={b.label}
            label={b.label}
            value={b.count}
            // Anything still open after two months needs a look.
            tone={b.max_days === null && b.count > 0 ? 'warning' : 'neutral'}
            numeric
          />
        ))}
      </div>

      <SectionHeading>Recently Closed</SectionHeading>
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
          {report.recently_closed.map((c) => (
            <Row
              key={c.id}
              interactive
              tabIndex={0}
              onClick={() => navigate(`/claims/${c.id}`)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && navigate(`/claims/${c.id}`)}
            >
              <Cell strong>{c.claim_number}</Cell>
              <Cell className="hidden sm:table-cell">{c.policy_number}</Cell>
              <Cell><ClaimStatusBadge status={c.status} /></Cell>
              <Cell numeric>{formatCurrency(c.approved_amount)}</Cell>
              <Cell numeric className="hidden md:table-cell">{formatDate(c.closed_at)}</Cell>
              <Cell numeric className="hidden md:table-cell">{c.processing_days.toFixed(1)}</Cell>
            </Row>
          ))}
          {report.recently_closed.length === 0 && (
            <TableEmpty colSpan={COLUMNS.length}>No closed claims yet.</TableEmpty>
          )}
        </TableBody>
      </TableRoot>
    </PageContainer>
  )
}
