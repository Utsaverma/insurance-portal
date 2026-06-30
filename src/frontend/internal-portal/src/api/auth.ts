import apiClient from './client'
import type { AuthUser } from '../types'

interface LoginResponse {
  access_token: string
  refresh_token: string
  token_type: string
}

export async function loginApi(email: string, password: string): Promise<LoginResponse> {
  const res = await apiClient.post<LoginResponse>('/auth/login', { email, password })
  return res.data
}

export async function me(): Promise<AuthUser> {
  const res = await apiClient.get<AuthUser>('/users/me')
  return res.data
}
