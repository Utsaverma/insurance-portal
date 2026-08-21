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

export interface Claim {
  id: string
  claim_number: string
  customer_id: string
  policy_number: string
  incident_date: string
  incident_description: string
  claimed_amount: number
  status: ClaimStatus
  assigned_to: string | null
  assigned_staff_name?: string
  approved_amount?: number
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
  changed_at: string
  note: string | null
}
