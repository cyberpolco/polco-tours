// auth module — repository. The only place that touches the DB for this module.
import { prisma } from '@lib/db';
import type { PublicUser } from './domain';

export const authRepository = {
  async findUserByEmail(email: string): Promise<PublicUser | null> {
    const u = await prisma.user.findUnique({ where: { email } });
    if (!u || u.deletedAt) return null;
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      organizationId: u.organizationId,
      emailVerified: u.emailVerified,
    };
  },

  async findUserById(id: string): Promise<PublicUser | null> {
    const u = await prisma.user.findUnique({ where: { id } });
    if (!u || u.deletedAt) return null;
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      organizationId: u.organizationId,
      emailVerified: u.emailVerified,
    };
  },
};
