import type { Currency, FlightClass } from '@prisma/client';
import { prisma } from './db';

/**
 * Effective-dated per-(route, airline, class) flight-ticket add-on pricing
 * (DR-222). `FlightFareRate` is platform-wide reference data (no
 * organizationId, no RLS policy) -- same precedent as
 * src/lib/addon-rates.ts's getEffectiveAddonRate, and for the same reason:
 * guest checkout (an anonymous session, no staff permissions) must be able
 * to read this too, so it's a plain query, not routed through
 * financeService's RBAC-gated methods.
 *
 * Returns null rather than throwing when no rate is configured for this
 * exact route+airline+class -- callers reject the selection outright,
 * there is no fallback price.
 */
export interface EffectiveFlightFareRate {
  priceMinor: number;
  currency: Currency;
}

export async function getEffectiveFlightFareRate(
  originAirportId: string,
  destinationAirportId: string,
  airline: string,
  flightClass: FlightClass,
  at: Date = new Date(),
): Promise<EffectiveFlightFareRate | null> {
  const row = await prisma.flightFareRate.findFirst({
    where: {
      originAirportId,
      destinationAirportId,
      airline,
      flightClass,
      validFrom: { lte: at },
      OR: [{ validTo: null }, { validTo: { gte: at } }],
    },
    orderBy: { validFrom: 'desc' },
  });
  return row ? { priceMinor: row.priceMinor, currency: row.currency } : null;
}
