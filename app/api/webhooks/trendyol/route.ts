import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyTrendyolWebhook } from '@/lib/platforms/trendyol'
import { processIncomingOrder } from '@/lib/webhooks/process-order'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

// Trendyol's order webhook payload (loose parse — Trendyol sends quite a lot
// of metadata; we only need the bits below).
const trendyolOrderPayload = z.object({
  orderNumber: z.string(),
  supplierId: z.union([z.string(), z.number()]).optional(),
  lines: z.array(
    z.object({
      id: z.union([z.string(), z.number()]).optional(),
      lineId: z.union([z.string(), z.number()]).optional(),
      orderLineId: z.union([z.string(), z.number()]).optional(),
      sku: z.string().optional(),
      barcode: z.string().optional(),
      quantity: z.number().int().positive(),
    })
  ),
})

export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  const secret = process.env.TRENDYOL_WEBHOOK_SECRET
  if (!secret) {
    console.error('[trendyol webhook] TRENDYOL_WEBHOOK_SECRET not configured')
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  }

  const signature = req.headers.get('x-trendyol-signature') ?? ''
  if (!verifyTrendyolWebhook(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: z.infer<typeof trendyolOrderPayload>
  try {
    payload = trendyolOrderPayload.parse(JSON.parse(rawBody))
  } catch (err) {
    console.error('[trendyol webhook] payload parse failed:', err)
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const supplierId = payload.supplierId ? String(payload.supplierId) : null
  const companyId = await resolveTrendyolCompany(supplierId)
  if (!companyId) {
    console.warn(`[trendyol webhook] no company for supplierId ${supplierId}`)
    return NextResponse.json({ ok: true, skipped: 'unknown_supplier' })
  }

  const result = await processIncomingOrder({
    companyId,
    platform: 'trendyol',
    platformOrderId: payload.orderNumber,
    items: payload.lines
      .map((l) => ({
        // Prefer SKU; fall back to barcode (Trendyol uses both)
        platformSku: (l.sku ?? l.barcode ?? '').trim(),
        quantity: l.quantity,
        cancelReference: stringifyLineId(l.orderLineId ?? l.lineId ?? l.id),
      }))
      .filter((l) => l.platformSku.length > 0),
  })

  return NextResponse.json({ ok: true, ...result })
}

function stringifyLineId(value: string | number | undefined): string | undefined {
  if (typeof value === 'undefined') return undefined
  const lineId = String(value).trim()
  return lineId.length > 0 ? lineId : undefined
}

async function resolveTrendyolCompany(supplierId: string | null): Promise<string | null> {
  if (!supplierId) return null
  const cred = await prisma.platformCredential.findUnique({
    where: {
      platform_externalAccountId: {
        platform: 'trendyol',
        externalAccountId: supplierId.trim().toLowerCase(),
      },
    },
    select: { companyId: true },
  })
  return cred?.companyId ?? null
}
