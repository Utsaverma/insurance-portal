import React from 'react'
import type { ClaimHistoryEntry } from '../api/claims'
import { ClaimStatusBadge } from './ClaimStatusBadge'
import type { ClaimStatus } from '../api/claims'

interface Props { history: ClaimHistoryEntry[] }

export function StatusTimeline({ history }: Props) {
  const sorted = [...history].sort(
    (a, b) => new Date(a.changed_at).getTime() - new Date(b.changed_at).getTime()
  )
  return (
    <div className="relative pl-6">
      {sorted.map((entry, i) => (
        <div key={entry.id} className="relative pb-6">
          <span className="absolute -left-1.5 top-1 w-3 h-3 rounded-full bg-blue-500 border-2 border-white ring-2 ring-blue-500" />
          {i < sorted.length - 1 && (
            <span className="absolute left-0 top-4 bottom-0 w-0.5 bg-gray-200" />
          )}
          <div className="ml-2">
            <ClaimStatusBadge status={entry.to_status as ClaimStatus} />
            <div className="text-xs text-gray-500 mt-1">
              {new Date(entry.changed_at).toLocaleString()}
            </div>
            {entry.note && (
              <div className="text-sm text-gray-700 mt-1">{entry.note}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}
