import type { ProductSnapshot } from '@/lib/platforms/snapshot'

export type Platform = 'trendyol' | 'shopify' | 'hepsiburada'

/**
 * One row in the import review table.
 *
 * - `bucket` tells the UI which tab the row belongs to:
 *   - matched   → SKU exists on 2+ platforms AND all stocks agree, no choice needed
 *   - conflict  → SKU exists on 2+ platforms but stocks disagree, user must pick
 *   - unmatched → SKU exists on exactly 1 platform; will become a single-listing product
 *
 * - `existingProductId` is set when we already have a Product with this SKU,
 *   in which case Apply will UPDATE it instead of CREATE.
 */
export type ScanRow = {
  sku: string // canonical (lowercased)
  rawSku: string // for display (first non-empty)
  name: string
  barcode: string | null
  bucket: 'matched' | 'conflict' | 'unmatched'
  snapshots: ProductSnapshot[] // one entry per platform that has this SKU
  suggestedStock: number // what we'd default to (min of platform stocks)
  existingProductId: string | null
}

export type ScanResult = {
  rows: ScanRow[]
  totals: {
    scanned: number // total snapshots fetched across platforms
    matched: number
    conflicts: number
    unmatched: number
    platforms: Record<Platform, number>
  }
  warnings: string[]
}

/**
 * What the UI sends back when user clicks "Apply".
 * Each entry corresponds to a ScanRow the user chose to import.
 */
export type ApplyPlanItem = {
  sku: string
  rawSku: string
  name: string
  barcode: string | null
  chosenStock: number // user's pick (or default)
  reservedStock?: number
  snapshots: Array<{
    platform: Platform
    platformProductId: string
    platformSku: string
  }>
  existingProductId: string | null
}

export type ApplyPlan = {
  items: ApplyPlanItem[]
  pushBack: boolean // push the chosen stock to all platforms after import
}
