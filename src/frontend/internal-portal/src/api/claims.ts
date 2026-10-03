import apiClient from './client'
import type { Claim, ClaimDocument, ClaimHistoryEntry } from '../types'

export interface ClaimFilterParams {
  status?: string
  skip?: number
  limit?: number
}

export interface StatusUpdateBody {
  status: string
  /** Required (as the reason) when a case manager overrides the workflow. */
  note?: string
  /** Required with SURVEYED; the server rejects it with any other status. */
  assessed_amount?: string | number
  /** Required with APPROVED (> 0, ≤ claimed); rejected with any other status. */
  approved_amount?: string | number
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

export const getClaimHistory = async (id: string): Promise<ClaimHistoryEntry[]> => {
  const res = await apiClient.get<ClaimHistoryEntry[]>(`/claims/${id}/history`)
  return res.data
}

export const listDocuments = async (claimId: string): Promise<ClaimDocument[]> => {
  const res = await apiClient.get<ClaimDocument[]>(`/claims/${claimId}/documents`)
  return res.data
}

export const uploadDocument = async (claimId: string, file: File): Promise<ClaimDocument> => {
  const form = new FormData()
  form.append('file', file)
  const res = await apiClient.post<ClaimDocument>(`/claims/${claimId}/documents`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export const downloadDocument = async (claimId: string, docId: string): Promise<Blob> => {
  const res = await apiClient.get(`/claims/${claimId}/documents/${docId}/download`, { responseType: 'blob' })
  return res.data
}
