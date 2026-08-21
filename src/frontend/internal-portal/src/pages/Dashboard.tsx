import React, { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { listClaims } from '../api/claims'
import { ClaimsTable } from '../components/ClaimsTable'
import { CONTENT_WIDTH } from '../components/layout/shell'
import { LoadingBlock, PageContainer, PageHeader, StatCard } from '../components/ui'
import type { Claim } from '../types'

const OPEN_STATUSES = ['SUBMITTED', 'ASSIGNED', 'UNDER_SURVEY', 'SURVEYED', 'UNDER_ADJUDICATION']

export function Dashboard() {
  const { currentUser } = useAuth()
  const navigate = useNavigate()
  const [claims, setClaims] = useState<Claim[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    listClaims().then((r) => setClaims(r.items)).finally(() => setLoading(false))
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

      {!loading && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <StatCard label="In queue" value={claims.length} size="lg" numeric />
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
      ) : (
        <ClaimsTable
          claims={claims}
          onRowClick={(id) => navigate(`/claims/${id}`)}
          roleVisibility={currentUser?.role ?? 'AUDITOR'}
        />
      )}
    </PageContainer>
  )
}
