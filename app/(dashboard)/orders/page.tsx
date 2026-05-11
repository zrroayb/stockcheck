import Link from 'next/link'
import { AlertTriangle, PackageCheck, ShoppingCart, TimerReset, type LucideIcon } from 'lucide-react'
import { prisma } from '@/lib/db'
import { requireCompany } from '@/lib/auth'
import { formatNumber, relativeTime } from '@/lib/utils'

export const dynamic = 'force-dynamic'

export default async function OrdersPage({
  searchParams,
}: {
  searchParams?: { platform?: string; status?: string; page?: string }
}) {
  const company = await requireCompany()
  const platform = searchParams?.platform
  const status = searchParams?.status
  const page = Math.max(1, parseInt(searchParams?.page ?? '1', 10))
  const limit = 50

  const where = {
    companyId: company.id,
    ...(platform ? { platform } : {}),
    ...(status ? { status } : {}),
  }

  const [orders, total, statusRows] = await Promise.all([
    prisma.order.findMany({
      where,
      include: {
        items: { include: { product: { select: { id: true, name: true, masterSku: true } } } },
      },
      orderBy: { receivedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.order.count({ where }),
    prisma.order.groupBy({
      by: ['status'],
      where: { companyId: company.id },
      _count: { _all: true },
    }),
  ])

  const pages = Math.max(1, Math.ceil(total / limit))
  const statusCounts = Object.fromEntries(statusRows.map((row) => [row.status, row._count._all]))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-amber-200">
            <ShoppingCart className="h-3.5 w-3.5" />
            Siparis operasyonu
          </div>
          <h1 className="text-2xl font-semibold">Siparis akisi</h1>
          <p className="text-sm text-gray-400">
            {formatNumber(total)} siparis, tum kanallardan tek stok defterine islenir.
          </p>
        </div>
        <form className="flex flex-wrap gap-2">
          <select name="platform" defaultValue={platform ?? ''} className="input w-40">
            <option value="">Tum kanallar</option>
            <option value="trendyol">Trendyol</option>
            <option value="shopify">Shopify</option>
            <option value="hepsiburada">Hepsiburada</option>
          </select>
          <select name="status" defaultValue={status ?? ''} className="input w-40">
            <option value="">Tum durumlar</option>
            <option value="processing">Processing</option>
            <option value="received">Received</option>
            <option value="fulfilled">Fulfilled</option>
            <option value="cancelled">Cancelled</option>
            <option value="partially_cancelled">Partially cancelled</option>
            <option value="failed">Failed</option>
          </select>
          <button type="submit" className="btn-secondary">Filtrele</button>
        </form>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        <OrderMetric icon={TimerReset} label="Islenen" value={statusCounts.received ?? 0} />
        <OrderMetric icon={PackageCheck} label="Tamamlanan" value={statusCounts.fulfilled ?? 0} tone="ok" />
        <OrderMetric icon={AlertTriangle} label="Iptal / partial" value={(statusCounts.cancelled ?? 0) + (statusCounts.partially_cancelled ?? 0)} tone="warn" />
        <OrderMetric icon={AlertTriangle} label="Failed" value={statusCounts.failed ?? 0} tone="error" />
      </div>

      {orders.length === 0 ? (
        <div className="card py-12 text-center text-gray-400">
          Henuz siparis yok. Kanallardan gelen siparisler burada operasyon akisina duser.
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>
                <th>Gelis</th>
                <th>Kanal</th>
                <th>Siparis ID</th>
                <th>Kalemler</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td className="text-gray-300">{relativeTime(o.receivedAt)}</td>
                  <td className="capitalize">{o.platform}</td>
                  <td>
                    <code className="rounded bg-bg-subtle px-1.5 py-0.5 text-xs">{o.platformOrderId}</code>
                  </td>
                  <td>
                    <div className="flex flex-wrap gap-2">
                      {o.items.map((it) => (
                        <Link
                          key={it.id}
                          href={`/products/${it.productId}`}
                          className="rounded-md border border-border bg-bg-subtle px-2 py-1 text-xs hover:bg-bg-card"
                        >
                          {it.product.name} × {it.quantity}
                        </Link>
                      ))}
                    </div>
                  </td>
                  <td>
                    <StatusBadge status={o.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-between text-sm text-gray-400">
          <div>Sayfa {page} / {pages}</div>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={`?page=${page - 1}`} className="btn-secondary">Geri</Link>
            ) : null}
            {page < pages ? (
              <Link href={`?page=${page + 1}`} className="btn-secondary">Ileri</Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function OrderMetric({
  icon: Icon,
  label,
  value,
  tone = 'default',
}: {
  icon: LucideIcon
  label: string
  value: number
  tone?: 'default' | 'ok' | 'warn' | 'error'
}) {
  const color =
    tone === 'ok'
      ? 'text-emerald-300'
      : tone === 'warn'
      ? 'text-amber-300'
      : tone === 'error'
      ? 'text-red-300'
      : 'text-cyan-200'
  return (
    <div className="metric-card">
      <div className="mb-3 flex items-center justify-between text-xs uppercase tracking-wider text-gray-500">
        <span>{label}</span>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div className="text-2xl font-semibold tabular-nums">{formatNumber(value)}</div>
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'processing':
      return <span className="badge-warn">processing</span>
    case 'received':
      return <span className="badge-ok">received</span>
    case 'fulfilled':
      return <span className="badge-ok">fulfilled</span>
    case 'cancelled':
      return <span className="badge-error">cancelled</span>
    case 'partially_cancelled':
      return <span className="badge-error">partial</span>
    case 'failed':
      return <span className="badge-error">failed</span>
    default:
      return <span className="badge-muted">{status}</span>
  }
}
