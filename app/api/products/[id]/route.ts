import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireCompany } from '@/lib/auth'

export const runtime = 'nodejs'

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  barcode: z.string().max(64).nullable().optional(),
  reservedStock: z.number().int().min(0).optional(),
  status: z.enum(['active', 'paused', 'archived']).optional(),
})

async function load(id: string, companyId: string) {
  return prisma.product.findFirst({
    where: { id, companyId },
    include: {
      platformListings: true,
      variants: true,
      alertRules: true,
      stockEvents: {
        orderBy: { occurredAt: 'desc' },
        take: 50,
      },
    },
  })
}

export async function GET(_req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const company = await requireCompany()
    const product = await load(ctx.params.id, company.id)
    if (!product) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    return NextResponse.json({ product })
  } catch (err) {
    if (err instanceof Response) return err
    console.error('[GET /api/products/:id]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const company = await requireCompany()
    const body = updateSchema.parse(await req.json())

    const existing = await prisma.product.findFirst({
      where: { id: ctx.params.id, companyId: company.id },
    })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const product = await prisma.product.update({
      where: { id: ctx.params.id },
      data: body,
    })

    return NextResponse.json({ product })
  } catch (err) {
    if (err instanceof Response) return err
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', issues: err.flatten() }, { status: 400 })
    }
    console.error('[PATCH /api/products/:id]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const company = await requireCompany()
    const existing = await prisma.product.findFirst({
      where: { id: ctx.params.id, companyId: company.id },
    })
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    await prisma.product.delete({ where: { id: ctx.params.id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    console.error('[DELETE /api/products/:id]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
