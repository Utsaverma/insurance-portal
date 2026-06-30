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
    <div style={{ position: 'relative', paddingLeft: 24 }}>
      {sorted.map((entry, i) => (
        <div key={entry.id} style={{ position: 'relative', paddingBottom: 20 }}>
          <div
            style={{
              position: 'absolute', left: -24, top: 4,
              width: 12, height: 12, borderRadius: '50%',
              background: '#3b82f6', border: '2px solid #fff', boxShadow: '0 0 0 2px #3b82f6',
            }}
          />
          {i < sorted.length - 1 && (
            <div style={{
              position: 'absolute', left: -19, top: 16, bottom: 0,
              width: 2, background: '#e5e7eb',
            }} />
          )}
          <ClaimStatusBadge status={entry.to_status as ClaimStatus} />
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>
            {new Date(entry.changed_at).toLocaleString()}
          </div>
          {entry.note && <div style={{ fontSize: 13, marginTop: 2, color: '#374151' }}>{entry.note}</div>}
        </div>
      ))}
    </div>
  )
}
