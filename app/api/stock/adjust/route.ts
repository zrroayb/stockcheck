import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireCompany } from '@/lib/auth'
import { adjustStock, triggerPlatformSync } from '@/lib/stock-engine'
import { InsufficientStockError } from '@/lib/errors'
import { internalApiError } from '@/lib/api-response'

export const runtime = 'nodejs'

const schema = z.object({
  productId: z.string().uuid(),
  delta: z.number().int(),
  note: z.string().max(500).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const company = await requireCompany()
    const body = schema.parse(await req.json())

    // Tenant scoping — make sure the product is ours.
    const product = await prisma.product.findFirst({
      where: { id: body.productId, companyId: company.id },
    })
    if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const newCount = await adjustStock({
      productId: body.productId,
      delta: body.delta,
      note: body.note,
    })

    await triggerPlatformSync(body.productId, company.id)

    return NextResponse.json({ stockCount: newCount })
  } catch (err) {
    if (err instanceof Response) return err
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', issues: err.flatten() }, { status: 400 })
    }
    if (err instanceof InsufficientStockError) {
      return NextResponse.json(
        {
          error: 'Insufficient stock',
          available: err.available,
          requested: err.requested,
        },
        { status: 409 }
      )
    }
    return internalApiError('[POST /api/stock/adjust]', err)
  }
}
