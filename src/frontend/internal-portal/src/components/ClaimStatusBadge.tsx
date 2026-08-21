import React from 'react'
import type { ClaimStatus } from '../types'
import { Badge } from './ui'

/* Every class here is a complete literal string, on purpose: Tailwind's content
   scanner is a regex over source text, so `bg-status-${key}-soft` would emit no
   CSS at all — and only in the production build. */
const STATUS_CLASSES: Record<ClaimStatus, { classes: string; label: string }> = {
  SUBMITTED:          { classes: 'bg-status-submitted-soft text-status-submitted-fg border-status-submitted-line',                   label: 'Submitted' },
  ASSIGNED:           { classes: 'bg-status-assigned-soft text-status-assigned-fg border-status-assigned-line',                      label: 'Assigned' },
  UNDER_SURVEY:       { classes: 'bg-status-under-survey-soft text-status-under-survey-fg border-status-under-survey-line',          label: 'Under Survey' },
  SURVEYED:           { classes: 'bg-status-surveyed-soft text-status-surveyed-fg border-status-surveyed-line',                      label: 'Surveyed' },
  UNDER_ADJUDICATION: { classes: 'bg-status-under-adjudication-soft text-status-under-adjudication-fg border-status-under-adjudication-line', label: 'Under Adjudication' },
  APPROVED:           { classes: 'bg-status-approved-soft text-status-approved-fg border-status-approved-line',                      label: 'Approved' },
  REJECTED:           { classes: 'bg-status-rejected-soft text-status-rejected-fg border-status-rejected-line',                      label: 'Rejected' },
  PAID:               { classes: 'bg-status-paid-soft text-status-paid-fg border-status-paid-line',                                  label: 'Paid' },
}

const FALLBACK = 'bg-status-submitted-soft text-status-submitted-fg border-status-submitted-line'

export function ClaimStatusBadge({ status }: { status: ClaimStatus }) {
  // StatusTimeline casts entry.to_status from an untyped string, so an unknown
  // backend status must still render. Keep this fallback.
  const { classes, label } = STATUS_CLASSES[status] ?? { classes: FALLBACK, label: status }
  return <Badge classes={classes}>{label}</Badge>
}
