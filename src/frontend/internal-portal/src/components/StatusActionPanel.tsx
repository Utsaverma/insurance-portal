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

  const btn = (label: string, status: string, disabled = false, color = '#3b82f6') => (
    <button onClick={() => doAction(status)} disabled={disabled || actionState === 'loading'}
      style={{ padding: '8px 16px', marginRight: 8, marginBottom: 8, background: color, color: '#fff', border: 'none', borderRadius: 6, cursor: disabled || actionState === 'loading' ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1 }}>
      {actionState === 'loading' ? '…' : label}
    </button>
  )

  return (
    <div style={{ padding: 20, border: '1px solid #e5e7eb', borderRadius: 8 }}>
      <h3 style={{ marginBottom: 16, fontSize: 16 }}>Actions</h3>

      {role === 'CASE_MANAGER' && (
        <>
          {btn('Assign Claim', 'ASSIGNED', claim.status !== 'SUBMITTED')}
          <div style={{ marginTop: 12 }}>
            <label style={{ fontSize: 13 }}>Override Status</label>
            <select onChange={(e) => e.target.value && doAction(e.target.value)} defaultValue=""
              style={{ display: 'block', marginTop: 4, padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', width: '100%' }}>
              <option value="">— choose status —</option>
              {['SUBMITTED','ASSIGNED','UNDER_SURVEY','SURVEYED','UNDER_ADJUDICATION','APPROVED','REJECTED','PAID']
                .map((s) => <option key={s} value={s}>{s.replace(/_/g,' ')}</option>)}
            </select>
          </div>
        </>
      )}

      {role === 'SURVEYOR' && (
        <>
          {btn('Start Survey', 'UNDER_SURVEY', claim.status !== 'ASSIGNED')}
          {claim.status === 'UNDER_SURVEY' && (
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 13 }}>Assessment Notes (required)</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
                style={{ display: 'block', marginTop: 4, padding: 8, border: '1px solid #d1d5db', borderRadius: 6, width: '100%' }} />
              {btn('Submit Assessment', 'SURVEYED', !note.trim())}
            </div>
          )}
        </>
      )}

      {role === 'ADJUSTOR' && (
        <>
          {btn('Begin Adjudication', 'UNDER_ADJUDICATION', claim.status !== 'SURVEYED')}
          {claim.status === 'UNDER_ADJUDICATION' && (
            <div style={{ marginTop: 12 }}>
              <label style={{ fontSize: 13 }}>Notes</label>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3}
                style={{ display: 'block', marginTop: 4, padding: 8, border: '1px solid #d1d5db', borderRadius: 6, width: '100%' }} />
              <div style={{ marginTop: 8 }}>
                {btn('Approve', 'APPROVED', false, '#22c55e')}
                {btn('Reject', 'REJECTED', !note.trim(), '#ef4444')}
              </div>
            </div>
          )}
          {claim.status === 'APPROVED' && btn('Mark Paid', 'PAID', false, '#eab308')}
        </>
      )}

      {errorMsg && <p style={{ color: '#ef4444', marginTop: 8, fontSize: 13 }}>{errorMsg}</p>}
    </div>
  )
}
