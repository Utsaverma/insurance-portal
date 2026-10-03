import apiClient from './client'
import type { ReportSummary } from '../types'

export const getReportSummary = async (): Promise<ReportSummary> => {
  const res = await apiClient.get<ReportSummary>('/reports/summary')
  return res.data
}
