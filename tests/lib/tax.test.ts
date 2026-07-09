import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { prisma } from '../../src/lib/db';
import { getEffectiveTaxRate } from '../../src/lib/tax';

/**
 * `TaxRate` is platform-wide reference data (DR-006) -- no organizationId, no
 * withOrg needed. Uses a unique fake country code per run so this file never
 * collides with the real seeded DRC ('CD')/Namibia ('NA') rows.
 */
const admin = new PrismaClient();
const country = `T${Date.now()}`.slice(0, 12);

beforeAll(async () => {
  // A superseded rate that must be ignored...
  await admin.taxRate.create({
    data: { country, taxType: 'VAT', rateBp: 1000, validFrom: new Date('2020-01-01'), validTo: new Date('2021-01-01') },
  });
  // ...and the current effective rate.
  await admin.taxRate.create({
    data: { country, taxType: 'VAT', rateBp: 1600, validFrom: new Date('2021-01-01'), validTo: null },
  });
});

afterAll(async () => {
  await admin.taxRate.deleteMany({ where: { country } });
  await admin.$disconnect();
  await prisma.$disconnect();
});

describe('getEffectiveTaxRate', () => {
  it('picks the currently effective rate, ignoring a superseded/expired one', async () => {
    const rate = await getEffectiveTaxRate(country);
    expect(rate.rateBp).toBe(1600);
    expect(rate.taxType).toBe('VAT');
  });

  it('resolves the correct rate as of a historical date', async () => {
    const rate = await getEffectiveTaxRate(country, new Date('2020-06-01'));
    expect(rate.rateBp).toBe(1000);
  });

  it('throws when no rate is configured for a country', async () => {
    await expect(getEffectiveTaxRate('UNCONFIGURED')).rejects.toThrow(/No effective VAT rate/);
  });
});
