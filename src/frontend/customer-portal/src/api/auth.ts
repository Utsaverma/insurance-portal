import apiClient from './client'
import type { UserProfileResponse } from '../types'

export interface LoginResponse {
  access_token: string
  refresh_token: string
  token_type: string
  /** Additive since the auth-service embeds the user in the token response. */
  user?: UserProfileResponse | null
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await apiClient.post<LoginResponse>('/auth/login', { email, password })
  return res.data
}

export async function register(payload: { email: string; password: string; full_name?: string }): Promise<void> {
  await apiClient.post('/auth/register', payload)
}

export async function me(): Promise<UserProfileResponse> {
  const res = await apiClient.get<UserProfileResponse>('/users/me')
  return res.data
}
