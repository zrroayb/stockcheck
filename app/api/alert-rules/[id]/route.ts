import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireCompany } from '@/lib/auth'
import { internalApiError } from '@/lib/api-response'

export const runtime = 'nodejs'

const patchSchema = z.object({
  threshold: z.number().int().min(0).optional(),
  action: z.enum(['notify_email', 'pause_listings']).optional(),
  enabled: z.boolean().optional(),
})

async function ownsRule(ruleId: string, companyId: string) {
  return prisma.alertRule.findFirst({
    where: { id: ruleId, product: { companyId } },
  })
}

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const company = await requireCompany()
    const body = patchSchema.parse(await req.json())
    const existing = await ownsRule(ctx.params.id, company.id)
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    const rule = await prisma.alertRule.update({ where: { id: ctx.params.id }, data: body })
    return NextResponse.json({ rule })
  } catch (err) {
    if (err instanceof Response) return err
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', issues: err.flatten() }, { status: 400 })
    }
    return internalApiError('[PATCH /api/alert-rules/:id]', err)
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: { id: string } }) {
  try {
    const company = await requireCompany()
    const existing = await ownsRule(ctx.params.id, company.id)
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 })
    await prisma.alertRule.delete({ where: { id: ctx.params.id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    return internalApiError('[DELETE /api/alert-rules/:id]', err)
  }
}
