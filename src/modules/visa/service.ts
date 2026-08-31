// visa module — service. Business logic; orchestrates repository + rbac.
// Callable by other modules ONLY through index.ts (module boundary rule).
import type { Currency } from '@prisma/client';
import { authService, type AuthContext } from '@modules/auth';
import { bookingService, type TravelerView } from '@modules/booking';
import { catalogService } from '@modules/catalog';
import { documentsService, type DocumentSummary, type DocumentStream } from '@modules/documents';
import { immigrationService } from '@modules/immigration';
import { notificationsService } from '@modules/notifications';
import { audit } from '@lib/audit';
import { Errors } from '@lib/errors';
import { assertCan } from '@lib/rbac';
import {
  canDecide,
  canMarkFeePaid,
  canRequestFeePayment,
  canResubmit,
  isVisaDeleter,
  type BookingLookupVisaView,
  type ContactTravelerInput,
  type DecideVisaInput,
  type FacilitatorVisaView,
  type GuestVisaApplicationView,
  type PendingVisaApplicationView,
  type VisaApplicationView,
} from './domain';
import { visaRepository } from './repository';

// DR-184: shared by submitApplication/autoSubmitOnPassportUpload/the two
// resubmit paths -- the government fee is always looked up the same way,
// via the new no-ctx immigration.getPublicFee (never immigrationService
// .getRegulation, which requires country_regulation.read and would reject
// a guest/no-permission caller).
async function resolveGovernmentFee(country: string): Promise<{ governmentFeeMinor: number | null; governmentFeeCurrency: Currency | null }> {
  const fee = await immigrationService.getPublicFee(country);
  return { governmentFeeMinor: fee.governmentFeeMinor, governmentFeeCurrency: fee.feeCurrency };
}

function requireOrg(ctx: AuthContext): string {
  if (!ctx.organizationId) throw Errors.forbidden('No organization membership');
  return ctx.organizationId;
}

/** DR-205: shared by submitApplication/autoSubmitOnPassportUpload -- alerts
 * every VISA_FACILITATOR in the org that a new application landed in their
 * queue. Best-effort/sequential per facilitator, same as every other
 * notify() call in this module -- never throws, so a facilitator alert
 * failure can't block the application itself from being created. */
async function notifyFacilitatorQueue(organizationId: string, travelerName: string, country: string): Promise<void> {
  const facilitators = await authService.listUsersByRole(organizationId, 'VISA_FACILITATOR');
  for (const facilitator of facilitators) {
    await notificationsService.notify('VISA_QUEUE_NEW_APPLICATION', facilitator.id, organizationId, {
      travelerName,
      country,
    });
  }
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

    // DR-111: a TAILOR_MADE traveler may never have had these collected --
    // a visa application can't be filed without knowing them.
    if (!traveler.nationality || !traveler.idOrPassportNumber) {
      throw Errors.validation('Traveler is missing nationality/passport number required for a visa application');
    }

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

    const fee = await resolveGovernmentFee(country);
    const application = await visaRepository.create(organizationId, {
      travelerId,
      country,
      travelerFirstName: traveler.firstName,
      travelerLastName: traveler.lastName,
      travelerNationality: traveler.nationality,
      travelerIdOrPassportNumber: traveler.idOrPassportNumber,
      ...fee,
    });

    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'visa.submitted',
      resourceType: 'VisaApplication',
      resourceId: application.id,
      organizationId,
    });
    const travelerName = `${traveler.firstName} ${traveler.lastName}`;
    await notificationsService.notify('VISA_SUBMITTED', booking.touristUserId, organizationId, { travelerName, country });
    await notifyFacilitatorQueue(organizationId, travelerName, country);
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
    const traveler = await findTraveler(ctx, bookingId, travelerId);

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

    // DR-154: let the guest know their application was decided -- same
    // "notify the booking's tour lead, since a Traveler isn't its own User
    // account" shape as contactTraveler/requestMissingDocuments above.
    const booking = await bookingService.getBookingForTraveler(ctx, travelerId);
    if (booking) {
      const travelerName = `${traveler.firstName} ${traveler.lastName}`;
      await notificationsService.notify(
        input.outcome === 'APPROVED' ? 'VISA_APPROVED' : 'VISA_REJECTED',
        booking.touristUserId,
        organizationId,
        { travelerName, rejectionReason: input.outcome === 'REJECTED' ? (input.reason ?? undefined) : undefined },
      );
    }
    return decided;
  },

  /** DR-025: closes the DR-019-deferred dead end. Same anti-BOLA/permission
   * shape as submitApplication/decideApplication. */
  async resubmitApplication(ctx: AuthContext, bookingId: string, travelerId: string): Promise<VisaApplicationView> {
    assertCan(ctx, 'visa.process');
    const organizationId = requireOrg(ctx);
    const traveler = await findTraveler(ctx, bookingId, travelerId);

    const existing = await visaRepository.findByTravelerId(organizationId, travelerId);
    if (!existing) throw Errors.notFound('Visa application not found');
    if (!canResubmit(existing.status)) throw Errors.conflict(`Cannot resubmit a ${existing.status} application`);

    // DR-184: only re-snapshot the government fee while nothing has been
    // requested/collected against it yet -- once staff has acted on the
    // fee, a resubmission must not silently change the number.
    const feeRefresh = existing.feePaymentStatus === 'NOT_REQUESTED' ? await resolveGovernmentFee(existing.country) : undefined;
    const resubmitted = await visaRepository.resubmit(organizationId, existing.id, feeRefresh);
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
    const booking = await bookingService.getBookingForTraveler(ctx, travelerId);
    if (booking) {
      await notificationsService.notify('VISA_RESUBMITTED', booking.touristUserId, organizationId, {
        travelerName: `${traveler.firstName} ${traveler.lastName}`,
      });
    }
    return resubmitted;
  },

  /** DR-154: guest self-service counterpart to resubmitApplication -- same
   * canResubmit/visaRepository.resubmit logic, deliberately without the
   * `visa.process` assertion. The caller here is the booking's own tour
   * lead (the only session that can ever reach this booking's travelers at
   * all -- findTraveler's ownership check, via bookingService.listTravelers,
   * already throws 404 for anyone else), not a staff facilitator, so this
   * doesn't expose any new data or capability -- it's the same "caller
   * already gates it" convention as autoSubmitOnPassportUpload. The guest
   * action calling this (resubmitVisaAction) uploads a fresh passport first,
   * same precedent as the initial passport-upload wizard. */
  async resubmitApplicationForGuest(ctx: AuthContext, bookingId: string, travelerId: string): Promise<VisaApplicationView> {
    const organizationId = requireOrg(ctx);
    const traveler = await findTraveler(ctx, bookingId, travelerId);

    const existing = await visaRepository.findByTravelerId(organizationId, travelerId);
    if (!existing) throw Errors.notFound('Visa application not found');
    if (!canResubmit(existing.status)) throw Errors.conflict(`Cannot resubmit a ${existing.status} application`);

    // DR-184: same re-snapshot-only-while-untouched rule as the staff path.
    const feeRefresh = existing.feePaymentStatus === 'NOT_REQUESTED' ? await resolveGovernmentFee(existing.country) : undefined;
    const resubmitted = await visaRepository.resubmit(organizationId, existing.id, feeRefresh);
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'visa.resubmitted',
      resourceType: 'VisaApplication',
      resourceId: resubmitted.id,
      organizationId,
      metadata: {
        previousRejectionReason: existing.rejectionReason,
        resubmissionCount: resubmitted.resubmissionCount,
        trigger: 'guest_self_service',
      },
    });
    const booking = await bookingService.getBookingForTraveler(ctx, travelerId);
    if (booking) {
      await notificationsService.notify('VISA_RESUBMITTED', booking.touristUserId, organizationId, {
        travelerName: `${traveler.firstName} ${traveler.lastName}`,
      });
    }
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

  /** DR-184: staff marks the destination country's government fee as
   * requested from the traveler -- entirely out-of-band (no Payment/Invoice
   * created here, no push notification sent; the guest finds out by
   * checking /find-booking or their booking pages, per explicit user
   * choice). Same findTraveler ownership check as every other row action on
   * /staff/visa-queue. */
  async requestFeePayment(ctx: AuthContext, bookingId: string, travelerId: string): Promise<VisaApplicationView> {
    assertCan(ctx, 'visa.process');
    const organizationId = requireOrg(ctx);
    await findTraveler(ctx, bookingId, travelerId);

    const existing = await visaRepository.findByTravelerId(organizationId, travelerId);
    if (!existing) throw Errors.notFound('Visa application not found');
    if (!canRequestFeePayment(existing.feePaymentStatus)) {
      throw Errors.conflict(`Cannot request payment for a fee already ${existing.feePaymentStatus}`);
    }

    const updated = await visaRepository.requestFeePayment(organizationId, existing.id);
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'visa.fee_payment_requested',
      resourceType: 'VisaApplication',
      resourceId: updated.id,
      organizationId,
      metadata: { governmentFeeMinor: updated.governmentFeeMinor, governmentFeeCurrency: updated.governmentFeeCurrency },
    });
    return updated;
  },

  /** DR-184: staff marks the government fee as collected -- again purely a
   * status flag, no Payment/Invoice, no notification. */
  async markFeePaid(ctx: AuthContext, bookingId: string, travelerId: string): Promise<VisaApplicationView> {
    assertCan(ctx, 'visa.process');
    const organizationId = requireOrg(ctx);
    await findTraveler(ctx, bookingId, travelerId);

    const existing = await visaRepository.findByTravelerId(organizationId, travelerId);
    if (!existing) throw Errors.notFound('Visa application not found');
    if (!canMarkFeePaid(existing.feePaymentStatus)) {
      throw Errors.conflict(`Cannot mark a ${existing.feePaymentStatus} fee as paid`);
    }

    const updated = await visaRepository.markFeePaid(organizationId, existing.id);
    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'visa.fee_marked_paid',
      resourceType: 'VisaApplication',
      resourceId: updated.id,
      organizationId,
      metadata: { governmentFeeMinor: updated.governmentFeeMinor, governmentFeeCurrency: updated.governmentFeeCurrency },
    });
    return updated;
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

  /** DR-154: guest self-service counterpart to getApplication, for the
   * authenticated booking status page -- deliberately without the
   * `documents.read` assertion (TOURIST doesn't hold it), relying instead on
   * findTraveler's existing ownership check for anti-BOLA (same convention as
   * resubmitApplicationForGuest above). Returns the minimized
   * GuestVisaApplicationView, not the full VisaApplicationView -- no
   * organizationId/travelerNationality/idOrPassportNumber/documentId
   * exposure, same minimization precedent as FacilitatorVisaView. Returns
   * null (not a throw) when no application exists yet -- a booking can have
   * requiresPassportUpload true with the passport step not yet completed. */
  async getApplicationForGuest(ctx: AuthContext, bookingId: string, travelerId: string): Promise<GuestVisaApplicationView | null> {
    const organizationId = requireOrg(ctx);
    const traveler = await findTraveler(ctx, bookingId, travelerId);

    const application = await visaRepository.findByTravelerId(organizationId, travelerId);
    if (!application) return null;
    return {
      travelerId,
      travelerName: `${traveler.firstName} ${traveler.lastName}`,
      status: application.status,
      rejectionReason: application.rejectionReason,
      resubmissionCount: application.resubmissionCount,
      hasDocument: application.documentId !== null,
      governmentFeeMinor: application.governmentFeeMinor,
      governmentFeeCurrency: application.governmentFeeCurrency,
      feePaymentStatus: application.feePaymentStatus,
    };
  },

  /** Guest `/find-booking` lookup: just the bare status + fee-payment state
   * (never the full VisaApplicationView -- no rejectionReason/documentId
   * exposure to an unauthenticated caller), no ctx -- same "caller already
   * gates" convention as fleetService.listVehiclesForBookingLookup. Only
   * ever called when Booking.requiresPassportUpload is true, per explicit
   * user scoping ("just the visa status if it was ticked by the client").
   * DR-184 widened this from a bare VisaStatus to also carry
   * feePaymentStatus, so /find-booking can reflect the government-fee
   * status staff sets from /staff/visa-queue. */
  async getStatusForBookingLookup(organizationId: string, travelerId: string): Promise<BookingLookupVisaView | null> {
    const application = await visaRepository.findByTravelerId(organizationId, travelerId);
    if (!application) return null;
    return { status: application.status, feePaymentStatus: application.feePaymentStatus };
  },

  async streamDocument(ctx: AuthContext, bookingId: string, travelerId: string): Promise<DocumentStream> {
    assertCan(ctx, 'documents.read');
    const organizationId = requireOrg(ctx);
    await findTraveler(ctx, bookingId, travelerId);

    const application = await visaRepository.findByTravelerId(organizationId, travelerId);
    if (!application?.documentId) throw Errors.notFound('Visa document not found');
    return documentsService.streamDocument(ctx, application.documentId);
  },

  /** DR-154: guest self-service counterpart to streamDocument, for
   * downloading a granted visa document from the authenticated booking
   * status page -- deliberately without the `documents.read` assertion
   * (TOURIST doesn't hold it), relying on findTraveler's ownership check for
   * anti-BOLA. Only ever streams once APPROVED -- a REJECTED application's
   * documentId is already nulled by repository.resubmit, but this also
   * guards the (currently unreachable) case of a stale document lingering
   * on a still-SUBMITTED application. */
  async streamDocumentForGuest(ctx: AuthContext, bookingId: string, travelerId: string): Promise<DocumentStream> {
    const organizationId = requireOrg(ctx);
    await findTraveler(ctx, bookingId, travelerId);

    const application = await visaRepository.findByTravelerId(organizationId, travelerId);
    if (application?.status !== 'APPROVED' || !application.documentId) throw Errors.notFound('Visa document not found');
    return documentsService.streamDocumentForOwner(ctx, application.documentId);
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
        let hasPassport = false;
        let packageReference: string | null = null;
        let bookingReference: string | null = null;
        try {
          const booking = await bookingService.getBookingForTraveler(ctx, row.travelerId);
          if (booking) {
            bookingId = booking.id;
            origin = booking.origin;
            bookingReference = booking.bookingReference;
            if (booking.departureId) {
              const { departure } = await catalogService.getDepartureDetail(ctx, booking.departureId);
              travelStartDate = departure.startDate;
              if (departure.tourPackageId) {
                try {
                  const pkg = await catalogService.getPackage(ctx, departure.tourPackageId);
                  packageReference = pkg.packageReference;
                } catch {
                  // Package no longer resolvable for this role (e.g.
                  // archived) -- the page falls back to bookingReference.
                }
              }
            } else {
              travelStartDate = booking.customTravelStart;
            }
          }
        } catch {
          // Booking/departure no longer resolvable for this role (e.g. a
          // COMPLETED trip) -- leave travelStartDate/bookingId/origin null
          // rather than fail the whole queue over one unresolvable row.
        }
        try {
          const traveler = await bookingService.getTravelerById(ctx, row.travelerId);
          hasPassport = traveler?.passportDocumentId != null;
        } catch {
          // Same tolerance as above -- leave hasPassport false rather than
          // fail the whole queue over one unresolvable row.
        }
        return { ...row, bookingId, origin, travelStartDate, hasPassport, packageReference, bookingReference };
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
    // DR-111: a TAILOR_MADE traveler may have skipped these -- skip auto-
    // submission rather than crash; the "needs application" reconciliation
    // view (listNeedingApplication) still surfaces the traveler so staff can
    // submit manually once the missing details are known.
    if (!traveler.nationality || !traveler.idOrPassportNumber) return;
    const fee = await resolveGovernmentFee(country);
    const application = await visaRepository.create(organizationId, {
      travelerId,
      country,
      travelerFirstName: traveler.firstName,
      travelerLastName: traveler.lastName,
      travelerNationality: traveler.nationality,
      travelerIdOrPassportNumber: traveler.idOrPassportNumber,
      ...fee,
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
    const travelerName = `${traveler.firstName} ${traveler.lastName}`;
    await notificationsService.notify('VISA_SUBMITTED', booking.touristUserId, organizationId, { travelerName, country });
    await notifyFacilitatorQueue(organizationId, travelerName, country);
  },

  /** DR-151 (explicit user request): SUPERADMIN-only genuine delete of an
   * individual visa application from /staff/visa-queue. `assertCan` alone
   * isn't enough, since `visa.delete` could in principle be granted to
   * another role via the runtime-editable permission matrix --
   * `isVisaDeleter` is the real gate, same layering as
   * ratingsService.deleteReview/bookingService.deleteBooking. No FK
   * cleanup needed beyond the row itself: the referenced Document (a
   * granted visa decision doc, if any) is left in place, same accepted
   * "orphaned blob" tradeoff as every other delete path in this app (no
   * blob-deletion capability exists anywhere yet). */
  async deleteApplication(ctx: AuthContext, applicationId: string): Promise<void> {
    assertCan(ctx, 'visa.delete');
    if (!isVisaDeleter(ctx.roles)) throw Errors.forbidden('Only SUPERADMIN may delete a visa application');
    const organizationId = requireOrg(ctx);

    const deleted = await visaRepository.deleteById(organizationId, applicationId);
    if (!deleted) throw Errors.notFound('Visa application not found');

    await audit({
      actorUserId: ctx.userId,
      actorRole: ctx.roles[0],
      action: 'visa.application_deleted',
      resourceType: 'VisaApplication',
      resourceId: applicationId,
      organizationId,
      metadata: {
        travelerId: deleted.travelerId,
        travelerName: `${deleted.travelerFirstName} ${deleted.travelerLastName}`,
        country: deleted.country,
        statusAtDeletion: deleted.status,
      },
    });
  },

  /** DR-151 (explicit user request): closes the same regression class
   * DR-059 already fixed for Itinerary -- a VisaApplication left pointing
   * at a soft-deleted Booking's Traveler would keep showing up on
   * /staff/visa-queue as if nothing had happened (the visa module has no
   * concept of "booking deleted"). Deliberately NOT called from
   * bookingService.deleteBooking itself -- this module already depends on
   * booking (see findTraveler/contactTraveler above), so booking calling
   * back into visa would create a circular module dependency; the caller
   * (the staff deleteBookingAction Server Action and the DELETE
   * /api/v1/bookings/[bookingId] route, same as the itinerary cleanup
   * they already orchestrate) calls this instead, BEFORE the booking
   * itself is deleted -- bookingService.listTravelers needs the booking to
   * still be visible. Asserts visa.process, not visa.delete: by the time
   * this runs the caller has already passed booking.delete's own
   * SUPERADMIN-only gate, so this is an internal cleanup step riding along
   * on an already-authorized actor, not a second independently-reachable
   * delete surface. No-op, not an error, when none of the booking's
   * travelers have a visa application at all -- most bookings don't. */
  async deleteForBooking(ctx: AuthContext, bookingId: string): Promise<void> {
    assertCan(ctx, 'visa.process');
    const organizationId = requireOrg(ctx);
    const travelers = await bookingService.listTravelers(ctx, bookingId);
    if (travelers.length === 0) return;

    const deleted = await visaRepository.deleteManyByTravelerIds(
      organizationId,
      travelers.map((t) => t.id),
    );
    for (const application of deleted) {
      await audit({
        actorUserId: ctx.userId,
        actorRole: ctx.roles[0],
        action: 'visa.application_deleted',
        resourceType: 'VisaApplication',
        resourceId: application.id,
        organizationId,
        metadata: { travelerId: application.travelerId, bookingId, trigger: 'booking_deleted' },
      });
    }
  },
};
