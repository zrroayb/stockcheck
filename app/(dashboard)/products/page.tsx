import Link from 'next/link'
import { prisma } from '@/lib/db'
import { requireCompany } from '@/lib/auth'
import { formatNumber, relativeTime } from '@/lib/utils'
import { CreateProductButton } from './_components/create-product-button'

export const dynamic = 'force-dynamic'

export default async function ProductsPage({
  searchParams,
}: {
  searchParams?: { q?: string; page?: string }
}) {
  const company = await requireCompany()
  const search = searchParams?.q?.trim() ?? ''
  const page = Math.max(1, parseInt(searchParams?.page ?? '1', 10))
  const limit = 50

  const where = {
    companyId: company.id,
    ...(search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { masterSku: { contains: search, mode: 'insensitive' as const } },
            { barcode: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  }

  const [products, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        platformListings: { select: { platform: true, syncStatus: true } },
      },
      orderBy: { updatedAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.product.count({ where }),
  ])

  const pages = Math.max(1, Math.ceil(total / limit))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Products</h1>
          <p className="text-sm text-gray-400">{formatNumber(total)} total</p>
        </div>
        <div className="flex items-center gap-3">
          <form>
            <input
              type="search"
              name="q"
              defaultValue={search}
              placeholder="Search by name, SKU or barcode"
              className="input w-72"
            />
          </form>
          <CreateProductButton />
        </div>
      </div>

      {products.length === 0 ? (
        <EmptyState hasSearch={Boolean(search)} />
      ) : (
        <div className="table-wrap">
          <table className="table-base">
            <thead>
              <tr>
                <th>Product</th>
                <th>SKU</th>
                <th className="text-right">Stock</th>
                <th className="text-right">Reserved</th>
                <th className="text-right">Available</th>
                <th>Listings</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => {
                const available = p.stockCount - p.reservedStock
                return (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/products/${p.id}`} className="font-medium text-gray-100 hover:text-white">
                        {p.name}
                      </Link>
                      {p.barcode ? (
                        <div className="text-xs text-gray-500">{p.barcode}</div>
                      ) : null}
                    </td>
                    <td>
                      <code className="rounded bg-bg-subtle px-1.5 py-0.5 text-xs text-gray-300">
                        {p.masterSku}
                      </code>
                    </td>
                    <td className="text-right tabular-nums">{formatNumber(p.stockCount)}</td>
                    <td className="text-right tabular-nums text-gray-400">
                      {formatNumber(p.reservedStock)}
                    </td>
                    <td
                      className={`text-right tabular-nums ${
                        available <= 0 ? 'text-red-400' : available < 5 ? 'text-amber-300' : ''
                      }`}
                    >
                      {formatNumber(available)}
                    </td>
                    <td>
                      <ListingChips listings={p.platformListings} />
                    </td>
                    <td className="text-gray-400">{relativeTime(p.updatedAt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 ? (
        <div className="flex items-center justify-between text-sm text-gray-400">
          <div>Page {page} of {pages}</div>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={`?q=${encodeURIComponent(search)}&page=${page - 1}`} className="btn-secondary">
                ← Prev
              </Link>
            ) : null}
            {page < pages ? (
              <Link href={`?q=${encodeURIComponent(search)}&page=${page + 1}`} className="btn-secondary">
                Next →
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ListingChips({
  listings,
}: {
  listings: Array<{ platform: string; syncStatus: string }>
}) {
  if (listings.length === 0) {
    return <span className="text-xs text-gray-500">—</span>
  }
  return (
    <div className="flex flex-wrap gap-1">
      {listings.map((l) => {
        const cls =
          l.syncStatus === 'ok'
            ? 'badge-ok'
            : l.syncStatus === 'error'
            ? 'badge-error'
            : l.syncStatus === 'paused' || l.syncStatus === 'disabled'
            ? 'badge-muted'
            : 'badge-warn'
        return (
          <span key={l.platform} className={cls}>
            {l.platform}
          </span>
        )
      })}
    </div>
  )
}

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="card flex flex-col items-center py-16 text-center">
      <div className="mb-3 text-3xl">📦</div>
      <h3 className="text-lg font-semibold">
        {hasSearch ? 'No products match your search' : 'No products yet'}
      </h3>
      <p className="mt-1 max-w-sm text-sm text-gray-400">
        {hasSearch
          ? 'Try a different search term or clear the filter.'
          : 'Add your first product to start tracking stock across marketplaces.'}
      </p>
      {!hasSearch ? (
        <div className="mt-5">
          <CreateProductButton />
        </div>
      ) : null}
    </div>
  )
}
