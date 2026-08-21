import React, { Suspense } from 'react'
import { Outlet } from 'react-router-dom'
import { LoadingBlock, PageContainer } from '../ui'
import { Header } from './Header'
import { CONTENT_WIDTH } from './shell'

/**
 * Nested INSIDE PrivateRoute, never around it — otherwise an unauthenticated
 * visitor briefly mounts a shell that reads currentUser.
 *
 * The Suspense boundary sits here rather than above <Routes>, so a lazy chunk
 * load swaps only the page body and the header stays put.
 */
export function AppShell() {
  return (
    <div className="flex min-h-dvh flex-col bg-app">
      <Header />
      <main className="flex-1">
        <Suspense
          fallback={
            <PageContainer width={CONTENT_WIDTH}>
              <LoadingBlock />
            </PageContainer>
          }
        >
          <Outlet />
        </Suspense>
      </main>
    </div>
  )
}
