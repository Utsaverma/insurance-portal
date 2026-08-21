import React from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/cn'

const SPINNER_SIZES = {
  sm: 'h-4 w-4',
  md: 'h-5 w-5',
  lg: 'h-8 w-8',
} as const

export function Spinner({
  size = 'md',
  className,
  label = 'Loading',
}: {
  size?: keyof typeof SPINNER_SIZES
  className?: string
  label?: string
}) {
  return (
    <Loader2
      role="status"
      aria-label={label}
      className={cn('animate-spin text-fg-subtle', SPINNER_SIZES[size], className)}
    />
  )
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn('animate-pulse rounded-control bg-surface-hover', className)}
    />
  )
}

/** Generic page-level loading placeholder used by Suspense and data fetches. */
export function LoadingBlock({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-3 animate-fade-in', className)}>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-24 w-full" />
      <Skeleton className="h-24 w-full" />
    </div>
  )
}

export interface EmptyStateProps {
  icon?: React.ReactNode
  title: string
  description?: string
  action?: React.ReactNode
  /** `card` (default): today's bordered box. `inline`: one muted line, no
   *  border/background/padding, for short "nothing here" spots inside a page
   *  that already has its own container. */
  variant?: 'card' | 'inline'
  className?: string
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  variant = 'card',
  className,
}: EmptyStateProps) {
  if (variant === 'inline') {
    return <p className={cn('text-sm text-fg-muted', className)}>{title}</p>
  }

  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-card border border-line bg-surface px-6 py-14 text-center',
        className
      )}
    >
      {icon && <div className="text-fg-subtle">{icon}</div>}
      <p className="text-sm font-medium text-fg">{title}</p>
      {description && <p className="text-sm text-fg-muted">{description}</p>}
      {action}
    </div>
  )
}
