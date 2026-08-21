import React from 'react'
import { cn } from '../../lib/cn'

export interface TableRootProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Caps the scroll box so the sticky header has something to stick to. */
  maxHeightClass?: string
}

export function TableRoot({
  maxHeightClass = 'max-h-[70vh]',
  className,
  children,
  ...rest
}: TableRootProps) {
  return (
    <div
      {...rest}
      className={cn(
        'overflow-auto rounded-card border border-line bg-surface',
        maxHeightClass,
        className
      )}
    >
      <table className="w-full border-collapse">{children}</table>
    </div>
  )
}

export function TableHead({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead {...rest} className={cn('sticky top-0 z-10', className)}>
      {children}
    </thead>
  )
}

export interface HeaderCellProps
  extends React.ThHTMLAttributes<HTMLTableCellElement> {}

export function HeaderCell({ className, children, ...rest }: HeaderCellProps) {
  return (
    <th
      {...rest}
      className={cn(
        'bg-surface-muted px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-fg-muted border-b border-line',
        className
      )}
    >
      {children}
    </th>
  )
}

export function TableBody({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <tbody {...rest} className={cn('divide-y divide-line', className)}>
      {children}
    </tbody>
  )
}

export interface RowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  interactive?: boolean
}

export function Row({ interactive, className, children, ...rest }: RowProps) {
  return (
    <tr
      {...rest}
      className={cn(
        'transition-colors',
        interactive && 'cursor-pointer hover:bg-surface-hover',
        className
      )}
    >
      {children}
    </tr>
  )
}

export interface CellProps extends React.TdHTMLAttributes<HTMLTableCellElement> {
  /** Renders as the row's primary identifier. */
  strong?: boolean
  /** Money, dates and durations: stops digits jittering between rows. */
  numeric?: boolean
}

export function Cell({ strong, numeric, className, children, ...rest }: CellProps) {
  return (
    <td
      {...rest}
      className={cn(
        'px-4 py-3 text-sm',
        strong ? 'font-medium text-fg' : 'text-fg-muted',
        numeric && 'tabular-nums',
        className
      )}
    >
      {children}
    </td>
  )
}

export interface TableEmptyProps {
  colSpan: number
  children: React.ReactNode
}

/** The "no rows" row shared by ClaimsTable and Reports. */
export function TableEmpty({ colSpan, children }: TableEmptyProps) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-10 text-center text-sm text-fg-muted">
        {children}
      </td>
    </tr>
  )
}
