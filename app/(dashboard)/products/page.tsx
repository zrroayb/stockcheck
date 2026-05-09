import Link from 'next/link'
import { prisma } from '@/lib/db'
import { requireCompany } from '@/lib/auth'
import { formatNumber } from '@/lib/utils'
import { CreateProductButton } from './_components/create-product-button'
import { ProductsTable, type ProductRow } from './_components/products-table'

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
          <Link href="/products/import" className="btn-secondary">
            İçe aktar
          </Link>
          <CreateProductButton />
        </div>
      </div>

      {products.length === 0 ? (
        <EmptyState hasSearch={Boolean(search)} />
      ) : (
        <ProductsTable
          rows={products.map(
            (p): ProductRow => ({
              id: p.id,
              name: p.name,
              masterSku: p.masterSku,
              barcode: p.barcode,
              stockCount: p.stockCount,
              reservedStock: p.reservedStock,
              status: p.status,
              updatedAt: p.updatedAt.toISOString(),
              platformListings: p.platformListings.map((l) => ({
                platform: l.platform,
                syncStatus: l.syncStatus,
              })),
            })
          )}
        />
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
