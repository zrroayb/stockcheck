import Link from 'next/link'
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CircleGauge,
  PackageCheck,
  PackagePlus,
  RadioTower,
  ShieldAlert,
  type LucideIcon,
} from 'lucide-react'
import { Prisma } from '@prisma/client'
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

  const [products, total, metricRows] = await Promise.all([
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
    prisma.$queryRaw<Array<{
      stock: number
      reserved: number
      available: number
      low: number
      out: number
      listings: number
      sync_issues: number
    }>>(Prisma.sql`
      WITH product_scope AS (
        SELECT p.id, p."stockCount", p."reservedStock"
        FROM "Product" p
        WHERE p."companyId" = ${company.id}
        ${search
          ? Prisma.sql`AND (
              p.name ILIKE ${`%${search}%`}
              OR p."masterSku" ILIKE ${`%${search}%`}
              OR p.barcode ILIKE ${`%${search}%`}
            )`
          : Prisma.empty}
      ),
      product_metrics AS (
        SELECT
          COALESCE(SUM("stockCount"), 0)::int AS stock,
          COALESCE(SUM("reservedStock"), 0)::int AS reserved,
          COALESCE(SUM(GREATEST("stockCount" - "reservedStock", 0)), 0)::int AS available,
          COUNT(*) FILTER (
            WHERE GREATEST("stockCount" - "reservedStock", 0) > 0
            AND GREATEST("stockCount" - "reservedStock", 0) < 5
          )::int AS low,
          COUNT(*) FILTER (WHERE GREATEST("stockCount" - "reservedStock", 0) <= 0)::int AS out
        FROM product_scope
      ),
      listing_metrics AS (
        SELECT
          COUNT(pl.id)::int AS listings,
          COUNT(DISTINCT ps.id) FILTER (WHERE pl."syncStatus" = 'error')::int AS sync_issues
        FROM product_scope ps
        LEFT JOIN "PlatformListing" pl ON pl."productId" = ps.id
      )
      SELECT
        product_metrics.stock,
        product_metrics.reserved,
        product_metrics.available,
        product_metrics.low,
        product_metrics.out,
        listing_metrics.listings,
        listing_metrics.sync_issues
      FROM product_metrics, listing_metrics
    `),
  ])

  const pages = Math.max(1, Math.ceil(total / limit))
  const metricRow = metricRows[0]
  const metrics = {
    stock: Number(metricRow?.stock ?? 0),
    available: Number(metricRow?.available ?? 0),
    reserved: Number(metricRow?.reserved ?? 0),
    listings: Number(metricRow?.listings ?? 0),
    low: Number(metricRow?.low ?? 0),
    out: Number(metricRow?.out ?? 0),
    syncIssues: Number(metricRow?.sync_issues ?? 0),
  }
  const activeChannels = Math.min(3, new Set(products.flatMap((p) => p.platformListings.map((l) => l.platform))).size)
  const riskScore = metrics.out > 0 || metrics.syncIssues > 0 ? 'Dikkat' : metrics.low > 0 ? 'Izle' : 'Saglam'
  const actionCount = metrics.low + metrics.out + metrics.syncIssues

  return (
    <div className="space-y-6">
      <section className="ops-summary overflow-hidden rounded-lg border border-white/10">
        <div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:p-6">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-wider text-amber-300">
              <RadioTower className="h-3.5 w-3.5" />
              Durum ozeti
            </div>
            <h1 className="text-3xl font-semibold tracking-normal text-gray-50">
              Stok ve kanal durumu
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-stone-400">
              {formatNumber(total)} SKU icinde {formatNumber(metrics.available)} adet satilabilir stok var.
              {actionCount > 0
                ? ` ${formatNumber(actionCount)} kayit kontrol bekliyor.`
                : ' Su an acil aksiyon bekleyen kayit yok.'}
            </p>
          </div>
          <div className="ops-summary-grid grid grid-cols-3 gap-2 rounded-lg border border-white/10 p-3">
            <PilotTile label="Aktif kanal" value={`${activeChannels}/3`} />
            <PilotTile label="Risk" value={riskScore} />
            <PilotTile label="SKU" value={formatNumber(total)} />
          </div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-semibold">Katalog & stok</h2>
          <p className="text-sm text-gray-400">
            {formatNumber(total)} SKU · {formatNumber(metrics.listings)} pazaryeri listingi
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <form>
            <input
              type="search"
              name="q"
              defaultValue={search}
              placeholder="Urun, SKU veya barkod ara"
              className="input w-72"
            />
          </form>
          <Link href="/products/import" className="btn-secondary">
            <RadioTower className="h-4 w-4" />
            Kanaldan ice aktar
          </Link>
          <CreateProductButton />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
        <Metric icon={Boxes} label="Toplam stok" value={metrics.stock} detail="Depodaki ana sayi" />
        <Metric icon={CircleGauge} label="Satisa hazir" value={metrics.available} detail="Kanallara giden stok" tone="ok" />
        <Metric icon={ShieldAlert} label="Rezerve" value={metrics.reserved} detail="Online satis disi" tone="muted" />
        <Metric icon={AlertTriangle} label="Dusuk / biten" value={`${metrics.low} / ${metrics.out}`} detail="Aksiyon bekleyen SKU" tone="warn" />
        <Metric icon={PackageCheck} label="Sync sorunu" value={metrics.syncIssues} detail="Hata veren listing" tone={metrics.syncIssues ? 'error' : 'ok'} />
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
          <div>Sayfa {page} / {pages}</div>
          <div className="flex gap-2">
            {page > 1 ? (
              <Link href={`?q=${encodeURIComponent(search)}&page=${page - 1}`} className="btn-secondary">
                Geri
              </Link>
            ) : null}
            {page < pages ? (
              <Link href={`?q=${encodeURIComponent(search)}&page=${page + 1}`} className="btn-secondary">
                Ileri
                <ArrowRight className="h-4 w-4" />
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function PilotTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-white/10 bg-white/[0.045] p-3">
      <div className="text-[11px] uppercase tracking-wider text-stone-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-stone-100">{value}</div>
    </div>
  )
}

function Metric({
  icon: Icon,
  label,
  value,
  detail,
  tone = 'default',
}: {
  icon: LucideIcon
  label: string
  value: number | string
  detail: string
  tone?: 'default' | 'ok' | 'warn' | 'error' | 'muted'
}) {
  const color =
    tone === 'ok'
      ? 'text-emerald-300'
      : tone === 'warn'
      ? 'text-amber-300'
      : tone === 'error'
      ? 'text-red-300'
      : tone === 'muted'
      ? 'text-gray-300'
      : 'text-cyan-200'

  return (
    <div className="metric-card">
      <div className="mb-3 flex items-center justify-between gap-3">
        <span className="text-xs uppercase tracking-wider text-gray-500">{label}</span>
        <Icon className={`h-4 w-4 ${color}`} />
      </div>
      <div className="text-2xl font-semibold tabular-nums text-gray-50">
        {typeof value === 'number' ? formatNumber(value) : value}
      </div>
      <div className="mt-1 text-xs text-gray-500">{detail}</div>
    </div>
  )
}

function EmptyState({ hasSearch }: { hasSearch: boolean }) {
  return (
    <div className="card flex flex-col items-center py-16 text-center">
      <PackagePlus className="mb-3 h-8 w-8 text-cyan-200" />
      <h3 className="text-lg font-semibold">
        {hasSearch ? 'Aramana uygun SKU yok' : 'Operasyon henuz bos'}
      </h3>
      <p className="mt-1 max-w-sm text-sm text-gray-400">
        {hasSearch
          ? 'Try a different search term or clear the filter.'
          : 'Ilk SKU veya pazaryeri importu ile PazarPilot katalog akisini baslat.'}
      </p>
      {!hasSearch ? (
        <div className="mt-5">
          <CreateProductButton />
        </div>
      ) : null}
    </div>
  )
}
