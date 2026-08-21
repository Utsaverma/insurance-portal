import apiClient from './client'
import type { UserProfileResponse } from '../types'

export const listStaff = async (): Promise<UserProfileResponse[]> => {
  const res = await apiClient.get<UserProfileResponse[]>('/users/all')
  return res.data
}
