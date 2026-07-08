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
