import crypto from 'node:crypto'
import { PlatformApiError } from '@/lib/errors'
import type { HepsiburadaCredentials } from './types'
import type { ProductSnapshot } from './snapshot'
import { isMockCredentials, mockHepsiburadaClient } from './mock'

/**
 * Hepsiburada client.
 *
 * Auth: HTTP Basic with merchant username + password (an app-specific token,
 * NOT the dashboard password). The merchant id is part of the URL.
 *
 * Webhooks here are unreliable in practice — pair this client with the
 * polling worker (see workers/poll-worker.ts) to catch missed orders.
 */
export function getHepsiburadaClient(credentials: HepsiburadaCredentials) {
  if (isMockCredentials(credentials as unknown as Record<string, unknown>)) {
    return mockHepsiburadaClient()
  }
  const { username, password, merchantId } = credentials
  const auth = Buffer.from(`${username}:${password}`).toString('base64')

  const listingBase = `https://listing-external.hepsiburada.com`
  const omsBase = `https://oms-external.hepsiburada.com`

  const headers = {
    Authorization: `Basic ${auth}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  }

  async function request<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, { ...init, headers: { ...headers, ...(init?.headers ?? {}) } })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new PlatformApiError('hepsiburada', `${init?.method ?? 'GET'} ${url} failed`, res.status, body)
    }
    if (res.status === 204) return undefined as T
    return (await res.json()) as T
  }

  return {
    async updateStock(sku: string, availableCount: number) {
      const url = `${listingBase}/listings/merchantid/${merchantId}/stock-uploads/sku/${encodeURIComponent(sku)}`
      return request<unknown>(url, {
        method: 'POST',
        body: JSON.stringify({ availableCount }),
      })
    },

    async getRecentOrders(limit = 50) {
      const url = `${omsBase}/orders/merchantid/${merchantId}?status=Created&limit=${limit}`
      return request<{ items?: unknown[] }>(url)
    },

    async cancelOrder(platformOrderId: string, reason = 'OutOfStock') {
      const url = `${omsBase}/orders/merchantid/${merchantId}/${platformOrderId}/cancel`
      return request<unknown>(url, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      })
    },

    /**
     * List the merchant's listings (one per SKU). Hepsiburada's API uses
     * offset/limit pagination.
     */
    async listProducts(maxPages = 50): Promise<ProductSnapshot[]> {
      const out: ProductSnapshot[] = []
      const limit = 100
      let offset = 0

      for (let i = 0; i < maxPages; i++) {
        const url = `${listingBase}/listings/merchantid/${merchantId}?offset=${offset}&limit=${limit}`
        const res = await request<{
          listings?: Array<{
            merchantSku?: string
            hepsiburadaSku?: string
            barcode?: string
            productName?: string
            availableStock?: number
          }>
        }>(url)

        const items = res.listings ?? []
        if (items.length === 0) break

        for (const it of items) {
          const rawSku = String(it.merchantSku ?? '').trim()
          if (!rawSku) continue
          out.push({
            platform: 'hepsiburada',
            // updateStock keys by merchantSku, so use that.
            platformProductId: rawSku,
            sku: rawSku.toLowerCase(),
            rawSku,
            barcode: it.barcode ?? null,
            name: it.productName ?? rawSku,
            stock: typeof it.availableStock === 'number' ? it.availableStock : 0,
          })
        }

        if (items.length < limit) break
        offset += limit
      }

      return out
    },
  }
}

/**
 * Hepsiburada webhook signature verification.
 * Defensive default: HMAC-SHA256(secret, rawBody) hex-encoded.
 * If your Hepsiburada partnership uses a different format, adjust here.
 */
export function verifyHepsiburadaWebhook(
  rawBody: string,
  signature: string | null | undefined,
  secret: string
): boolean {
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
