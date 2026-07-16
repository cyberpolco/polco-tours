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

-- -------------------------------------------------------------------- invoices
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON invoices;
CREATE POLICY tenant_isolation ON invoices
  USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::uuid);
-- Same anti-BOLA caveat as bookings: this isolates by org only, not by
-- tourist ownership -- that check lives in invoicing/service.ts, covered by
-- tests/api/invoices.security.test.ts.

-- -------------------------------------------------------------------- payments
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON payments;
CREATE POLICY tenant_isolation ON payments
  USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::uuid);

-- No policy for tax_rates: it is platform-wide reference data with no
-- organizationId column (DR-006) -- not tenant-scoped, intentionally.

-- ------------------------------------------------------------------- travelers
ALTER TABLE travelers ENABLE ROW LEVEL SECURITY;
ALTER TABLE travelers FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON travelers;
CREATE POLICY tenant_isolation ON travelers
  USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::uuid);

-- ------------------------------------------------------------------- documents
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON documents;
CREATE POLICY tenant_isolation ON documents
  USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::uuid);

-- -------------------------------------------------------------- addon_services
ALTER TABLE addon_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE addon_services FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON addon_services;
CREATE POLICY tenant_isolation ON addon_services
  USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::uuid);

-- -------------------------------------------------------------- booking_addons
ALTER TABLE booking_addons ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_addons FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON booking_addons;
CREATE POLICY tenant_isolation ON booking_addons
  USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::uuid);

-- ------------------------------------------------------------------- vehicles (DR-017)
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON vehicles;
CREATE POLICY tenant_isolation ON vehicles
  USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::uuid);
-- Same anti-BOLA caveat as bookings/invoices: this isolates by org only, not
-- by VEHICLE_OWNER ownership -- that check lives in fleet/service.ts, covered
-- by tests/api/fleet.security.test.ts.

-- ------------------------------------------------------------- driver_profiles (DR-017)
ALTER TABLE driver_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE driver_profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON driver_profiles;
CREATE POLICY tenant_isolation ON driver_profiles
  USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::uuid);
-- Same anti-BOLA caveat: isolates by org only, not by DRIVER self-ownership --
-- enforced in fleet/service.ts, covered by tests/api/fleet.security.test.ts.

-- ---------------------------------------------------------------- assignments (DR-018)
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON assignments;
CREATE POLICY tenant_isolation ON assignments
  USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::uuid);
-- Same anti-BOLA caveat: isolates by org only, not by TOUR_GUIDE/DRIVER/
-- VEHICLE_OWNER self-ownership -- enforced in assignment/service.ts, covered
-- by tests/api/assignment.security.test.ts.

-- ----------------------------------------------------------- visa_applications (DR-019)
ALTER TABLE visa_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE visa_applications FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON visa_applications;
CREATE POLICY tenant_isolation ON visa_applications
  USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::uuid);
-- Isolates by org only. Country-scoping for IMMIGRATION_OFFICER (BR-10) is
-- enforced in visa/service.ts's listForCountry, covered by
-- tests/api/visa.security.test.ts.

-- ----------------------------------------------------- organization_members (DR-026)
-- The `Membership` model existed since early on but was never queried
-- anywhere in src/, so this policy was never added either -- now that it's
-- the real multi-role source of truth for staff accounts, it needs the same
-- tenant isolation every other org-scoped table gets.
ALTER TABLE organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_members FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON organization_members;
CREATE POLICY tenant_isolation ON organization_members
  USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::uuid);

-- ----------------------------------------------------- maintenance_records (DR-029)
ALTER TABLE maintenance_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_records FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON maintenance_records;
CREATE POLICY tenant_isolation ON maintenance_records
  USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::uuid);

-- ----------------------------------------------------- starlink_kits (DR-029)
ALTER TABLE starlink_kits ENABLE ROW LEVEL SECURITY;
ALTER TABLE starlink_kits FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation ON starlink_kits;
CREATE POLICY tenant_isolation ON starlink_kits
  USING ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::uuid)
  WITH CHECK ("organizationId" = NULLIF(current_setting('app.org_id', true), '')::uuid);
