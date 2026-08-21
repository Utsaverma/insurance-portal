import React, { useId } from 'react'
import { cn } from '../../lib/cn'
import { ErrorText } from './Alert'

/** What Field hands back to the control it wraps. */
export interface FieldControlProps {
  id: string
  'aria-describedby': string | undefined
  'aria-invalid': true | undefined
}

export interface FieldProps {
  label?: string
  /** Rendered inside the <label> in a muted weight, e.g. "(optional)". */
  hint?: string
  error?: string
  className?: string
  children: (props: FieldControlProps) => React.ReactNode
}

/**
 * Label + hint + error shell.
 *
 * None of the labels in either portal had `htmlFor` before this, so clicking a
 * label did nothing. Field wires htmlFor/id plus aria-describedby and
 * aria-invalid — pure a11y, no behaviour change.
 */
export function Field({ label, hint, error, className, children }: FieldProps) {
  const id = useId()
  const hintId = hint ? `${id}-hint` : undefined
  const errorId = error ? `${id}-error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={id} className="text-sm font-medium text-fg">
          {label}
          {hint && (
            <span id={hintId} className="ml-1 font-normal text-fg-subtle">
              {hint}
            </span>
          )}
        </label>
      )}
      {children({
        id,
        'aria-describedby': describedBy,
        'aria-invalid': error ? true : undefined,
      })}
      {error && <ErrorText id={errorId}>{error}</ErrorText>}
    </div>
  )
}
