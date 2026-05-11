-- Add plain, non-secret account identifier for webhook lookup.
ALTER TABLE "PlatformCredential" ADD COLUMN "externalAccountId" TEXT;

-- Each marketplace account should map to one company credential.
CREATE UNIQUE INDEX "PlatformCredential_platform_externalAccountId_key"
  ON "PlatformCredential"("platform", "externalAccountId");
