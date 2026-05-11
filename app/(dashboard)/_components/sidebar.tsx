'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  BellRing,
  Command,
  PackageSearch,
  PlugZap,
  RadioTower,
  Users,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV = [
  { href: '/products', label: 'Operasyon', icon: Activity },
  { href: '/orders', label: 'Siparisler', icon: PackageSearch },
  { href: '/alerts', label: 'Otomasyon', icon: BellRing },
  { href: '/settings/integrations', label: 'Kanallar', icon: PlugZap },
  { href: '/settings/team', label: 'Ekip', icon: Users },
]

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="app-sidebar hidden w-64 shrink-0 flex-col border-r border-white/10 backdrop-blur-xl md:flex">
      <div className="flex h-16 items-center gap-3 border-b border-white/10 px-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-amber-300 text-stone-950">
          <Command className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-semibold leading-none">PazarPilot</div>
          <div className="text-[11px] text-stone-500">Commerce operations OS</div>
        </div>
      </div>
      <div className="border-b border-white/10 px-4 py-4">
        <div className="rounded-lg border border-white/10 bg-white/[0.035] p-3">
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>Kanal sagligi</span>
            <span className="status-dot" />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-1.5">
            {['TY', 'SF', 'HB'].map((item) => (
              <div
                key={item}
                className="rounded-md border border-white/10 bg-black/20 px-2 py-1.5 text-center text-[11px] font-medium text-gray-300"
              >
                {item}
              </div>
            ))}
          </div>
          <div className="mt-3 text-[11px] leading-5 text-stone-500">
            Stok, siparis ve alarm akisi ayni operasyon ritminde.
          </div>
        </div>
      </div>
      <nav className="flex-1 space-y-1 px-3 py-4">
        {NAV.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(item.href + '/')
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm transition-colors',
                active
                  ? 'bg-white/[0.075] text-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)_inset]'
                  : 'text-gray-400 hover:bg-white/[0.045] hover:text-gray-100'
              )}
            >
              <Icon
                className={cn(
                  'h-4 w-4',
                  active ? 'text-amber-200' : 'text-gray-500 group-hover:text-gray-300'
                )}
              />
              <span className="flex-1">{item.label}</span>
              {active ? <span className="h-1.5 w-1.5 rounded-full bg-amber-300" /> : null}
            </Link>
          )
        })}
      </nav>
      <div className="border-t border-white/10 p-4 text-xs text-gray-500">
        <div className="mb-2 flex items-center gap-2 text-gray-400">
          <RadioTower className="h-3.5 w-3.5 text-emerald-300" />
          <span>Pazaryeri agi</span>
        </div>
        <div>Trendyol · Shopify · Hepsiburada</div>
      </div>
    </aside>
  )
}
