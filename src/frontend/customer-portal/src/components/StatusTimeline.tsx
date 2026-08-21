import React from 'react'
import type { ClaimHistoryEntry, ClaimStatus } from '../api/claims'
import { ClaimStatusBadge } from './ClaimStatusBadge'
import { EmptyState } from './ui'

interface Props { history: ClaimHistoryEntry[] }

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
            <ClaimStatusBadge status={entry.to_status as ClaimStatus} />
            <div className="mt-1 text-xs text-fg-muted tabular-nums">
              {new Date(entry.changed_at).toLocaleString()}
            </div>
            {entry.note && <div className="mt-1 text-sm text-fg">{entry.note}</div>}
          </div>
        </div>
      ))}
    </div>
  )
}
