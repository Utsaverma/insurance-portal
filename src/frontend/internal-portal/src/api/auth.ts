import apiClient, { apiErrorStatus } from './client'
import type { UserProfileResponse } from '../types'

/** A valid account that belongs in the other portal. */
export class WrongPortalError extends Error {}

/** Why a sign-in failed, in words: "Invalid email or password" used to cover
 *  the rate limit and an unreachable server too. */
export function loginErrorMessage(err: unknown): string {
  if (err instanceof WrongPortalError) {
    return 'This is the internal staff portal. Customer accounts sign in to the customer portal.'
  }
  const status = apiErrorStatus(err)
  if (status === 401) return 'Invalid email or password.'
  if (status === 422) return 'Enter a valid email address.'
  if (status === 429) return 'Too many sign-in attempts. Please wait a minute and try again.'
  return 'Could not sign in right now. Please try again shortly.'
}

interface LoginResponse {
  access_token: string
  refresh_token: string
  token_type: string
  /** Additive since the auth-service embeds the user in the token response. */
  user?: UserProfileResponse | null
}

export async function loginApi(email: string, password: string): Promise<LoginResponse> {
  const res = await apiClient.post<LoginResponse>('/auth/login', { email, password })
  return res.data
}

/** Typed to the real endpoint shape — it returns `full_name`, not `name`.
 *  Callers map it through profileToUser(). */
export async function me(): Promise<UserProfileResponse> {
  const res = await apiClient.get<UserProfileResponse>('/users/me')
  return res.data
}
