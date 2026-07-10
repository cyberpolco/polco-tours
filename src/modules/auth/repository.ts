// auth module — repository. The only place that touches the DB for this module.
import { prisma } from '@lib/db';
import type { PublicUser, UpdateProfileInput } from './domain';

function toPublicUser(u: {
  id: string;
  email: string;
  name: string | null;
  role: PublicUser['role'];
  organizationId: string | null;
  emailVerified: boolean;
  phone: string | null;
  preferredLocale: PublicUser['preferredLocale'];
  assignedCountry: string | null;
}): PublicUser {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    role: u.role,
    organizationId: u.organizationId,
    emailVerified: u.emailVerified,
    phone: u.phone,
    preferredLocale: u.preferredLocale,
    assignedCountry: u.assignedCountry,
  };
}

export const authRepository = {
  async findUserByEmail(email: string): Promise<PublicUser | null> {
    const u = await prisma.user.findUnique({ where: { email } });
    if (!u || u.deletedAt) return null;
    return toPublicUser(u);
  },

  async findUserById(id: string): Promise<PublicUser | null> {
    const u = await prisma.user.findUnique({ where: { id } });
    if (!u || u.deletedAt) return null;
    return toPublicUser(u);
  },

  async updateProfile(userId: string, input: UpdateProfileInput): Promise<PublicUser> {
    const u = await prisma.user.update({ where: { id: userId }, data: input });
    return toPublicUser(u);
  },

  async updateAssignedCountry(userId: string, country: string): Promise<PublicUser> {
    const u = await prisma.user.update({ where: { id: userId }, data: { assignedCountry: country } });
    return toPublicUser(u);
  },

  /** Organization is a shared/platform table (like src/lib/primary-org.ts's
   * reads), not owned by any single feature module -- this is just a
   * read of the countries an officer's org actually operates in. */
  async findOrganizationCountries(organizationId: string): Promise<string[] | null> {
    const org = await prisma.organization.findUnique({ where: { id: organizationId } });
    return org ? org.countries : null;
  },
};
