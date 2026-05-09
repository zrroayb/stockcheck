import crypto from 'node:crypto'
import { PlatformApiError } from '@/lib/errors'
import type { TrendyolCredentials } from './types'
import type { ProductSnapshot } from './snapshot'
import { isMockCredentials, mockTrendyolClient } from './mock'

/**
 * Trendyol Marketplace API client.
 *
 * Auth: Basic, with Base64(apiKey:apiSecret), plus a supplier-specific URL.
 * Reference: https://developers.trendyol.com/
 */
export function getTrendyolClient(credentials: TrendyolCredentials) {
  if (isMockCredentials(credentials as unknown as Record<string, unknown>)) {
    return mockTrendyolClient()
  }
  const { apiKey, apiSecret, supplierId, storeName } = credentials
  const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
  const baseUrl = `https://api.trendyol.com/sapigw/suppliers/${supplierId}`

  const headers = {
    Authorization: `Basic ${auth}`,
    'Content-Type': 'application/json',
    'User-Agent': `${supplierId} - ${storeName ?? 'Stokkontrol'}`,
  }

  async function request<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${baseUrl}${path}`, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new PlatformApiError('trendyol', `${init?.method ?? 'GET'} ${path} failed`, res.status, body)
    }
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  }

  return {
    /**
     * Update price + inventory in batch.
     * `barcodeOrSku` should be the value Trendyol uses to identify the product
     * (in Trendyol that's the barcode field).
     */
    async updateStock(barcodeOrSku: string, quantity: number) {
      return request<{ batchRequestId: string }>('/products/price-and-inventory', {
        method: 'POST',
        body: JSON.stringify({
          items: [{ barcode: barcodeOrSku, quantity }],
        }),
      })
    },

    async getOrders(startDateMs: number, endDateMs: number) {
      const qs = new URLSearchParams({
        startDate: String(startDateMs),
        endDate: String(endDateMs),
        status: 'Created',
      })
      return request<{ content: unknown[]; totalElements: number }>(`/orders?${qs.toString()}`)
    },

    /**
     * Trendyol order cancel — `orderLineId` is what we pass.
     */
    async cancelOrder(orderLineId: string, reasonId = 0) {
      return request<unknown>(`/orders/${orderLineId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reasonId }),
      })
    },

    /**
     * List all supplier products with pagination. Trendyol uses page+size;
     * we yield until we exhaust totalPages or hit a hard cap.
     */
    async listProducts(maxPages = 50): Promise<ProductSnapshot[]> {
      const out: ProductSnapshot[] = []
      const size = 200
      let page = 0

      while (page < maxPages) {
        const qs = new URLSearchParams({ page: String(page), size: String(size) })
        const res = await request<{
          content?: Array<{
            id?: string | number
            barcode?: string
            stockCode?: string
            productMainId?: string
            title?: string
            quantity?: number
          }>
          totalPages?: number
        }>(`/products?${qs.toString()}`)

        const items = res.content ?? []
        for (const it of items) {
          const rawSku = String(it.stockCode ?? it.productMainId ?? it.barcode ?? '').trim()
          if (!rawSku) continue
          out.push({
            platform: 'trendyol',
            // Trendyol identifies inventory updates by barcode in our updateStock call,
            // so prefer barcode for the platformProductId.
            platformProductId: String(it.barcode ?? it.id ?? rawSku),
            sku: rawSku.toLowerCase(),
            rawSku,
            barcode: it.barcode ?? null,
            name: it.title ?? rawSku,
            stock: typeof it.quantity === 'number' ? it.quantity : 0,
          })
        }

        if (items.length < size) break
        if (typeof res.totalPages === 'number' && page + 1 >= res.totalPages) break
        page += 1
      }

      return out
    },
  }
}

/**
 * Verify a Trendyol webhook signature.
 *
 * Trendyol sends the HMAC-SHA256 of the raw request body using the partner's
 * webhook secret in the `x-trendyol-signature` header (hex encoded).
 */
export function verifyTrendyolWebhook(rawBody: string, signature: string, secret: string): boolean {
  if (!signature || !secret) return false
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  return safeEqual(signature, expected)
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return crypto.timingSafeEqual(ab, bb)
}
