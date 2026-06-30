import React from 'react'
import type { ClaimStatus } from '../api/claims'

const STATUS_MAP: Record<ClaimStatus, { color: string; label: string }> = {
  SUBMITTED: { color: '#6b7280', label: 'Submitted' },
  ASSIGNED: { color: '#3b82f6', label: 'Assigned' },
  UNDER_SURVEY: { color: '#8b5cf6', label: 'Under Survey' },
  SURVEYED: { color: '#14b8a6', label: 'Surveyed' },
  UNDER_ADJUDICATION: { color: '#f97316', label: 'Under Adjudication' },
  APPROVED: { color: '#22c55e', label: 'Approved' },
  REJECTED: { color: '#ef4444', label: 'Rejected' },
  PAID: { color: '#eab308', label: 'Paid' },
}

export function ClaimStatusBadge({ status }: { status: ClaimStatus }) {
  const { color, label } = STATUS_MAP[status] ?? { color: '#6b7280', label: status }
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 12,
        background: color + '22',
        color,
        fontWeight: 600,
        fontSize: 13,
        border: `1px solid ${color}55`,
      }}
    >
      {label}
    </span>
  )
}
