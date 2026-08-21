import React, { useEffect, useState, useMemo } from 'react'
import { listClaims } from '../api/claims'
import { ClaimStatusBadge } from '../components/ClaimStatusBadge'
import { CONTENT_WIDTH } from '../components/layout/shell'
import { formatINR } from '../lib/format'
import {
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
import type { Claim } from '../types'

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

export function Reports() {
  const [claims, setClaims] = useState<Claim[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listClaims({ limit: 1000 }).then((r) => setClaims(r.items)).finally(() => setLoading(false))
  }, [])

  const stats = useMemo(() => {
    const byStatus = claims.reduce<Record<string, number>>((acc, c) => {
      acc[c.status] = (acc[c.status] ?? 0) + 1
      return acc
    }, {})
    const approved = claims.filter((c) => c.status === 'APPROVED')
    const totalApproved = approved.reduce((s, c) => s + (c.approved_amount ?? Number(c.claimed_amount)), 0)
    const avgProcessingDays = claims.length
      ? claims.reduce((s, c) => s + (Date.now() - new Date(c.created_at).getTime()) / 86400000, 0) / claims.length
      : 0
    return { byStatus, totalApproved, avgProcessingDays }
  }, [claims])

  if (loading) {
    return (
      <PageContainer width={CONTENT_WIDTH}>
        <LoadingBlock />
      </PageContainer>
    )
  }

  return (
    <PageContainer width={CONTENT_WIDTH}>
      <PageHeader title="Claims Reports" subtitle={`${claims.length} claims in scope`} />

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Object.entries(stats.byStatus).map(([status, count]) => (
          <StatCard key={status} label={status.replace(/_/g, ' ')} value={count} numeric />
        ))}
        {/* These two hardcoded bg-green-50 / bg-blue-50, which are unreadable
            in dark mode. The tone prop resolves to tokens that flip. */}
        <StatCard
          label="Total Approved Amount"
          value={formatINR(stats.totalApproved)}
          tone="success"
          size="lg"
          numeric
          className="col-span-2 sm:col-span-1"
        />
        <StatCard
          label="Avg Processing (days)"
          value={stats.avgProcessingDays.toFixed(1)}
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
          {claims.map((c) => (
            <Row key={c.id}>
              <Cell strong>{c.claim_number}</Cell>
              <Cell className="hidden sm:table-cell">{c.policy_number}</Cell>
              <Cell><ClaimStatusBadge status={c.status} /></Cell>
              <Cell numeric>{formatINR(c.claimed_amount)}</Cell>
              <Cell numeric className="hidden md:table-cell">
                {((Date.now() - new Date(c.created_at).getTime()) / 86400000).toFixed(1)}
              </Cell>
            </Row>
          ))}
          {claims.length === 0 && (
            <TableEmpty colSpan={COLUMNS.length}>No claims found.</TableEmpty>
          )}
        </TableBody>
      </TableRoot>
    </PageContainer>
  )
}
