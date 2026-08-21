import React from 'react'
import { cn } from '../../lib/cn'

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  interactive?: boolean
}

export function Card({ interactive, className, children, ...rest }: CardProps) {
  return (
    <div
      {...rest}
      className={cn(
        'bg-surface border border-line rounded-card shadow-card',
        interactive &&
          'transition-all hover:border-brand-300 hover:shadow-card-hover cursor-pointer',
        className
      )}
    >
      {children}
    </div>
  )
}

export function CardHeader({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div {...rest} className={cn('px-5 py-4 border-b border-line', className)}>
      {children}
    </div>
  )
}

const BODY_SIZES = {
  sm: 'p-4',
  md: 'p-5',
  lg: 'p-6 sm:p-8',
} as const

export interface CardBodyProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: keyof typeof BODY_SIZES
}

export function CardBody({
  size = 'md',
  className,
  children,
  ...rest
}: CardBodyProps) {
  return (
    <div {...rest} className={cn(BODY_SIZES[size], className)}>
      {children}
    </div>
  )
}

const TITLE_SIZES = {
  sm: 'text-sm',
  md: 'text-base',
} as const

export interface CardTitleProps extends React.HTMLAttributes<HTMLHeadingElement> {
  size?: keyof typeof TITLE_SIZES
}

export function CardTitle({
  size = 'sm',
  className,
  children,
  ...rest
}: CardTitleProps) {
  return (
    <h2 {...rest} className={cn(TITLE_SIZES[size], 'font-semibold text-fg', className)}>
      {children}
    </h2>
  )
}
