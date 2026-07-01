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
      <div className="flex flex-wrap gap-2 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="">All Statuses</option>
          {['SUBMITTED', 'ASSIGNED', 'UNDER_SURVEY', 'SURVEYED', 'UNDER_ADJUDICATION', 'APPROVED', 'REJECTED', 'PAID']
            .map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <button
          onClick={() => setSortDir((d) => d === 'asc' ? 'desc' : 'asc')}
          className="px-3 py-1.5 text-sm border border-gray-300 rounded-md bg-white hover:bg-gray-50 transition-colors"
        >
          Incident Date {sortDir === 'asc' ? '↑' : '↓'}
        </button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-50 text-left">
              {['Claim #', 'Policy', 'Status', 'Incident Date', ...(showAssigned ? ['Assigned'] : [])].map((h) => (
                <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {filtered.map((c) => (
              <tr
                key={c.id}
                tabIndex={0}
                onClick={() => onRowClick(c.id)}
                onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onRowClick(c.id)}
                className="cursor-pointer hover:bg-gray-50 transition-colors"
              >
                <td className="px-4 py-3 text-sm font-medium text-gray-900">{c.claim_number}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{c.policy_number}</td>
                <td className="px-4 py-3"><ClaimStatusBadge status={c.status} /></td>
                <td className="px-4 py-3 text-sm text-gray-600">{c.incident_date}</td>
                {showAssigned && <td className="px-4 py-3 text-sm text-gray-600">{c.assigned_staff_name ?? '—'}</td>}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500">
                  No claims found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
