import React, { useState } from 'react'
import { Link, NavLink } from 'react-router-dom'
import { Menu as MenuIcon } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useAuth } from '../../context/AuthContext'
import { IconButton, Logo, WIDTHS } from '../ui'
import { navItemsFor, WORDMARK } from './nav'
import { CONTENT_WIDTH } from './shell'
import { MobileNav } from './MobileNav'
import { ThemeToggle } from './ThemeToggle'
import { UserMenu } from './UserMenu'

/* bg-surface/85 + backdrop-blur is why the colour tokens are stored as RGB
   channels rather than hex — the /85 opacity modifier needs them. */
export function Header() {
  const [drawerOpen, setDrawerOpen] = useState(false)
  const { currentUser } = useAuth()
  const items = navItemsFor(currentUser?.role)

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-line bg-surface/85 shadow-header backdrop-blur supports-[backdrop-filter]:bg-surface/75">
        <div className={cn('mx-auto flex h-16 items-center gap-3 px-4 md:px-8', WIDTHS[CONTENT_WIDTH])}>
          <IconButton
            label="Open menu"
            className="md:hidden"
            onClick={() => setDrawerOpen(true)}
          >
            <MenuIcon aria-hidden className="h-5 w-5" />
          </IconButton>

          <Link
            to="/dashboard"
            className="flex items-center gap-2 rounded-control text-fg"
          >
            <Logo className="h-6 w-6 text-brand-600" />
            <span className="text-base font-bold tracking-tight">{WORDMARK}</span>
          </Link>

          <nav className="ml-4 hidden items-center gap-1 md:flex">
            {items.map(({ to, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    'flex h-9 items-center rounded-control px-3 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-info-soft text-info-fg'
                      : 'text-fg-muted hover:bg-surface-hover hover:text-fg'
                  )
                }
              >
                {label}
              </NavLink>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
            <UserMenu />
          </div>
        </div>
      </header>

      <MobileNav
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        items={items}
      />
    </>
  )
}
