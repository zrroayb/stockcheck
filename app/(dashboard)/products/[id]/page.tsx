import Link from 'next/link'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/db'
import { requireCompany } from '@/lib/auth'
import { formatNumber, relativeTime } from '@/lib/utils'
import { StockAdjustForm } from './_components/stock-adjust-form'

export const dynamic = 'force-dynamic'

export default async function ProductPage({ params }: { params: { id: string } }) {
  const company = await requireCompany()

  const product = await prisma.product.findFirst({
    where: { id: params.id, companyId: company.id },
    include: {
      platformListings: true,
      alertRules: true,
      stockEvents: {
        orderBy: { occurredAt: 'desc' },
        take: 50,
      },
    },
  })
  if (!product) notFound()

  const available = product.stockCount - product.reservedStock

  return (
    <div className="space-y-6">
      <div>
        <Link href="/products" className="text-sm text-gray-400 hover:text-gray-100">
          ← All products
        </Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{product.name}</h1>
            <div className="mt-1 flex items-center gap-2 text-sm text-gray-400">
              <code className="rounded bg-bg-subtle px-1.5 py-0.5 text-xs">{product.masterSku}</code>
              {product.barcode ? <span>· {product.barcode}</span> : null}
              <span>· status: {product.status}</span>
            </div>
          </div>
          <span
            className={`text-3xl font-semibold tabular-nums ${
              available <= 0 ? 'text-red-400' : available < 5 ? 'text-amber-300' : 'text-emerald-300'
            }`}
          >
            {formatNumber(available)}
            <span className="ml-2 text-sm font-normal text-gray-500">available</span>
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Stat label="Stock count" value={product.stockCount} />
        <Stat label="Reserved" value={product.reservedStock} />
        <Stat label="Available" value={available} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
            Adjust stock
          </h2>
          <StockAdjustForm productId={product.id} currentStock={product.stockCount} />
        </section>

        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
            Platform listings
          </h2>
          {product.platformListings.length === 0 ? (
            <div className="card text-sm text-gray-400">
              No platform listings yet. Connect an integration in settings.
            </div>
          ) : (
            <div className="space-y-2">
              {product.platformListings.map((l) => (
                <div key={l.id} className="card flex items-center justify-between py-3">
                  <div>
                    <div className="font-medium capitalize">{l.platform}</div>
                    <div className="text-xs text-gray-500">
                      Last pushed: {formatNumber(l.stockOnPlatform)}
                      {l.lastSyncedAt ? ` · ${relativeTime(l.lastSyncedAt)}` : ''}
                    </div>
                  </div>
                  <span
                    className={
                      l.syncStatus === 'ok'
                        ? 'badge-ok'
                        : l.syncStatus === 'error'
                        ? 'badge-error'
                        : 'badge-warn'
                    }
                  >
                    {l.syncStatus}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
          Stock event log
        </h2>
        {product.stockEvents.length === 0 ? (
          <div className="card text-sm text-gray-400">No events recorded.</div>
        ) : (
          <div className="table-wrap">
            <table className="table-base">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Source</th>
                  <th>Type</th>
                  <th className="text-right">Δ</th>
                  <th>Note</th>
                </tr>
              </thead>
              <tbody>
                {product.stockEvents.map((e) => (
                  <tr key={e.id}>
                    <td className="text-gray-300">{relativeTime(e.occurredAt)}</td>
                    <td className="capitalize">{e.sourcePlatform}</td>
                    <td className="text-gray-400">{e.eventType}</td>
                    <td
                      className={`text-right tabular-nums ${
                        e.quantityDelta > 0 ? 'text-emerald-300' : e.quantityDelta < 0 ? 'text-red-300' : 'text-gray-400'
                      }`}
                    >
                      {e.quantityDelta > 0 ? '+' : ''}
                      {formatNumber(e.quantityDelta)}
                    </td>
                    <td className="text-gray-400">{e.note ?? ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="card">
      <div className="text-xs uppercase tracking-wider text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{formatNumber(value)}</div>
    </div>
  )
}
