import crypto from 'node:crypto'
import { PlatformApiError } from '@/lib/errors'
import type { TrendyolCredentials } from './types'

/**
 * Trendyol Marketplace API client.
 *
 * Auth: Basic, with Base64(apiKey:apiSecret), plus a supplier-specific URL.
 * Reference: https://developers.trendyol.com/
 */
export function getTrendyolClient(credentials: TrendyolCredentials) {
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
