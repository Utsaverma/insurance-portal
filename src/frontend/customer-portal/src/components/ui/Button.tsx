import React from 'react'
import { Loader2 } from 'lucide-react'
import { cn } from '../../lib/cn'

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'danger'
  | 'success'
  | 'warning'
  | 'link'

export type ButtonSize = 'sm' | 'md' | 'lg'

/* Every class below is a complete literal string. Tailwind's content scanner is
   a regex over source text, so a templated `bg-${x}` would emit no CSS at all —
   and only in the production build. Never interpolate a class name. */
const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 shadow-sm',
  secondary: 'bg-surface text-fg border border-line-strong hover:bg-surface-hover',
  ghost: 'bg-transparent text-fg-muted hover:bg-surface-hover hover:text-fg',
  danger: 'bg-danger-solid text-white hover:bg-danger-solid-hover shadow-sm',
  success: 'bg-success-solid text-white hover:bg-success-solid-hover shadow-sm',
  warning: 'bg-warning-solid text-white hover:bg-warning-solid-hover shadow-sm',
  link: 'bg-transparent text-link hover:text-link-hover hover:underline',
}

const SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-5 text-sm',
}

/* A link-styled button keeps a tight visual box but a full-size hit target: the
   negative margin pulls the padding back out of the layout. */
const LINK_SIZES: Record<ButtonSize, string> = {
  sm: 'h-9 -mx-2 px-2 text-sm',
  md: 'h-10 -mx-2 px-2 text-sm',
  lg: 'h-11 -mx-2 px-2 text-sm',
}

const BASE =
  'inline-flex items-center justify-center gap-2 rounded-control font-medium whitespace-nowrap transition-colors disabled:cursor-not-allowed disabled:opacity-50'

export function buttonClasses(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  fullWidth = false
): string {
  const sizes = variant === 'link' ? LINK_SIZES : SIZES
  return cn(BASE, VARIANTS[variant], sizes[size], fullWidth && 'w-full')
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  loading?: boolean
  fullWidth?: boolean
  icon?: React.ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  icon,
  className,
  disabled,
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(buttonClasses(variant, size, fullWidth), className)}
    >
      {loading ? (
        <Loader2 aria-hidden className="h-4 w-4 shrink-0 animate-spin" />
      ) : (
        icon
      )}
      {children}
    </button>
  )
}
