import React, { useEffect, useState } from 'react'
import type { Claim, ClaimStatus, UserProfileResponse, UserRole } from '../types'
import { assignClaim, updateClaimStatus, type StatusUpdateBody } from '../api/claims'
import { apiErrorMessage } from '../api/client'
import { listStaff } from '../api/users'
import { cn } from '../lib/cn'
import { formatCurrency } from '../lib/format'
import { Alert, Button, Card, CardBody, CardTitle, Input, Select, Textarea, type ButtonVariant } from './ui'

interface Props {
  claim: Claim
  role: UserRole
  userId: string
  onActionComplete: () => void
}

type ActionState = 'idle' | 'loading' | 'error'

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

/** Why the server offers this user nothing on the claim, instead of an empty
 *  panel. Copy only: what is offered comes from claim.allowed_actions. */
function waitingMessage(role: UserRole, claim: Claim, userId: string): string {
  const { status } = claim
  if (status === 'PAID') return 'Paid claims are final: their status can no longer be changed.'
  if (status === 'REJECTED') return 'This claim was rejected. A case manager can reopen it with an override.'
  if (role === 'REGIONAL_MANAGER') return 'A case manager makes the first assignment. You can reassign the claim after that.'
  if (role === 'SURVEYOR' && !['SUBMITTED', 'ASSIGNED', 'UNDER_SURVEY'].includes(status)) {
    return 'The survey is complete. The claim is now with the adjustor.'
  }
  if (role === 'ADJUSTOR' && ['SUBMITTED', 'ASSIGNED', 'UNDER_SURVEY'].includes(status)) {
    return 'Waiting for the survey to be completed.'
  }
  if (!claim.assigned_to) return 'Waiting for a case manager to assign this claim.'
  if (claim.assigned_to !== userId) {
    return `This claim is assigned to ${claim.assigned_staff_name ?? 'another staff member'}. Only the assignee can work on it.`
  }
  return 'There is nothing for you to do on this claim right now.'
}

export function StatusActionPanel({ claim, role, userId, onActionComplete }: Props) {
  const actions = claim.allowed_actions
  const can = (status: ClaimStatus) => actions.transitions.includes(status)

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
    if (!actions.assign) return
    // GET /users/all has no server-side role filter: it returns every user,
    // customers and auditors included.
    listStaff()
      .then((users) => setStaff(users.filter((u) => ASSIGNABLE_ROLES[u.role])))
      .catch((e) => setErrorMsg(apiErrorMessage(e, 'Could not load staff.')))
  }, [actions.assign])

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

  const nothingToDo = !actions.assign && actions.overrides.length === 0 && actions.transitions.length === 0

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

  const assignForm = (
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
          {claim.assigned_to ? 'Reassign Claim' : 'Assign Claim'}
        </Button>
      </div>
    </div>
  )

  // Every control below is offered only when claim.allowed_actions says the
  // server would accept it, so the panel no longer mirrors the state machine.
  return (
    <Card>
      <CardBody>
        <CardTitle size="md" className="mb-4">Actions</CardTitle>

        <div className="space-y-4">
          {nothingToDo && <p className="text-sm text-fg-muted">{waitingMessage(role, claim, userId)}</p>}

          {actions.assign && assignForm}

          {/* An explicit form: the old select changed the status straight from
              onChange, so one slip in the picker rewrote a claim's status. */}
          {actions.overrides.length > 0 && (
            <div className={cn('space-y-3', actions.assign && 'border-t border-line pt-4')}>
              <Select
                label="Override Status"
                value={overrideTo}
                onChange={(e) => setOverrideTo(e.target.value)}
                disabled={actionState === 'loading'}
              >
                <option value="">— choose status —</option>
                {actions.overrides.map((s) => (
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

          {can('UNDER_SURVEY') && (
            <div className="flex flex-wrap gap-2">
              {btn('Start Survey', 'UNDER_SURVEY')}
            </div>
          )}

          {can('SURVEYED') && (
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

          {can('UNDER_ADJUDICATION') && (
            <div className="flex flex-wrap gap-2">
              {btn('Begin Adjudication', 'UNDER_ADJUDICATION')}
            </div>
          )}

          {(can('APPROVED') || can('REJECTED')) && (
            <div className="space-y-3">
              {can('APPROVED') &&
                amountInput(
                  'Approved Amount (USD)',
                  approvedAmount,
                  setApprovedAmount,
                  claim.claimed_amount,
                  '(required to approve)'
                )}
              <Textarea
                label="Notes"
                hint={can('REJECTED') ? '(required to reject)' : undefined}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                rows={3}
              />
              <div className="flex flex-wrap gap-2">
                {can('APPROVED') &&
                  btn('Approve', 'APPROVED', !amountOk(approvedAmount, claim.claimed_amount), 'success')}
                {can('REJECTED') && btn('Reject', 'REJECTED', !note.trim(), 'danger')}
              </div>
            </div>
          )}

          {can('PAID') && (
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

        {errorMsg && <Alert tone="danger" className="mt-4">{errorMsg}</Alert>}
      </CardBody>
    </Card>
  )
}
