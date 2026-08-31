'use server';

import { randomUUID } from 'crypto';
import { cookies, headers } from 'next/headers';
import { analyticsService } from '@modules/analytics';
import { authService } from '@modules/auth';
import { CreateTailorMadeInput, bookingService } from '@modules/booking';
import { toE164 } from '@lib/country-codes';
import { COOKIE_CONSENT_COOKIE, isAnalyticsConsentGiven } from '@lib/cookie-consent';
import { ApiError } from '@lib/errors';
import { logger, newTraceId } from '@lib/logger';
import { isStaffRole } from '@lib/rbac';

const WIZARD_SESSION_COOKIE = 'wizard_session';

/**
 * Best-effort wizard-step-abandonment tracking (DR-155) -- fired on every
 * step the guest lands on, fire-and-forget from the client. Deliberately
 * never throws: this must never block or visibly affect the wizard. No
 * account/session is created here -- just an opaque cookie id, distinct
 * from better-auth's own session cookie.
 *
 * DR-207: gated behind the cookie-consent banner's choice -- this is the
 * one non-essential cookie on the guest site (see CLAUDE.md's cookie
 * inventory / the Cookie Policy tab on /terms). No consent yet, or an
 * explicit reject, means this is a silent no-op -- never sets the cookie,
 * never records the step.
 */
export async function recordWizardStepAction(step: number): Promise<void> {
  try {
    const cookieStore = await cookies();
    if (!isAnalyticsConsentGiven(cookieStore.get(COOKIE_CONSENT_COOKIE)?.value)) return;
    let sessionToken = cookieStore.get(WIZARD_SESSION_COOKIE)?.value;
    if (!sessionToken) {
      sessionToken = randomUUID();
      cookieStore.set(WIZARD_SESSION_COOKIE, sessionToken, {
        httpOnly: true,
        maxAge: 60 * 60 * 24, // 1 day -- long enough to cover a single sitting through the wizard
        path: '/',
      });
    }
    const ip = (await headers()).get('x-forwarded-for')?.split(',')[0]?.trim();
    await analyticsService.recordWizardStep({ sessionToken, step, ip });
  } catch {
    // Never surface a tracking failure to the guest.
  }
}

export type CreatePlanMyTripResult = { bookingId: string } | { error: string };

export interface CreatePlanMyTripPayload {
  countries: string[];
  customTravelStart: string;
  customTravelEnd: string;
  seats: number;
  preferredTags: string[];
  preferredSites: string[];
  customDescription?: string; // optional (DR-048)
  preferredAddons?: string[];
  countryOfResidence: string;
  citizenship: string;
  specialRequests?: string;
  firstName: string;
  lastName: string;
  email: string;
  dialCode: string;
  localNumber: string;
}

// Mirrors (guest)/book/[departureId]/actions.ts's createGuestBookingAction --
// same reasoning applies here: called right after the client establishes the
// anonymous session, returns a result instead of calling redirect() since
// it's invoked from a plain client event handler, not a <form action>.
// Still creates a TAILOR_MADE booking exactly as the old tailor-made form
// did (DR-046 merged the entry point, not the underlying operation) --
// tags/sites are the old quiz's preference questions, carried over as
// Booking.preferredTags/preferredSites (staff context only, no scoring).
// Takes a plain object, not FormData (DR-047) -- the form is now a
// client-managed multi-step wizard, not a single native <form> submit.
export async function createPlanMyTripRequestAction(payload: CreatePlanMyTripPayload): Promise<CreatePlanMyTripResult> {
  const traceId = newTraceId();
  try {
    const ctx = await authService.resolveSession(await headers());

    // User.name is a single better-auth-managed string (no firstName/lastName
    // split at the schema level), so it's combined here for the account
    // profile -- but the split firstName/lastName ALSO get passed into
    // CreateTailorMadeInput below and stored as Booking.contactFirstName/
    // contactLastName (DR-057), since /find-booking's last-name check needs
    // a real last name to match against before any Traveler manifest exists.
    //
    // Real incident: resolveSession() resolves whatever session cookie the
    // browser carries, with no staff-vs-guest distinction -- a staff member
    // who opens this guest wizard in the same browser they're signed into
    // /staff with (e.g. to test the flow, or walk a client through it
    // in person) gets their OWN account back as `ctx`, and typing the
    // client's name into this step then overwrote the staff member's own
    // User.name. Guarding on isStaffRole here stops the profile write for
    // any staff role, not just SUPERADMIN -- the booking itself still
    // proceeds under that session below, unchanged.
    const name = `${payload.firstName.trim()} ${payload.lastName.trim()}`.trim();
    if (name && !isStaffRole(ctx.roles)) {
      await authService.updateProfile(ctx, {
        name,
        phone: payload.localNumber ? toE164(payload.dialCode, payload.localNumber) : undefined,
      });
    }

    // DR-140: reject a plan-my-trip request typed under an email that
    // already belongs to a real staff account (any non-TOURIST role) --
    // explicit user request. Only staff accounts are checked, not every
    // existing User row: a returning guest re-using their own email is
    // expected and fine.
    const contactEmail = payload.email.trim();
    const existingByEmail = await authService.getUserByEmail(contactEmail);
    if (existingByEmail && isStaffRole(existingByEmail.roles)) {
      return { error: 'This email address is already associated with an account on this platform. Please contact us directly if you\'d like to proceed.' };
    }

    const input = CreateTailorMadeInput.parse({
      countries: payload.countries.map((c) => c.trim().toUpperCase()),
      customTravelStart: payload.customTravelStart,
      customTravelEnd: payload.customTravelEnd,
      seats: payload.seats,
      customDescription: payload.customDescription?.trim() || undefined,
      specialRequests: payload.specialRequests?.trim() || undefined,
      preferredTags: payload.preferredTags,
      preferredSites: payload.preferredSites,
      email: contactEmail,
      firstName: payload.firstName.trim(),
      lastName: payload.lastName.trim(),
      preferredAddons: payload.preferredAddons,
      countryOfResidence: payload.countryOfResidence.trim().toUpperCase(),
      citizenship: payload.citizenship.trim().toUpperCase(),
    });
    // Confirmation email language follows the guest's own site-wide locale
    // cookie (DR-023) -- notifications' Locale enum is uppercase ('EN'/'FR'),
    // the cookie's value is lowercase; default 'en' matches request.ts's own
    // fallback.
    const cookieLocale = (await cookies()).get('locale')?.value;
    const locale = cookieLocale === 'fr' ? 'FR' : 'EN';

    const booking = await bookingService.createTailorMadeRequest(ctx, input, locale);
    return { bookingId: booking.id };
  } catch (err) {
    if (err instanceof ApiError) {
      return { error: err.detail ?? err.title };
    }
    logger(traceId).error('plan-my-trip request failed unexpectedly', {
      message: err instanceof Error ? err.message : String(err),
    });
    return { error: 'Something went wrong submitting your request -- please try again.' };
  }
}
