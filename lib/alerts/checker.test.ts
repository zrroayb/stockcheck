import { beforeEach, describe, expect, it, vi } from 'vitest'

const pausePlatformListings = vi.fn()
const sendAlertEmail = vi.fn()
const alertRuleFindMany = vi.fn()

vi.mock('@/lib/stock-engine', () => ({
  pausePlatformListings,
}))

vi.mock('./email', () => ({
  sendAlertEmail,
}))

vi.mock('@/lib/db', () => ({
  prisma: {
    alertRule: {
      findMany: alertRuleFindMany,
      findFirst: vi.fn(),
    },
  },
}))

describe('checkAlertRules', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('pause_listings delegates to the stock engine without changing product stock', async () => {
    const { checkAlertRules } = await import('./checker')
    alertRuleFindMany.mockResolvedValue([
      {
        id: 'rule-1',
        productId: 'product-1',
        ruleType: 'low_stock',
        threshold: 5,
        action: 'pause_listings',
        product: {
          name: 'Demo',
          companyId: 'company-1',
          company: { alertEmail: 'ops@example.com' },
        },
      },
    ])
    pausePlatformListings.mockResolvedValue(undefined)

    await checkAlertRules('product-1', 3)

    expect(pausePlatformListings).toHaveBeenCalledWith('product-1', 'company-1')
  })
})
