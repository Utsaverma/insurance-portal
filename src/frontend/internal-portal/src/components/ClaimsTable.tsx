import React, { useMemo, useState } from 'react'
import { ArrowDown, ArrowUp } from 'lucide-react'
import type { Claim, UserRole } from '../types'
import { ClaimStatusBadge } from './ClaimStatusBadge'
import { formatDate } from '../lib/format'
import {
  Avatar,
  Button,
  Card,
  Cell,
  EmptyState,
  HeaderCell,
  Row,
  Select,
  TableBody,
  TableEmpty,
  TableHead,
  TableRoot,
} from './ui'

interface Props {
  claims: Claim[]
  onRowClick: (id: string) => void
  roleVisibility: UserRole
}

type SortDir = 'asc' | 'desc'

const STATUSES = [
  'SUBMITTED', 'ASSIGNED', 'UNDER_SURVEY', 'SURVEYED',
  'UNDER_ADJUDICATION', 'APPROVED', 'REJECTED', 'PAID',
]

export function ClaimsTable({ claims, onRowClick, roleVisibility }: Props) {
  const [statusFilter, setStatusFilter] = useState('')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const filtered = useMemo(() => {
    let list = statusFilter ? claims.filter((c) => c.status === statusFilter) : claims
    list = [...list].sort((a, b) => {
      const diff = new Date(a.incident_date).getTime() - new Date(b.incident_date).getTime()
      return sortDir === 'asc' ? diff : -diff
    })
    return list
  }, [claims, statusFilter, sortDir])

  const showAssigned = roleVisibility !== 'AUDITOR'
  const columnCount = showAssigned ? 5 : 4

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end gap-2">
        <Select
          label="Status"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          wrapperClassName="w-full sm:w-56"
        >
          <option value="">All Statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
          ))}
        </Select>
        <Button
          variant="secondary"
          onClick={() => setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))}
          aria-label={`Sort by incident date, ${sortDir === 'asc' ? 'ascending' : 'descending'}`}
          icon={
            sortDir === 'asc'
              ? <ArrowUp aria-hidden className="h-4 w-4" />
              : <ArrowDown aria-hidden className="h-4 w-4" />
          }
        >
          Incident Date
        </Button>
      </div>

      {/* Card stack under md, table from md up — same `filtered` array, so the
          two views can never disagree. */}
      <div className="grid gap-3 md:hidden">
        {filtered.map((c) => (
          <Card
            key={c.id}
            interactive
            role="button"
            tabIndex={0}
            onClick={() => onRowClick(c.id)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onRowClick(c.id)}
            className="p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-semibold text-fg">{c.claim_number}</div>
                <div className="mt-0.5 text-xs text-fg-muted">Policy: {c.policy_number}</div>
              </div>
              <ClaimStatusBadge status={c.status} />
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-muted">
              <span className="tabular-nums">Incident: {formatDate(c.incident_date)}</span>
              {showAssigned && <span>Assigned: {c.assigned_staff_name ?? '—'}</span>}
            </div>
          </Card>
        ))}
        {filtered.length === 0 && <EmptyState title="No claims found." />}
      </div>

      <div className="hidden md:block">
        <TableRoot>
          <TableHead>
            <tr>
              <HeaderCell>Claim #</HeaderCell>
              <HeaderCell>Policy</HeaderCell>
              <HeaderCell>Status</HeaderCell>
              <HeaderCell>Incident Date</HeaderCell>
              {showAssigned && <HeaderCell>Assigned</HeaderCell>}
            </tr>
          </TableHead>
          <TableBody>
            {filtered.map((c) => (
              <Row
                key={c.id}
                interactive
                tabIndex={0}
                onClick={() => onRowClick(c.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onRowClick(c.id)}
              >
                <Cell strong>{c.claim_number}</Cell>
                <Cell>{c.policy_number}</Cell>
                <Cell><ClaimStatusBadge status={c.status} /></Cell>
                <Cell numeric>{formatDate(c.incident_date)}</Cell>
                {showAssigned && (
                  <Cell>
                    {c.assigned_staff_name ? (
                      <div className="flex items-center gap-2">
                        <Avatar name={c.assigned_staff_name} seed={c.assigned_to} size="sm" />
                        {c.assigned_staff_name}
                      </div>
                    ) : (
                      '—'
                    )}
                  </Cell>
                )}
              </Row>
            ))}
            {/* Was a hardcoded 5, which is wrong for AUDITOR (4 columns). */}
            {filtered.length === 0 && (
              <TableEmpty colSpan={columnCount}>No claims found.</TableEmpty>
            )}
          </TableBody>
        </TableRoot>
      </div>
    </div>
  )
}
