// visa module — service. Business logic; orchestrates repository + rbac.
// Callable by other modules ONLY through index.ts (module boundary rule).
import type { AuthContext } from '@modules/auth';
import { bookingService, type TravelerView } from '@modules/booking';
import { catalogService } from '@modules/catalog';
import { documentsService, type DocumentSummary, type DocumentStream } from '@modules/documents';
import { audit } from '@lib/audit';
import { Errors } from '@lib/errors';
import { assertCan } from '@lib/rbac';
import { canDecide, type DecideVisaInput, type OfficerVisaView, type VisaApplicationView } from './domain';
import { visaRepository } from './repository';

function requireOrg(ctx: AuthContext): string {
  if (!ctx.organizationId) throw Errors.forbidden('No organization membership');
  return ctx.organizationId;
}

/** Same findTraveler-by-bookingId+travelerId pattern as the existing
 * passport route (src/app/api/v1/bookings/[bookingId]/travelers/[travelerId]/passport/route.ts) --
 * 404s if the traveler isn't actually on that booking. */
async function findTraveler(ctx: AuthContext, bookingId: string, travelerId: string): Promise<TravelerView> {
  const travelers = await bookingService.listTravelers(ctx, bookingId);
  const traveler = travelers.find((t) => t.id === travelerId);
  if (!traveler) throw Errors.notFound('Traveler not found');
  return traveler;
}

export interface UploadVisaDocumentInput {
  contentType: string;
  sizeBytes: number;
  bytes: Buffer;
}

export const visaService = {
  async submitApplication(ctx: AuthContext, bookingId: string, travelerId: string): Promise<VisaApplicationView> {
    assertCan(ctx.role, 'visa.process');
    const organizationId = requireOrg(ctx);
    const traveler = await findTraveler(ctx, bookingId, travelerId);

    const existing = await visaRepository.findByTravelerId(organizationId, travelerId);
    if (existing) throw Errors.conflict('A visa application already exists for this traveler');

    const booking = await bookingService.getById(ctx, bookingId);
    const { packageCountry } = await catalogService.getDepartureDetail(ctx, booking.departureId);

    const application = await visaRepository.create(organizationId, {
      travelerId,
      country: packageCountry,
      travelerFirstName: traveler.firstName,
      travelerLastName: traveler.lastName,
      travelerNationality: traveler.nationality,
      travelerIdOrPassportNumber: traveler.idOrPassportNumber,
    });

    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      action: 'visa.submitted',
      resourceType: 'VisaApplication',
      resourceId: application.id,
      organizationId,
    });
    return application;
  },

  async decideApplication(
    ctx: AuthContext,
    bookingId: string,
    travelerId: string,
    input: DecideVisaInput,
  ): Promise<VisaApplicationView> {
    assertCan(ctx.role, 'visa.process');
    const organizationId = requireOrg(ctx);
    await findTraveler(ctx, bookingId, travelerId);

    const existing = await visaRepository.findByTravelerId(organizationId, travelerId);
    if (!existing) throw Errors.notFound('Visa application not found');
    if (!canDecide(existing.status)) throw Errors.conflict(`Cannot decide a ${existing.status} application`);

    const decided = await visaRepository.decide(organizationId, existing.id, input.outcome, new Date());
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.role,
      action: 'visa.decided',
      resourceType: 'VisaApplication',
      resourceId: decided.id,
      organizationId,
    });
    return decided;
  },

  async uploadDocument(
    ctx: AuthContext,
    bookingId: string,
    travelerId: string,
    input: UploadVisaDocumentInput,
  ): Promise<DocumentSummary> {
    assertCan(ctx.role, 'visa.process');
    const organizationId = requireOrg(ctx);
    await findTraveler(ctx, bookingId, travelerId);

    const application = await visaRepository.findByTravelerId(organizationId, travelerId);
    if (!application) throw Errors.notFound('Visa application not found');

    const doc = await documentsService.uploadDocument(ctx, { ...input, kind: 'VISA' });
    await visaRepository.setDocument(organizationId, application.id, doc.id);
    return doc;
  },

  async getApplication(ctx: AuthContext, bookingId: string, travelerId: string): Promise<VisaApplicationView> {
    assertCan(ctx.role, 'documents.read');
    const organizationId = requireOrg(ctx);
    await findTraveler(ctx, bookingId, travelerId);

    const application = await visaRepository.findByTravelerId(organizationId, travelerId);
    if (!application) throw Errors.notFound('Visa application not found');
    return application;
  },

  async streamDocument(ctx: AuthContext, bookingId: string, travelerId: string): Promise<DocumentStream> {
    assertCan(ctx.role, 'documents.read');
    const organizationId = requireOrg(ctx);
    await findTraveler(ctx, bookingId, travelerId);

    const application = await visaRepository.findByTravelerId(organizationId, travelerId);
    if (!application?.documentId) throw Errors.notFound('Visa document not found');
    return documentsService.streamDocument(ctx, application.documentId);
  },

  /** IMMIGRATION_OFFICER: forced to their own assignedCountry (BR-10), any
   * `country` argument is ignored. Admins (SUPERADMIN/PLATFORM_ADMIN, via
   * '*') may pass a country to filter or omit it to see every country. */
  async listForCountry(ctx: AuthContext, country?: string): Promise<OfficerVisaView[]> {
    assertCan(ctx.role, 'immigration.read');
    const organizationId = requireOrg(ctx);

    if (ctx.role === 'IMMIGRATION_OFFICER') {
      if (!ctx.assignedCountry) throw Errors.forbidden('No country assigned to this officer');
      return visaRepository.listForCountry(organizationId, ctx.assignedCountry);
    }
    return country ? visaRepository.listForCountry(organizationId, country) : visaRepository.listAll(organizationId);
  },
};
