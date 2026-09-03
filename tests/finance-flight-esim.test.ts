import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../src/lib/db';
import { financeService } from '@modules/finance';
import type { AuthContext } from '@modules/auth';
import { resolvePermissionsForRoles } from '@lib/rbac';

/**
 * DR-222 -- Flight Ticket / eSIM add-on rate tables: Airport, FlightFareRate,
 * EsimDataPlanRate. All three are platform-wide reference data (no
 * organizationId, no RLS policy), same precedent as every other Operational
 * Rate table (see tests/api/finance-rates.api.test.ts) -- but unlike those
 * seven, no REST route exists for these three yet (only the staff Server
 * Actions under src/app/staff/(dashboard)/finance/rates/{flights,esim}/
 * call financeService directly), so this file exercises the service layer
 * directly instead of going through a route handler -- same ctx-fixture
 * convention as tests/booking-guest-dates.test.ts and
 * tests/booking-lookup.test.ts (a hand-built AuthContext, permissions
 * resolved via the real rbac.ts resolvePermissionsForRoles so the fixture
 * reflects actual production role grants rather than a hand-picked set).
 */
const admin = new PrismaClient();
const suffix = `${Date.now()}`;
const TEST_COUNTRY = 'ZU'; // fictitious, distinct from every other file's TEST_COUNTRY literal
const TEST_IATA_ORIGIN = 'ZU1';
const TEST_IATA_DEST = 'ZU2';
const TEST_IATA_EXTRA = 'ZU3'; // used only by the rejected-write assertion, never actually created

let orgId: string;
let superadminId: string;
let operatorId: string;
let originAirportId: string;
let destinationAirportId: string;
let createdFlightFareRateId: string;
let createdEsimRateId: string;

const superadminCtx: AuthContext = {
  userId: '',
  roles: ['SUPERADMIN'],
  permissions: resolvePermissionsForRoles(['SUPERADMIN']),
  organizationId: '',
  sessionId: 'test-session-superadmin',
  mustChangePassword: false,
};

// finance_config.write is granted to nobody but SUPERADMIN's hardcoded
// wildcard (DR-159) -- a real resolved TOUR_OPERATOR permission set already
// lacks it, so requireRateWriter's assertCan rejects before its own
// SUPERADMIN role-identity backstop is ever reached.
const operatorCtx: AuthContext = {
  userId: '',
  roles: ['TOUR_OPERATOR'],
  permissions: resolvePermissionsForRoles(['TOUR_OPERATOR']),
  organizationId: '',
  sessionId: 'test-session-operator',
  mustChangePassword: false,
};

beforeAll(async () => {
  const org = await admin.organization.create({
    data: { name: `FINANCE-FLIGHT-ESIM-TEST-${suffix}`, countries: ['NA'], status: 'VERIFIED' },
  });
  orgId = org.id;
  superadminCtx.organizationId = orgId;
  operatorCtx.organizationId = orgId;

  const [superadmin, operator] = await Promise.all([
    admin.user.create({ data: { email: `superadmin-flight-esim-${suffix}@example.test`, role: 'SUPERADMIN', organizationId: orgId } }),
    admin.user.create({ data: { email: `operator-flight-esim-${suffix}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId } }),
  ]);
  superadminId = superadmin.id;
  operatorId = operator.id;
  superadminCtx.userId = superadminId;
  operatorCtx.userId = operatorId;
});

afterAll(async () => {
  // Guard: if beforeAll failed before orgId was assigned, Prisma silently
  // drops the undefined where-clause value, turning cleanup into an
  // unscoped deleteMany that wipes the whole table -- this has hit real
  // production data twice. Skip cleanup entirely rather than risk it.
  if (!orgId) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  await admin.esimDataPlanRate.deleteMany({ where: { country: TEST_COUNTRY } });
  await admin.flightFareRate.deleteMany({ where: { airline: { startsWith: 'Fixture' } } });
  await admin.airport.deleteMany({ where: { iataCode: { in: [TEST_IATA_ORIGIN, TEST_IATA_DEST, TEST_IATA_EXTRA] } } });
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('Airport CRUD (DR-222)', () => {
  it('a SUPERADMIN creates two fixture airports', async () => {
    const origin = await financeService.createAirport(superadminCtx, {
      iataCode: TEST_IATA_ORIGIN,
      name: 'Fixture Origin Airport',
      city: 'Fixture City',
      country: TEST_COUNTRY,
      active: true,
    });
    expect(origin.iataCode).toBe(TEST_IATA_ORIGIN);
    originAirportId = origin.id;

    const destination = await financeService.createAirport(superadminCtx, {
      iataCode: TEST_IATA_DEST,
      name: 'Fixture Destination Airport',
      city: 'Fixture City 2',
      country: TEST_COUNTRY,
      active: true,
    });
    destinationAirportId = destination.id;
  });

  it('a non-SUPERADMIN (TOUR_OPERATOR) cannot create an airport', async () => {
    await expect(
      financeService.createAirport(operatorCtx, {
        iataCode: TEST_IATA_EXTRA,
        name: 'Should not be created',
        city: 'Nowhere',
        country: TEST_COUNTRY,
        active: true,
      }),
    ).rejects.toThrow();
  });

  it('lists airports including the fixtures', async () => {
    const airports = await financeService.listAirports(superadminCtx);
    expect(airports.some((a) => a.id === originAirportId)).toBe(true);
    expect(airports.some((a) => a.id === destinationAirportId)).toBe(true);
  });

  it('updates an airport in place', async () => {
    const updated = await financeService.updateAirport(superadminCtx, originAirportId, {
      iataCode: TEST_IATA_ORIGIN,
      name: 'Fixture Origin Airport (renamed)',
      city: 'Fixture City',
      country: TEST_COUNTRY,
      active: false,
    });
    expect(updated.name).toBe('Fixture Origin Airport (renamed)');
    expect(updated.active).toBe(false);

    // Restore active=true -- listPublicAirports (below) and the
    // FlightFareRate fixtures both depend on this airport staying active.
    await financeService.updateAirport(superadminCtx, originAirportId, {
      iataCode: TEST_IATA_ORIGIN,
      name: 'Fixture Origin Airport (renamed)',
      city: 'Fixture City',
      country: TEST_COUNTRY,
      active: true,
    });
  });

  it('a non-SUPERADMIN cannot update or delete an airport', async () => {
    await expect(
      financeService.updateAirport(operatorCtx, originAirportId, {
        iataCode: TEST_IATA_ORIGIN,
        name: 'Hijacked',
        city: 'Nowhere',
        country: TEST_COUNTRY,
        active: true,
      }),
    ).rejects.toThrow();
    await expect(financeService.deleteAirport(operatorCtx, originAirportId)).rejects.toThrow();
  });
});

describe('FlightFareRate CRUD (DR-222)', () => {
  it('a SUPERADMIN creates a flight fare rate', async () => {
    const rate = await financeService.createFlightFareRate(superadminCtx, {
      originAirportId,
      destinationAirportId,
      airline: 'Fixture Air',
      flightClass: 'ECONOMY',
      priceMinor: 50000,
      currency: 'USD',
    });
    expect(rate.airline).toBe('Fixture Air');
    expect(rate.flightClass).toBe('ECONOMY');
    createdFlightFareRateId = rate.id;
  });

  it('a non-SUPERADMIN cannot create a flight fare rate', async () => {
    await expect(
      financeService.createFlightFareRate(operatorCtx, {
        originAirportId,
        destinationAirportId,
        airline: 'Fixture Air Rejected',
        flightClass: 'BUSINESS',
        priceMinor: 1000,
        currency: 'USD',
      }),
    ).rejects.toThrow();
  });

  it('lists flight fare rates including the fixture', async () => {
    const rates = await financeService.listFlightFareRates(superadminCtx);
    expect(rates.some((r) => r.id === createdFlightFareRateId)).toBe(true);
  });

  it("updates the rate's price in place (no reapply sweep -- resolved live, never snapshotted)", async () => {
    const updated = await financeService.updateFlightFareRate(superadminCtx, createdFlightFareRateId, {
      originAirportId,
      destinationAirportId,
      airline: 'Fixture Air',
      flightClass: 'ECONOMY',
      priceMinor: 60000,
      currency: 'USD',
    });
    expect(updated.priceMinor).toBe(60000);
  });

  it('a non-SUPERADMIN cannot update or delete a flight fare rate', async () => {
    await expect(
      financeService.updateFlightFareRate(operatorCtx, createdFlightFareRateId, {
        originAirportId,
        destinationAirportId,
        airline: 'Hijacked',
        flightClass: 'ECONOMY',
        priceMinor: 1,
        currency: 'USD',
      }),
    ).rejects.toThrow();
    await expect(financeService.deleteFlightFareRate(operatorCtx, createdFlightFareRateId)).rejects.toThrow();
  });
});

describe('EsimDataPlanRate CRUD (DR-222)', () => {
  it('a SUPERADMIN creates an eSIM data plan rate', async () => {
    const rate = await financeService.createEsimDataPlanRate(superadminCtx, {
      country: TEST_COUNTRY,
      dataAllowanceGb: 10,
      priceMinor: 2500,
      currency: 'USD',
    });
    expect(rate.dataAllowanceGb).toBe(10);
    createdEsimRateId = rate.id;
  });

  it('a non-SUPERADMIN cannot create an eSIM data plan rate', async () => {
    await expect(
      financeService.createEsimDataPlanRate(operatorCtx, {
        country: TEST_COUNTRY,
        dataAllowanceGb: 5,
        priceMinor: 100,
        currency: 'USD',
      }),
    ).rejects.toThrow();
  });

  it('lists eSIM data plan rates including the fixture', async () => {
    const rates = await financeService.listEsimDataPlanRates(superadminCtx);
    expect(rates.some((r) => r.id === createdEsimRateId)).toBe(true);
  });

  it("updates the rate's price in place (no reapply sweep -- resolved live, never snapshotted)", async () => {
    const updated = await financeService.updateEsimDataPlanRate(superadminCtx, createdEsimRateId, {
      country: TEST_COUNTRY,
      dataAllowanceGb: 10,
      priceMinor: 3000,
      currency: 'USD',
    });
    expect(updated.priceMinor).toBe(3000);
  });

  it('a non-SUPERADMIN cannot update or delete an eSIM data plan rate', async () => {
    await expect(
      financeService.updateEsimDataPlanRate(operatorCtx, createdEsimRateId, {
        country: TEST_COUNTRY,
        dataAllowanceGb: 999,
        priceMinor: 1,
        currency: 'USD',
      }),
    ).rejects.toThrow();
    await expect(financeService.deleteEsimDataPlanRate(operatorCtx, createdEsimRateId)).rejects.toThrow();
  });
});

describe('public no-ctx reads (DR-222 -- guest checkout, anonymous session)', () => {
  it('listPublicAirports returns only active airports, including both fixtures', async () => {
    const airports = await financeService.listPublicAirports();
    expect(airports.every((a) => a.active)).toBe(true);
    expect(airports.some((a) => a.id === originAirportId)).toBe(true);
    expect(airports.some((a) => a.id === destinationAirportId)).toBe(true);
  });

  it('listPublicFlightFareOptions returns only currently-effective rates, including the fixture', async () => {
    const options = await financeService.listPublicFlightFareOptions();
    expect(options.some((r) => r.id === createdFlightFareRateId)).toBe(true);
  });

  it('listPublicEsimPlans filters by country and sorts by ascending data allowance', async () => {
    // A second, smaller-allowance plan for the same fictitious country --
    // proves the ascending sort, not just single-row filtering.
    const smaller = await financeService.createEsimDataPlanRate(superadminCtx, {
      country: TEST_COUNTRY,
      dataAllowanceGb: 3,
      priceMinor: 1000,
      currency: 'USD',
    });
    try {
      const plans = await financeService.listPublicEsimPlans(TEST_COUNTRY);
      expect(plans.every((p) => p.country === TEST_COUNTRY)).toBe(true);
      expect(plans.some((p) => p.id === createdEsimRateId)).toBe(true);
      expect(plans.some((p) => p.id === smaller.id)).toBe(true);
      const allowances = plans.map((p) => p.dataAllowanceGb);
      const sortedAscending = [...allowances].sort((a, b) => a - b);
      expect(allowances).toEqual(sortedAscending);
      // A different, unrelated country never sees this fictitious plan.
      const other = await financeService.listPublicEsimPlans('NA');
      expect(other.some((p) => p.id === smaller.id)).toBe(false);
    } finally {
      await financeService.deleteEsimDataPlanRate(superadminCtx, smaller.id);
    }
  });
});
