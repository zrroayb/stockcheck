# Stokkontrol — Multi-Marketplace Stock Control

A multi-tenant SaaS that keeps product stock in sync across **Trendyol**, **Shopify** and **Hepsiburada**.
The local database (`products.stockCount`) is the single source of truth — every marketplace reads from it,
nothing writes back into it.

## Stack

- **Next.js 14** (App Router) — dashboard + API + webhooks
- **PostgreSQL 16** + **Prisma** — durable storage, row-level locking for stock
- **Redis** + **BullMQ** — async sync queue with per-platform rate limiting
- **Clerk** — auth + multi-tenant organizations
- **Zod** — runtime validation on every input
- **Resend** — transactional alert emails
- **AES-256-GCM** — credentials encrypted at rest

## Quick Start

```bash
# 1. Install deps
npm install

# 2. Bring up Postgres + Redis
docker compose up -d

# 3. Generate an encryption key and copy env template
cp .env.example .env
echo "ENCRYPTION_KEY=\"$(openssl rand -hex 32)\"" >> .env
# (then fill in Clerk + marketplace secrets)

# 4. Run migrations
npx prisma migrate dev --name init

# 5. Run app + workers in parallel
npm run dev:all
```

App is at <http://localhost:3000>.

## Layout

```
app/             Next.js app router (dashboard pages, API routes, webhooks)
workers/         Standalone Node.js process (BullMQ workers)
lib/             Shared modules: db, redis, queues, encrypt, stock-engine, platforms, alerts
prisma/          Schema + migrations
```

## Key Invariants

1. **`Product.stockCount` is the only authoritative number.**
   Never set it directly with `prisma.update`; always go through `lib/stock-engine.ts`.
2. **`StockEvent` is append-only.**
   It is the audit ledger. `SUM(quantityDelta)` over events = current stock.
3. **`PlatformListing.stockOnPlatform`** is the last value we pushed.
   Sync workers compare to current `stockCount` and skip the API call when equal.
4. **Webhooks** verify HMAC, are idempotent on `(companyId, platform, platformOrderId)`,
   and never call marketplace APIs synchronously — they enqueue.

## Scripts

| Script              | What it does                                   |
| ------------------- | ---------------------------------------------- |
| `npm run dev`       | Next.js dev server                             |
| `npm run workers`   | BullMQ workers in watch mode                   |
| `npm run dev:all`   | Both of the above, concurrently                |
| `npm run build`     | Production Next.js build                       |
| `npm run typecheck` | `tsc --noEmit`                                 |
| `npm run lint`      | Next.js eslint                                 |

See [`docs/architecture.md`](./docs/architecture.md) for the long-form spec.
