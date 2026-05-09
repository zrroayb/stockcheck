import { NextResponse } from 'next/server'
import { requireCompany } from '@/lib/auth'
import { scanAllPlatforms } from '@/lib/import/scanner'
import { internalApiError } from '@/lib/api-response'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
// Marketplace listing pulls can be slow when a seller has thousands of SKUs.
// Use the maximum that Vercel's hobby tier still allows; on Railway/self-host
// this is effectively no limit.
export const maxDuration = 300

export async function POST() {
  try {
    const company = await requireCompany()
    const result = await scanAllPlatforms(company.id)
    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof Response) return err
    return internalApiError('[POST /api/import/scan]', err)
  }
}
