/**
 * Normalised product snapshot — every platform's listProducts() returns this
 * shape. The import scanner groups snapshots from all platforms by SKU.
 */
export type ProductSnapshot = {
  platform: 'trendyol' | 'shopify' | 'hepsiburada'
  platformProductId: string // the id we'll later use to push stock back
  sku: string // canonical SKU (lowercased + trimmed) used for matching
  rawSku: string // SKU as the platform returned it (display)
  barcode: string | null
  name: string
  stock: number
}
