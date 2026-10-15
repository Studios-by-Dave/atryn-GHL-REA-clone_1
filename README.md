# Atryn

White-label, multi-tenant **local business growth OS** for web agencies and their clients.

> Capture more leads, follow up automatically, book more appointments, and prove revenue results.

Original product. Architecture and roadmap live in [`docs/INITIAL_DELIVERABLE.md`](docs/INITIAL_DELIVERABLE.md).

## Stack

- Next.js 16 (App Router) · TypeScript · Tailwind CSS 4
- PostgreSQL 16 · Prisma 7 (Rust-free client + `pg` adapter)
- Redis 7 + BullMQ (planned, Phase 5) · Docker Compose
- Auth.js (Phase 1) · Resend (email) · Twilio (SMS) · Stripe (billing)

## Quick start

```bash
cp .env.example .env          # fill in values (defaults work with compose)
docker compose up -d          # postgres, redis, mailpit
npm install                   # also runs `prisma generate`
npm run db:migrate            # apply prisma/migrations
npm run db:seed               # demo org, sub-account, contact, pipeline
npm run dev                   # http://localhost:3000
```

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` | Dev server (Turbopack) |
| `npm run build` | Production build |
| `npm run lint` / `typecheck` / `test` | CI gates |
| `npm run db:migrate` | Create/apply dev migrations |
| `npm run db:deploy` | Apply migrations (CI/prod) |
| `npm run db:seed` | Seed demo data |

## Repository layout

See `docs/INITIAL_DELIVERABLE.md` §2. Key roots: `src/app` (routes), `src/server` (db/rbac/services/repositories), `src/features` (domain UI), `prisma` (schema/migrations/seed).

## License

Private. All rights reserved.
