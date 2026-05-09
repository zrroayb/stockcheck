import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { verifyHepsiburadaWebhook } from '@/lib/platforms/hepsiburada'
import { processIncomingOrder } from '@/lib/webhooks/process-order'
import { prisma } from '@/lib/db'
import { decryptJSON } from '@/lib/encrypt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const hepsiburadaOrderPayload = z.object({
  orderId: z.string(),
  merchantId: z.string().optional(),
  items: z.array(
    z.object({
      sku: z.string(),
      quantity: z.number().int().positive(),
    })
  ),
})

export async function POST(req: NextRequest) {
  const rawBody = await req.text()

  const secret = process.env.HEPSIBURADA_WEBHOOK_SECRET
  if (!secret) {
    console.error('[hepsiburada webhook] HEPSIBURADA_WEBHOOK_SECRET not configured')
    return NextResponse.json({ error: 'Server not configured' }, { status: 500 })
  }

  // Hepsiburada doesn't have a single canonical signature header name in
  // public docs; accept either common variant.
  const signature =
    req.headers.get('x-hepsiburada-signature') ??
    req.headers.get('x-signature') ??
    ''
  if (!verifyHepsiburadaWebhook(rawBody, signature, secret)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let payload: z.infer<typeof hepsiburadaOrderPayload>
  try {
    payload = hepsiburadaOrderPayload.parse(JSON.parse(rawBody))
  } catch (err) {
    console.error('[hepsiburada webhook] payload parse failed:', err)
    return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
  }

  const companyId = await resolveHepsiburadaCompany(payload.merchantId ?? null)
  if (!companyId) {
    console.warn(`[hepsiburada webhook] no company for merchantId ${payload.merchantId}`)
    return NextResponse.json({ ok: true, skipped: 'unknown_merchant' })
  }

  const result = await processIncomingOrder({
    companyId,
    platform: 'hepsiburada',
    platformOrderId: payload.orderId,
    items: payload.items.map((it) => ({
      platformSku: it.sku,
      quantity: it.quantity,
    })),
  })

  return NextResponse.json({ ok: true, ...result })
}

async function resolveHepsiburadaCompany(merchantId: string | null): Promise<string | null> {
  if (!merchantId) return null
  const creds = await prisma.platformCredential.findMany({ where: { platform: 'hepsiburada' } })
  for (const c of creds) {
    try {
      const data = decryptJSON<{ merchantId: string }>(c.encryptedData)
      if (data.merchantId === merchantId) return c.companyId
    } catch {
      // skip
    }
  }
  return null
}
