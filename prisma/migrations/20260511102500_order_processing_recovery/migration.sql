-- Track webhook processing failures so retries can safely resume instead of
-- being treated as completed duplicates.
ALTER TABLE "Order" ADD COLUMN "processingError" TEXT;
ALTER TABLE "Order" ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "Order" ALTER COLUMN "status" SET DEFAULT 'processing';

-- Store platform-specific cancel identifiers, especially Trendyol order line ids.
ALTER TABLE "OrderItem" ADD COLUMN "cancelReference" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE "OrderItem" ADD COLUMN "processedAt" TIMESTAMP(3);

-- We normalize incoming webhook line items by SKU before writing them. This
-- lets retries check whether a line was already recorded.
CREATE UNIQUE INDEX "OrderItem_orderId_platformSku_key" ON "OrderItem"("orderId", "platformSku");
