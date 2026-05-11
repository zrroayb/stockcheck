# Environment Profiles

This project uses one active `.env` file at runtime, but real values should live in ignored profile files:

- `.env.development` for local development
- `.env.staging` for shared cloud testing
- `.env.production` for production

Create each file from its matching tracked example:

```bash
cp .env.development.example .env.development
cp .env.staging.example .env.staging
cp .env.production.example .env.production
```

Activate a profile by copying it into `.env`:

```bash
npm run env:use:development
npm run env:use:staging
npm run env:use:production
```

Check what is active without printing secrets:

```bash
npm run env:check
```

## Recommended Workflow

- Do daily coding against `development`.
- Use `staging` for Neon/cloud DB testing before production.
- Use `production` only when intentionally operating on live services.
- Never commit `.env`, `.env.development`, `.env.staging`, `.env.production`, or backups.

## Current Cloud Setup

- Neon Postgres can be used as `staging` or `production`, depending on which profile you place the URL in.
- Redis/worker can stay local or be added later with a cloud `REDIS_URL`.
- Vercel deployment can use the same variable names in its own dashboard when deployment is added.
