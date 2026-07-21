// visa module — service. Business logic; orchestrates repository + rbac.
// Callable by other modules ONLY through index.ts (module boundary rule).
import type { AuthContext } from '@modules/auth';
import { bookingService, type TravelerView } from '@modules/booking';
import { catalogService } from '@modules/catalog';
import { documentsService, type DocumentSummary, type DocumentStream } from '@modules/documents';
import { notificationsService } from '@modules/notifications';
import { audit } from '@lib/audit';
import { Errors } from '@lib/errors';
import { assertCan } from '@lib/rbac';
import {
  canDecide,
  canResubmit,
  type ContactTravelerInput,
  type DecideVisaInput,
  type FacilitatorVisaView,
  type PendingVisaApplicationView,
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
    assertCan(ctx, 'visa.process');
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
    assertCan(ctx, 'visa.process');
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
    assertCan(ctx, 'visa.process');
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

  /** Immigration Module (DR-034): "contact travellers." A Traveler isn't
   * itself a User account (only the booking's tour lead is), so this
   * notifies the booking's touristUserId -- the person actually responsible
   * for that traveler's paperwork -- via the existing notifications module
   * (WhatsApp -> SMS -> email fallback, charter rule 8). */
  async contactTraveler(ctx: AuthContext, bookingId: string, travelerId: string, input: ContactTravelerInput): Promise<void> {
    assertCan(ctx, 'visa.process');
    const organizationId = requireOrg(ctx);
    const traveler = await findTraveler(ctx, bookingId, travelerId);
    const booking = await bookingService.getBookingForTraveler(ctx, travelerId);
    if (!booking) throw Errors.notFound('Booking not found for this traveler');

    await notificationsService.notify('VISA_CONTACT_TRAVELER', booking.touristUserId, organizationId, {
      travelerName: `${traveler.firstName} ${traveler.lastName}`,
      message: input.message,
    });
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'visa.contacted_traveler',
      resourceType: 'Traveler',
      resourceId: travelerId,
      organizationId,
      metadata: { message: input.message },
    });
  },

  /** Immigration Module (DR-034): "request missing documents" -- same
   * notification target/reasoning as contactTraveler above. */
  async requestMissingDocuments(ctx: AuthContext, bookingId: string, travelerId: string): Promise<void> {
    assertCan(ctx, 'visa.process');
    const organizationId = requireOrg(ctx);
    const traveler = await findTraveler(ctx, bookingId, travelerId);

    const application = await visaRepository.findByTravelerId(organizationId, travelerId);
    const booking = await bookingService.getBookingForTraveler(ctx, travelerId);
    if (!booking) throw Errors.notFound('Booking not found for this traveler');

    await notificationsService.notify('VISA_MISSING_DOCUMENTS', booking.touristUserId, organizationId, {
      travelerName: `${traveler.firstName} ${traveler.lastName}`,
      country: application?.country,
    });
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'visa.requested_missing_documents',
      resourceType: 'Traveler',
      resourceId: travelerId,
      organizationId,
    });
  },

  async uploadDocument(
    ctx: AuthContext,
    bookingId: string,
    travelerId: string,
    input: UploadVisaDocumentInput,
  ): Promise<DocumentSummary> {
    assertCan(ctx, 'visa.process');
    const organizationId = requireOrg(ctx);
    await findTraveler(ctx, bookingId, travelerId);

    const application = await visaRepository.findByTravelerId(organizationId, travelerId);
    if (!application) throw Errors.notFound('Visa application not found');

    const doc = await documentsService.uploadDocument(ctx, { ...input, kind: 'VISA' });
    await visaRepository.setDocument(organizationId, application.id, doc.id);
    return doc;
  },

  async getApplication(ctx: AuthContext, bookingId: string, travelerId: string): Promise<VisaApplicationView> {
    assertCan(ctx, 'documents.read');
    const organizationId = requireOrg(ctx);
    await findTraveler(ctx, bookingId, travelerId);

    const application = await visaRepository.findByTravelerId(organizationId, travelerId);
    if (!application) throw Errors.notFound('Visa application not found');
    return application;
  },

  async streamDocument(ctx: AuthContext, bookingId: string, travelerId: string): Promise<DocumentStream> {
    assertCan(ctx, 'documents.read');
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
    assertCan(ctx, 'visa.process');
    const organizationId = requireOrg(ctx);
    const rows = await visaRepository.listAllForFacilitator(organizationId);

    const withDates = await Promise.all(
      rows.map(async (row) => {
        let travelStartDate: Date | null = null;
        let bookingId: string | null = null;
        let origin: FacilitatorVisaView['origin'] = null;
        try {
          const booking = await bookingService.getBookingForTraveler(ctx, row.travelerId);
          if (booking) {
            bookingId = booking.id;
            origin = booking.origin;
            if (booking.departureId) {
              const { departure } = await catalogService.getDepartureDetail(ctx, booking.departureId);
              travelStartDate = departure.startDate;
            } else {
              travelStartDate = booking.customTravelStart;
            }
          }
        } catch {
          // Booking/departure no longer resolvable for this role (e.g. a
          // COMPLETED trip) -- leave travelStartDate/bookingId/origin null
          // rather than fail the whole queue over one unresolvable row.
        }
        return { ...row, bookingId, origin, travelStartDate };
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

  /** DR-060: "needs application" reconciliation view for /staff/visa-queue --
   * primarily a safety net now that autoSubmitOnPassportUpload handles the
   * common case, so this should normally return few or zero rows. Composes
   * booking's whole-org candidate list (every traveler with a passport
   * uploaded on a visa-requiring booking) against this module's own
   * existing-application set, diffed here rather than via a direct
   * cross-table join (module boundary -- booking doesn't know about
   * VisaApplication). Sequential awaits, not Promise.all -- the same
   * connection-pool-exhaustion fix Insights (DR-038) and Tracking (DR-041)
   * already established for composing two concurrent withOrg transactions. */
  async listNeedingApplication(ctx: AuthContext): Promise<PendingVisaApplicationView[]> {
    assertCan(ctx, 'visa.process');
    const organizationId = requireOrg(ctx);
    const candidates = await bookingService.listTravelersRequiringVisa(ctx);
    const existingTravelerIds = await visaRepository.listExistingTravelerIds(organizationId);
    return candidates
      .filter((c) => !existingTravelerIds.has(c.travelerId))
      .map((c) => ({
        travelerId: c.travelerId,
        bookingId: c.bookingId,
        origin: c.origin,
        travelerFirstName: c.firstName,
        travelerLastName: c.lastName,
        travelerNationality: c.nationality,
      }));
  },

  /** DR-060: auto-triggered right after a traveler's passport is uploaded
   * (guest wizard, staff wizard, and the raw API route) -- replaces what was
   * previously a fully manual, UI-less action (nothing in this app ever
   * called POST .../visa/submit; the only reachable trigger was a direct API
   * call by someone holding visa.process). A visa application should exist
   * the moment its one real precondition -- an uploaded passport, on a
   * booking that actually needs one -- is met, rather than waiting on a
   * facilitator to separately notice and start it.
   *
   * Deliberately does NOT assertCan(ctx, 'visa.process') -- the caller here
   * is whoever just uploaded the passport (a guest or a staff member without
   * that permission), and this doesn't expose them to any new data or
   * capability: they already have legitimate write access to this exact
   * traveler via setTravelerPassport's own anti-BOLA check. It also never
   * throws -- every non-eligible case (no requiresPassportUpload, an
   * application already exists, country unresolvable) is a silent no-op,
   * and every call site additionally wraps this in try/catch so a failure
   * here can never fail the passport upload itself (same charter-rule-8
   * "must not crash the triggering action" precedent as the Add-ons
   * currency-mismatch fix earlier this session). */
  async autoSubmitOnPassportUpload(ctx: AuthContext, bookingId: string, travelerId: string): Promise<void> {
    const organizationId = requireOrg(ctx);

    const existing = await visaRepository.findByTravelerId(organizationId, travelerId);
    if (existing) return;

    const booking = await bookingService.getById(ctx, bookingId);
    if (!booking.requiresPassportUpload) return;

    let country: string | null = null;
    if (booking.departureId) {
      ({ packageCountry: country } = await catalogService.getDepartureDetail(ctx, booking.departureId));
    } else if (booking.customCountry) {
      country = booking.customCountry;
    }
    if (!country) return;

    const traveler = await findTraveler(ctx, bookingId, travelerId);
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
      action: 'visa.auto_submitted',
      resourceType: 'VisaApplication',
      resourceId: application.id,
      organizationId,
      metadata: { trigger: 'passport_upload' },
    });
  },
};
