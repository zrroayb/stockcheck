import crypto from 'node:crypto'
import { PlatformApiError } from '@/lib/errors'
import type { ShopifyCredentials } from './types'

const API_VERSION = '2024-01'

/**
 * Shopify Admin REST client.
 *
 * Auth: a custom-app `X-Shopify-Access-Token`.
 * Inventory is keyed by inventory_item_id + location_id, NOT by product id.
 * Reference: https://shopify.dev/docs/api/admin-rest/2024-01/resources/inventorylevel
 */
export function getShopifyClient(credentials: ShopifyCredentials) {
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
