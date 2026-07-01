import React from 'react'
import type { ClaimStatus } from '../types'

const STATUS_CLASSES: Record<ClaimStatus, { classes: string; label: string }> = {
  SUBMITTED:          { classes: 'bg-gray-100 text-gray-600 border border-gray-300',       label: 'Submitted' },
  ASSIGNED:           { classes: 'bg-blue-100 text-blue-700 border border-blue-300',       label: 'Assigned' },
  UNDER_SURVEY:       { classes: 'bg-violet-100 text-violet-700 border border-violet-300', label: 'Under Survey' },
  SURVEYED:           { classes: 'bg-teal-100 text-teal-700 border border-teal-300',       label: 'Surveyed' },
  UNDER_ADJUDICATION: { classes: 'bg-orange-100 text-orange-700 border border-orange-300', label: 'Under Adjudication' },
  APPROVED:           { classes: 'bg-green-100 text-green-700 border border-green-300',    label: 'Approved' },
  REJECTED:           { classes: 'bg-red-100 text-red-700 border border-red-300',          label: 'Rejected' },
  PAID:               { classes: 'bg-yellow-100 text-yellow-700 border border-yellow-300', label: 'Paid' },
}

export function ClaimStatusBadge({ status }: { status: ClaimStatus }) {
  const { classes, label } = STATUS_CLASSES[status] ?? { classes: 'bg-gray-100 text-gray-600 border border-gray-300', label: status }
  return (
    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap ${classes}`}>
      {label}
    </span>
  )
}
