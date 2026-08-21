import React from 'react'
import { Dialog, DialogPanel } from '@headlessui/react'
import { X } from 'lucide-react'
import { NavLink } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { IconButton, Logo } from '../ui'
import { NAV_ITEMS, WORDMARK, type NavItem } from './nav'

interface Props {
  open: boolean
  onClose: () => void
  items?: NavItem[]
}

/* Headless UI's Dialog portals to the end of <body> and this panel is z-50,
   so it paints above the z-40 sticky header. Focus trap and Escape come free. */
export function MobileNav({ open, onClose, items = NAV_ITEMS }: Props) {
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50 md:hidden">
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm"
        aria-hidden
      />
      <div className="fixed inset-y-0 left-0 flex w-full max-w-xs">
        <DialogPanel className="flex w-full flex-col border-r border-line bg-surface shadow-card-hover">
          <div className="flex h-16 items-center justify-between border-b border-line px-4">
            <span className="flex items-center gap-2 font-semibold text-fg">
              <Logo className="h-6 w-6 text-brand-600" />
              {WORDMARK}
            </span>
            <IconButton label="Close menu" size="lg" onClick={onClose}>
              <X aria-hidden className="h-5 w-5" />
            </IconButton>
          </div>

          <nav className="flex flex-col gap-1 p-3">
            {items.map(({ to, label, Icon }) => (
              <NavLink
                key={to}
                to={to}
                onClick={onClose}
                className={({ isActive }) =>
                  cn(
                    'flex h-11 items-center gap-3 rounded-control px-3 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-info-soft text-info-fg'
                      : 'text-fg-muted hover:bg-surface-hover hover:text-fg'
                  )
                }
              >
                <Icon aria-hidden className="h-[18px] w-[18px] shrink-0" />
                {label}
              </NavLink>
            ))}
          </nav>
        </DialogPanel>
      </div>
    </Dialog>
  )
}
