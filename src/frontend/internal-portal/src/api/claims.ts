import apiClient from './client'
import type { Claim, ClaimDocument, ClaimHistoryEntry } from '../types'

export interface ClaimFilterParams {
  status?: string
  skip?: number
  limit?: number
}

export interface StatusUpdateBody {
  status: string
  note?: string
}

export const listClaims = async (params?: ClaimFilterParams): Promise<{ items: Claim[]; total: number }> => {
  const res = await apiClient.get('/claims', { params })
  return res.data
}

export const getClaim = async (id: string): Promise<Claim> => {
  const res = await apiClient.get<Claim>(`/claims/${id}`)
  return res.data
}

export const updateClaimStatus = async (id: string, body: StatusUpdateBody): Promise<Claim> => {
  const res = await apiClient.patch<Claim>(`/claims/${id}/status`, body)
  return res.data
}

export const assignClaim = async (id: string, assignedTo: string): Promise<Claim> => {
  const res = await apiClient.post<Claim>(`/claims/${id}/assign`, { assigned_to: assignedTo })
  return res.data
}

export const listDocuments = async (claimId: string): Promise<ClaimDocument[]> => {
  const res = await apiClient.get<ClaimDocument[]>(`/claims/${claimId}/documents`)
  return res.data
}

export const downloadDocument = async (claimId: string, docId: string): Promise<Blob> => {
  const res = await apiClient.get(`/claims/${claimId}/documents/${docId}/download`, { responseType: 'blob' })
  return res.data
}
