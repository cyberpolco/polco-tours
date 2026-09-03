import { describe, it, expect } from 'vitest';
import { getTrustedUserCreateSignal, withTrustedUserCreate } from '../src/lib/trusted-user-create';
import type { TrustedUserCreateSignal } from '../src/lib/trusted-user-create';

const SIGNAL_A: TrustedUserCreateSignal = {
  role: 'DRIVER',
  organizationId: 'org-a',
  mustChangePassword: true,
  phone: '+264812345678',
};

const SIGNAL_B: TrustedUserCreateSignal = {
  role: 'TOUR_GUIDE',
  organizationId: 'org-b',
  mustChangePassword: false,
  phone: null,
};

describe('trusted-user-create (DR-229)', () => {
  it('returns undefined outside any withTrustedUserCreate call', () => {
    expect(getTrustedUserCreateSignal()).toBeUndefined();
  });

  it('returns the exact signal inside the callback, including across an await', async () => {
    const observed = await withTrustedUserCreate(SIGNAL_A, async () => {
      expect(getTrustedUserCreateSignal()).toEqual(SIGNAL_A);
      await new Promise((resolve) => setTimeout(resolve, 5));
      return getTrustedUserCreateSignal();
    });
    expect(observed).toEqual(SIGNAL_A);
  });

  it('clears back to undefined once the callback resolves', async () => {
    await withTrustedUserCreate(SIGNAL_A, async () => undefined);
    expect(getTrustedUserCreateSignal()).toBeUndefined();
  });

  it('isolates two concurrent calls with different signals from each other', async () => {
    const observe = (signal: TrustedUserCreateSignal, delayMs: number) =>
      withTrustedUserCreate(signal, async () => {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        return getTrustedUserCreateSignal();
      });

    const [resultA, resultB] = await Promise.all([observe(SIGNAL_A, 10), observe(SIGNAL_B, 1)]);

    expect(resultA).toEqual(SIGNAL_A);
    expect(resultB).toEqual(SIGNAL_B);
  });

  it('does not leak into unrelated code running outside the callback', async () => {
    const outsidePromise = new Promise<TrustedUserCreateSignal | undefined>((resolve) => {
      setTimeout(() => resolve(getTrustedUserCreateSignal()), 15);
    });

    await withTrustedUserCreate(SIGNAL_A, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
    });

    expect(await outsidePromise).toBeUndefined();
  });
});
