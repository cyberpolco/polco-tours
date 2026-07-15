// catalog module — domain types & rules. Pure; no framework or DB imports.
import type { AddonCode, Currency, DepartureStatus, PackageStatus, PackageTag, Role } from '@prisma/client';
import { z } from 'zod';
import { money, type Money } from '@lib/money';

export interface TourPackageView {
  id: string;
  organizationId: string;
  packageReference: string;
  title: string;
  description: string;
  country: string;
  priceMinor: number;
  currency: Currency;
  durationDays: number | null;
  tags: PackageTag[];
  status: PackageStatus;
  createdAt: Date;
  updatedAt: Date;
}

export interface DepartureView {
  id: string;
  organizationId: string;
  // Null only for a bespoke departure (DR-028) converted from a TAILOR_MADE
  // booking with no TourPackage -- see catalogService.createBespokeDeparture.
  tourPackageId: string | null;
  startDate: Date;
  endDate: Date | null;
  capacity: number;
  priceOverrideMinor: number | null;
  currency: Currency | null;
  customCountry: string | null;
  status: DepartureStatus;
  createdAt: Date;
  updatedAt: Date;
}

const PACKAGE_TAGS = ['WILDLIFE', 'ADVENTURE', 'RELAXATION', 'FAMILY', 'CULTURE', 'LUXURY', 'BUDGET'] as const;

export const CreatePackageInput = z.object({
  title: z.string().min(1).max(200),
  description: z.string().min(1),
  country: z.string().length(2), // ISO-3166 alpha-2
  priceMinor: z.number().int().nonnegative(),
  currency: z.enum(['USD', 'EUR', 'NAD', 'CDF']),
  durationDays: z.number().int().positive().optional(),
  tags: z.array(z.enum(PACKAGE_TAGS)).optional(),
});
export type CreatePackageInput = z.infer<typeof CreatePackageInput>;

export const UpdatePackageInput = CreatePackageInput.partial().extend({
  status: z.enum(['DRAFT', 'PUBLISHED', 'ARCHIVED']).optional(),
});
export type UpdatePackageInput = z.infer<typeof UpdatePackageInput>;

export const CreateDepartureInput = z.object({
  startDate: z.coerce.date(),
  endDate: z.coerce.date().optional(),
  capacity: z.number().int().positive(),
  priceOverrideMinor: z.number().int().nonnegative().optional(),
});
export type CreateDepartureInput = z.infer<typeof CreateDepartureInput>;

/** Business-facing reference, e.g. PKG-00034 -- the numeric part comes from
 * a plain Postgres sequence (repository.ts); this just formats it. No year
 * component, unlike Booking.bookingReference (DR-027), per the spec's own
 * example. */
export function formatPackageReference(sequence: number | bigint): string {
  return `PKG-${String(sequence).padStart(5, '0')}`;
}

/** Params for a bespoke (package-less) departure converted from an approved
 * TAILOR_MADE booking (DR-028). Plain interface, not a zod input schema --
 * this is never parsed from a raw HTTP body; the booking module builds it
 * from its own already-validated fields, and the catalog module deliberately
 * has no knowledge of Booking (module boundary). */
export interface CreateBespokeDepartureParams {
  customCountry: string;
  startDate: Date;
  endDate: Date;
  capacity: number;
  priceMinor: number;
  currency: Currency;
}

/** Departure's own price wins; otherwise inherit the package's. */
export function effectivePrice(pkg: TourPackageView, dep: DepartureView): Money {
  const minor = dep.priceOverrideMinor ?? pkg.priceMinor;
  return money(minor, pkg.currency);
}

/** A tourist can only act on a live package + a still-running departure. */
export function isBookable(pkg: TourPackageView, dep: DepartureView): boolean {
  return pkg.status === 'PUBLISHED' && dep.status === 'SCHEDULED';
}

function isOperatorRole(roles: Role[]): boolean {
  return roles.some((role) => role === 'TOUR_OPERATOR' || role === 'SUPERADMIN' || role === 'PLATFORM_ADMIN');
}

/** Non-operator roles only ever see published packages, regardless of their catalog.read grant. */
export function isPackageVisible(pkg: TourPackageView, roles: Role[]): boolean {
  return isOperatorRole(roles) || pkg.status === 'PUBLISHED';
}

/** Non-operator roles only ever see scheduled departures. */
export function isDepartureVisible(dep: DepartureView, roles: Role[]): boolean {
  return isOperatorRole(roles) || dep.status === 'SCHEDULED';
}

export interface AddonServiceView {
  id: string;
  organizationId: string;
  code: AddonCode;
  name: string;
  description: string;
  priceMinor: number;
  currency: Currency;
  active: boolean;
}

// -------------------------------------------------------------- public quiz (DR-016)

export const QuizAnswers = z.object({
  country: z.string().length(2).optional(),
  tripLength: z.enum(['SHORT', 'MEDIUM', 'LONG']).optional(),
  tags: z.array(z.enum(PACKAGE_TAGS)).optional(),
  // Free-text destination names (src/lib/destination-sites.ts) -- there's no
  // Site/Destination entity in this app, so this scores a substring match
  // against title/description the same way tags score against the tags
  // array, rather than needing a real relational model (DR-024).
  sites: z.array(z.string()).optional(),
});
export type QuizAnswers = z.infer<typeof QuizAnswers>;

// Inclusive day-count bounds per trip-length bucket -- packages with no
// durationDays set are excluded once a bucket is chosen (nothing to match).
const TRIP_LENGTH_RANGES: Record<NonNullable<QuizAnswers['tripLength']>, { min: number; max: number }> = {
  SHORT: { min: 0, max: 5 },
  MEDIUM: { min: 6, max: 10 },
  LONG: { min: 11, max: Infinity },
};

/** Sorts by tag-overlap count desc, ties broken alphabetically by title.
 * Deliberately no budget/price-based filtering OR tiebreak: packages can be
 * priced in 4 different currencies with no FX conversion anywhere in this
 * app, so comparing raw priceMinor across packages would silently compare
 * apples to oranges. */
export function scorePackagesForQuiz(packages: TourPackageView[], answers: QuizAnswers): TourPackageView[] {
  const range = answers.tripLength ? TRIP_LENGTH_RANGES[answers.tripLength] : null;
  const wantedTags = answers.tags ?? [];
  const wantedSites = answers.sites ?? [];

  return packages
    .filter((p) => !answers.country || p.country === answers.country)
    .filter((p) => !range || (p.durationDays != null && p.durationDays >= range.min && p.durationDays <= range.max))
    .map((p) => {
      const tagScore = p.tags.filter((t) => wantedTags.includes(t)).length;
      const haystack = `${p.title} ${p.description}`.toLowerCase();
      const siteScore = wantedSites.filter((site) => haystack.includes(site.toLowerCase())).length;
      return { pkg: p, score: tagScore + siteScore };
    })
    .sort((a, b) => b.score - a.score || a.pkg.title.localeCompare(b.pkg.title))
    .map(({ pkg }) => pkg);
}
