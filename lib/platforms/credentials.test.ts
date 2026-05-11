import { describe, expect, it } from 'vitest'
import { externalAccountIdFor } from './credentials'

describe('externalAccountIdFor', () => {
  it('normalizes real marketplace account identifiers for webhook lookup', () => {
    expect(externalAccountIdFor('trendyol', { supplierId: '  SUP-123  ' })).toBe('sup-123')
    expect(externalAccountIdFor('shopify', { storeUrl: 'Store.MyShopify.com' })).toBe(
      'store.myshopify.com'
    )
    expect(externalAccountIdFor('hepsiburada', { merchantId: 42 })).toBe('42')
  })

  it('returns null when the lookup field is missing or empty', () => {
    expect(externalAccountIdFor('trendyol', {})).toBeNull()
    expect(externalAccountIdFor('shopify', { storeUrl: '  ' })).toBeNull()
  })
})
