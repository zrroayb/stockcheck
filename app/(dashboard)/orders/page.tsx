import Link from 'next/link'
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

  const [orders, total] = await Promise.all([
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
  ])

  const pages = Math.max(1, Math.ceil(total / limit))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Orders</h1>
          <p className="text-sm text-gray-400">{formatNumber(total)} total</p>
        </div>
        <form className="flex flex-wrap gap-2">
          <select name="platform" defaultValue={platform ?? ''} className="input w-40">
            <option value="">All platforms</option>
            <option value="trendyol">Trendyol</option>
            <option value="shopify">Shopify</option>
            <option value="hepsiburada">Hepsiburada</option>
          </select>
          <select name="status" defaultValue={status ?? ''} className="input w-40">
            <option value="">All statuses</option>
            <option value="received">Received</option>
            <option value="fulfilled">Fulfilled</option>
            <option value="cancelled">Cancelled</option>
            <option value="partially_cancelled">Partially cancelled</option>
          </select>
          <button type="submit" className="btn-secondary">Filter</button>
        </form>
      </div>

      {orders.length === 0 ? (
        <div className="card py-12 text-center text-gray-400">
          No orders yet. Orders flow in here from your connected marketplaces.
        </div>
      ) : (
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>
                <th>Received</th>
                <th>Platform</th>
                <th>Order ID</th>
                <th>Items</th>
                <th>Status</th>
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
          <div>Page {page} of {pages}</div>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={`?page=${page - 1}`} className="btn-secondary">← Prev</Link>
            ) : null}
            {page < pages ? (
              <Link href={`?page=${page + 1}`} className="btn-secondary">Next →</Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function StatusBadge({ status }: { status: string }) {
  switch (status) {
    case 'received':
      return <span className="badge-warn">received</span>
    case 'fulfilled':
      return <span className="badge-ok">fulfilled</span>
    case 'cancelled':
      return <span className="badge-error">cancelled</span>
    case 'partially_cancelled':
      return <span className="badge-error">partial</span>
    default:
      return <span className="badge-muted">{status}</span>
  }
}
