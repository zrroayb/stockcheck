'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/products', label: 'Products' },
  { href: '/orders', label: 'Orders' },
  { href: '/alerts', label: 'Alerts' },
  { href: '/settings/integrations', label: 'Integrations' },
  { href: '/settings/team', label: 'Team' },
]

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-border bg-bg-subtle md:flex">
      <div className="flex h-14 items-center gap-2 border-b border-border px-5">
        <div className="h-7 w-7 rounded-md bg-gradient-to-br from-indigo-500 to-purple-500" />
        <div>
          <div className="text-sm font-semibold leading-none">Stokkontrol</div>
          <div className="text-[11px] text-gray-500">Multi-marketplace stock</div>
        </div>
      </div>
      <nav className="flex-1 space-y-0.5 px-3 py-4">
        {NAV.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + '/')
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'block rounded-md px-3 py-2 text-sm transition-colors',
                active
                  ? 'bg-bg-card text-white'
                  : 'text-gray-400 hover:bg-bg-card/60 hover:text-gray-100'
              )}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
      <div className="border-t border-border p-4 text-xs text-gray-500">
        <div>Trendyol · Shopify · Hepsiburada</div>
      </div>
    </aside>
  )
}
