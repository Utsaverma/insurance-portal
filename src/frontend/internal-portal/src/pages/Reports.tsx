import React, { useEffect, useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { listClaims } from '../api/claims'
import { ClaimStatusBadge } from '../components/ClaimStatusBadge'
import type { Claim } from '../types'

export function Reports() {
  const navigate = useNavigate()
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

  if (loading) return <div className="p-10 text-sm text-gray-500">Loading…</div>

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8 md:px-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-semibold text-gray-900">Claims Reports</h1>
          <button
            onClick={() => navigate('/dashboard')}
            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
          >
            ← Back to Queue
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-8">
          {Object.entries(stats.byStatus).map(([status, count]) => (
            <div key={status} className="p-4 bg-white border border-gray-200 rounded-xl">
              <div className="text-xs text-gray-500 mb-1">{status.replace(/_/g, ' ')}</div>
              <div className="text-2xl font-bold text-gray-900">{count}</div>
            </div>
          ))}
          <div className="p-4 bg-green-50 border border-green-200 rounded-xl col-span-2 sm:col-span-1">
            <div className="text-xs text-gray-500 mb-1">Total Approved Amount</div>
            <div className="text-lg font-bold text-green-700">{fmt.format(stats.totalApproved)}</div>
          </div>
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl col-span-2 sm:col-span-1">
            <div className="text-xs text-gray-500 mb-1">Avg Processing (days)</div>
            <div className="text-2xl font-bold text-blue-700">{stats.avgProcessingDays.toFixed(1)}</div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-gray-200">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-gray-50 text-left">
                {['Claim #', 'Policy', 'Status', 'Claimed', 'Processing (days)'].map((h) => (
                  <th key={h} className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider border-b border-gray-200">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {claims.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-4 py-3 text-sm font-medium text-gray-900">{c.claim_number}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">{c.policy_number}</td>
                  <td className="px-4 py-3"><ClaimStatusBadge status={c.status} /></td>
                  <td className="px-4 py-3 text-sm text-gray-600">{fmt.format(Number(c.claimed_amount))}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {((Date.now() - new Date(c.created_at).getTime()) / 86400000).toFixed(1)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
