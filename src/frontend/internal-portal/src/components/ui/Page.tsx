import React from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft } from 'lucide-react'
import { cn } from '../../lib/cn'
import { buttonClasses } from './Button'

export const WIDTHS = {
  sm: 'max-w-content-sm',
  md: 'max-w-content-md',
  lg: 'max-w-content-lg',
  xl: 'max-w-content-xl',
} as const

export interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  width?: keyof typeof WIDTHS
}

export function PageContainer({
  width = 'md',
  className,
  children,
  ...rest
}: PageContainerProps) {
  return (
    <div
      {...rest}
      className={cn('mx-auto w-full px-4 py-8 md:px-8', WIDTHS[width], className)}
    >
      {children}
    </div>
  )
}

export interface PageHeaderProps {
  title: React.ReactNode
  subtitle?: React.ReactNode
  /** Trailing chip next to the title, typically a status badge. */
  meta?: React.ReactNode
  actions?: React.ReactNode
  /** Renders a back affordance above the title. */
  backTo?: string
  backLabel?: string
  className?: string
}

export function PageHeader({
  title,
  subtitle,
  meta,
  actions,
  backTo,
  backLabel = 'Back',
  className,
}: PageHeaderProps) {
  return (
    <div className={cn('mb-6', className)}>
      {backTo && (
        // A real <Link>, so middle-click, cmd-click and hover-URL all work —
        // the old back buttons were <button onClick={navigate(...)}>.
        <Link
          to={backTo}
          className={cn(buttonClasses('link', 'sm'), 'mb-3 inline-flex')}
        >
          <ChevronLeft aria-hidden className="h-4 w-4" />
          {backLabel}
        </Link>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold text-fg truncate">{title}</h1>
            {meta}
          </div>
          {subtitle && <p className="mt-1 text-sm text-fg-muted">{subtitle}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
      </div>
    </div>
  )
}

export function SectionHeading({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2 {...rest} className={cn('text-lg font-semibold text-fg mb-4', className)}>
      {children}
    </h2>
  )
}
