/**
 * Mock marketplace mode.
 *
 * When ANY required credential field is the literal string "MOCK", the
 * platform client falls back to this in-memory implementation. The mock
 * exposes the same surface as the real client (listProducts, updateStock,
 * cancelOrder, …) so the rest of the app — scanner, applier, sync worker —
 * behaves exactly as it would in production.
 *
 * The fixture is deterministic, so reloading or re-scanning gives the same
 * 30-row dataset every time. Push-back actually updates the in-memory state,
 * so a second scan after Apply will show every SKU as "auto-merged".
 */

import type { ProductSnapshot } from './snapshot'

export const MOCK_MARKER = 'MOCK'

export function isMockCredentials(creds: Record<string, unknown>): boolean {
  return Object.values(creds).some((v) => typeof v === 'string' && v.trim().toUpperCase() === MOCK_MARKER)
}

// ---- Fixture --------------------------------------------------------------

type FixtureRow = {
  sku: string
  name: string
  // Stock per platform — undefined means the SKU isn't on that platform.
  trendyol?: number
  shopify?: number
  hepsiburada?: number
  barcode?: string
}

/**
 * 30 SKUs, designed to exercise every bucket in the import scanner:
 *  - SKU-001..006 → only Trendyol → 6 unmatched
 *  - SKU-007..012 → T + S, equal stock → 6 auto-merge (2-platform)
 *  - SKU-013..018 → T + S + H, equal stock → 6 auto-merge (3-platform)
 *  - SKU-019..024 → T + S, DIFFERENT stock → 6 conflict (2-platform)
 *  - SKU-025..030 → S + H, DIFFERENT stock → 6 conflict (cross-platform)
 *
 * Stock numbers are derived from the SKU index so they're easy to predict
 * when debugging.
 */
function buildFixture(): FixtureRow[] {
  const rows: FixtureRow[] = []
  for (let i = 1; i <= 30; i++) {
    const sku = `SKU-${String(i).padStart(3, '0')}`
    const name = `Demo Ürün ${i}`
    const barcode = `869000${String(100000 + i)}`
    const base: FixtureRow = { sku, name, barcode }

    if (i <= 6) {
      base.trendyol = 10 + i // 11..16
    } else if (i <= 12) {
      const stock = 25 + i // 32..37
      base.trendyol = stock
      base.shopify = stock
    } else if (i <= 18) {
      const stock = 50 + i // 63..68
      base.trendyol = stock
      base.shopify = stock
      base.hepsiburada = stock
    } else if (i <= 24) {
      base.trendyol = 80 + i // 99..104
      base.shopify = 50 + i // 69..74  (different → conflict)
    } else {
      base.shopify = 20 + i // 45..50
      base.hepsiburada = 5 + i // 30..35  (different → conflict)
    }

    rows.push(base)
  }
  return rows
}

// In-memory store keyed by platform — push-back actually mutates this.
const fixture = buildFixture()

const stockState: Record<'trendyol' | 'shopify' | 'hepsiburada', Map<string, number>> = {
  trendyol: new Map(),
  shopify: new Map(),
  hepsiburada: new Map(),
}

for (const row of fixture) {
  if (typeof row.trendyol === 'number') stockState.trendyol.set(row.sku, row.trendyol)
  if (typeof row.shopify === 'number') stockState.shopify.set(row.sku, row.shopify)
  if (typeof row.hepsiburada === 'number') stockState.hepsiburada.set(row.sku, row.hepsiburada)
}

function snapshotsFor(platform: 'trendyol' | 'shopify' | 'hepsiburada'): ProductSnapshot[] {
  const out: ProductSnapshot[] = []
  for (const row of fixture) {
    const stock = stockState[platform].get(row.sku)
    if (typeof stock !== 'number') continue
    out.push({
      platform,
      platformProductId: row.sku, // mock keys updates by SKU
      sku: row.sku.toLowerCase(),
      rawSku: row.sku,
      barcode: row.barcode ?? null,
      name: row.name,
      stock,
    })
  }
  return out
}

function setStock(
  platform: 'trendyol' | 'shopify' | 'hepsiburada',
  sku: string,
  qty: number
): void {
  stockState[platform].set(sku, qty)
  console.log(`[mock/${platform}] updateStock ${sku} → ${qty}`)
}

// ---- Mock clients ---------------------------------------------------------

export function mockTrendyolClient() {
  return {
    async updateStock(barcodeOrSku: string, quantity: number) {
      setStock('trendyol', barcodeOrSku, quantity)
      await tick()
      return { batchRequestId: `mock-${Date.now()}` }
    },
    async getOrders(_startDateMs: number, _endDateMs: number) {
      await tick()
      return { content: [], totalElements: 0 }
    },
    async cancelOrder(orderLineId: string, _reasonId = 0) {
      console.log(`[mock/trendyol] cancelOrder ${orderLineId}`)
      await tick()
      return { ok: true }
    },
    async listProducts(_maxPages = 50) {
      await tick(120)
      return snapshotsFor('trendyol')
    },
  }
}

export function mockShopifyClient() {
  return {
    async setInventoryLevel(inventoryItemId: string, available: number) {
      setStock('shopify', inventoryItemId, available)
      await tick()
      return { inventory_level: { available } }
    },
    async cancelOrder(orderId: string) {
      console.log(`[mock/shopify] cancelOrder ${orderId}`)
      await tick()
      return { order: { cancelled_at: new Date().toISOString() } }
    },
    async getProduct(productId: string) {
      await tick()
      return { product: { id: productId } }
    },
    async findVariantBySku(_sku: string) {
      await tick()
      return { products: [] }
    },
    async listProducts(_maxPages = 50) {
      await tick(150)
      return snapshotsFor('shopify')
    },
  }
}

export function mockHepsiburadaClient() {
  return {
    async updateStock(sku: string, availableCount: number) {
      setStock('hepsiburada', sku, availableCount)
      await tick()
      return { ok: true }
    },
    async getRecentOrders(_limit = 50) {
      await tick()
      return { items: [] }
    },
    async cancelOrder(platformOrderId: string, _reason = 'OutOfStock') {
      console.log(`[mock/hepsiburada] cancelOrder ${platformOrderId}`)
      await tick()
      return { ok: true }
    },
    async listProducts(_maxPages = 50) {
      await tick(100)
      return snapshotsFor('hepsiburada')
    },
  }
}

// Tiny artificial delay so the UI's "scanning…" state is visible.
function tick(ms = 30): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
