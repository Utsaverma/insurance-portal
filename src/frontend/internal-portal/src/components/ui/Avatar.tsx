import React from 'react'
import { cn } from '../../lib/cn'
import { hueFrom, initials } from '../../lib/initials'

const SIZES = {
  sm: 'h-7 w-7 text-[0.65rem]',
  md: 'h-9 w-9 text-xs',
  lg: 'h-11 w-11 text-sm',
} as const

export interface AvatarProps {
  name?: string | null
  /** Stable identity for the hue — usually the user id or email. */
  seed?: string | null
  size?: keyof typeof SIZES
  className?: string
}

/**
 * Initials chip with a deterministic hue, so a given user always gets the same
 * colour. Only saturation/lightness differ between themes, and those live in
 * src/index.css as --avatar-s / --avatar-l / --avatar-fg-l, so the hue can stay
 * an inline style without needing to know the current theme.
 */
export function Avatar({ name, seed, size = 'md', className }: AvatarProps) {
  const hue = hueFrom(seed || name || '')
  return (
    <span
      aria-hidden
      style={{
        backgroundColor: `hsl(${hue} var(--avatar-s) var(--avatar-l))`,
        color: `hsl(${hue} var(--avatar-s) var(--avatar-fg-l))`,
      }}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold select-none',
        SIZES[size],
        className
      )}
    >
      {initials(name)}
    </span>
  )
}
