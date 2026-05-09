import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/db'
import { requireCompany } from '@/lib/auth'
import { adjustStock, triggerPlatformSync } from '@/lib/stock-engine'
import { InsufficientStockError } from '@/lib/errors'
import { internalApiError } from '@/lib/api-response'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const baseSchema = z.object({
  productIds: z.array(z.string().uuid()).min(1).max(500),
  note: z.string().max(500).optional(),
})

const actionSchema = z.discriminatedUnion('action', [
  baseSchema.extend({
    action: z.literal('set_stock'),
    value: z.number().int().min(0),
  }),
  baseSchema.extend({
    action: z.literal('adjust_stock'),
    delta: z.number().int(),
  }),
  baseSchema.extend({
    action: z.literal('set_reserved'),
    value: z.number().int().min(0),
  }),
  baseSchema.extend({
    action: z.literal('pause'),
  }),
  baseSchema.extend({
    action: z.literal('resume'),
  }),
])

type BulkResult = {
  ok: number
  failed: number
  errors: Array<{ productId: string; error: string }>
}

export async function POST(req: NextRequest) {
  try {
    const company = await requireCompany()
    const body = actionSchema.parse(await req.json())

    // Tenant scoping in one query — drop any IDs that aren't ours.
    const ours = await prisma.product.findMany({
      where: { id: { in: body.productIds }, companyId: company.id },
      select: { id: true, stockCount: true },
    })
    const ownedIds = new Set(ours.map((p) => p.id))

    const result: BulkResult = { ok: 0, failed: 0, errors: [] }

    switch (body.action) {
      case 'set_stock': {
        // Compute the delta per product so we go through the audit-logged
        // stock engine rather than blindly overwriting stockCount.
        for (const p of ours) {
          const delta = body.value - p.stockCount
          if (delta === 0) {
            result.ok += 1
            continue
          }
          try {
            await adjustStock({
              productId: p.id,
              delta,
              note: body.note ?? `Bulk: set stock to ${body.value}`,
            })
            await triggerPlatformSync(p.id, company.id).catch(() => undefined)
            result.ok += 1
          } catch (err) {
            result.failed += 1
            result.errors.push({ productId: p.id, error: explain(err) })
          }
        }
        break
      }

      case 'adjust_stock': {
        for (const p of ours) {
          if (body.delta === 0) {
            result.ok += 1
            continue
          }
          try {
            await adjustStock({
              productId: p.id,
              delta: body.delta,
              note: body.note ?? `Bulk: ${body.delta > 0 ? '+' : ''}${body.delta}`,
            })
            await triggerPlatformSync(p.id, company.id).catch(() => undefined)
            result.ok += 1
          } catch (err) {
            result.failed += 1
            result.errors.push({ productId: p.id, error: explain(err) })
          }
        }
        break
      }

      case 'set_reserved': {
        // Reserved doesn't go through the stock engine — it's not actual
        // stock movement, just a soft hold against `available`.
        try {
          await prisma.product.updateMany({
            where: { id: { in: Array.from(ownedIds) } },
            data: { reservedStock: body.value },
          })
          result.ok = ownedIds.size
        } catch (err) {
          result.failed = ownedIds.size
          result.errors.push({ productId: '*', error: explain(err) })
        }
        break
      }

      case 'pause': {
        await prisma.platformListing.updateMany({
          where: { productId: { in: Array.from(ownedIds) } },
          data: { syncStatus: 'paused' },
        })
        await prisma.product.updateMany({
          where: { id: { in: Array.from(ownedIds) } },
          data: { status: 'paused' },
        })
        result.ok = ownedIds.size
        break
      }

      case 'resume': {
        await prisma.platformListing.updateMany({
          where: { productId: { in: Array.from(ownedIds) }, syncStatus: 'paused' },
          data: { syncStatus: 'pending' },
        })
        await prisma.product.updateMany({
          where: { id: { in: Array.from(ownedIds) } },
          data: { status: 'active' },
        })
        // Trigger a sync so the marketplace stocks come back to current values.
        for (const p of ours) {
          await triggerPlatformSync(p.id, company.id).catch(() => undefined)
        }
        result.ok = ownedIds.size
        break
      }
    }

    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof Response) return err
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', issues: err.flatten() }, { status: 400 })
    }
    return internalApiError('[POST /api/products/bulk]', err)
  }
}

function explain(err: unknown): string {
  if (err instanceof InsufficientStockError) return `insufficient stock (avail ${err.available})`
  if (err instanceof Prisma.PrismaClientKnownRequestError) return `db: ${err.code}`
  return err instanceof Error ? err.message : String(err)
}
