import React, { useEffect, useState, useMemo } from 'react'
import { listClaims } from '../api/claims'
import { ClaimStatusBadge } from '../components/ClaimStatusBadge'
import type { Claim, ClaimStatus } from '../types'

export function Reports() {
  const [claims, setClaims] = useState<Claim[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listClaims({ limit: 1000 }).then((r) => setClaims(r.items)).finally(() => setLoading(false))
  }, [])

  const stats = useMemo(() => {
    const byStatus = claims.reduce<Record<string, number>>((acc, c) => {
      acc[c.status] = (acc[c.status] ?? 0) + 1
      return acc
    }, {})
    const approved = claims.filter((c) => c.status === 'APPROVED')
    const totalApproved = approved.reduce((s, c) => s + (c.approved_amount ?? Number(c.claimed_amount)), 0)
    const avgProcessingDays = claims.length
      ? claims.reduce((s, c) => s + (Date.now() - new Date(c.created_at).getTime()) / 86400000, 0) / claims.length
      : 0
    return { byStatus, totalApproved, avgProcessingDays }
  }, [claims])

  const fmt = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })

  if (loading) return <div style={{ padding: 40 }}>Loading…</div>

  return (
    <div style={{ maxWidth: 1000, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 22, marginBottom: 20 }}>Claims Reports</h1>
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {Object.entries(stats.byStatus).map(([status, count]) => (
          <div key={status} style={{ padding: '10px 16px', background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, minWidth: 120 }}>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{status.replace(/_/g, ' ')}</div>
            <div style={{ fontWeight: 700, fontSize: 22 }}>{count}</div>
          </div>
        ))}
        <div style={{ padding: '10px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, minWidth: 180 }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Total Approved Amount</div>
          <div style={{ fontWeight: 700, fontSize: 18, color: '#16a34a' }}>{fmt.format(stats.totalApproved)}</div>
        </div>
        <div style={{ padding: '10px 16px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 8, minWidth: 160 }}>
          <div style={{ fontSize: 12, color: '#6b7280' }}>Avg Processing (days)</div>
          <div style={{ fontWeight: 700, fontSize: 22, color: '#2563eb' }}>{stats.avgProcessingDays.toFixed(1)}</div>
        </div>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#f9fafb', textAlign: 'left' }}>
            {['Claim #', 'Policy', 'Status', 'Claimed', 'Processing (days)'].map((h) => (
              <th key={h} style={{ padding: '10px 12px', borderBottom: '2px solid #e5e7eb', fontSize: 13 }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {claims.map((c) => (
            <tr key={c.id} style={{ borderBottom: '1px solid #e5e7eb' }}>
              <td style={{ padding: '10px 12px' }}>{c.claim_number}</td>
              <td style={{ padding: '10px 12px' }}>{c.policy_number}</td>
              <td style={{ padding: '10px 12px' }}><ClaimStatusBadge status={c.status} /></td>
              <td style={{ padding: '10px 12px' }}>{fmt.format(Number(c.claimed_amount))}</td>
              <td style={{ padding: '10px 12px' }}>
                {((Date.now() - new Date(c.created_at).getTime()) / 86400000).toFixed(1)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
