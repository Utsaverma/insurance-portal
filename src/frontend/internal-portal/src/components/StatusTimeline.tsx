import React from 'react'
import { ClaimStatusBadge } from './ClaimStatusBadge'
import { EmptyState } from './ui'
import { formatDateTime } from '../lib/format'

/** Structural, not an imported ClaimHistoryEntry: that type lives in api/claims.ts
 *  on customer-portal and types/index.ts on internal-portal, and this file must
 *  stay byte-identical. Both portals' real type satisfies this shape. */
export interface StatusTimelineEntry {
  id: string
  to_status: string
  changed_at: string
  /** Who acted, recorded by the server at the time of the action. */
  changed_by_name?: string | null
  note: string | null
}

/** Each portal's ClaimStatusBadge takes that portal's own ClaimStatus union. */
type BadgeStatus = React.ComponentProps<typeof ClaimStatusBadge>['status']

interface Props { history: StatusTimelineEntry[] }

export function StatusTimeline({ history }: Props) {
  const sorted = [...history].sort(
    (a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime()
  )

  if (sorted.length === 0) {
    return <EmptyState variant="inline" title="No status changes yet." />
  }

  return (
    <div className="relative pl-6">
      {sorted.map((entry, i) => (
        <div key={entry.id} className="relative pb-6">
          {/* ring-app, not ring-white: these dots sit on the page background,
              which is dark in dark mode. */}
          <span className="absolute -left-1.5 top-1 h-3 w-3 rounded-full bg-brand-600 ring-2 ring-app" />
          {i < sorted.length - 1 && (
            <span className="absolute bottom-0 left-0 top-4 w-0.5 bg-line-strong" />
          )}
          <div className="ml-2">
            <ClaimStatusBadge status={entry.to_status as BadgeStatus} />
            <div className="mt-1 text-xs text-fg-muted tabular-nums">
              {formatDateTime(entry.changed_at)}
              {entry.changed_by_name && <> · by {entry.changed_by_name}</>}
            </div>
            {entry.note && <div className="mt-1 text-sm text-fg">{entry.note}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}
