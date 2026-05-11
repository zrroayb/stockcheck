import Link from 'next/link'
import { OrganizationSwitcher, UserButton } from '@clerk/nextjs'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { Activity, Bell, PlugZap, Search, ShieldCheck } from 'lucide-react'
import { getCurrentCompany } from '@/lib/auth'
import { ThemeToggle } from '@/app/_components/theme-toggle'
import { Sidebar } from './_components/sidebar'
import { HelpPanel } from './_components/help-panel'

const appEnv = process.env.NEXT_PUBLIC_APP_ENV ?? process.env.APP_ENV ?? 'development'

function getEnvBadgeClass() {
  if (appEnv === 'production') {
    return 'border-red-400/35 bg-red-500/10 text-red-200'
  }

  if (appEnv === 'staging') {
    return 'border-amber-400/35 bg-amber-500/10 text-amber-200'
  }

  return 'border-emerald-400/35 bg-emerald-500/10 text-emerald-200'
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId, orgId } = await auth()
  if (!userId) redirect('/sign-in')
  if (!orgId) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="card max-w-md text-center">
          <h2 className="mb-2 text-xl font-semibold">Pick a workspace</h2>
          <p className="mb-6 text-sm text-gray-400">
            PazarPilot ekip ve marka operasyonunu workspace olarak ayirir. Devam etmek icin bir workspace sec.
          </p>
          <div className="flex justify-center">
            <OrganizationSwitcher hidePersonal />
          </div>
        </div>
      </div>
    )
  }

  // Ensure the local Company row exists.
  await getCurrentCompany()

  return (
    <div className="dashboard-shell flex min-h-screen bg-transparent">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <header className="app-header sticky top-0 z-20 flex min-h-16 items-center justify-between gap-4 border-b border-white/10 px-4 py-3 backdrop-blur-xl lg:px-6">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <OrganizationSwitcher hidePersonal />
            <form action="/products" className="hidden min-w-0 max-w-xl flex-1 md:block">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
                <input
                  name="q"
                  type="search"
                  placeholder="SKU, barkod, siparis, kanal"
                  className="input h-10 pl-9"
                />
              </label>
            </form>
          </div>
          <div className="flex items-center gap-2">
            <div className={`hidden rounded-md border px-3 py-2 text-xs font-medium uppercase md:block ${getEnvBadgeClass()}`}>
              {appEnv}
            </div>
            <div className="hidden items-center gap-2 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-gray-300 xl:flex">
              <span className="status-dot" />
              <span>Kanallar canli</span>
              <span className="text-gray-600">/</span>
              <Activity className="h-3.5 w-3.5 text-amber-300" />
              <span>Operasyon akiyor</span>
            </div>
            <div className="hidden items-center gap-2 rounded-md border border-white/10 bg-white/[0.035] px-3 py-2 text-xs text-gray-300 lg:flex">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" />
              <span>Magaza izole</span>
            </div>
            <Link href="/alerts" className="btn-icon" title="Otomasyon">
              <Bell className="h-4 w-4" />
            </Link>
            <Link href="/settings/integrations" className="btn-icon" title="Kanallar">
              <PlugZap className="h-4 w-4" />
            </Link>
            <ThemeToggle />
            <UserButton afterSignOutUrl="/" />
          </div>
        </header>
        <div className="flex flex-1">
          <main className="flex-1 overflow-x-hidden">
            <div className="mx-auto max-w-7xl px-6 py-8">{children}</div>
          </main>
          <HelpPanel />
        </div>
      </div>
    </div>
  )
}
