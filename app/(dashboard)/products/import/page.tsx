import { ImportClient } from './_components/import-client'
import { prisma } from '@/lib/db'
import { requireCompany } from '@/lib/auth'

export const dynamic = 'force-dynamic'

export default async function ImportPage() {
  const company = await requireCompany()
  const creds = await prisma.platformCredential.findMany({
    where: { companyId: company.id },
    select: { platform: true },
    orderBy: { platform: 'asc' },
  })

  return <ImportClient connectedPlatforms={creds.map((c) => c.platform)} />
}
