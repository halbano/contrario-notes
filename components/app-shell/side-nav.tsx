'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'
import { PRIMARY_NAV, SECONDARY_NAV, type NavItem } from './nav-items'

/**
 * Side navigation. Presentation only — does no data fetching.
 * Active state derived from `usePathname`.
 */
export interface SideNavProps {
  className?: string
  /** Called when a nav link is selected. Used by mobile drawer to close itself. */
  onNavigate?: () => void
}

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem
  active: boolean
  onNavigate?: () => void
}) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      onClick={onNavigate}
      className={cn(
        'group flex items-center gap-3 rounded-md px-3 py-2 text-small font-medium transition-colors',
        'hover:bg-accent hover:text-accent-foreground',
        active
          ? 'bg-accent text-accent-foreground'
          : 'text-muted-foreground'
      )}
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span>{item.label}</span>
    </Link>
  )
}

export function SideNav({ className, onNavigate }: SideNavProps) {
  const pathname = usePathname() ?? '/'

  const isActive = (href: string) => {
    if (href === '/') return pathname === '/'
    return pathname === href || pathname.startsWith(`${href}/`)
  }

  return (
    <nav
      aria-label="Primary"
      className={cn('flex h-full flex-col gap-6 p-4', className)}
    >
      <ul className="flex flex-col gap-1">
        {PRIMARY_NAV.map((item) => (
          <li key={item.href}>
            <NavLink item={item} active={isActive(item.href)} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>
      <div className="mt-auto">
        <ul className="flex flex-col gap-1">
          {SECONDARY_NAV.map((item) => (
            <li key={item.href}>
              <NavLink item={item} active={isActive(item.href)} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      </div>
    </nav>
  )
}
