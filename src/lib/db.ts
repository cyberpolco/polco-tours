import { PrismaClient } from '@prisma/client';

/**
 * Single Prisma instance (avoids exhausting Neon connections on hot reload).
 * The backend is the single source of truth; all DB access flows through here.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

/**
 * Run a unit of work scoped to one organization. Sets the Postgres session
 * variable `app.org_id` for the life of the transaction so Row-Level Security
 * (prisma/rls.sql) filters every statement to that tenant. This is the
 * database-layer half of the defense-in-depth model (Vol. 4 §4.3).
 *
 * Deny-by-default: if you never call this (no GUC set), RLS-protected tables
 * return zero rows.
 */
export async function withOrg<T>(
  organizationId: string,
  work: (tx: TenantTx) => Promise<T>,
): Promise<T> {
  return prisma.$transaction(async (tx) => {
    // Parameterized; `true` makes it transaction-local (SET LOCAL semantics).
    await tx.$executeRaw`SELECT set_config('app.org_id', ${organizationId}, true)`;
    return work(tx as unknown as TenantTx);
  });
}

export type TenantTx = Omit<
  PrismaClient,
  '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'
>;

// P2025 (record not found on an immediate follow-up read/update -- suspected
// Neon pooler read-after-write lag) and P2028 ("Transaction API error:
// Transaction not found... refers to an old closed transaction... or was
// obtained before disconnecting" -- a dropped interactive transaction, same
// class of transient Neon connectivity blip, just surfacing mid-transaction
// instead of on a stale read). Both are safe to blindly retry from scratch:
// a P2028'd transaction was never committed (Postgres has no partial
// commit), so nothing needs cleaning up first. DR-221 follow-up.
export function isTransientDbError(e: unknown): boolean {
  const code = typeof e === 'object' && e !== null ? (e as { code?: string }).code : undefined;
  return code === 'P2025' || code === 'P2028';
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Retries `work` a few times if it fails with a transient Neon connectivity
 * error (see isTransientDbError above), rather than letting one blip crash
 * an otherwise-successful operation. Any other error, or a transient error
 * that's still failing after the last attempt, is rethrown as-is -- the
 * caller decides how to present that (e.g. map to Errors.internal()).
 *
 * Real production gap this closes (DR-221 follow-up): the fix originally
 * landed only inside finalizeAdminCreatedUser's own transaction, but
 * authService.createUser's subsequent audit() call -- also a withOrg
 * transaction -- had no retry at all, so a blip there could crash user
 * creation with a raw, uncaught Prisma error even after the user row (with
 * every selected role) had already committed successfully.
 */
export async function withTransientRetry<T>(work: () => Promise<T>, maxAttempts = 4): Promise<T> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await work();
    } catch (e) {
      if (isTransientDbError(e) && attempt < maxAttempts) {
        await delay(attempt * 150);
        continue;
      }
      throw e;
    }
  }
  throw new Error('unreachable');
}
