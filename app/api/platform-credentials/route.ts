import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { requireCompany } from '@/lib/auth'
import {
  deleteCredentials,
  saveCredentials,
  type PlatformName,
} from '@/lib/platforms/credentials'
import { internalApiError } from '@/lib/api-response'

export const runtime = 'nodejs'

const platformEnum = z.enum(['trendyol', 'shopify', 'hepsiburada'])

const saveSchema = z.object({
  platform: platformEnum,
  data: z.record(z.string(), z.any()),
})

const deleteSchema = z.object({
  platform: platformEnum,
})

export async function GET() {
  try {
    const company = await requireCompany()
    const creds = await prisma.platformCredential.findMany({
      where: { companyId: company.id },
      select: { platform: true, createdAt: true, updatedAt: true, expiresAt: true },
      orderBy: { platform: 'asc' },
    })
    return NextResponse.json({ credentials: creds })
  } catch (err) {
    if (err instanceof Response) return err
    return internalApiError('[GET /api/platform-credentials]', err)
  }
}

export async function POST(req: NextRequest) {
  try {
    const company = await requireCompany()
    const body = saveSchema.parse(await req.json())
    await saveCredentials(company.id, body.platform as PlatformName, body.data)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', issues: err.flatten() }, { status: 400 })
    }
    return internalApiError('[POST /api/platform-credentials]', err)
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const company = await requireCompany()
    const body = deleteSchema.parse(await req.json())
    await deleteCredentials(company.id, body.platform as PlatformName)
    return NextResponse.json({ ok: true })
  } catch (err) {
    if (err instanceof Response) return err
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: 'Validation failed', issues: err.flatten() }, { status: 400 })
    }
    return internalApiError('[DELETE /api/platform-credentials]', err)
  }
}
