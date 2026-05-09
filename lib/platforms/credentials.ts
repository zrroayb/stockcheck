import { prisma } from '@/lib/db'
import { decryptJSON, encryptJSON } from '@/lib/encrypt'
import {
  credentialsByPlatform,
  type AnyCredentials,
  type HepsiburadaCredentials,
  type ShopifyCredentials,
  type TrendyolCredentials,
} from './types'

export type PlatformName = 'trendyol' | 'shopify' | 'hepsiburada'

export async function saveCredentials(
  companyId: string,
  platform: PlatformName,
  raw: unknown
): Promise<void> {
  const schema = credentialsByPlatform[platform]
  const parsed = schema.parse(raw)
  const encryptedData = encryptJSON(parsed)

  await prisma.platformCredential.upsert({
    where: { companyId_platform: { companyId, platform } },
    create: { companyId, platform, encryptedData },
    update: { encryptedData },
  })
}

export async function deleteCredentials(companyId: string, platform: PlatformName): Promise<void> {
  await prisma.platformCredential.delete({
    where: { companyId_platform: { companyId, platform } },
  }).catch(() => undefined)
}

export async function loadCredentials(
  companyId: string,
  platform: 'trendyol'
): Promise<TrendyolCredentials>
export async function loadCredentials(
  companyId: string,
  platform: 'shopify'
): Promise<ShopifyCredentials>
export async function loadCredentials(
  companyId: string,
  platform: 'hepsiburada'
): Promise<HepsiburadaCredentials>
export async function loadCredentials(
  companyId: string,
  platform: PlatformName
): Promise<AnyCredentials['data']> {
  const cred = await prisma.platformCredential.findUniqueOrThrow({
    where: { companyId_platform: { companyId, platform } },
  })

  const decrypted = decryptJSON(cred.encryptedData)
  return credentialsByPlatform[platform].parse(decrypted) as AnyCredentials['data']
}
