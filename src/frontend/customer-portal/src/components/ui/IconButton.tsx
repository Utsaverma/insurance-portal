import React from 'react'
import { cn } from '../../lib/cn'

const SIZES = {
  /** 40x40 — the floor for a comfortable pointer target. */
  md: 'h-10 w-10',
  /** 44x44 — Apple's minimum; use inside the mobile drawer. */
  lg: 'h-11 w-11',
} as const

const VARIANTS = {
  ghost: 'text-fg-muted hover:bg-surface-hover hover:text-fg',
  secondary: 'border border-line-strong bg-surface text-fg hover:bg-surface-hover',
} as const

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Required: the button has no text content to name it. */
  label: string
  size?: keyof typeof SIZES
  variant?: keyof typeof VARIANTS
}

export function IconButton({
  label,
  size = 'md',
  variant = 'ghost',
  className,
  children,
  ...rest
}: IconButtonProps) {
  return (
    <button
      {...rest}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center rounded-control transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        SIZES[size],
        VARIANTS[variant],
        className
      )}
    >
      {children}
    </button>
  )
}
