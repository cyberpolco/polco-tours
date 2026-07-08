-- POLCO TOURS — Row-Level Security policies (Phase 0)
-- Applied after `prisma db push` (which does not manage RLS). Idempotent.
-- Proves the Vol. 4 §4.3 / Vol. 8 defense-in-depth tenancy model at the DB layer.
--
-- Isolation contract: a query only sees rows whose "organizationId" matches
-- the session setting `app.org_id`. Column is quoted camelCase: Prisma maps
-- table names to snake_case via @@map but never @map's the organizationId
-- field itself (see schema.prisma).
--
-- NULLIF(..., '') before the ::uuid cast matters: current_setting(name, true)
-- returns NULL only the FIRST time a custom GUC is referenced on a connection.
-- Once any transaction on that (pooled) connection has done `SET LOCAL
-- app.org_id = ...`, Postgres registers a placeholder for it whose reset value
-- is '' (empty string) — so an unscoped query on a *reused* connection would
-- otherwise throw "invalid input syntax for type uuid" instead of failing
-- closed. NULLIF maps that '' back to NULL so the predicate is simply false.
--
-- FORCE is used so the table owner (the connection Prisma uses) is ALSO subject
-- to the policies; without FORCE, owners bypass RLS.

-- ---------------------------------------------------------------- tour_packages
ALTER TABLE tour_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tour_packages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON tour_packages;
CREATE POLICY tenant_isolation ON tour_packages
  USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::uuid);

-- ------------------------------------------------------------------ audit_logs
-- Append-only: readable within tenant scope (or platform-wide when org unset by
-- an admin connection), insertable by anyone, never updatable or deletable.
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_insert ON audit_logs;
CREATE POLICY audit_insert ON audit_logs
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS audit_select ON audit_logs;
CREATE POLICY audit_select ON audit_logs
  FOR SELECT USING (
    "organizationId" IS NULL
    OR "organizationId" = NULLIF(current_setting('app.org_id', true), '')::uuid
  );
-- No UPDATE/DELETE policy exists -> those commands are denied for all rows.

-- ------------------------------------------------------------------ departures
ALTER TABLE departures ENABLE ROW LEVEL SECURITY;
ALTER TABLE departures FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON departures;
CREATE POLICY tenant_isolation ON departures
  USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::uuid);

-- -------------------------------------------------------------------- bookings
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON bookings;
CREATE POLICY tenant_isolation ON bookings
  USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::uuid);
-- RLS isolates by organizationId only. It does NOT stop tourist A from
-- reading tourist B's booking in the same org -- that ownership check is
-- enforced in booking/service.ts and covered by tests/api/bookings.security.test.ts.
