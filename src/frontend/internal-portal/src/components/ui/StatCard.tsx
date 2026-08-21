import React from 'react'
import { cn } from '../../lib/cn'

export type StatTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger'

const TONES: Record<StatTone, string> = {
  neutral: 'bg-surface border-line',
  brand: 'bg-info-soft border-info-line',
  success: 'bg-success-soft border-success-line',
  warning: 'bg-warning-soft border-warning-line',
  danger: 'bg-danger-soft border-danger-line',
}

const VALUE_TONES: Record<StatTone, string> = {
  neutral: 'text-fg',
  brand: 'text-info-fg',
  success: 'text-success-fg',
  warning: 'text-warning-fg',
  danger: 'text-danger-fg',
}

const VALUE_SIZES = {
  sm: 'text-sm font-semibold',
  md: 'text-lg font-bold',
  lg: 'text-xl sm:text-2xl font-bold',
} as const

export interface StatCardProps {
  label: string
  value: React.ReactNode
  tone?: StatTone
  size?: keyof typeof VALUE_SIZES
  /** Money and durations: keeps digits from jittering between rows. */
  numeric?: boolean
  className?: string
}

export function StatCard({
  label,
  value,
  tone = 'neutral',
  size = 'lg',
  numeric = false,
  className,
}: StatCardProps) {
  return (
    <div className={cn('p-4 rounded-card border', TONES[tone], className)}>
      <div className="text-xs text-fg-muted mb-1">{label}</div>
      <div className={cn(VALUE_SIZES[size], VALUE_TONES[tone], numeric && 'tabular-nums')}>
        {value}
      </div>
    </div>
  )
}
