// visa module — service. Business logic; orchestrates repository + rbac.
// Callable by other modules ONLY through index.ts (module boundary rule).
import type { AuthContext } from '@modules/auth';
import { bookingService, type TravelerView } from '@modules/booking';
import { catalogService } from '@modules/catalog';
import { documentsService, type DocumentSummary, type DocumentStream } from '@modules/documents';
import { audit } from '@lib/audit';
import { Errors } from '@lib/errors';
import { assertCan } from '@lib/rbac';
import {
  canDecide,
  canResubmit,
  type DecideVisaInput,
  type FacilitatorVisaView,
  type VisaApplicationView,
} from './domain';
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
    assertCan(ctx.roles, 'visa.process');
    const organizationId = requireOrg(ctx);
    const traveler = await findTraveler(ctx, bookingId, travelerId);

    const existing = await visaRepository.findByTravelerId(organizationId, travelerId);
    if (existing) throw Errors.conflict('A visa application already exists for this traveler');

    const booking = await bookingService.getById(ctx, bookingId);
    // A PREDEFINED_PACKAGE booking's country comes from its departure's
    // package; a TAILOR_MADE booking has no departure, so it carries its own
    // customCountry instead (same fallback as invoicingService).
    let country: string;
    if (booking.departureId) {
      ({ packageCountry: country } = await catalogService.getDepartureDetail(ctx, booking.departureId));
    } else if (booking.customCountry) {
      country = booking.customCountry;
    } else {
      throw Errors.conflict('This booking has no destination country for a visa application');
    }

    const application = await visaRepository.create(organizationId, {
      travelerId,
      country,
      travelerFirstName: traveler.firstName,
      travelerLastName: traveler.lastName,
      travelerNationality: traveler.nationality,
      travelerIdOrPassportNumber: traveler.idOrPassportNumber,
    });

    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
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
    assertCan(ctx.roles, 'visa.process');
    const organizationId = requireOrg(ctx);
    await findTraveler(ctx, bookingId, travelerId);

    const existing = await visaRepository.findByTravelerId(organizationId, travelerId);
    if (!existing) throw Errors.notFound('Visa application not found');
    if (!canDecide(existing.status)) throw Errors.conflict(`Cannot decide a ${existing.status} application`);

    const decided = await visaRepository.decide(organizationId, existing.id, input.outcome, new Date(), input.reason);
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'visa.decided',
      resourceType: 'VisaApplication',
      resourceId: decided.id,
      organizationId,
      metadata: { outcome: input.outcome, reason: input.reason ?? null },
    });
    return decided;
  },

  /** DR-025: closes the DR-019-deferred dead end. Same anti-BOLA/permission
   * shape as submitApplication/decideApplication. */
  async resubmitApplication(ctx: AuthContext, bookingId: string, travelerId: string): Promise<VisaApplicationView> {
    assertCan(ctx.roles, 'visa.process');
    const organizationId = requireOrg(ctx);
    await findTraveler(ctx, bookingId, travelerId);

    const existing = await visaRepository.findByTravelerId(organizationId, travelerId);
    if (!existing) throw Errors.notFound('Visa application not found');
    if (!canResubmit(existing.status)) throw Errors.conflict(`Cannot resubmit a ${existing.status} application`);

    const resubmitted = await visaRepository.resubmit(organizationId, existing.id);
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'visa.resubmitted',
      resourceType: 'VisaApplication',
      resourceId: resubmitted.id,
      organizationId,
      // The previous rejection reason is captured here, in the append-only
      // audit trail, since repository.resubmit nulls it on the live row.
      metadata: { previousRejectionReason: existing.rejectionReason, resubmissionCount: resubmitted.resubmissionCount },
    });
    return resubmitted;
  },

  async uploadDocument(
    ctx: AuthContext,
    bookingId: string,
    travelerId: string,
    input: UploadVisaDocumentInput,
  ): Promise<DocumentSummary> {
    assertCan(ctx.roles, 'visa.process');
    const organizationId = requireOrg(ctx);
    await findTraveler(ctx, bookingId, travelerId);

    const application = await visaRepository.findByTravelerId(organizationId, travelerId);
    if (!application) throw Errors.notFound('Visa application not found');

    const doc = await documentsService.uploadDocument(ctx, { ...input, kind: 'VISA' });
    await visaRepository.setDocument(organizationId, application.id, doc.id);
    return doc;
  },

  async getApplication(ctx: AuthContext, bookingId: string, travelerId: string): Promise<VisaApplicationView> {
    assertCan(ctx.roles, 'documents.read');
    const organizationId = requireOrg(ctx);
    await findTraveler(ctx, bookingId, travelerId);

    const application = await visaRepository.findByTravelerId(organizationId, travelerId);
    if (!application) throw Errors.notFound('Visa application not found');
    return application;
  },

  async streamDocument(ctx: AuthContext, bookingId: string, travelerId: string): Promise<DocumentStream> {
    assertCan(ctx.roles, 'documents.read');
    const organizationId = requireOrg(ctx);
    await findTraveler(ctx, bookingId, travelerId);

    const application = await visaRepository.findByTravelerId(organizationId, travelerId);
    if (!application?.documentId) throw Errors.notFound('Visa document not found');
    return documentsService.streamDocument(ctx, application.documentId);
  },

  /** VISA_FACILITATOR's own "My Schedule" dashboard (DR-031) -- unlike
   * listForCountry (IMMIGRATION_OFFICER, country-scoped, BR-10-minimized),
   * this role has no scoping concept of its own, so it sees the whole org's
   * queue (explicit user choice) -- matches its existing unscoped
   * visa.process permission, no new exposure. Resolves each application's
   * travel start date via a live join (Traveler -> Booking -> Departure, or
   * Booking.customTravelStart for a TAILOR_MADE booking) since
   * VisaApplication itself has no date field for this -- sorted soonest
   * travel date first (nulls -- unresolvable, e.g. a COMPLETED departure
   * catalogService.getDepartureDetail no longer shows a non-operator role --
   * sort last since there's nothing to prioritize against). */
  async listForFacilitator(ctx: AuthContext): Promise<FacilitatorVisaView[]> {
    assertCan(ctx.roles, 'visa.process');
    const organizationId = requireOrg(ctx);
    const rows = await visaRepository.listAllForFacilitator(organizationId);

    const withDates = await Promise.all(
      rows.map(async (row) => {
        let travelStartDate: Date | null = null;
        try {
          const booking = await bookingService.getBookingForTraveler(ctx, row.travelerId);
          if (booking) {
            if (booking.departureId) {
              const { departure } = await catalogService.getDepartureDetail(ctx, booking.departureId);
              travelStartDate = departure.startDate;
            } else {
              travelStartDate = booking.customTravelStart;
            }
          }
        } catch {
          // Booking/departure no longer resolvable for this role (e.g. a
          // COMPLETED trip) -- leave travelStartDate null rather than fail
          // the whole queue over one unresolvable row.
        }
        return { ...row, travelStartDate };
      }),
    );

    withDates.sort((a, b) => {
      if (a.travelStartDate && b.travelStartDate) return a.travelStartDate.getTime() - b.travelStartDate.getTime();
      if (a.travelStartDate) return -1;
      if (b.travelStartDate) return 1;
      return 0;
    });
    return withDates;
  },
};
