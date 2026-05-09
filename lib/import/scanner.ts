import { prisma } from '@/lib/db'
import { decryptJSON } from '@/lib/encrypt'
import { getTrendyolClient } from '@/lib/platforms/trendyol'
import { getShopifyClient } from '@/lib/platforms/shopify'
import { getHepsiburadaClient } from '@/lib/platforms/hepsiburada'
import type {
  TrendyolCredentials,
  ShopifyCredentials,
  HepsiburadaCredentials,
} from '@/lib/platforms/types'
import type { ProductSnapshot } from '@/lib/platforms/snapshot'
import type { Platform, ScanResult, ScanRow } from './types'

/**
 * Pull product lists from every connected marketplace, group them by canonical
 * SKU (lowercase + trim), and produce three buckets:
 *
 *   - matched   → SKU on 2+ platforms AND stocks all agree (no UX needed)
 *   - conflict  → SKU on 2+ platforms but stocks disagree (user picks)
 *   - unmatched → SKU on exactly 1 platform (lone listing)
 *
 * In-memory only; no DB writes happen here.
 */
export async function scanAllPlatforms(companyId: string): Promise<ScanResult> {
  const creds = await prisma.platformCredential.findMany({
    where: { companyId },
    select: { platform: true, encryptedData: true },
  })

  const warnings: string[] = []
  const perPlatform: Record<Platform, number> = {
    trendyol: 0,
    shopify: 0,
    hepsiburada: 0,
  }

  // Fan out: pull every platform in parallel. A failure on one shouldn't block
  // the others — capture the error as a warning instead.
  const results = await Promise.all(
    creds.map(async (c) => {
      try {
        const snaps = await fetchSnapshots(c.platform as Platform, c.encryptedData)
        perPlatform[c.platform as Platform] = snaps.length
        return snaps
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        warnings.push(`${c.platform} listing fetch failed: ${msg}`)
        return [] as ProductSnapshot[]
      }
    })
  )

  const allSnapshots = results.flat()

  // Group by canonical SKU.
  const bySku = new Map<string, ProductSnapshot[]>()
  for (const s of allSnapshots) {
    const arr = bySku.get(s.sku) ?? []
    arr.push(s)
    bySku.set(s.sku, arr)
  }

  // Match existing Products by SKU case-insensitively ("SKU-001" vs "sku-001").
  const skuKeys = Array.from(bySku.keys())
  const existingProducts =
    skuKeys.length === 0
      ? []
      : await prisma.product.findMany({
          where: {
            companyId,
            OR: skuKeys.map((sku) => ({
              masterSku: { equals: sku, mode: 'insensitive' },
            })),
          },
          select: { id: true, masterSku: true },
        })
  const existingMap = new Map(existingProducts.map((p) => [p.masterSku.toLowerCase(), p.id]))

  const rows: ScanRow[] = []
  let matched = 0
  let conflicts = 0
  let unmatched = 0

  for (const [sku, snaps] of bySku) {
    const stocks = snaps.map((s) => s.stock)
    const allEqual = stocks.every((v) => v === stocks[0])
    let bucket: ScanRow['bucket']
    if (snaps.length === 1) {
      bucket = 'unmatched'
      unmatched += 1
    } else if (allEqual) {
      bucket = 'matched'
      matched += 1
    } else {
      bucket = 'conflict'
      conflicts += 1
    }

    // Default to the lowest stock — safest "don't oversell" stance, matches
    // the principle that the local DB is the new source of truth and we'd
    // rather show too little than too much.
    const suggested = Math.min(...stocks)

    // Prefer the longest non-empty name across snapshots.
    const name =
      snaps
        .map((s) => s.name?.trim() ?? '')
        .filter((n) => n.length > 0)
        .sort((a, b) => b.length - a.length)[0] ?? sku

    const rawSku = snaps[0].rawSku
    const barcode = snaps.find((s) => s.barcode)?.barcode ?? null

    rows.push({
      sku,
      rawSku,
      name,
      barcode,
      bucket,
      snapshots: snaps,
      suggestedStock: suggested,
      existingProductId: existingMap.get(sku) ?? null,
    })
  }

  // Stable sort: conflicts first, then unmatched, then matched. Within each
  // bucket alphabetical by SKU. Helps the user focus on what needs attention.
  rows.sort((a, b) => {
    const order = { conflict: 0, unmatched: 1, matched: 2 } as const
    const d = order[a.bucket] - order[b.bucket]
    if (d !== 0) return d
    return a.sku.localeCompare(b.sku)
  })

  return {
    rows,
    totals: {
      scanned: allSnapshots.length,
      matched,
      conflicts,
      unmatched,
      platforms: perPlatform,
    },
    warnings,
  }
}

async function fetchSnapshots(
  platform: Platform,
  encryptedData: string
): Promise<ProductSnapshot[]> {
  switch (platform) {
    case 'trendyol': {
      const client = getTrendyolClient(decryptJSON<TrendyolCredentials>(encryptedData))
      return client.listProducts()
    }
    case 'shopify': {
      const client = getShopifyClient(decryptJSON<ShopifyCredentials>(encryptedData))
      return client.listProducts()
    }
    case 'hepsiburada': {
      const client = getHepsiburadaClient(decryptJSON<HepsiburadaCredentials>(encryptedData))
      return client.listProducts()
    }
  }
}
