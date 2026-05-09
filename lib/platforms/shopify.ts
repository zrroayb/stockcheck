import crypto from 'node:crypto'
import { PlatformApiError } from '@/lib/errors'
import type { ShopifyCredentials } from './types'
import type { ProductSnapshot } from './snapshot'
import { isMockCredentials, mockShopifyClient } from './mock'

const API_VERSION = '2024-01'

/**
 * Shopify Admin REST client.
 *
 * Auth: a custom-app `X-Shopify-Access-Token`.
 * Inventory is keyed by inventory_item_id + location_id, NOT by product id.
 * Reference: https://shopify.dev/docs/api/admin-rest/2024-01/resources/inventorylevel
 */
export function getShopifyClient(credentials: ShopifyCredentials) {
  if (isMockCredentials(credentials as unknown as Record<string, unknown>)) {
    return mockShopifyClient()
  }
  const { accessToken, storeUrl, locationId } = credentials
  const baseUrl = `https://${storeUrl}/admin/api/${API_VERSION}`

  const headers = {
    'X-Shopify-Access-Token': accessToken,
    'Content-Type': 'application/json',
  }

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new PlatformApiError('shopify', `${init?.method ?? 'GET'} ${path} failed`, res.status, body)
    }
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  }

  return {
    /**
     * Set absolute inventory level for an inventory item at the configured location.
     * `inventoryItemId` lives on a product variant (variant.inventory_item_id).
     */
    async setInventoryLevel(inventoryItemId: string, available: number) {
      return request<{ inventory_level: { available: number } }>('/inventory_levels/set.json', {
        method: 'POST',
        body: JSON.stringify({
          location_id: Number(locationId),
          inventory_item_id: Number(inventoryItemId),
          available,
        }),
      })
    },

    async cancelOrder(orderId: string) {
      return request<{ order: { cancelled_at: string } }>(
        `/orders/${orderId}/cancel.json`,
        {
          method: 'POST',
          body: JSON.stringify({ reason: 'inventory', email: true }),
        }
      )
    },

    async getProduct(productId: string) {
      return request<{ product: unknown }>(`/products/${productId}.json`)
    },

    /**
     * Look up a variant by its SKU. Useful when wiring up listings.
     * Note: Shopify does not have a direct "find by SKU" — you must search.
     */
    async findVariantBySku(sku: string) {
      const qs = new URLSearchParams({ sku })
      return request<{ products: unknown[] }>(`/products.json?${qs.toString()}`)
    },

    /**
     * List every product variant in the store. Each Shopify product can have
     * multiple variants — we flatten them, because each variant has its own
     * SKU and inventory_item_id (which is what `setInventoryLevel` needs).
     *
     * Uses the legacy since_id pagination (works without cursor headers).
     */
    async listProducts(maxPages = 50): Promise<ProductSnapshot[]> {
      const out: ProductSnapshot[] = []
      const limit = 250
      let sinceId = 0

      for (let i = 0; i < maxPages; i++) {
        const qs = new URLSearchParams({
          limit: String(limit),
          since_id: String(sinceId),
          fields: 'id,title,variants',
        })
        const res = await request<{
          products?: Array<{
            id?: number
            title?: string
            variants?: Array<{
              id?: number
              sku?: string | null
              barcode?: string | null
              inventory_item_id?: number
              inventory_quantity?: number
              title?: string
            }>
          }>
        }>(`/products.json?${qs.toString()}`)

        const products = res.products ?? []
        if (products.length === 0) break

        for (const p of products) {
          for (const v of p.variants ?? []) {
            const rawSku = String(v.sku ?? '').trim()
            if (!rawSku) continue
            const fullName =
              v.title && v.title !== 'Default Title'
                ? `${p.title ?? ''} — ${v.title}`.trim()
                : p.title ?? rawSku
            out.push({
              platform: 'shopify',
              // setInventoryLevel needs the inventory_item_id, not the variant id.
              platformProductId: String(v.inventory_item_id ?? v.id ?? ''),
              sku: rawSku.toLowerCase(),
              rawSku,
              barcode: v.barcode ?? null,
              name: fullName,
              stock: typeof v.inventory_quantity === 'number' ? v.inventory_quantity : 0,
            })
          }
          if (typeof p.id === 'number' && p.id > sinceId) sinceId = p.id
        }

        if (products.length < limit) break
      }

      return out
    },
  }
}

/**
 * Verify Shopify webhook HMAC.
 * Shopify sends the base64-encoded HMAC-SHA256 of the raw body in the
 * `X-Shopify-Hmac-Sha256` header.
 */
export function verifyShopifyWebhook(
  rawBody: string,
  hmacHeader: string | null | undefined,
  secret: string
): boolean {
  if (!hmacHeader || !secret) return false
  const digest = crypto.createHmac('sha256', secret).update(rawBody, 'utf8').digest('base64')
  return safeEqual(digest, hmacHeader)
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return crypto.timingSafeEqual(ab, bb)
}
