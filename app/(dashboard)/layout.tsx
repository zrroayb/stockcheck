import Link from 'next/link'
import { OrganizationSwitcher, UserButton } from '@clerk/nextjs'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'
import { getCurrentCompany } from '@/lib/auth'
import { Sidebar } from './_components/sidebar'
import { HelpPanel } from './_components/help-panel'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { userId, orgId } = await auth()
  if (!userId) redirect('/sign-in')
  if (!orgId) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="card max-w-md text-center">
          <h2 className="mb-2 text-xl font-semibold">Pick a workspace</h2>
          <p className="mb-6 text-sm text-gray-400">
            Stokkontrol uses Clerk Organizations as workspaces. Create or select one to continue.
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
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-border bg-bg-subtle px-6 py-3">
          <div className="flex items-center gap-3">
            <OrganizationSwitcher hidePersonal />
          </div>
          <div className="flex items-center gap-3">
            <Link href="/settings/integrations" className="text-sm text-gray-400 hover:text-gray-100">
              Integrations
            </Link>
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
