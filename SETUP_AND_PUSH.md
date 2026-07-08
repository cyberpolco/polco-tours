# Push this scaffold to GitHub → Vercel

You have the complete Phase 0 foundation. Get it live in ~15 minutes.

## 1. Create the repo and push

```bash
cd polco-tours                      # this unzipped folder
git init -b main
git add .
git commit -m "Phase 0: foundation (DR-008) — CI, Prisma+RLS, auth/RBAC, Lam seed"
git remote add origin git@github.com:<you>/polco-tours.git
git push -u origin main
```

## 2. Neon (database)

1. Create a Neon project in an EU region (e.g. eu-central-1).
2. Copy the **pooled** URL → you'll set it as `DATABASE_URL`.
   Copy the **direct** URL → `DIRECT_URL`.
3. Turn on database branching.

## 3. Vercel (hosting)

1. Import the GitHub repo at vercel.com/new (auto-detects Next.js).
2. Add environment variables for **Production** and **Preview**:
   `DATABASE_URL`, `DIRECT_URL`, `BETTER_AUTH_SECRET` (`openssl rand -base64 32`),
   `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`.
3. Deploy. `main` → Production; every PR → Preview.

## 4. Initialize the database once

```bash
cp .env.example .env    # paste the Neon URLs + a BETTER_AUTH_SECRET
npm install
npm run db:setup        # schema + RLS policies + Lam/tax seed
npx @better-auth/cli@latest generate && npm run db:push   # auth tables
```

## 5. Confirm the exit criterion

```bash
npm test                # RLS cross-tenant test must pass = Phase 0 done
```

CI runs the same on every push (with its own Postgres). When the pipeline is
green and `main` is deployed on Vercel, Phase 0 is complete and Phase 1 (core
booking) begins.

---

Tip: once you connect a GitHub tool here, I can open PRs and push changes
directly instead of you copying files.
