-- POLCO TOURS — Row-Level Security policies (Phase 0)
-- Applied after `prisma db push` (which does not manage RLS). Idempotent.
-- Proves the Vol. 4 §4.3 / Vol. 8 defense-in-depth tenancy model at the DB layer.
--
-- Isolation contract: a query only sees rows whose organization_id matches the
-- session setting `app.org_id`. When the setting is absent, current_setting(..,
-- true) returns NULL and every tenant predicate fails closed — deny by default.
--
-- FORCE is used so the table owner (the connection Prisma uses) is ALSO subject
-- to the policies; without FORCE, owners bypass RLS.

-- ---------------------------------------------------------------- tour_packages
ALTER TABLE tour_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE tour_packages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON tour_packages;
CREATE POLICY tenant_isolation ON tour_packages
  USING (organization_id = current_setting('app.org_id', true)::uuid)
  WITH CHECK (organization_id = current_setting('app.org_id', true)::uuid);

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
    organization_id IS NULL
    OR organization_id = current_setting('app.org_id', true)::uuid
  );
-- No UPDATE/DELETE policy exists -> those commands are denied for all rows.
