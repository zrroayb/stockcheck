import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyShopifyWebhook } from '@/lib/platforms/shopify'
import { processIncomingOrder } from '@/lib/webhooks/process-order'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const shopifyOrderPayload = z.object({
  id: z.union([z.string(), z.number()]),
  line_items: z.array(
    z.object({
      sku: z.string().nullable().optional(),
      quantity: z.number().int().positive(),
    })
  ),
})

export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  const secret = process.env.SHOPIFY_WEBHOOK_SECRET
  if (!secret) {
    console.error('[shopify webhook] SHOPIFY_WEBHOOK_SECRET not configured')
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  }

  const hmac = req.headers.get('x-shopify-hmac-sha256')
  if (!verifyShopifyWebhook(rawBody, hmac, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  // Shopify identifies the shop via X-Shopify-Shop-Domain. We map that to a
  // PlatformCredential row to find the owning company.
  const shopDomain = req.headers.get('x-shopify-shop-domain')
  if (!shopDomain) {
    return NextResponse.json({ error: 'Missing X-Shopify-Shop-Domain' }, { status: 400 })
  }

  const cred = await prisma.platformCredential.findFirst({
    where: {
      platform: 'shopify',
      // We can't decrypt to filter, so we look up by a separate companyId mapping
      // strategy: store the storeUrl in a separate (non-encrypted) column when
      // saving credentials. For now we scan all and match — see TODO.
    },
  })

  // Resolve company by scanning all shopify credentials and matching the
  // storeUrl after decryption. For high-throughput, denormalise storeUrl onto
  // PlatformCredential as a plain column (not part of the encrypted blob).
  const companyId = await resolveShopifyCompany(shopDomain)
  if (!companyId) {
    console.warn(`[shopify webhook] no company for shop ${shopDomain}`)
    return NextResponse.json({ ok: true, skipped: 'unknown_shop' })
  }

  let payload: z.infer<typeof shopifyOrderPayload>
  try {
    payload = shopifyOrderPayload.parse(JSON.parse(rawBody))
  } catch (err) {
    console.error('[shopify webhook] payload parse failed:', err)
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const result = await processIncomingOrder({
    companyId,
    platform: 'shopify',
    platformOrderId: String(payload.id),
    items: payload.line_items
      .filter((it) => it.sku)
      .map((it) => ({ platformSku: it.sku as string, quantity: it.quantity })),
  })

  return NextResponse.json({ ok: true, ...result })
}

async function resolveShopifyCompany(shopDomain: string): Promise<string | null> {
  const { decryptJSON } = await import('@/lib/encrypt')
  const creds = await prisma.platformCredential.findMany({ where: { platform: 'shopify' } })
  for (const c of creds) {
    try {
      const data = decryptJSON<{ storeUrl: string }>(c.encryptedData)
      if (data.storeUrl?.toLowerCase() === shopDomain.toLowerCase()) {
        return c.companyId
      }
    } catch {
      // bad credential — skip
    }
  }
  return null
}
