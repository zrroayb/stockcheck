import Link from 'next/link'
import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

export default async function Home() {
  const { userId, orgId } = await auth()
  if (userId && orgId) {
    redirect('/products')
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 text-center">
      <span className="badge-muted mb-6">Stokkontrol</span>
      <h1 className="bg-gradient-to-br from-white to-indigo-300 bg-clip-text text-5xl font-bold tracking-tight text-transparent sm:text-6xl">
        One stock count.
        <br />
        Every marketplace in sync.
      </h1>
      <p className="mt-6 max-w-xl text-lg text-gray-400">
        Manage Trendyol, Shopify and Hepsiburada inventory from a single source of truth.
        No more overselling, no more spreadsheets.
      </p>
      <div className="mt-10 flex gap-3">
        <Link href="/sign-up" className="btn-primary">
          Get started
        </Link>
        <Link href="/sign-in" className="btn-secondary">
          Sign in
        </Link>
      </div>
    </main>
  )
}
