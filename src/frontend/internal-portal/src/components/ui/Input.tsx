import React from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/cn'
import { Field } from './Field'

/* Font size is deliberately absent: src/index.css sets inputs to 16px below the
   sm breakpoint (anything smaller makes iOS Safari zoom the whole viewport on
   focus) and 14px above it. */
const CONTROL =
  'w-full rounded-control border border-line-strong bg-surface text-fg placeholder:text-fg-subtle transition-colors focus:border-transparent disabled:cursor-not-allowed disabled:opacity-60'

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  hint?: string
  error?: string
  wrapperClassName?: string
}

export function Input({
  label,
  hint,
  error,
  wrapperClassName,
  className,
  ...rest
}: InputProps) {
  return (
    <Field label={label} hint={hint} error={error} className={wrapperClassName}>
      {(a) => (
        <input
          {...a}
          {...rest}
          className={cn(CONTROL, 'h-10 px-3', error && 'border-danger-line', className)}
        />
      )}
    </Field>
  )
}

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string
  hint?: string
  error?: string
  wrapperClassName?: string
}

export function Textarea({
  label,
  hint,
  error,
  wrapperClassName,
  className,
  ...rest
}: TextareaProps) {
  return (
    <Field label={label} hint={hint} error={error} className={wrapperClassName}>
      {(a) => (
        <textarea
          {...a}
          {...rest}
          className={cn(
            CONTROL,
            'px-3 py-2 resize-none leading-relaxed',
            error && 'border-danger-line',
            className
          )}
        />
      )}
    </Field>
  )
}

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string
  hint?: string
  error?: string
  wrapperClassName?: string
}

/**
 * A styled *native* <select>, deliberately not a Headless UI Listbox: native
 * keeps the OS picker on mobile, and both ClaimsTable and StatusActionPanel
 * depend on native onChange semantics (the latter fires a mutating API call
 * from it).
 */
export function Select({
  label,
  hint,
  error,
  wrapperClassName,
  className,
  children,
  ...rest
}: SelectProps) {
  return (
    <Field label={label} hint={hint} error={error} className={wrapperClassName}>
      {(a) => (
        <div className="relative">
          <select
            {...a}
            {...rest}
            className={cn(
              CONTROL,
              'h-10 pl-3 pr-9 appearance-none',
              error && 'border-danger-line',
              className
            )}
          >
            {children}
          </select>
          <ChevronDown
            aria-hidden
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-fg-subtle"
          />
        </div>
      )}
    </Field>
  )
}
