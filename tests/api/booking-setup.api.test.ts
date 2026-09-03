import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { testPackageReference } from '../helpers/package-reference';
import { NextRequest } from 'next/server';
import { PrismaClient } from '@prisma/client';
import { prisma, withOrg } from '../../src/lib/db';
import { getEffectivePlatformRate } from '../../src/lib/platform-rate';
import { loginAs } from '../helpers/test-auth';
import { generateBookingReference } from '../../src/modules/booking';

// Vercel Blob needs a real BLOB_READ_WRITE_TOKEN this repo's CI does not
// provision (same category of gap as OI-05/06/07 for notification
// providers) -- mock only the network-touching gateway boundary so this
// still exercises the real route/service/repository/RLS path against
// Postgres, same spirit as invoicing's StubDpoGateway but at the test edge
// instead of in production code (DR-015 wires up the *real* adapter).
const { uploadMock, downloadMock } = vi.hoisted(() => ({
  uploadMock: vi.fn(async (pathname: string) => ({ pathname })),
  downloadMock: vi.fn(async () => ({
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('%PDF-fixture'));
        controller.close();
      },
    }),
  })),
}));
vi.mock('@modules/documents/gateway', () => ({
  blobGateway: { upload: uploadMock, download: downloadMock },
  BlobGatewayError: class BlobGatewayError extends Error {},
}));

const { GET: getBooking } = await import('../../src/app/api/v1/bookings/[bookingId]/route');
const { GET: getInvoice } = await import('../../src/app/api/v1/bookings/[bookingId]/invoice/route');
const { GET: listTravelers, POST: addTraveler } = await import('../../src/app/api/v1/bookings/[bookingId]/travelers/route');
const { GET: downloadPassport, POST: uploadPassport } = await import(
  '../../src/app/api/v1/bookings/[bookingId]/travelers/[travelerId]/passport/route'
);
const { POST: setAddons } = await import('../../src/app/api/v1/bookings/[bookingId]/addons/route');

const admin = new PrismaClient();
const country = `SETUP${Date.now()}`.slice(0, 10);

let orgId: string;
let bookingId: string;
let addonServiceId: string;
let visaAddonServiceId: string;
let touristAId: string;
let guideId: string;
let operatorId: string;
let leadTravelerId: string;
let platformFeeRateBp: number;

function jsonRequest(method: string, url: string, headers: Headers, body?: unknown): NextRequest {
  const h = new Headers(headers);
  h.set('Content-Type', 'application/json');
  return new NextRequest(url, { method, headers: h, body: body !== undefined ? JSON.stringify(body) : undefined });
}

beforeAll(async () => {
  await admin.taxRate.create({ data: { country, taxType: 'VAT', rateBp: 1000 } });
  ({ rateBp: platformFeeRateBp } = await getEffectivePlatformRate());

  const org = await admin.organization.create({
    data: { name: `SETUP-API-TEST-${Date.now()}`, countries: [country], status: 'VERIFIED' },
  });
  orgId = org.id;

  const [touristA, guide, operator] = await Promise.all([
    admin.user.create({ data: { email: `setup-a-${Date.now()}@example.test`, role: 'TOURIST', organizationId: orgId } }),
    admin.user.create({ data: { email: `setup-g-${Date.now()}@example.test`, role: 'TOUR_GUIDE', organizationId: orgId } }),
    admin.user.create({ data: { email: `setup-op-${Date.now()}@example.test`, role: 'TOUR_OPERATOR', organizationId: orgId } }),
  ]);
  touristAId = touristA.id;
  guideId = guide.id;
  operatorId = operator.id;

  await withOrg(orgId, async (tx) => {
    const pkg = await tx.tourPackage.create({
      data: {
        organizationId: orgId,
        packageReference: testPackageReference(),
        title: 'Setup Fixture Safari',
        description: 'Fixture for booking-setup API tests.',
        country,
        priceMinor: 10000,
        currency: 'USD',
        status: 'PUBLISHED_AVAILABLE',
      },
    });
    const departure = await tx.departure.create({
      data: { organizationId: orgId, tourPackageId: pkg.id, startDate: new Date('2026-09-01'), capacity: 5, status: 'SCHEDULED' },
    });
    const booking = await tx.booking.create({
      data: {
        organizationId: orgId,
        departureId: departure.id,
        touristUserId: touristAId,
        bookingReference: generateBookingReference(),
        seats: 2,
        priceMinor: 20000,
        currency: 'USD',
      },
    });
    bookingId = booking.id;
    const visaAddon = await tx.addonService.create({
      data: {
        organizationId: orgId,
        code: 'VISA_ASSISTANCE',
        name: 'Visa assistance',
        description: 'Fixture add-on -- selecting this is what makes passport uploads required.',
        priceMinor: 5000,
        currency: 'USD',
      },
    });
    visaAddonServiceId = visaAddon.id;
    const addon = await tx.addonService.create({
      data: {
        organizationId: orgId,
        code: 'PHOTOGRAPHY',
        name: 'Photography',
        description: 'Fixture add-on.',
        priceMinor: 5000,
        currency: 'USD',
      },
    });
    addonServiceId = addon.id;
  });

  // DR-128: setAddons now resolves each add-on's price from AddonRate
  // (country + code), not AddonService's own flat priceMinor/currency --
  // seed matching rates for both the departure-based booking's country and
  // the pre-quotation TAILOR_MADE fixtures' customCountry (country.slice(0,
  // 2), a different value) below, or setAddons 409s with "no rate
  // configured" before ever reaching the behavior each test means to check.
  await admin.addonRate.createMany({
    data: [
      { country, code: 'PHOTOGRAPHY', priceMinor: 5000, currency: 'USD' },
      { country, code: 'VISA_ASSISTANCE', priceMinor: 5000, currency: 'USD' },
      { country: country.slice(0, 2), code: 'PHOTOGRAPHY', priceMinor: 5000, currency: 'USD' },
    ],
  });
});

afterAll(async () => {
  // Guard: if beforeAll failed before orgId was assigned, Prisma silently
  // drops the undefined where-clause value, turning these into unscoped
  // deleteMany calls that wipe the whole table -- this has hit real
  // production data twice. Skip cleanup entirely rather than risk it.
  if (!orgId) {
    await admin.$disconnect();
    await prisma.$disconnect();
    return;
  }
  await withOrg(orgId, (tx) => tx.bookingAddon.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.invoice.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.traveler.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.document.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.addonService.deleteMany({ where: { organizationId: orgId } }));
  await admin.addonRate.deleteMany({ where: { country: { in: [country, country.slice(0, 2)] } } });
  await withOrg(orgId, (tx) => tx.booking.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.departure.deleteMany({ where: { organizationId: orgId } }));
  await withOrg(orgId, (tx) => tx.tourPackage.deleteMany({ where: { organizationId: orgId } }));
  await admin.user.deleteMany({ where: { organizationId: orgId } });
  await admin.organization.delete({ where: { id: orgId } });
  await admin.taxRate.deleteMany({ where: { country } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('POST /api/v1/bookings/:bookingId/travelers', () => {
  it('rejects a role without booking.create (403)', async () => {
    const headers = await loginAs(guideId);
    const req = jsonRequest('POST', `http://localhost/api/v1/bookings/${bookingId}/travelers`, headers, {
      firstName: 'X',
      lastName: 'Y',
      age: 30,
      sex: 'X',
      nationality: 'NA',
      idOrPassportNumber: 'X1',
    });
    const res = await addTraveler(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(403);
  });

  it('adds the first (tour lead) traveler (201)', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest('POST', `http://localhost/api/v1/bookings/${bookingId}/travelers`, headers, {
      firstName: 'Lead',
      lastName: 'Traveler',
      age: 35,
      sex: 'F',
      nationality: 'NA',
      idOrPassportNumber: 'LEAD1',
      isTourLead: true,
    });
    const res = await addTraveler(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.traveler.isTourLead).toBe(true);
    leadTravelerId = body.traveler.id;
  });

  it('rejects a second tour lead (409)', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest('POST', `http://localhost/api/v1/bookings/${bookingId}/travelers`, headers, {
      firstName: 'Second',
      lastName: 'Lead',
      age: 40,
      sex: 'M',
      nationality: 'CD',
      idOrPassportNumber: 'LEAD2',
      isTourLead: true,
    });
    const res = await addTraveler(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(409);
  });

  it('adds the second (companion) traveler (201)', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest('POST', `http://localhost/api/v1/bookings/${bookingId}/travelers`, headers, {
      firstName: 'Companion',
      lastName: 'Traveler',
      age: 28,
      sex: 'M',
      nationality: 'CD',
      idOrPassportNumber: 'COMP1',
    });
    const res = await addTraveler(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(201);
  });

  it('rejects once every seat has a traveler (409)', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest('POST', `http://localhost/api/v1/bookings/${bookingId}/travelers`, headers, {
      firstName: 'Extra',
      lastName: 'Traveler',
      age: 22,
      sex: 'X',
      nationality: 'NA',
      idOrPassportNumber: 'EXTRA1',
    });
    const res = await addTraveler(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(409);
  });

  it('lists both travelers (200)', async () => {
    const headers = await loginAs(touristAId);
    const req = new NextRequest(`http://localhost/api/v1/bookings/${bookingId}/travelers`, { headers });
    const res = await listTravelers(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.travelers).toHaveLength(2);
  });
});

describe('GET /api/v1/bookings/:bookingId/invoice (gated on setup, DR-015)', () => {
  it('409s while the manifest/passport/add-ons are still incomplete', async () => {
    const headers = await loginAs(touristAId);
    const req = new NextRequest(`http://localhost/api/v1/bookings/${bookingId}/invoice`, { headers });
    const res = await getInvoice(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(409);
  });
});

describe('POST/GET /api/v1/bookings/:bookingId/travelers/:travelerId/passport', () => {
  it('rejects a passport upload before Visa Assistance has been selected (409)', async () => {
    const headers = await loginAs(touristAId);
    const formData = new FormData();
    formData.append('passport', new File([new TextEncoder().encode('%PDF-fixture')], 'passport.pdf', { type: 'application/pdf' }));
    const req = new NextRequest(`http://localhost/api/v1/bookings/${bookingId}/travelers/${leadTravelerId}/passport`, {
      method: 'POST',
      headers,
      body: formData,
    });
    const res = await uploadPassport(req, { params: Promise.resolve({ bookingId, travelerId: leadTravelerId }) });
    expect(res.status).toBe(409);
  });

  it('selecting Visa Assistance makes passport uploads required (200)', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest('POST', `http://localhost/api/v1/bookings/${bookingId}/addons`, headers, {
      addons: [{ addonServiceId: visaAddonServiceId }],
    });
    const res = await setAddons(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(200);
  });

  it('uploads the tour lead passport without leaking the blob pathname (201)', async () => {
    // The route uploads to Blob storage BEFORE checking
    // Booking.requiresPassportUpload (see the passport route), so the
    // preceding "rejects before Visa Assistance" test above already
    // triggered one real (mocked) upload call despite its 409 -- clear it
    // here so this test's own toHaveBeenCalledOnce() reflects only this
    // upload, not a cumulative count across the describe block.
    uploadMock.mockClear();
    const headers = await loginAs(touristAId);
    const formData = new FormData();
    formData.append('passport', new File([new TextEncoder().encode('%PDF-fixture')], 'passport.pdf', { type: 'application/pdf' }));
    const req = new NextRequest(`http://localhost/api/v1/bookings/${bookingId}/travelers/${leadTravelerId}/passport`, {
      method: 'POST',
      headers,
      body: formData,
    });
    const res = await uploadPassport(req, { params: Promise.resolve({ bookingId, travelerId: leadTravelerId }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.document).not.toHaveProperty('blobPathname');
    expect(uploadMock).toHaveBeenCalledOnce();
  });

  it('streams the passport bytes back and audits the access (200 -- staff only, TOURIST lacks documents.read)', async () => {
    const headers = await loginAs(operatorId);
    const req = new NextRequest(`http://localhost/api/v1/bookings/${bookingId}/travelers/${leadTravelerId}/passport`, {
      headers,
    });
    const res = await downloadPassport(req, { params: Promise.resolve({ bookingId, travelerId: leadTravelerId }) });
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('application/pdf');
    const text = await res.text();
    expect(text).toBe('%PDF-fixture');

    const accessed = await withOrg(orgId, (tx) =>
      tx.auditLog.findFirst({ where: { organizationId: orgId, action: 'document.accessed', resourceType: 'Document' } }),
    );
    expect(accessed).not.toBeNull();
  });
});

describe('POST /api/v1/bookings/:bookingId/addons', () => {
  it('finalizes an add-on selection and gates/unblocks the invoice (200 then 200)', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest('POST', `http://localhost/api/v1/bookings/${bookingId}/addons`, headers, {
      addons: [{ addonServiceId }],
    });
    const res = await setAddons(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.addons).toHaveLength(1);
    expect(body.addons[0].priceMinor).toBe(5000);

    const invoiceReq = new NextRequest(`http://localhost/api/v1/bookings/${bookingId}/invoice`, { headers });
    const invoiceRes = await getInvoice(invoiceReq, { params: Promise.resolve({ bookingId }) });
    expect(invoiceRes.status).toBe(200);
    const invoiceBody = await invoiceRes.json();
    // 20000 (booking) + 5000 (add-on) = 25000 subtotal, 10% VAT -> 2500 tax,
    // pre-fee total 27500; platform fee (DR-127) is charged to the customer
    // on top of that, at whatever PlatformRate is actually live (read in
    // beforeAll, not a hardcoded guess -- DR-042 is platform-wide mutable
    // config, not something this file seeds itself).
    const preFeeTotal = 27500;
    const platformFeeMinor = Math.round((preFeeTotal * platformFeeRateBp) / 10000);
    expect(invoiceBody.invoice.subtotalMinor).toBe(25000);
    expect(invoiceBody.invoice.taxMinor).toBe(2500);
    expect(invoiceBody.invoice.platformFeeMinor).toBe(platformFeeMinor);
    expect(invoiceBody.invoice.totalMinor).toBe(preFeeTotal + platformFeeMinor);
  });

  it('confirms the booking now shows the fully set-up state', async () => {
    const headers = await loginAs(touristAId);
    const req = new NextRequest(`http://localhost/api/v1/bookings/${bookingId}`, { headers });
    const res = await getBooking(req, { params: Promise.resolve({ bookingId }) });
    const body = await res.json();
    expect(body.booking.addonsFinalizedAt).not.toBeNull();
  });

  it('rejects an add-on whose currency does not match the booking (409)', async () => {
    const eurAddon = await withOrg(orgId, (tx) =>
      tx.addonService.create({
        data: {
          organizationId: orgId,
          code: 'TRANSLATOR',
          name: 'Translator (EUR)',
          description: 'Currency-mismatch fixture.',
          priceMinor: 1000,
          currency: 'EUR',
        },
      }),
    );
    const headers = await loginAs(touristAId);
    const req = jsonRequest('POST', `http://localhost/api/v1/bookings/${bookingId}/addons`, headers, {
      addons: [{ addonServiceId: eurAddon.id }],
    });
    const res = await setAddons(req, { params: Promise.resolve({ bookingId }) });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/v1/bookings/:bookingId/addons (pre-quotation, DR-092)', () => {
  it('accepts a single-currency add-on selection on a TAILOR_MADE booking with no price yet (200)', async () => {
    const preQuoteBooking = await withOrg(orgId, (tx) =>
      tx.booking.create({
        data: {
          organizationId: orgId,
          origin: 'TAILOR_MADE',
          touristUserId: touristAId,
          bookingReference: generateBookingReference(),
          seats: 1,
          customCountry: country.slice(0, 2),
          status: 'AWAITING_QUOTATION',
        },
      }),
    );
    const headers = await loginAs(touristAId);
    const req = jsonRequest('POST', `http://localhost/api/v1/bookings/${preQuoteBooking.id}/addons`, headers, {
      addons: [{ addonServiceId }],
    });
    const res = await setAddons(req, { params: Promise.resolve({ bookingId: preQuoteBooking.id }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.addons).toHaveLength(1);
  });

  it('rejects a mixed-currency add-on selection on a TAILOR_MADE booking with no price yet (409)', async () => {
    const [preQuoteBooking, eurAddon] = await Promise.all([
      withOrg(orgId, (tx) =>
        tx.booking.create({
          data: {
            organizationId: orgId,
            origin: 'TAILOR_MADE',
            touristUserId: touristAId,
            bookingReference: generateBookingReference(),
            seats: 1,
            customCountry: country.slice(0, 2),
            status: 'AWAITING_QUOTATION',
          },
        }),
      ),
      withOrg(orgId, (tx) =>
        tx.addonService.create({
          data: {
            organizationId: orgId,
            code: 'TRANSLATOR',
            name: 'Translator (EUR, pre-quotation fixture)',
            description: 'Currency-mismatch fixture.',
            priceMinor: 1000,
            currency: 'EUR',
          },
        }),
      ),
    ]);
    const headers = await loginAs(touristAId);
    const req = jsonRequest('POST', `http://localhost/api/v1/bookings/${preQuoteBooking.id}/addons`, headers, {
      addons: [{ addonServiceId }, { addonServiceId: eurAddon.id }],
    });
    const res = await setAddons(req, { params: Promise.resolve({ bookingId: preQuoteBooking.id }) });
    expect(res.status).toBe(409);
  });
});

// DR-222: FLIGHT_TICKET's price varies by route+airline+class -- a real
// FK-able Airport identity, not just a small fixed enum like AddonRate's
// `code`, so this fixture needs two real Airport rows + a matching
// FlightFareRate. Airport/FlightFareRate/EsimDataPlanRate are all
// platform-wide reference data (no organizationId, no RLS) -- a plain
// `admin.<model>.create` is correct here, same as `admin.addonRate.createMany`
// above, unlike the org-scoped AddonService/Booking rows this block also needs.
function randomIataCode(): string {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return Array.from({ length: 3 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
}

describe('POST /api/v1/bookings/:bookingId/addons (FLIGHT_TICKET/ESIM, DR-222)', () => {
  let flightEsimBookingId: string;
  let flightAddonServiceId: string;
  let esimAddonServiceId: string;
  let originAirportId: string;
  let destinationAirportId: string;
  const originIata = randomIataCode();
  const destinationIata = randomIataCode();

  beforeAll(async () => {
    const [flightEsimBooking, flightAddon, esimAddon, origin, destination] = await Promise.all([
      withOrg(orgId, (tx) =>
        tx.booking.create({
          data: {
            organizationId: orgId,
            touristUserId: touristAId,
            bookingReference: generateBookingReference(),
            seats: 1,
            customCountry: country.slice(0, 2),
            currency: 'USD',
            priceMinor: 20000,
            status: 'AWAITING_DEPOSIT',
          },
        }),
      ),
      withOrg(orgId, (tx) =>
        tx.addonService.create({
          data: { organizationId: orgId, code: 'FLIGHT_TICKET', name: 'Flight Ticket', description: 'Fixture add-on.', priceMinor: 0, currency: 'USD' },
        }),
      ),
      withOrg(orgId, (tx) =>
        tx.addonService.create({
          data: { organizationId: orgId, code: 'ESIM', name: 'eSIM', description: 'Fixture add-on.', priceMinor: 0, currency: 'USD' },
        }),
      ),
      admin.airport.create({ data: { iataCode: originIata, name: 'Origin Fixture Airport', city: 'Origin City', country } }),
      admin.airport.create({ data: { iataCode: destinationIata, name: 'Destination Fixture Airport', city: 'Destination City', country } }),
    ]);
    flightEsimBookingId = flightEsimBooking.id;
    flightAddonServiceId = flightAddon.id;
    esimAddonServiceId = esimAddon.id;
    originAirportId = origin.id;
    destinationAirportId = destination.id;

    await Promise.all([
      admin.flightFareRate.create({
        data: { originAirportId, destinationAirportId, airline: 'Fixture Air', flightClass: 'ECONOMY', priceMinor: 45000, currency: 'USD' },
      }),
      // The booking's own customCountry is truncated to 2 chars (VarChar(2)
      // column) -- the rate must be seeded under that same truncated value,
      // not the full fixture `country`, or getEffectiveEsimRate's lookup
      // (keyed off resolveBookingCountry -> booking.customCountry) misses.
      admin.esimDataPlanRate.create({ data: { country: country.slice(0, 2), dataAllowanceGb: 5, priceMinor: 1200, currency: 'USD' } }),
    ]);
  });

  afterAll(async () => {
    await admin.flightFareRate.deleteMany({ where: { originAirportId, destinationAirportId } });
    await admin.esimDataPlanRate.deleteMany({ where: { country: country.slice(0, 2), dataAllowanceGb: 5 } });
    await admin.airport.deleteMany({ where: { id: { in: [originAirportId, destinationAirportId] } } });
  });

  it('resolves a FLIGHT_TICKET selection with a real matching rate (200)', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest('POST', `http://localhost/api/v1/bookings/${flightEsimBookingId}/addons`, headers, {
      addons: [{ addonServiceId: flightAddonServiceId, originAirportId, destinationAirportId, airline: 'Fixture Air', flightClass: 'ECONOMY' }],
    });
    const res = await setAddons(req, { params: Promise.resolve({ bookingId: flightEsimBookingId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.addons).toHaveLength(1);
    const flight = body.addons[0];
    expect(flight.flightClass).toBe('ECONOMY');
    expect(flight.airline).toBe('Fixture Air');
    expect(flight.originAirportCode).toBe(originIata);
    expect(flight.destinationAirportCode).toBe(destinationIata);
    expect(flight.priceMinor).toBe(45000);
    expect(flight.currency).toBe('USD');
  });

  it('rejects a FLIGHT_TICKET selection missing one of the 4 required fields (422)', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest('POST', `http://localhost/api/v1/bookings/${flightEsimBookingId}/addons`, headers, {
      // flightClass omitted.
      addons: [{ addonServiceId: flightAddonServiceId, originAirportId, destinationAirportId, airline: 'Fixture Air' }],
    });
    const res = await setAddons(req, { params: Promise.resolve({ bookingId: flightEsimBookingId }) });
    expect(res.status).toBe(422);
  });

  it('rejects a FLIGHT_TICKET selection with no matching rate for the route+airline+class (409)', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest('POST', `http://localhost/api/v1/bookings/${flightEsimBookingId}/addons`, headers, {
      // Only an ECONOMY rate was seeded -- BUSINESS has no configured rate.
      addons: [{ addonServiceId: flightAddonServiceId, originAirportId, destinationAirportId, airline: 'Fixture Air', flightClass: 'BUSINESS' }],
    });
    const res = await setAddons(req, { params: Promise.resolve({ bookingId: flightEsimBookingId }) });
    expect(res.status).toBe(409);
  });

  it('rejects an ESIM selection missing dataAllowanceGb (422)', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest('POST', `http://localhost/api/v1/bookings/${flightEsimBookingId}/addons`, headers, {
      addons: [{ addonServiceId: esimAddonServiceId }],
    });
    const res = await setAddons(req, { params: Promise.resolve({ bookingId: flightEsimBookingId }) });
    expect(res.status).toBe(422);
  });

  it('resolves an ESIM selection with a real matching rate (200)', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest('POST', `http://localhost/api/v1/bookings/${flightEsimBookingId}/addons`, headers, {
      addons: [{ addonServiceId: esimAddonServiceId, dataAllowanceGb: 5 }],
    });
    const res = await setAddons(req, { params: Promise.resolve({ bookingId: flightEsimBookingId }) });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.addons).toHaveLength(1);
    expect(body.addons[0].dataAllowanceGb).toBe(5);
    expect(body.addons[0].priceMinor).toBe(1200);
    expect(body.addons[0].currency).toBe('USD');
  });

  it('rejects a non-flight/esim addon selection carrying a flight/esim-only field (422)', async () => {
    const headers = await loginAs(touristAId);
    const req = jsonRequest('POST', `http://localhost/api/v1/bookings/${flightEsimBookingId}/addons`, headers, {
      // `addonServiceId` here is the PHOTOGRAPHY fixture from the outer
      // beforeAll (its AddonRate is already seeded for `country`) --
      // carrying dataAllowanceGb on a non-ESIM/FLIGHT_TICKET selection must
      // be rejected regardless of whether the addon itself would otherwise
      // resolve fine.
      addons: [{ addonServiceId, dataAllowanceGb: 5 }],
    });
    const res = await setAddons(req, { params: Promise.resolve({ bookingId: flightEsimBookingId }) });
    expect(res.status).toBe(422);
  });
});

describe('DR-111: age/nationality/idOrPassportNumber optional for a TAILOR_MADE booking', () => {
  it('accepts a traveler with no age/nationality/idOrPassportNumber on a TAILOR_MADE booking (200)', async () => {
    const preQuoteBooking = await withOrg(orgId, (tx) =>
      tx.booking.create({
        data: {
          organizationId: orgId,
          origin: 'TAILOR_MADE',
          touristUserId: touristAId,
          bookingReference: generateBookingReference(),
          seats: 1,
          customCountry: country.slice(0, 2),
          status: 'AWAITING_QUOTATION',
        },
      }),
    );
    const headers = await loginAs(touristAId);
    const req = jsonRequest('POST', `http://localhost/api/v1/bookings/${preQuoteBooking.id}/travelers`, headers, {
      firstName: 'No',
      lastName: 'Details',
      sex: 'X',
      isTourLead: true,
    });
    const res = await addTraveler(req, { params: Promise.resolve({ bookingId: preQuoteBooking.id }) });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.traveler.age).toBeNull();
    expect(body.traveler.nationality).toBeNull();
    expect(body.traveler.idOrPassportNumber).toBeNull();
  });

  it('still rejects a traveler missing age/nationality/idOrPassportNumber on a PREDEFINED_PACKAGE booking (422)', async () => {
    // A fresh booking, not the shared `bookingId` fixture -- its 2 seats are
    // already filled by the "POST .../travelers" describe block above, which
    // would 409 (seats full) before ever reaching the field-requirement
    // check this test targets.
    const freshBooking = await withOrg(orgId, (tx) =>
      tx.booking.create({
        data: {
          organizationId: orgId,
          touristUserId: touristAId,
          bookingReference: generateBookingReference(),
          seats: 1,
          priceMinor: 20000,
          currency: 'USD',
        },
      }),
    );
    const headers = await loginAs(touristAId);
    const req = jsonRequest('POST', `http://localhost/api/v1/bookings/${freshBooking.id}/travelers`, headers, {
      firstName: 'Missing',
      lastName: 'Details',
      sex: 'X',
    });
    const res = await addTraveler(req, { params: Promise.resolve({ bookingId: freshBooking.id }) });
    expect(res.status).toBe(422);
  });
});

describe('DR-105: hard-blocked edits on a terminal-status booking', () => {
  it.each(['COMPLETED', 'CANCELLED', 'REFUNDED'] as const)('rejects addTraveler/setAddons/passport upload on a %s booking (409)', async (status) => {
    // A real Traveler row is inserted directly (not via addTraveler, which
    // is itself one of the actions this locked status now blocks) so the
    // passport route's own pre-check (traveler existence) finds a real row
    // and actually reaches bookingService.setTravelerPassport's guard,
    // rather than 404ing on a made-up travelerId before ever getting there.
    const { lockedBooking, lockedTraveler } = await withOrg(orgId, async (tx) => {
      const booking = await tx.booking.create({
        data: {
          organizationId: orgId,
          origin: 'TAILOR_MADE',
          touristUserId: touristAId,
          bookingReference: generateBookingReference(),
          seats: 1,
          customCountry: country.slice(0, 2),
          status,
        },
      });
      const traveler = await tx.traveler.create({
        data: {
          organizationId: orgId,
          bookingId: booking.id,
          firstName: 'Locked',
          lastName: 'Fixture',
          age: 30,
          sex: 'X',
          nationality: 'NA',
          idOrPassportNumber: `LOCKED-${status}`,
          isTourLead: true,
        },
      });
      return { lockedBooking: booking, lockedTraveler: traveler };
    });
    const headers = await loginAs(touristAId);

    const travelerReq = jsonRequest('POST', `http://localhost/api/v1/bookings/${lockedBooking.id}/travelers`, headers, {
      firstName: 'X',
      lastName: 'Y',
      age: 30,
      sex: 'X',
      nationality: 'NA',
      idOrPassportNumber: 'LOCKED1',
    });
    const travelerRes = await addTraveler(travelerReq, { params: Promise.resolve({ bookingId: lockedBooking.id }) });
    expect(travelerRes.status).toBe(409);

    const addonsReq = jsonRequest('POST', `http://localhost/api/v1/bookings/${lockedBooking.id}/addons`, headers, {
      addons: [{ addonServiceId }],
    });
    const addonsRes = await setAddons(addonsReq, { params: Promise.resolve({ bookingId: lockedBooking.id }) });
    expect(addonsRes.status).toBe(409);

    const formData = new FormData();
    formData.append('passport', new File([new TextEncoder().encode('%PDF-fixture')], 'passport.pdf', { type: 'application/pdf' }));
    const passportReq = new NextRequest(
      `http://localhost/api/v1/bookings/${lockedBooking.id}/travelers/${lockedTraveler.id}/passport`,
      { method: 'POST', headers, body: formData },
    );
    const passportRes = await uploadPassport(passportReq, {
      params: Promise.resolve({ bookingId: lockedBooking.id, travelerId: lockedTraveler.id }),
    });
    expect(passportRes.status).toBe(409);
  });
});
