import React, { useEffect, useState } from 'react'
import type { Claim, UserProfileResponse, UserRole } from '../types'
import { assignClaim, updateClaimStatus } from '../api/claims'
import { listStaff } from '../api/users'
import { Button, Card, CardBody, CardTitle, ErrorText, Select, Textarea, type ButtonVariant } from './ui'

interface Props {
  claim: Claim
  role: UserRole
  onActionComplete: () => void
}

type ActionState = 'idle' | 'loading' | 'error'

const ALL_STATUSES = [
  'SUBMITTED', 'ASSIGNED', 'UNDER_SURVEY', 'SURVEYED',
  'UNDER_ADJUDICATION', 'APPROVED', 'REJECTED', 'PAID',
]

export function StatusActionPanel({ claim, role, onActionComplete }: Props) {
  const [note, setNote] = useState('')
  const [actionState, setActionState] = useState<ActionState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [staff, setStaff] = useState<UserProfileResponse[]>([])
  const [assignee, setAssignee] = useState('')

  useEffect(() => {
    if (role !== 'CASE_MANAGER' && role !== 'REGIONAL_MANAGER') return
    // GET /users/all has no server-side role filter — it returns customers too.
    listStaff().then((users) => setStaff(users.filter((u) => (u.role as string) !== 'CUSTOMER')))
  }, [role])

  if (role === 'AUDITOR') return null

  const doAssign = async () => {
    if (!assignee) return
    setActionState('loading')
    setErrorMsg('')
    try {
      await assignClaim(claim.id, assignee)
      setAssignee('')
      onActionComplete()
      setActionState('idle')
    } catch (e: any) {
      setErrorMsg(e?.response?.data?.detail ?? 'Action failed.')
      setActionState('error')
    }
  }

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

  // The panel-wide loading state is unchanged; it just renders as `loading`
  // now, so labels stay readable instead of collapsing to an ellipsis.
  const btn = (
    label: string,
    status: string,
    disabled = false,
    variant: ButtonVariant = 'primary'
  ) => (
    <Button
      variant={variant}
      onClick={() => doAction(status)}
      disabled={disabled}
      loading={actionState === 'loading'}
    >
      {label}
    </Button>
  )

  return (
    <Card>
      <CardBody>
        <CardTitle size="md" className="mb-4">Actions</CardTitle>

        {role === 'CASE_MANAGER' && (
          <div className="space-y-4">
            <div className="space-y-3">
              <Select
                label="Assignee"
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
              >
                <option value="">— choose staff member —</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>{s.full_name ?? s.email}</option>
                ))}
              </Select>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="primary"
                  onClick={doAssign}
                  disabled={!assignee}
                  loading={actionState === 'loading'}
                >
                  Assign Claim
                </Button>
              </div>
            </div>
            {/* Stays a native <select>: line 57 of the old file fired a
                mutating API call straight from onChange, and that event
                semantics must not change. */}
            <Select
              label="Override Status"
              defaultValue=""
              onChange={(e) => e.target.value && doAction(e.target.value)}
              disabled={actionState === 'loading'}
            >
              <option value="">— choose status —</option>
              {ALL_STATUSES.map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>
              ))}
            </Select>
          </div>
        )}

        {role === 'REGIONAL_MANAGER' && (
          <div className="space-y-3">
            <Select
              label="Assignee"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            >
              <option value="">— choose staff member —</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{s.full_name ?? s.email}</option>
              ))}
            </Select>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                onClick={doAssign}
                disabled={!assignee}
                loading={actionState === 'loading'}
              >
                Reassign Claim
              </Button>
            </div>
          </div>
        )}

        {role === 'SURVEYOR' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {btn('Start Survey', 'UNDER_SURVEY', claim.status !== 'ASSIGNED')}
            </div>
            {claim.status === 'UNDER_SURVEY' && (
              <div className="space-y-3">
                <Textarea
                  label="Assessment Notes"
                  hint="(required)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                />
                <div className="flex flex-wrap gap-2">
                  {btn('Submit Assessment', 'SURVEYED', !note.trim())}
                </div>
              </div>
            )}
          </div>
        )}

        {role === 'ADJUSTOR' && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {btn('Begin Adjudication', 'UNDER_ADJUDICATION', claim.status !== 'SURVEYED')}
            </div>
            {claim.status === 'UNDER_ADJUDICATION' && (
              <div className="space-y-3">
                <Textarea
                  label="Notes"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                />
                <div className="flex flex-wrap gap-2">
                  {btn('Approve', 'APPROVED', false, 'success')}
                  {btn('Reject', 'REJECTED', !note.trim(), 'danger')}
                </div>
              </div>
            )}
            {claim.status === 'APPROVED' && (
              <div className="flex flex-wrap gap-2">
                {/* Was bg-yellow-500 + white text: ~1.9:1, already failing in
                    light mode. The warning token is amber-700, which clears
                    4.5:1 in both themes. Do not reintroduce the yellow. */}
                {btn('Mark Paid', 'PAID', false, 'warning')}
              </div>
            )}
          </div>
        )}

        {errorMsg && <ErrorText className="mt-3">{errorMsg}</ErrorText>}
      </CardBody>
    </Card>
  )
}
