import { prisma } from '@/lib/db'
import { triggerPlatformSync } from '@/lib/stock-engine'
import { sendAlertEmail } from './email'

type RuleWithProduct = Awaited<ReturnType<typeof prisma.alertRule.findFirst>> & {
  product: {
    name: string
    companyId: string
    company: { alertEmail: string | null }
  }
}

/**
 * Evaluate every enabled alert rule for a product after its stock changes.
 *
 * Called from the alert worker (queued by stock-engine after each deduction
 * or credit). Keeping this out of the request path means slow email/Slack
 * sends never delay the webhook response.
 */
export async function checkAlertRules(productId: string, newStockCount: number): Promise<void> {
  const rules = await prisma.alertRule.findMany({
    where: { productId, enabled: true },
    include: {
      product: {
        select: {
          name: true,
          companyId: true,
          company: { select: { alertEmail: true } },
        },
      },
    },
  })

  for (const rule of rules) {
    const triggered =
      (rule.ruleType === 'low_stock' && newStockCount <= rule.threshold) ||
      (rule.ruleType === 'out_of_stock' && newStockCount <= 0) ||
      (rule.ruleType === 'overstock' && newStockCount >= rule.threshold)

    if (!triggered) continue

    try {
      await executeAction(rule as RuleWithProduct, newStockCount)
    } catch (err) {
      console.error(`[alerts] failed to execute rule ${rule.id}:`, err)
    }
  }
}

async function executeAction(rule: RuleWithProduct, currentStock: number): Promise<void> {
  switch (rule.action) {
    case 'notify_email': {
      const to = rule.product.company.alertEmail
      if (!to) {
        console.warn(`[alerts] rule ${rule.id}: notify_email but company has no alertEmail set`)
        return
      }
      await sendAlertEmail({
        to,
        productName: rule.product.name,
        currentStock,
        threshold: rule.threshold,
        ruleType: rule.ruleType as 'low_stock' | 'out_of_stock' | 'overstock',
      })
      break
    }

    case 'pause_listings': {
      await prisma.platformListing.updateMany({
        where: { productId: rule.productId },
        data: { syncStatus: 'paused' },
      })
      // Push 0 stock so the marketplaces stop showing the product.
      await prisma.product.update({
        where: { id: rule.productId },
        data: { stockCount: 0 },
      })
      await triggerPlatformSync(rule.productId, rule.product.companyId)
      break
    }

    case 'notify_slack': {
      // TODO: Slack webhook integration
      console.warn(`[alerts] rule ${rule.id}: notify_slack action not yet implemented`)
      break
    }

    default:
      console.warn(`[alerts] rule ${rule.id}: unknown action "${rule.action}"`)
  }
}
