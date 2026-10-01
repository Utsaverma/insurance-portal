import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { listClaims } from '../api/claims'
import { apiErrorMessage } from '../api/client'
import { ClaimsTable } from '../components/ClaimsTable'
import { CONTENT_WIDTH } from '../components/layout/shell'
import { Alert, LoadingBlock, PageContainer, PageHeader, StatCard } from '../components/ui'
import type { Claim } from '../types'

const OPEN_STATUSES = ['SUBMITTED', 'ASSIGNED', 'UNDER_SURVEY', 'SURVEYED', 'UNDER_ADJUDICATION']

export function Dashboard() {
  const { currentUser } = useAuth()
  const navigate = useNavigate()
  const [claims, setClaims] = useState<Claim[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    // The API pages at 20 by default, which silently cut the queue off at 20 claims.
    // It returns newest first, and at most 1000 claims per call.
    listClaims({ limit: 1000 })
      .then((r) => {
        setClaims(r.items)
        setTotal(r.total)
      })
      // Without this a failed load rendered as an empty queue.
      .catch((e) => setError(apiErrorMessage(e, 'Could not load the claims queue. Please try again.')))
      .finally(() => setLoading(false))
  }, [])

  const stats = useMemo(() => {
    const open = claims.filter((c) => OPEN_STATUSES.includes(c.status)).length
    const assignedToMe = claims.filter((c) => c.assigned_to === currentUser?.id).length
    return { open, assignedToMe }
  }, [claims, currentUser])

  const showAssignedToMe = currentUser?.role !== 'AUDITOR'

  return (
    // Identity, nav and Logout now live in AppShell's Header, so they persist
    // on Claim Detail and Reports too instead of only this page.
    <PageContainer width={CONTENT_WIDTH}>
      <PageHeader
        title="Claims Queue"
        subtitle={currentUser ? `viewing as ${currentUser.role.replace(/_/g, ' ')}` : undefined}
      />

      {error && <Alert tone="danger">{error}</Alert>}
      {claims.length < total && (
        <Alert tone="info" className="mb-4">
          Showing the {claims.length} most recent of {total} claims.
        </Alert>
      )}

      {!loading && !error && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label="In queue" value={total} size="lg" numeric />
          <StatCard label="Awaiting action" value={stats.open} size="lg" numeric tone="brand" />
          {showAssignedToMe && (
            <StatCard
              label="Assigned to me"
              value={stats.assignedToMe}
              size="lg"
              numeric
              tone="success"
              className="col-span-2 sm:col-span-1"
            />
          )}
        </div>
      )}

      {loading ? (
        <LoadingBlock />
      ) : error ? null : (
        <ClaimsTable
          claims={claims}
          onRowClick={(id) => navigate(`/claims/${id}`)}
          roleVisibility={currentUser?.role ?? 'AUDITOR'}
        />
      )}
    </PageContainer>
  )
}
