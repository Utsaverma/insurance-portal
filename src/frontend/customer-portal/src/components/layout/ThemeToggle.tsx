import React from 'react'
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react'
import { Check, Monitor, Moon, Sun } from 'lucide-react'
import { cn } from '../../lib/cn'
import { useTheme } from '../../context/ThemeContext'
import type { ThemeMode } from '../../lib/theme'

const OPTIONS: Array<{ mode: ThemeMode; label: string; Icon: typeof Sun }> = [
  { mode: 'light', label: 'Light', Icon: Sun },
  { mode: 'dark', label: 'Dark', Icon: Moon },
  { mode: 'auto', label: 'Auto', Icon: Monitor },
]

export function ThemeToggle() {
  const { mode, resolved, setMode } = useTheme()
  // The trigger shows what is *rendered*, not what was chosen: on Auto that is
  // the OS answer, which is the more useful thing to see at a glance.
  const TriggerIcon = resolved === 'dark' ? Moon : Sun

  return (
    <Menu as="div" className="relative">
      <MenuButton
        aria-label={`Theme: ${mode}`}
        title={`Theme: ${mode}`}
        className="inline-flex h-10 w-10 items-center justify-center rounded-control text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
      >
        <TriggerIcon aria-hidden className="h-[18px] w-[18px]" />
      </MenuButton>
      <MenuItems
        transition
        className="absolute right-0 z-50 mt-2 w-40 origin-top-right overflow-hidden rounded-card border border-line bg-surface p-1 shadow-card-hover focus:outline-none data-[closed]:scale-95 data-[closed]:opacity-0 data-[enter]:duration-100 data-[leave]:duration-75"
      >
        {OPTIONS.map(({ mode: m, label, Icon }) => (
          <MenuItem key={m}>
            <button
              onClick={() => setMode(m)}
              className={cn(
                'flex w-full items-center gap-2 rounded-control px-3 py-2 text-sm text-fg transition-colors data-[focus]:bg-surface-hover',
                mode === m && 'font-medium'
              )}
            >
              <Icon aria-hidden className="h-4 w-4 shrink-0 text-fg-muted" />
              <span className="flex-1 text-left">{label}</span>
              {mode === m && <Check aria-hidden className="h-4 w-4 text-brand-600" />}
            </button>
          </MenuItem>
        ))}
      </MenuItems>
    </Menu>
  )
}
