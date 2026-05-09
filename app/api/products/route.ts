import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireCompany } from '@/lib/auth'
import { internalApiError } from '@/lib/api-response'

export const runtime = 'nodejs'

const createProductSchema = z.object({
  masterSku: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  barcode: z.string().max(64).optional(),
  stockCount: z.number().int().min(0).default(0),
  reservedStock: z.number().int().min(0).default(0),
})

export async function GET(req: NextRequest) {
  try {
    const company = await requireCompany()
    const { searchParams } = new URL(req.url)
    const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') ?? '50', 10)))
    const search = searchParams.get('q')?.trim()

    const where = {
      companyId: company.id,
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { masterSku: { contains: search, mode: 'insensitive' as const } },
              { barcode: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        include: {
          platformListings: {
            select: {
              platform: true,
              syncStatus: true,
              stockOnPlatform: true,
              lastSyncedAt: true,
            },
          },
          _count: { select: { stockEvents: true } },
        },
        orderBy: { updatedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.product.count({ where }),
    ])

    return NextResponse.json({
      products,
      total,
      page,
      pages: Math.ceil(total / limit),
    })
  } catch (err) {
    if (err instanceof Response) return err
    return internalApiError('[GET /api/products]', err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const company = await requireCompany()
    const body = createProductSchema.parse(await req.json())

    const product = await prisma.product.create({
      data: {
        companyId: company.id,
        masterSku: body.masterSku,
        name: body.name,
        barcode: body.barcode,
        stockCount: body.stockCount,
        reservedStock: body.reservedStock,
      },
    })

    if (body.stockCount > 0) {
      await prisma.stockEvent.create({
        data: {
          productId: product.id,
          sourcePlatform: 'manual',
          eventType: 'import',
          quantityDelta: body.stockCount,
          note: 'Initial stock on product create',
        },
      })
    }

    return NextResponse.json({ product }, { status: 201 })
  } catch (err) {
    if (err instanceof Response) return err
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', issues: err.flatten() }, { status: 400 })
    }
    if ((err as { code?: string })?.code === 'P2002') {
      return NextResponse.json({ error: 'A product with this SKU already exists' }, { status: 409 })
    }
    return internalApiError('[POST /api/products]', err)
  }
}
