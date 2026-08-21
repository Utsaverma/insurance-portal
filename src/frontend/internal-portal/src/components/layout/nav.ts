import { BarChart3, LayoutList } from 'lucide-react'
import type { UserRole } from '../../types'

export interface NavItem {
  to: string
  label: string
  Icon: typeof LayoutList
  /** Mirrors the route guard in App.tsx. The guard is authoritative — hiding
   *  the link is presentation only, and /reports stays role-blocked when the
   *  URL is typed directly. */
  roles?: UserRole[]
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/dashboard', label: 'Claims Queue', Icon: LayoutList },
  {
    to: '/reports',
    label: 'Reports',
    Icon: BarChart3,
    roles: ['CASE_MANAGER', 'REGIONAL_MANAGER'],
  },
]

export function navItemsFor(role?: UserRole | null): NavItem[] {
  return NAV_ITEMS.filter((i) => !i.roles || (role != null && i.roles.includes(role)))
}

export const WORDMARK = 'eClaims Internal'
