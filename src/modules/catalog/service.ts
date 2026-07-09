// catalog module — service. Business logic; orchestrates repository + rbac.
// Callable by other modules ONLY through index.ts (module boundary rule).
import type { AuthContext } from '@modules/auth';
import { Errors } from '@lib/errors';
import type { Money } from '@lib/money';
import { assertCan } from '@lib/rbac';
import {
  effectivePrice,
  isBookable,
  isDepartureVisible,
  isPackageVisible,
  type AddonServiceView,
  type CreateDepartureInput,
  type CreatePackageInput,
  type DepartureView,
  type TourPackageView,
  type UpdatePackageInput,
} from './domain';
import { catalogRepository } from './repository';

export interface DepartureDetail {
  departure: DepartureView;
  packageStatus: TourPackageView['status'];
  packageCountry: string;
  effectiveUnitPrice: Money;
  bookable: boolean;
}

function requireOrg(ctx: AuthContext): string {
  if (!ctx.organizationId) throw Errors.forbidden('No organization membership');
  return ctx.organizationId;
}

export const catalogService = {
  async createPackage(ctx: AuthContext, input: CreatePackageInput): Promise<TourPackageView> {
    assertCan(ctx.role, 'catalog.write');
    return catalogRepository.createPackage(requireOrg(ctx), input);
  },

  async updatePackage(ctx: AuthContext, packageId: string, input: UpdatePackageInput): Promise<TourPackageView> {
    assertCan(ctx.role, 'catalog.write');
    const updated = await catalogRepository.updatePackage(requireOrg(ctx), packageId, input);
    if (!updated) throw Errors.notFound('Package not found');
    return updated;
  },

  async getPackage(ctx: AuthContext, packageId: string): Promise<TourPackageView> {
    assertCan(ctx.role, 'catalog.read');
    const pkg = await catalogRepository.findPackageById(requireOrg(ctx), packageId);
    if (!pkg || !isPackageVisible(pkg, ctx.role)) throw Errors.notFound('Package not found');
    return pkg;
  },

  async listPackages(ctx: AuthContext): Promise<TourPackageView[]> {
    assertCan(ctx.role, 'catalog.read');
    const all = await catalogRepository.listPackages(requireOrg(ctx));
    return all.filter((p) => isPackageVisible(p, ctx.role));
  },

  async createDeparture(
    ctx: AuthContext,
    packageId: string,
    input: CreateDepartureInput,
  ): Promise<DepartureView> {
    assertCan(ctx.role, 'catalog.write');
    const organizationId = requireOrg(ctx);
    const pkg = await catalogRepository.findPackageById(organizationId, packageId);
    if (!pkg) throw Errors.notFound('Package not found');
    return catalogRepository.createDeparture(organizationId, packageId, input);
  },

  async listDepartures(ctx: AuthContext, packageId: string): Promise<DepartureView[]> {
    assertCan(ctx.role, 'catalog.read');
    const organizationId = requireOrg(ctx);
    const pkg = await catalogRepository.findPackageById(organizationId, packageId);
    if (!pkg || !isPackageVisible(pkg, ctx.role)) throw Errors.notFound('Package not found');
    const all = await catalogRepository.listDeparturesForPackage(organizationId, packageId);
    return all.filter((d) => isDepartureVisible(d, ctx.role));
  },

  /** The one cross-module entry point the booking module calls. */
  async getDepartureDetail(ctx: AuthContext, departureId: string): Promise<DepartureDetail> {
    assertCan(ctx.role, 'catalog.read');
    const organizationId = requireOrg(ctx);
    const departure = await catalogRepository.findDepartureById(organizationId, departureId);
    if (!departure) throw Errors.notFound('Departure not found');
    const pkg = await catalogRepository.findPackageById(organizationId, departure.tourPackageId);
    if (!pkg || !isPackageVisible(pkg, ctx.role) || !isDepartureVisible(departure, ctx.role)) {
      throw Errors.notFound('Departure not found');
    }
    return {
      departure,
      packageStatus: pkg.status,
      packageCountry: pkg.country,
      effectiveUnitPrice: effectivePrice(pkg, departure),
      bookable: isBookable(pkg, departure),
    };
  },

  /** Staff-managed, read-only for now -- seeded via prisma/seed.ts. */
  async listActiveAddonServices(ctx: AuthContext): Promise<AddonServiceView[]> {
    assertCan(ctx.role, 'catalog.read');
    return catalogRepository.listActiveAddonServices(requireOrg(ctx));
  },

  /** The cross-module entry point the booking module calls to price-snapshot a selection. */
  async getAddonService(ctx: AuthContext, addonServiceId: string): Promise<AddonServiceView> {
    assertCan(ctx.role, 'catalog.read');
    const addon = await catalogRepository.findAddonServiceById(requireOrg(ctx), addonServiceId);
    if (!addon || !addon.active) throw Errors.notFound('Add-on service not found');
    return addon;
  },
};
