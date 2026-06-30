import apiClient from './client'

export type ClaimStatus =
  | 'SUBMITTED'
  | 'ASSIGNED'
  | 'UNDER_SURVEY'
  | 'SURVEYED'
  | 'UNDER_ADJUDICATION'
  | 'APPROVED'
  | 'REJECTED'
  | 'PAID'

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
  created_at: string
  updated_at: string
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

export interface SubmitClaimPayload {
  policy_number: string
  incident_date: string
  incident_description: string
  claimed_amount: number
}

export const getClaims = async (): Promise<Claim[]> => {
  const res = await apiClient.get<{ items: Claim[]; total: number }>('/claims')
  return res.data.items
}

export const getClaim = async (id: string): Promise<Claim> => {
  const res = await apiClient.get<Claim>(`/claims/${id}`)
  return res.data
}

export const submitClaim = async (data: SubmitClaimPayload): Promise<Claim> => {
  const res = await apiClient.post<Claim>('/claims', data)
  return res.data
}

export const getClaimHistory = async (id: string): Promise<ClaimHistoryEntry[]> => {
  const res = await apiClient.get<ClaimHistoryEntry[]>(`/claims/${id}/history`)
  return res.data
}

export const getClaimDocuments = async (id: string): Promise<ClaimDocument[]> => {
  const res = await apiClient.get<ClaimDocument[]>(`/claims/${id}/documents`)
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
  const res = await apiClient.get(`/claims/${claimId}/documents/${docId}/download`, {
    responseType: 'blob',
  })
  return res.data
}
