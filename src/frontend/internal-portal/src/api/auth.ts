import apiClient from './client'
import type { UserProfileResponse } from '../types'

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
