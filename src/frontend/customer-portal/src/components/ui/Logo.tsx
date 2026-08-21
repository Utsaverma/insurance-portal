import React from 'react'
import { cn } from '../../lib/cn'

/**
 * Inline SVG shield + check. Uses currentColor so it inherits the surrounding
 * text colour in both themes — no fetch, no CSP surface, no asset pipeline.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={cn('h-6 w-6', className)}
    >
      <path
        d="M12 2.5 4.5 5.6v6c0 4.6 3.2 8.9 7.5 9.9 4.3-1 7.5-5.3 7.5-9.9v-6L12 2.5Z"
        fill="currentColor"
        fillOpacity="0.16"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="m8.6 11.9 2.4 2.4 4.4-4.6"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
