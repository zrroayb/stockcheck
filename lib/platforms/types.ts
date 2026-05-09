import { z } from 'zod'

// ----- Trendyol -----

export const trendyolCredentialsSchema = z.object({
  apiKey: z.string().min(1),
  apiSecret: z.string().min(1),
  supplierId: z.string().min(1),
  storeName: z.string().optional(),
})
export type TrendyolCredentials = z.infer<typeof trendyolCredentialsSchema>

// ----- Shopify -----

export const shopifyCredentialsSchema = z.object({
  accessToken: z.string().min(1),
  storeUrl: z.string().regex(/^[a-z0-9-]+\.myshopify\.com$/i, 'Must be like yourstore.myshopify.com'),
  locationId: z.string().min(1),
})
export type ShopifyCredentials = z.infer<typeof shopifyCredentialsSchema>

// ----- Hepsiburada -----

export const hepsiburadaCredentialsSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  merchantId: z.string().min(1),
})
export type HepsiburadaCredentials = z.infer<typeof hepsiburadaCredentialsSchema>

// ----- Discriminated union for storage -----

export const credentialsByPlatform = {
  trendyol: trendyolCredentialsSchema,
  shopify: shopifyCredentialsSchema,
  hepsiburada: hepsiburadaCredentialsSchema,
} as const

export type CredentialsFor<P extends keyof typeof credentialsByPlatform> = z.infer<
  (typeof credentialsByPlatform)[P]
>

export type AnyCredentials =
  | { platform: 'trendyol'; data: TrendyolCredentials }
  | { platform: 'shopify'; data: ShopifyCredentials }
  | { platform: 'hepsiburada'; data: HepsiburadaCredentials }
