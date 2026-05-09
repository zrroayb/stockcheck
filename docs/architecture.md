# Stokkontrol — Architecture Overview

Concise engineering map of this repo. The canonical domain rules remain: **`Product.stockCount` is the single source of truth**; marketplaces receive pushes, they do not write stock back except via webhook-driven deductions that go through **`lib/stock-engine.ts`**.

## Runtime processes

| Process | Entry | Responsibility |
|---------|-------|----------------|
| Web app | `next dev` / `next start` | Dashboard, authenticated API routes under `app/api/*`, webhooks under `app/api/webhooks/*` |
| Workers | `npm run workers` / `tsx workers/index.ts` | BullMQ consumers: sync, cancel, alerts, Hepsiburada poll (`workers/` + `dotenv`) |

Webhooks intentionally **enqueue** sync jobs; they never block on marketplace REST calls (`lib/queues.ts` → lazy queue construction so `next build` does not connect to Redis at import time).

## Data layer

- **PostgreSQL + Prisma** — `prisma/schema.prisma`; migrations live in `prisma/migrations/`.
- **Tenant boundary** — `Company` rows mirror Clerk orgs (`clerkOrgId`); dashboards filter by resolved `companyId` (`lib/auth.ts`).
- **Stock mutations** — `deductStock` / `creditStock` use `SELECT … FOR UPDATE` on `Product`; never raw `stockCount` updates elsewhere for business-critical paths.
- **Audit** — `StockEvent` is append-only; import/bulk/manual paths should log meaningful `eventType` + `note`.
- **Credentials** — AES-256-GCM in `lib/encrypt.ts`; `PlatformCredential.encryptedData` blob. **`ENCRYPTION_KEY` must be 64 hex chars** (paste output of `openssl rand -hex 32`; do not put shell substitution inside `.env` as literal text).

## Marketplace layer

| Path | Role |
|------|------|
| `lib/platforms/trendyol.ts`, `shopify.ts`, `hepsiburada.ts` | REST clients + webhook HMAC helpers |
| `lib/platforms/mock.ts` | DEV: any credential field `"MOCK"` → in-memory deterministic catalog |
| `lib/platforms/credentials.ts` | Zod-validated encrypt-on-save |

## Import pipeline

| Stage | Implementation |
|-------|----------------|
| Scan | `lib/import/scanner.ts` → `POST /api/import/scan`: parallel `listProducts` per linked platform; group by lowercase SKU → matched / conflict / unmatched |
| Apply | `lib/import/applier.ts` → `POST /api/import/apply`: upsert `Product` + `PlatformListing`, optional queue or inline push-back |

Existing products are matched on **`masterSku`** with **case-insensitive** semantics in the scanner so `SKU-001` and `sku-001` align.

## Auth & middleware

`middleware.ts` — Clerk protects app routes; `app/api/webhooks/**` stays public (HMAC verifies callers).

## Local development checklist

1. `docker compose up -d` (Postgres `:5432`, Redis `:6379`) or equivalent.
2. `.env`: `DATABASE_URL`, `REDIS_URL`, Clerk keys, **valid** `ENCRYPTION_KEY`.
3. `npx prisma migrate dev`.
4. `npm run dev:all` (Next + workers) for queues and sync behaviour.

Production: separate deployables for Next and workers; `npx prisma migrate deploy` before traffic.
