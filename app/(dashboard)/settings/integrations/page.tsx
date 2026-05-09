import Link from 'next/link'
import { prisma } from '@/lib/db'
import { requireCompany } from '@/lib/auth'
import { relativeTime } from '@/lib/utils'
import { IntegrationCard } from './_components/integration-card'

export const dynamic = 'force-dynamic'

const PLATFORMS = [
  {
    key: 'trendyol' as const,
    name: 'Trendyol',
    color: 'from-orange-500 to-red-500',
    fields: [
      { name: 'apiKey', label: 'API Key', type: 'text' as const, required: true },
      { name: 'apiSecret', label: 'API Secret', type: 'password' as const, required: true },
      { name: 'supplierId', label: 'Supplier ID', type: 'text' as const, required: true },
      { name: 'storeName', label: 'Store name (optional)', type: 'text' as const, required: false },
    ],
  },
  {
    key: 'shopify' as const,
    name: 'Shopify',
    color: 'from-emerald-500 to-green-600',
    fields: [
      { name: 'accessToken', label: 'Admin API Access Token', type: 'password' as const, required: true },
      { name: 'storeUrl', label: 'Store URL', type: 'text' as const, required: true, placeholder: 'yourstore.myshopify.com' },
      { name: 'locationId', label: 'Location ID', type: 'text' as const, required: true },
    ],
  },
  {
    key: 'hepsiburada' as const,
    name: 'Hepsiburada',
    color: 'from-orange-400 to-yellow-500',
    fields: [
      { name: 'username', label: 'Username', type: 'text' as const, required: true },
      { name: 'password', label: 'Password', type: 'password' as const, required: true },
      { name: 'merchantId', label: 'Merchant ID', type: 'text' as const, required: true },
    ],
  },
]

export default async function IntegrationsPage() {
  const company = await requireCompany()
  const creds = await prisma.platformCredential.findMany({
    where: { companyId: company.id },
    select: { platform: true, createdAt: true, updatedAt: true },
  })

  const byPlatform = Object.fromEntries(creds.map((c) => [c.platform, c]))

  const anyConnected = creds.length > 0

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Integrations</h1>
          <p className="text-sm text-gray-400">
            Connect a marketplace to start syncing stock. Credentials are encrypted at rest with AES-256-GCM.
          </p>
        </div>
        {anyConnected ? (
          <Link href="/products/import" className="btn-primary">
            Pazaryerinden ürün içe aktar →
          </Link>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {PLATFORMS.map((p) => (
          <IntegrationCard
            key={p.key}
            platform={p.key}
            name={p.name}
            colorGradient={p.color}
            fields={p.fields}
            connected={Boolean(byPlatform[p.key])}
            connectedAt={byPlatform[p.key]?.updatedAt ? relativeTime(byPlatform[p.key].updatedAt) : null}
          />
        ))}
      </div>
    </div>
  )
}
