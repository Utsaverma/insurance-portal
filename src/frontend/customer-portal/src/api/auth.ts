import apiClient from './client'

export interface LoginResponse {
  access_token: string
  refresh_token: string
  token_type: string
}

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await apiClient.post<LoginResponse>('/auth/login', { email, password })
  return res.data
}

export async function register(payload: { email: string; password: string; full_name?: string }): Promise<void> {
  await apiClient.post('/auth/register', payload)
}
