import React, { useState } from 'react'
import type { Claim, UserRole } from '../types'
import { updateClaimStatus } from '../api/claims'

interface Props {
  claim: Claim
  role: UserRole
  onActionComplete: () => void
  staffList?: Array<{ id: string; name: string; role: string }>
}

type ActionState = 'idle' | 'loading' | 'error'

const BTN_BASE = 'px-4 py-2 text-sm font-medium rounded-md border-none transition-colors disabled:cursor-not-allowed disabled:opacity-50 mb-2 mr-2'

export function StatusActionPanel({ claim, role, onActionComplete }: Props) {
  const [note, setNote] = useState('')
  const [actionState, setActionState] = useState<ActionState>('idle')
  const [errorMsg, setErrorMsg] = useState('')

  if (role === 'AUDITOR') return null

  const doAction = async (status: string, extraNote?: string) => {
    setActionState('loading')
    setErrorMsg('')
    try {
      await updateClaimStatus(claim.id, { status, note: extraNote ?? note ?? undefined })
      setNote('')
      onActionComplete()
      setActionState('idle')
    } catch (e: any) {
      setErrorMsg(e?.response?.data?.detail ?? 'Action failed.')
      setActionState('error')
    }
  }

  const btn = (label: string, status: string, disabled = false, colorClass = 'bg-blue-800 hover:bg-blue-900 text-white') => (
    <button
      onClick={() => doAction(status)}
      disabled={disabled || actionState === 'loading'}
      className={`${BTN_BASE} ${colorClass}`}
    >
      {actionState === 'loading' ? '…' : label}
    </button>
  )

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5">
      <h3 className="text-base font-semibold text-gray-900 mb-4">Actions</h3>

      {role === 'CASE_MANAGER' && (
        <>
          {btn('Assign Claim', 'ASSIGNED', claim.status !== 'SUBMITTED')}
          <div className="mt-3">
            <label className="block text-xs font-medium text-gray-600 mb-1">Override Status</label>
            <select
              onChange={(e) => e.target.value && doAction(e.target.value)}
              defaultValue=""
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">— choose status —</option>
              {['SUBMITTED', 'ASSIGNED', 'UNDER_SURVEY', 'SURVEYED', 'UNDER_ADJUDICATION', 'APPROVED', 'REJECTED', 'PAID']
                .map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
        </>
      )}

      {role === 'SURVEYOR' && (
        <>
          {btn('Start Survey', 'UNDER_SURVEY', claim.status !== 'ASSIGNED')}
          {claim.status === 'UNDER_SURVEY' && (
            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">Assessment Notes (required)</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <div className="mt-2">
                {btn('Submit Assessment', 'SURVEYED', !note.trim())}
              </div>
            </div>
          )}
        </>
      )}

      {role === 'ADJUSTOR' && (
        <>
          {btn('Begin Adjudication', 'UNDER_ADJUDICATION', claim.status !== 'SURVEYED')}
          {claim.status === 'UNDER_ADJUDICATION' && (
            <div className="mt-3">
              <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
              <div className="mt-2 flex flex-wrap gap-1">
                {btn('Approve', 'APPROVED', false, 'bg-green-600 hover:bg-green-700 text-white')}
                {btn('Reject', 'REJECTED', !note.trim(), 'bg-red-500 hover:bg-red-600 text-white')}
              </div>
            </div>
          )}
          {claim.status === 'APPROVED' && btn('Mark Paid', 'PAID', false, 'bg-yellow-500 hover:bg-yellow-600 text-white')}
        </>
      )}

      {errorMsg && <p className="mt-3 text-xs text-red-500">{errorMsg}</p>}
    </div>
  )
}
