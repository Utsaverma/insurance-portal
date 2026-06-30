import React, { useMemo, useState } from 'react'
import type { Claim, UserRole } from '../types'
import { ClaimStatusBadge } from './ClaimStatusBadge'

interface Props {
  claims: Claim[]
  onRowClick: (id: string) => void
  roleVisibility: UserRole
}

type SortDir = 'asc' | 'desc'

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

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #d1d5db' }}>
          <option value="">All Statuses</option>
          {['SUBMITTED','ASSIGNED','UNDER_SURVEY','SURVEYED','UNDER_ADJUDICATION','APPROVED','REJECTED','PAID']
            .map((s) => <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
        </select>
        <button onClick={() => setSortDir((d) => d === 'asc' ? 'desc' : 'asc')}
          style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid #d1d5db', cursor: 'pointer', background: '#f9fafb' }}>
          Incident Date {sortDir === 'asc' ? '↑' : '↓'}
        </button>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
            {['Claim #','Policy','Status','Incident Date', ...(showAssigned ? ['Assigned'] : [])].map((h) => (
              <th key={h} style={{ padding: '10px 12px', borderBottom: '2px solid #e5e7eb', fontSize: 13, fontWeight: 600 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map((c) => (
            <tr key={c.id} tabIndex={0} onClick={() => onRowClick(c.id)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onRowClick(c.id)}
              style={{ cursor: 'pointer', borderBottom: '1px solid #e5e7eb' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#f9fafb')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
              <td style={{ padding: '10px 12px' }}>{c.claim_number}</td>
              <td style={{ padding: '10px 12px' }}>{c.policy_number}</td>
              <td style={{ padding: '10px 12px' }}><ClaimStatusBadge status={c.status} /></td>
              <td style={{ padding: '10px 12px' }}>{c.incident_date}</td>
              {showAssigned && <td style={{ padding: '10px 12px' }}>{c.assigned_staff_name ?? '—'}</td>}
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr><td colSpan={5} style={{ padding: 24, textAlign: 'center', color: '#6b7280' }}>No claims found.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
