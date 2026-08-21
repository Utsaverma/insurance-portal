export type UserRole =
  | 'CUSTOMER'
  | 'CASE_MANAGER'
  | 'SURVEYOR'
  | 'ADJUSTOR'
  | 'AUDITOR'
  | 'REGIONAL_MANAGER'

/** Client-side display shape. `name` is derived from the API's `full_name`. */
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
