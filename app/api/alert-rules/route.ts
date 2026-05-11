import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireCompany } from '@/lib/auth'
import { internalApiError } from '@/lib/api-response'

export const runtime = 'nodejs'

const createSchema = z.object({
  productId: z.string().uuid(),
  ruleType: z.enum(['low_stock', 'out_of_stock', 'overstock']),
  threshold: z.number().int().min(0),
  action: z.enum(['notify_email', 'pause_listings']),
  enabled: z.boolean().default(true),
})

export async function GET() {
  try {
    const company = await requireCompany()
    const rules = await prisma.alertRule.findMany({
      where: { product: { companyId: company.id } },
      include: {
        product: { select: { id: true, name: true, masterSku: true, stockCount: true } },
      },
      orderBy: { id: 'desc' },
    })
    return NextResponse.json({ rules })
  } catch (err) {
    if (err instanceof Response) return err
    return internalApiError('[GET /api/alert-rules]', err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const company = await requireCompany()
    const body = createSchema.parse(await req.json())

    // Tenant scoping
    const product = await prisma.product.findFirst({
      where: { id: body.productId, companyId: company.id },
    })
    if (!product) return NextResponse.json({ error: 'Product not found' }, { status: 404 })

    const rule = await prisma.alertRule.create({ data: body })
    return NextResponse.json({ rule }, { status: 201 })
  } catch (err) {
    if (err instanceof Response) return err
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', issues: err.flatten() }, { status: 400 })
    }
    return internalApiError('[POST /api/alert-rules]', err)
  }
}
