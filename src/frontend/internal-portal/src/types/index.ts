export type ClaimStatus =
  | 'SUBMITTED'
  | 'ASSIGNED'
  | 'UNDER_SURVEY'
  | 'SURVEYED'
  | 'UNDER_ADJUDICATION'
  | 'APPROVED'
  | 'REJECTED'
  | 'PAID'

export type UserRole =
  | 'CASE_MANAGER'
  | 'SURVEYOR'
  | 'ADJUSTOR'
  | 'AUDITOR'
  | 'REGIONAL_MANAGER'

export interface AuthUser {
  id: string
  name: string
  email: string
  role: UserRole
}

/** Exactly what GET /users/me and the login response's `user` object return. */
export interface UserProfileResponse {
  id: string
  email: string
  full_name: string | null
  role: UserRole
  is_active: boolean
  created_at: string
}

/** What the signed-in user may do to a claim right now, computed by the server
 *  from the workflow and the assignment. The UI renders from this instead of
 *  re-implementing the state machine. */
export interface AllowedActions {
  /** Workflow steps: PATCH /claims/{id}/status with one of these. */
  transitions: ClaimStatus[]
  /** Case-manager overrides: the same PATCH, with a mandatory reason. */
  overrides: ClaimStatus[]
  /** POST /claims/{id}/assign */
  assign: boolean
  /** POST /claims/{id}/documents */
  upload: boolean
}

export interface Claim {
  id: string
  claim_number: string
  customer_id: string
  policy_number: string
  incident_date: string
  incident_description: string
  /** Money is a Decimal on the API, which serialises it as a string ("5850.00"). */
  claimed_amount: string | number
  /** Set by the surveyor when the survey completes (SURVEYED). */
  assessed_amount: string | number | null
  /** Set by the adjustor on approval; only non-null while APPROVED or PAID. */
  approved_amount: string | number | null
  status: ClaimStatus
  assigned_to: string | null
  assigned_staff_name?: string
  allowed_actions: AllowedActions
  created_at: string
  updated_at: string
}

export interface ClaimDocument {
  id: string
  claim_id: string
  filename: string
  mime_type: string
  file_size_bytes: number
  uploaded_by: string
  uploaded_at: string
  download_url: string
}

export interface ClaimHistoryEntry {
  id: string
  claim_id: string
  from_status: string | null
  to_status: string
  changed_by: string
  /** The actor's name as recorded when they acted. */
  changed_by_name: string | null
  changed_at: string
  note: string | null
}
