import React from 'react'
import { cn } from '../../lib/cn'

export type BadgeTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger'

const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-hover text-fg-muted border-line-strong',
  brand: 'bg-info-soft text-info-fg border-info-line',
  success: 'bg-success-soft text-success-fg border-success-line',
  warning: 'bg-warning-soft text-warning-fg border-warning-line',
  danger: 'bg-danger-soft text-danger-fg border-danger-line',
}

const BASE =
  'inline-block px-2.5 py-0.5 rounded-full border text-xs font-semibold whitespace-nowrap'

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone
  /** Pre-resolved paint classes, for callers with their own token set
   *  (ClaimStatusBadge maps 8 statuses to 8 literal class strings). */
  classes?: string
}

export function Badge({ tone = 'neutral', classes, className, children, ...rest }: BadgeProps) {
  return (
    <span {...rest} className={cn(BASE, classes ?? TONES[tone], className)}>
      {children}
    </span>
  )
}
