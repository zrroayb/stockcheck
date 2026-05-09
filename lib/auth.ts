import { auth, clerkClient, currentUser } from '@clerk/nextjs/server'
import { prisma } from './db'

/**
 * Resolve the current Clerk org → our local Company row.
 * Lazily creates the Company on first access (Clerk org is created during
 * sign-up/onboarding; we mirror it here so we have a stable internal id).
 */
export async function getCurrentCompany() {
  const { orgId, userId } = await auth()
  if (!orgId || !userId) return null

  // Use upsert + retry-on-find to avoid a race when Next.js runs server
  // components in parallel (RSC streams) and two of them hit getCurrentCompany
  // for a brand-new org at the same time. With plain findUnique+create both
  // would see null and the second create would fail on the unique constraint.
  let company = await prisma.company.findUnique({ where: { clerkOrgId: orgId } })

  if (!company) {
    const user = await currentUser()
    let orgName = 'New Workspace'
    try {
      const client = await clerkClient()
      const org = await client.organizations.getOrganization({ organizationId: orgId })
      if (org?.name) orgName = org.name
    } catch (err) {
      console.warn('[auth] failed to fetch Clerk organization name:', err)
    }

    company = await prisma.company.upsert({
      where: { clerkOrgId: orgId },
      create: {
        clerkOrgId: orgId,
        name: orgName,
        alertEmail: user?.primaryEmailAddress?.emailAddress ?? null,
      },
      update: {},
    })

    // Mirror the Clerk user into our User table.
    await prisma.user.upsert({
      where: { clerkId: userId },
      create: {
        clerkId: userId,
        companyId: company.id,
        email: user?.primaryEmailAddress?.emailAddress ?? '',
        role: 'admin',
      },
      update: { companyId: company.id },
    })
  }

  return company
}

/**
 * Throwing variant — use in API routes where "no company" should 401.
 */
export async function requireCompany() {
  const company = await getCurrentCompany()
  if (!company) {
    throw new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  return company
}
