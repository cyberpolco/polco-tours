# POLCO TOURS

Tourism Operating System for **Namibia** and the **Democratic Republic of Congo**.
This repository is the **Phase 0 foundation** from the engineering design package
(Volumes 1–11). It establishes the pipeline, database, access control and quality
gates that every later phase builds on.

Stack (DR-001): **Next.js** (App Router, TypeScript) on **Vercel**, **Neon
PostgreSQL** with **Prisma**, **Better Auth** + RBAC, **DPO Pay** (Phase 1).
Launch operator: **Lam**, holding SUPERADMIN across both countries (DR-005).

---

## Phase 0 exit criteria

- [x] Repo structured by module boundaries (`src/modules/*`, Vol. 5 §5.2)
- [x] GitHub → Vercel pipeline with CI gates (`.github/workflows/ci.yml`)
- [x] Neon environments, branch-per-PR ready (`DATABASE_URL` / `DIRECT_URL`)
- [x] Auth + RBAC skeleton (`src/lib/auth.ts`, `src/lib/rbac.ts`)
- [x] Design tokens + landing surface (`tailwind.config.ts`, `src/app`)
- [x] Per-country tax table seeded (`prisma/seed.ts`, DR-006)
- [x] Observability baseline (`src/lib/logger.ts`, health probe)
- [x] **RLS proven by a cross-tenant test** (`tests/rls.cross-tenant.test.ts`)

The last item is the gate: `npm test` must pass, which means Row-Level Security
isolates tenants against a real Postgres.

---

## Local setup

```bash
# 1. Install
npm install

# 2. Configure env
cp .env.example .env        # fill DATABASE_URL / DIRECT_URL (Neon) + BETTER_AUTH_SECRET

# 3. Create schema, apply RLS policies, seed Lam + tax rates
npm run db:setup            # = db:push + db:rls + db:seed

# 4. Finalize Better Auth tables (emits into schema, then push)
npx @better-auth/cli@latest generate
npm run db:push

# 5. Run
npm run dev                 # http://localhost:3000  (health: /api/v1/health)
```

### Scripts

| Script | Purpose |
|--------|---------|
| `npm run dev` / `build` / `start` | Next.js dev / production build / serve |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit` |
| `npm test` / `test:watch` | Vitest (unit + RLS) |
| `npm run test:e2e` | Playwright smoke |
| `npm run db:push` | Sync Prisma schema to the DB |
| `npm run db:rls` | Apply `prisma/rls.sql` (RLS policies) |
| `npm run db:seed` | Seed Lam + per-country tax |
| `npm run db:setup` | push + rls + seed in one step |

> **Note on RLS + migrations:** `prisma db push`/`migrate` do not manage
> Row-Level Security. Always run `npm run db:rls` after a schema change that
> adds a tenant-scoped table, and add its policy to `prisma/rls.sql`.

---

## Neon

1. Create a project in an **EU region** (e.g. `eu-central-1`).
2. Copy the **pooled** connection string into `DATABASE_URL` (host contains
   `-pooler`) and the **direct** string into `DIRECT_URL`.
3. Enable **database branching** so each PR/preview gets an isolated branch.

## Vercel

1. Import this GitHub repo in Vercel (framework auto-detects Next.js).
2. Add env vars for **Production** and **Preview**: `DATABASE_URL`, `DIRECT_URL`,
   `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`.
3. `main` → Production; every PR → Preview deployment. Region pinned to `fra1`
   in `vercel.json` (keep close to the Neon EU region).

---

## Repository layout

```
src/
  app/                 # Next.js App Router (UI + /api/v1 route handlers)
    api/v1/health/     # liveness probe
  lib/                 # shared kernel: db, auth, rbac, errors, money, audit, logger
  modules/             # feature modules (independent, reusable) — Vol. 5 §5.2
    auth/              # reference module: domain · repository · service · index
  middleware.ts        # trace id + locale (rate limit / session hook in Phase 1)
prisma/
  schema.prisma        # Phase 0 data model
  rls.sql              # Row-Level Security policies (applied post-push)
  seed.ts              # Lam operator + superadmin + tax rates
tests/                 # Vitest: RLS cross-tenant, RBAC, money
e2e/                   # Playwright smoke
docs/decisions/        # DECISION_LOG.md (DR-007 living record)
.github/               # CI workflow + PR template (enforces the DR gate)
```

---

## Governance

Structural or integration changes must add a dated entry to
`docs/decisions/DECISION_LOG.md`, update the affected volume, and reference the
`DR-nnn` id in the PR (the template enforces this). See DR-007.
