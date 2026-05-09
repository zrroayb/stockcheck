import { prisma } from '@/lib/db'
import { decryptJSON, encryptJSON } from '@/lib/encrypt'
import { isMockCredentials, MOCK_MARKER } from './mock'
import {
  credentialsByPlatform,
  type AnyCredentials,
  type HepsiburadaCredentials,
  type ShopifyCredentials,
  type TrendyolCredentials,
} from './types'

export type PlatformName = 'trendyol' | 'shopify' | 'hepsiburada'

// Per-platform set of required field names — used to fully populate a mock
// credential blob when the user provides only a single MOCK field (or
// types MOCK in different fields). Means real schema validation can be
// skipped while still producing a valid, consistent stored shape.
const MOCK_FIELDS: Record<PlatformName, string[]> = {
  trendyol: ['apiKey', 'apiSecret', 'supplierId'],
  shopify: ['accessToken', 'storeUrl', 'locationId'],
  hepsiburada: ['username', 'password', 'merchantId'],
}

export async function saveCredentials(
  companyId: string,
  platform: PlatformName,
  raw: unknown
): Promise<void> {
  let payload: Record<string, unknown>

  if (raw && typeof raw === 'object' && isMockCredentials(raw as Record<string, unknown>)) {
    // Mock mode: store a uniform MOCK blob, skip strict validation.
    payload = Object.fromEntries(MOCK_FIELDS[platform].map((k) => [k, MOCK_MARKER]))
  } else {
    payload = credentialsByPlatform[platform].parse(raw) as Record<string, unknown>
  }

  const encryptedData = encryptJSON(payload)
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
  if (isMockCredentials(decrypted as Record<string, unknown>)) {
    return decrypted as AnyCredentials['data']
  }
  return credentialsByPlatform[platform].parse(decrypted) as AnyCredentials['data']
}
