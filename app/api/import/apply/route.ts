import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { requireCompany } from '@/lib/auth'
import { applyImport } from '@/lib/import/applier'
import { internalApiError } from '@/lib/api-response'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const platformEnum = z.enum(['trendyol', 'shopify', 'hepsiburada'])

const planSchema = z.object({
  pushBack: z.boolean().default(true),
  items: z
    .array(
      z.object({
        sku: z.string().min(1),
        rawSku: z.string().min(1),
        name: z.string().min(1).max(255),
        barcode: z.string().nullable(),
        chosenStock: z.number().int().min(0),
        reservedStock: z.number().int().min(0).optional(),
        existingProductId: z.string().nullable(),
        snapshots: z
          .array(
            z.object({
              platform: platformEnum,
              platformProductId: z.string().min(1),
              platformSku: z.string().min(1),
            })
          )
          .min(1),
      })
    )
    .min(1)
    .max(2000),
})

export async function POST(req: NextRequest) {
  try {
    const company = await requireCompany()
    const plan = planSchema.parse(await req.json())
    const result = await applyImport(company.id, plan)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof Response) return err
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', issues: err.flatten() }, { status: 400 })
    }
    return internalApiError('[POST /api/import/apply]', err)
  }
}
