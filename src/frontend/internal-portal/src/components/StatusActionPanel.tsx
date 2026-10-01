import React, { useEffect, useState } from 'react'
import type { Claim, UserProfileResponse, UserRole } from '../types'
import { assignClaim, updateClaimStatus, type StatusUpdateBody } from '../api/claims'
import { apiErrorMessage } from '../api/client'
import { listStaff } from '../api/users'
import { cn } from '../lib/cn'
import { formatCurrency } from '../lib/format'
import { Alert, Button, Card, CardBody, CardTitle, Input, Select, Textarea, type ButtonVariant } from './ui'

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

/** Closed claims keep their last assignment (the server refuses a reassignment). */
const isClosed = (c: Claim) => c.status === 'PAID' || c.status === 'REJECTED'

/** Who a claim can be assigned to (the people who work it), and how the role reads. */
const ASSIGNABLE_ROLES: Partial<Record<UserRole, string>> = {
  SURVEYOR: 'Surveyor',
  ADJUSTOR: 'Adjustor',
}

const statusLabel = (s: string) => s.replace(/_/g, ' ')

const staffLabel = (u: UserProfileResponse) => `${u.full_name ?? u.email} (${ASSIGNABLE_ROLES[u.role]})`

const amountValue = (v: string | number | null) => (v == null ? '' : String(v))

/** The approved amount starts at the lower of the assessed and claimed amounts. */
const defaultApproved = (c: Claim) =>
  c.assessed_amount != null && Number(c.assessed_amount) < Number(c.claimed_amount)
    ? String(c.assessed_amount)
    : String(c.claimed_amount)

/** Mirrors the server's amount rules so the panel can explain them before a
 *  round trip. Empty is not an error: the submit button just stays disabled. */
function amountError(value: string, max?: string | number): string | undefined {
  if (value === '') return undefined
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return 'Enter an amount greater than $0.00.'
  if (Number(n.toFixed(2)) !== n) return 'Use at most 2 decimal places.'
  if (max !== undefined && n > Number(max)) return `Cannot exceed the claimed amount (${formatCurrency(max)}).`
  return undefined
}

const amountOk = (value: string, max?: string | number) => value !== '' && !amountError(value, max)

/** What a surveyor or adjustor is told when the claim is not at one of their steps,
 *  instead of a permanently disabled button with no explanation. */
function waitingMessage(role: UserRole, status: Claim['status']): string | undefined {
  if (status === 'PAID') return 'Paid claims are final: their status can no longer be changed.'
  if (status === 'REJECTED') return 'This claim was rejected. A case manager can reopen it with an override.'
  if (role === 'SURVEYOR') {
    if (status === 'SUBMITTED') return 'Waiting for a case manager to assign this claim.'
    if (status !== 'ASSIGNED' && status !== 'UNDER_SURVEY') return 'The survey is complete. The claim is now with the adjustor.'
  }
  if (role === 'ADJUSTOR') {
    if (status === 'SUBMITTED' || status === 'ASSIGNED' || status === 'UNDER_SURVEY') {
      return 'Waiting for the survey to be completed.'
    }
  }
  return undefined
}

export function StatusActionPanel({ claim, role, onActionComplete }: Props) {
  const [note, setNote] = useState('')
  const [actionState, setActionState] = useState<ActionState>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [staff, setStaff] = useState<UserProfileResponse[]>([])
  const [assignee, setAssignee] = useState('')
  const [assessedAmount, setAssessedAmount] = useState(() => amountValue(claim.assessed_amount))
  const [approvedAmount, setApprovedAmount] = useState(() => defaultApproved(claim))
  const [overrideTo, setOverrideTo] = useState('')

  // Re-seed the amounts each time the claim reloads after an action.
  useEffect(() => {
    setAssessedAmount(amountValue(claim.assessed_amount))
    setApprovedAmount(defaultApproved(claim))
  }, [claim])

  useEffect(() => {
    if (role !== 'CASE_MANAGER' && role !== 'REGIONAL_MANAGER') return
    // GET /users/all has no server-side role filter: it returns every user,
    // customers and auditors included.
    listStaff()
      .then((users) => setStaff(users.filter((u) => ASSIGNABLE_ROLES[u.role])))
      .catch((e) => setErrorMsg(apiErrorMessage(e, 'Could not load staff.')))
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
    } catch (e) {
      setErrorMsg(apiErrorMessage(e, 'Action failed.'))
      setActionState('error')
    }
  }

  // An amount rides along only with the status that takes it: the server
  // rejects an amount sent with any other status.
  const bodyFor = (status: string): StatusUpdateBody => ({
    status,
    note: note.trim() || undefined,
    assessed_amount: status === 'SURVEYED' ? assessedAmount : undefined,
    approved_amount: status === 'APPROVED' ? approvedAmount : undefined,
  })

  const doAction = async (status: string) => {
    setActionState('loading')
    setErrorMsg('')
    try {
      await updateClaimStatus(claim.id, bodyFor(status))
      setNote('')
      setOverrideTo('')
      onActionComplete()
      setActionState('idle')
    } catch (e) {
      setErrorMsg(apiErrorMessage(e, 'Action failed.'))
      setActionState('error')
    }
  }

  // Any status but the current one. SUBMITTED → ASSIGNED is not an override:
  // it is the case manager's own step, taken with Assign so the claim gets an owner.
  // PAID settles the approved amount, so the server allows it only once there is one.
  const overrideTargets = ALL_STATUSES.filter(
    (s) =>
      s !== claim.status &&
      !(claim.status === 'SUBMITTED' && s === 'ASSIGNED') &&
      !(s === 'PAID' && claim.approved_amount == null)
  )
  // An override is held to the same amount rules as the normal workflow.
  const overrideReady =
    overrideTo !== '' &&
    note.trim() !== '' &&
    (overrideTo !== 'SURVEYED' || amountOk(assessedAmount)) &&
    (overrideTo !== 'APPROVED' || amountOk(approvedAmount, claim.claimed_amount))

  const doOverride = () => {
    const question = `Override ${statusLabel(claim.status)} → ${statusLabel(overrideTo)}? This is recorded in the audit trail.`
    if (window.confirm(question)) doAction(overrideTo)
  }

  // PAID is final for every role, so it gets the same confirmation step as an override.
  const doMarkPaid = () => {
    const question = `Mark ${claim.claim_number} as paid (${formatCurrency(claim.approved_amount)})? A paid claim is final.`
    if (window.confirm(question)) doAction('PAID')
  }

  const waiting = waitingMessage(role, claim.status)

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

  const amountInput = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    max?: string | number,
    hint = '(required)'
  ) => (
    <Input
      label={label}
      hint={hint}
      type="number"
      inputMode="decimal"
      min="0.01"
      step="0.01"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      error={amountError(value, max)}
    />
  )

  return (
    <Card>
      <CardBody>
        <CardTitle size="md" className="mb-4">Actions</CardTitle>

        {role === 'CASE_MANAGER' && (
          <div className="space-y-4">
            {!isClosed(claim) && (
              <div className="space-y-3">
                <Select
                  label="Assignee"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                >
                  <option value="">— choose staff member —</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>{staffLabel(s)}</option>
                  ))}
                </Select>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="primary"
                    onClick={doAssign}
                    disabled={!assignee}
                    loading={actionState === 'loading'}
                  >
                    {claim.status === 'SUBMITTED' ? 'Assign Claim' : 'Reassign Claim'}
                  </Button>
                </div>
              </div>
            )}
            {/* An explicit form: the old select changed the status straight from
                onChange, so one slip in the picker rewrote a claim's status. */}
            {claim.status === 'PAID' ? (
              <p className="text-sm text-fg-muted">
                Paid claims are final: their status can no longer be changed.
              </p>
            ) : (
              <div className={cn('space-y-3', !isClosed(claim) && 'border-t border-line pt-4')}>
                <Select
                  label="Override Status"
                  value={overrideTo}
                  onChange={(e) => setOverrideTo(e.target.value)}
                  disabled={actionState === 'loading'}
                >
                  <option value="">— choose status —</option>
                  {overrideTargets.map((s) => (
                    <option key={s} value={s}>{statusLabel(s)}</option>
                  ))}
                </Select>
                {overrideTo === 'SURVEYED' &&
                  amountInput('Assessed Amount (USD)', assessedAmount, setAssessedAmount)}
                {overrideTo === 'APPROVED' &&
                  amountInput('Approved Amount (USD)', approvedAmount, setApprovedAmount, claim.claimed_amount)}
                <Textarea
                  label="Reason"
                  hint="(required)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="danger"
                    onClick={doOverride}
                    disabled={!overrideReady}
                    loading={actionState === 'loading'}
                  >
                    Apply Override
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}

        {role === 'REGIONAL_MANAGER' && isClosed(claim) && (
          <p className="text-sm text-fg-muted">Closed claims keep their last assignment.</p>
        )}

        {role === 'REGIONAL_MANAGER' && claim.status === 'SUBMITTED' && (
          <p className="text-sm text-fg-muted">
            A case manager makes the first assignment. You can reassign the claim after that.
          </p>
        )}

        {role === 'REGIONAL_MANAGER' && !isClosed(claim) && claim.status !== 'SUBMITTED' && (
          <div className="space-y-3">
            <Select
              label="Assignee"
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
            >
              <option value="">— choose staff member —</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>{staffLabel(s)}</option>
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
            {waiting && <p className="text-sm text-fg-muted">{waiting}</p>}
            {claim.status === 'ASSIGNED' && (
              <div className="flex flex-wrap gap-2">
                {btn('Start Survey', 'UNDER_SURVEY')}
              </div>
            )}
            {claim.status === 'UNDER_SURVEY' && (
              <div className="space-y-3">
                {amountInput('Assessed Amount (USD)', assessedAmount, setAssessedAmount)}
                <Textarea
                  label="Assessment Notes"
                  hint="(required)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                />
                <div className="flex flex-wrap gap-2">
                  {btn('Submit Assessment', 'SURVEYED', !note.trim() || !amountOk(assessedAmount))}
                </div>
              </div>
            )}
          </div>
        )}

        {role === 'ADJUSTOR' && (
          <div className="space-y-4">
            {waiting && <p className="text-sm text-fg-muted">{waiting}</p>}
            {claim.status === 'SURVEYED' && (
              <div className="flex flex-wrap gap-2">
                {btn('Begin Adjudication', 'UNDER_ADJUDICATION')}
              </div>
            )}
            {claim.status === 'UNDER_ADJUDICATION' && (
              <div className="space-y-3">
                {amountInput(
                  'Approved Amount (USD)',
                  approvedAmount,
                  setApprovedAmount,
                  claim.claimed_amount,
                  '(required to approve)'
                )}
                <Textarea
                  label="Notes"
                  hint="(required to reject)"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                />
                <div className="flex flex-wrap gap-2">
                  {btn('Approve', 'APPROVED', !amountOk(approvedAmount, claim.claimed_amount), 'success')}
                  {btn('Reject', 'REJECTED', !note.trim(), 'danger')}
                </div>
              </div>
            )}
            {claim.status === 'APPROVED' && (
              <div className="flex flex-wrap gap-2">
                {/* Was bg-yellow-500 + white text: ~1.9:1, already failing in
                    light mode. The warning token is amber-700, which clears
                    4.5:1 in both themes. Do not reintroduce the yellow. */}
                <Button variant="warning" onClick={doMarkPaid} loading={actionState === 'loading'}>
                  Mark Paid
                </Button>
              </div>
            )}
          </div>
        )}

        {errorMsg && <Alert tone="danger" className="mt-4">{errorMsg}</Alert>}
      </CardBody>
    </Card>
  )
}
