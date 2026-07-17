-- Custom Postgres sequences backing Booking.bookingReference (DR-027) and
-- TourPackage.packageReference (DR-028). Prisma's schema DSL can't express a
-- custom formatted default, so these are created out-of-band via this script
-- (same convention as prisma/rls.sql for RLS policies) rather than through
-- `prisma db push`. IF NOT EXISTS makes this safe to re-run against an
-- already-provisioned database (production/dev Neon) without resetting its
-- current counter -- those sequences were originally created by hand and
-- this file is what should have captured that from the start (see the
-- CLAUDE.md gotcha on the CI/fresh-environment gap this caused).

CREATE SEQUENCE IF NOT EXISTS package_reference_seq;
CREATE SEQUENCE IF NOT EXISTS booking_reference_seq;

-- Explicit, not relied-on-by-assumption: the runtime app role (`polco_app`)
-- only has DML grants, not DDL ownership (see the CLAUDE.md gotcha on Neon
-- role setup), so this script is run with an owning credential (mirrors
-- `db:push`/`db:rls`) and must grant USAGE itself rather than assume a
-- separate ALTER DEFAULT PRIVILEGES statement already covers sequences. In
-- CI, `polco_app` is both creator and grantee here (self-grant, harmless).
GRANT USAGE, SELECT ON SEQUENCE package_reference_seq TO polco_app;
GRANT USAGE, SELECT ON SEQUENCE booking_reference_seq TO polco_app;
