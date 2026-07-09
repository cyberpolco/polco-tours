# POLCO TOURS — Decision & Change Log

Mirror of the governance record in the master design package. **Living-document
mandate (DR-007):** every structural change (data model, module boundary,
permission, business rule) and every integration change (add/remove/reconfigure
an external service) is recorded here with a dated entry, the affected volume(s)
updated, and the DR id referenced in the PR — before merge. Enforced by the PR
template and the Definition of Done (Vol. 10 §10.3).

## Approved decisions

| ID | Date | Decision | Affects |
|----|------|----------|---------|
| DR-001 | 2026-07-07 | Stack: Next.js full-stack (App Router, TS) + Neon PostgreSQL + Prisma, modular monolith. | V5, V6, V9, V11 |
| DR-002 | 2026-07-07 | Payment gateway locked to DPO Pay (hosted page, v6, SAQ-A). Commercial terms pending (OI-01). | V3, V7, V8, V11 |
| DR-003 | 2026-07-07 | Brand confirmed: `polcotours` for website + all social handles; polcotours.com primary. | V1, V11 |
| DR-004 | 2026-07-07 | Deployment on Vercel for all environments; GitHub → Vercel CI/CD. | V9 |
| DR-005 | 2026-07-07 | Launch tenancy: single operator "Lam" (Namibia + DRC); Lam holds SUPERADMIN. Multi-tenant RLS retained. | V4, V6 |
| DR-006 | 2026-07-07 | Per-country effective-dated tax (DRC 16% / Namibia 15%), superseding flat 16%. | V1, V2, V3 |
| DR-007 | 2026-07-07 | Living-document mandate adopted (this policy). | All |
| DR-008 | 2026-07-07 | Phase 0 foundation scaffolded: repo, CI (GitHub→Vercel), Prisma schema + RLS, Better Auth + RBAC skeleton, design tokens, tax table, observability baseline. Implements DR-001/004/005/006. | V5, V6, V9, V10 |
| DR-009 | 2026-07-08 | Security-driven dependency bump on the DR-001 stack: Next.js 15.1.6 → 15.5.20, better-auth → 1.6.23, zod → 4.4.3, Playwright → 1.61.1. No stack change, patched releases of already-approved majors. | V9 |
| DR-010 | 2026-07-08 | OI-04 resolved: object storage on **Vercel Blob**, region `fra1` (matches DR-004 hosting region). Chosen over Cloudflare R2 / AWS S3 to avoid a second infra vendor/credential model alongside the existing Vercel deployment. Passport/visa documents (NFR: encryption + short-lived signed URLs + access logging, DB stores references only) will use this store starting when document upload lands (Phase 2). | V8, V9 |
| DR-011 | 2026-07-08 | Phase 1 Increment 1 (booking core, no payments): `TourPackage` extended with real catalog fields; new `Departure` (scheduled instance, own capacity) and `Booking` models — a "hold" is `Booking.status=HELD` + `holdExpiresAt`, not a separate table, using DB lazy expiry (no Redis/QStash for this increment). New permissions `booking.confirm`/`booking.cancel`. New tourists auto-join the primary org (Lam) at signup via a better-auth hook. DPO payments/invoicing/notifications/i18n explicitly deferred to later increments (OI-01 still open). | V1, V4, V6, V7 |
| DR-012 | 2026-07-09 | Phase 1 Increment 2 (invoicing + stubbed DPO payments): new `invoicing` module — `Invoice` (1:1 with `Booking`) + `Payment` (sub-concept, per DR-011's fold-into-one-module precedent, not a sibling module) — snapshots tax jurisdiction/rate at invoice-issue time from the platform-wide `TaxRate` table (DR-006) via new `src/lib/tax.ts` (its first reader). New business rule: 40%/60% deposit/balance split on the post-tax total, half-up rounding, `balance = total - deposit` (no independent rounding, avoids drift). DPO integration stubbed behind a `PaymentGateway` interface (charter rule 8) — a staff-only route manually resolves a `PENDING` payment to `SUCCEEDED`/`FAILED`, standing in for DPO's future webhook; only the adapter changes when OI-01's commercial terms land, no caller does. Booking confirmation remains deliberately uncoupled from invoice/payment status this increment. New permissions `invoice.read`/`payment.initiate`/`payment.resolve` (tourist gets the first two, only staff get `payment.resolve` — anti-fraud). `docs/design-package/` volumes still don't exist in-repo; "Affects" below only tags ids per prior-DR convention. | V1, V4, V6, V7 |
| DR-013 | 2026-07-09 | Phase 1 Increment 3 (notifications + notification-content i18n): new `notifications` module (`domain`/`gateway`/`service`/`index`, deliberately no `repository.ts` -- owns no table, delivery outcomes recorded via the existing `audit()` lib, not a bespoke log model) wired into booking confirm/cancel and invoicing payment-resolve. Real (not permanently-stubbed) HTTP adapters for Resend (email), WhatsApp Cloud API, and Africa's Talking (SMS) behind a shared `NotificationChannelGateway` interface (charter rule 8) -- each gated by its own env var(s), throwing before any network attempt when unconfigured (true in every environment today), so the WhatsApp→SMS→email fallback chain always degrades gracefully and a channel outage never fails a booking. New `User.phone`/`preferredLocale` (`Locale` enum EN/FR) columns + a `profile.write` self-service `PATCH /users/me` (every role except `IMMIGRATION_OFFICER`, an interpretive reading of BR-10). i18n scope this increment is notification templates only (EN/FR) -- existing `Errors.*` API error messages stay English-only, deferred (would require threading locale through `AuthContext`). | V1, V4, V6, V7, V8 |
| DR-014 | 2026-07-09 | First authenticated frontend: staff-only pilot dashboard (`src/app/staff/...`) for Lam to manage bookings/invoices/payments, sequenced ahead of a future tourist-facing site. Mounted Better Auth's own HTTP route for the first time (`src/app/api/auth/[...all]/route.ts`, `toNextJsHandler`) -- previously configured but never wired up. New `authService.getUserByEmail` (thin wrapper, no new DB capability) so staff can book on behalf of an existing tourist found by email. Business rule: staff may only book for tourists who already have an account this increment -- creating an account for a brand-new, never-signed-up client ("lead" capture) is explicitly deferred, since `Booking.touristUserId` is a hard FK and no such capability exists yet. Real payment collection during the pilot is still manual (`payment.resolve`) -- the DPO gateway remains stubbed (OI-01 still open); a "payment link" in the UI is real, but doesn't yet move real money. New CI job runs Playwright e2e (previously installed but never invoked in CI) against its own Postgres bootstrap, mirroring the `quality` job's setup. | V4, V5, V7, V9 |

## Open items

| ID | Item | Owner | Blocks | Status |
|----|------|-------|--------|--------|
| OI-01 | DPO written commercial terms (fee %, EUR, mobile money, settlement SLA, reserve %). | Founder | Phase 1 finance | OPEN |
| OI-02 | Trademark clearance for polcotours / POLCO TOURS in NA + DRC. | Founder / counsel | Public launch | OPEN |
| OI-03 | Lam per-market legal registrations (NTB/BIPA/NamRA; DARA/DGI/Min. Tourism). | Lam / ops | Go-live | OPEN |
| OI-04 | Object-storage provider + EU region confirmation (documents + Neon). | Tech lead | Phase 0 close | RESOLVED — DR-010, 2026-07-08 |
| OI-05 | Resend account + API key. | Founder / ops | Real email notifications | OPEN |
| OI-06 | WhatsApp Cloud API access (Meta Business verification, phone number). | Founder / ops | Real WhatsApp notifications | OPEN |
| OI-07 | Africa's Talking account + API key (SMS). | Founder / ops | Real SMS notifications | OPEN |

## How to add a decision

1. Append a `DR-nnn` row above with today's date and the affected volumes.
2. Update the relevant volume section(s) in the master design package.
3. Reference the `DR-nnn` id in your PR description (the template has a checkbox).
