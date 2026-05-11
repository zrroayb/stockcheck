import { prisma } from '@/lib/db'
import { decryptJSON } from '@/lib/encrypt'
import { enqueueSync } from '@/lib/queues'
import { setStockCount } from '@/lib/stock-engine'
import { getTrendyolClient } from '@/lib/platforms/trendyol'
import { getShopifyClient } from '@/lib/platforms/shopify'
import { getHepsiburadaClient } from '@/lib/platforms/hepsiburada'
import type {
  TrendyolCredentials,
  ShopifyCredentials,
  HepsiburadaCredentials,
} from '@/lib/platforms/types'
import type { ApplyPlan, Platform } from './types'

export type ApplyResult = {
  productsUpserted: number
  listingsUpserted: number
  pushSucceeded: number
  pushFailed: number
  errors: string[]
}

/**
 * Materialise an import plan into Product + PlatformListing rows.
 *
 * For each plan item:
 *   1. Upsert the Product (by companyId + masterSku).
 *   2. Upsert one PlatformListing per snapshot (carries platformProductId
 *      so future syncs know what to update on the marketplace).
 *   3. Append a StockEvent describing the import so the audit trail is
 *      complete from the very first stock entry.
 *
 * If `pushBack` is true, after writes we trigger a sync to every listing so
 * marketplaces converge on the new master stock. We try the BullMQ queue
 * first; if Redis isn't available we push directly via the marketplace API.
 */
export async function applyImport(
  companyId: string,
  plan: ApplyPlan
): Promise<ApplyResult> {
  const result: ApplyResult = {
    productsUpserted: 0,
    listingsUpserted: 0,
    pushSucceeded: 0,
    pushFailed: 0,
    errors: [],
  }

  // Cache decrypted credentials so we don't decrypt per-listing.
  const credCache = new Map<Platform, string>()
  if (plan.pushBack) {
    const creds = await prisma.platformCredential.findMany({ where: { companyId } })
    for (const c of creds) credCache.set(c.platform as Platform, c.encryptedData)
  }

  for (const item of plan.items) {
    try {
      const importNote = `Imported from ${item.snapshots.map((s) => s.platform).join(', ')}`
      const { product, created } = await prisma.$transaction(async (tx) => {
        // Treat masterSku as the canonical key (companyId + masterSku is
        // unique by schema). Existing product stock is reconciled below via
        // the stock engine so the audit ledger gets a delta event.
        const existing = await tx.product.findUnique({
          where: { companyId_masterSku: { companyId, masterSku: item.rawSku } },
        })

        const product = existing
          ? await tx.product.update({
              where: { id: existing.id },
              data: {
                name: item.name,
                barcode: item.barcode,
                ...(typeof item.reservedStock === 'number'
                  ? { reservedStock: item.reservedStock }
                  : {}),
              },
            })
          : await tx.product.create({
              data: {
                companyId,
                masterSku: item.rawSku,
                name: item.name,
                barcode: item.barcode,
                stockCount: item.chosenStock,
                reservedStock: item.reservedStock ?? 0,
              },
            })

        // One listing per snapshot.
        for (const snap of item.snapshots) {
          await tx.platformListing.upsert({
            where: {
              productId_platform: { productId: product.id, platform: snap.platform },
            },
            create: {
              productId: product.id,
              platform: snap.platform,
              platformProductId: snap.platformProductId,
              platformSku: snap.platformSku,
              // We haven't pushed yet; the field gets updated on a successful push.
              stockOnPlatform: 0,
              syncStatus: 'pending',
            },
            update: {
              platformProductId: snap.platformProductId,
              platformSku: snap.platformSku,
              syncStatus: 'pending',
            },
          })
        }

        if (!existing && item.chosenStock > 0) {
          // Initial stock for a new product is an absolute first ledger entry.
          await tx.stockEvent.create({
            data: {
              productId: product.id,
              sourcePlatform: 'manual',
              eventType: 'import',
              quantityDelta: item.chosenStock,
              note: importNote,
            },
          })
        }

        return { product, created: !existing }
      })

      if (!created) {
        await setStockCount({
          productId: product.id,
          stockCount: item.chosenStock,
          sourcePlatform: 'manual',
          eventType: 'import',
          note: importNote,
        })
      }

      result.productsUpserted += 1
      result.listingsUpserted += item.snapshots.length

      // Push-back: try queue first (so production retries/rate-limits work),
      // fall back to inline push so the demo works even without Redis.
      if (plan.pushBack) {
        const availableToPush = Math.max(0, item.chosenStock - (item.reservedStock ?? 0))
        for (const snap of item.snapshots) {
          const listing = await prisma.platformListing.findUnique({
            where: { productId_platform: { productId: product.id, platform: snap.platform } },
          })
          if (!listing) continue

          let pushed = false
          try {
            await enqueueSync({
              productId: product.id,
              companyId,
              platform: snap.platform,
              listingId: listing.id,
            })
            pushed = true // queued — worker will do the actual push
          } catch (queueErr) {
            // Redis unavailable. Fall back to inline push.
            const enc = credCache.get(snap.platform)
            if (!enc) {
              result.errors.push(
                `${snap.platform}/${item.rawSku}: queue failed and no creds cached`
              )
            } else {
              try {
                await pushInline(snap.platform, snap.platformProductId, availableToPush, enc)
                await prisma.platformListing.update({
                  where: { id: listing.id },
                  data: {
                    stockOnPlatform: availableToPush,
                    syncStatus: 'ok',
                    lastSyncedAt: new Date(),
                    errorMessage: null,
                  },
                })
                pushed = true
              } catch (inlineErr) {
                const msg =
                  inlineErr instanceof Error ? inlineErr.message : String(inlineErr)
                await prisma.platformListing.update({
                  where: { id: listing.id },
                  data: { syncStatus: 'error', errorMessage: msg },
                })
                result.errors.push(`${snap.platform}/${item.rawSku}: ${msg}`)
              }
            }
          }
          if (pushed) result.pushSucceeded += 1
          else result.pushFailed += 1
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      result.errors.push(`${item.rawSku}: ${msg}`)
    }
  }

  return result
}

async function pushInline(
  platform: Platform,
  platformProductId: string,
  newStock: number,
  encryptedData: string
): Promise<void> {
  switch (platform) {
    case 'trendyol': {
      const client = getTrendyolClient(decryptJSON<TrendyolCredentials>(encryptedData))
      await client.updateStock(platformProductId, newStock)
      return
    }
    case 'shopify': {
      const client = getShopifyClient(decryptJSON<ShopifyCredentials>(encryptedData))
      await client.setInventoryLevel(platformProductId, newStock)
      return
    }
    case 'hepsiburada': {
      const client = getHepsiburadaClient(decryptJSON<HepsiburadaCredentials>(encryptedData))
      await client.updateStock(platformProductId, newStock)
      return
    }
  }
}
