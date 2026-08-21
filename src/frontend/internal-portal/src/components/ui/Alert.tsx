import React from 'react'
import { cn } from '../../lib/cn'

export type AlertTone = 'danger' | 'warning' | 'success' | 'info'

const TONES: Record<AlertTone, string> = {
  danger: 'bg-danger-soft border-danger-line text-danger-fg',
  warning: 'bg-warning-soft border-warning-line text-warning-fg',
  success: 'bg-success-soft border-success-line text-success-fg',
  info: 'bg-info-soft border-info-line text-info-fg',
}

export interface AlertProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: AlertTone
  icon?: React.ReactNode
}

/** Form-submit failures — a bordered block. For field-level errors use `ErrorText`. */
export function Alert({ tone = 'danger', icon, className, children, ...rest }: AlertProps) {
  return (
    <div
      {...rest}
      role="alert"
      className={cn(
        'flex items-start gap-2 rounded-card border px-3 py-2 text-sm',
        TONES[tone],
        className
      )}
    >
      {icon && <span className="mt-0.5 shrink-0">{icon}</span>}
      <span>{children}</span>
    </div>
  )
}

export interface ErrorTextProps extends React.HTMLAttributes<HTMLParagraphElement> {
  id?: string
}

/** Field-level errors — one muted line. Forwards `id` for `Field`'s aria-describedby wiring. */
export function ErrorText({ className, children, ...rest }: ErrorTextProps) {
  return (
    <p {...rest} role="alert" className={cn('text-xs text-danger-fg', className)}>
      {children}
    </p>
  )
}
