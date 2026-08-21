import React from 'react'
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { LogOut } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { Avatar } from '../ui'

/**
 * The fix for "the logged-in user's name is never shown". Living in the shell
 * is what makes it appear on every authenticated page rather than one screen.
 * Every currentUser access is optional-chained: the shell must never crash if
 * it renders a frame before the user resolves.
 */
export function UserMenu() {
  const { currentUser, logout } = useAuth()
  const name = currentUser?.name || currentUser?.email || 'Account'

  return (
    <Menu as="div" className="relative">
      <MenuButton
        aria-label={`Account: ${name}`}
        className="flex items-center gap-2 rounded-control px-1.5 py-1 transition-colors hover:bg-surface-hover"
      >
        <Avatar name={currentUser?.name} seed={currentUser?.id ?? currentUser?.email} />
        <span className="hidden max-w-[10rem] truncate text-sm font-medium text-fg lg:block">
          {name}
        </span>
      </MenuButton>

      <MenuItems
        transition
        className="absolute right-0 z-50 mt-2 w-60 origin-top-right overflow-hidden rounded-card border border-line bg-surface p-1 shadow-card-hover focus:outline-none data-[closed]:scale-95 data-[closed]:opacity-0 data-[enter]:duration-100 data-[leave]:duration-75"
      >
        <div className="flex items-center gap-3 px-3 py-3">
          <Avatar
            name={currentUser?.name}
            seed={currentUser?.id ?? currentUser?.email}
            size="lg"
          />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-fg">{name}</div>
            <div className="truncate text-xs text-fg-muted">
              {currentUser?.role?.replace(/_/g, ' ')}
            </div>
            {currentUser?.email && currentUser.email !== name && (
              <div className="truncate text-xs text-fg-subtle">{currentUser.email}</div>
            )}
          </div>
        </div>

        <div className="my-1 h-px bg-line" />

        <MenuItem>
          {/* No navigate() here: the internal portal's logout() navigates
              itself, and the customer portal's PrivateRoute redirects as soon
              as isAuthenticated flips. */}
          <button
            onClick={logout}
            className="flex w-full items-center gap-2 rounded-control px-3 py-2 text-sm text-fg transition-colors data-[focus]:bg-surface-hover"
          >
            <LogOut aria-hidden className="h-4 w-4 shrink-0 text-fg-muted" />
            Logout
          </button>
        </MenuItem>
      </MenuItems>
    </Menu>
  )
}
