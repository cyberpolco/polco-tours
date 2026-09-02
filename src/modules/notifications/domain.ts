// notifications module — domain types & rules. Pure; no framework or DB
// imports. No repository.ts in this module -- it owns no Prisma table;
// delivery outcomes are recorded via the existing @lib/audit, not a
// bespoke log model (DR-013).
import type { Currency, Locale, PaymentKind } from '@prisma/client';
import { format, money } from '@lib/money';
import { renderBrandedEmail } from './email-template';

export type NotificationChannel = 'WHATSAPP' | 'SMS' | 'EMAIL';

export type NotificationEvent =
  | 'BOOKING_CONFIRMED'
  | 'BOOKING_CANCELLED'
  | 'PAYMENT_SUCCEEDED'
  | 'PAYMENT_FAILED'
  | 'QUOTATION_SENT'
  | 'QUOTATION_ACCEPTED'
  | 'BOOKING_REFUNDED'
  | 'INVOICE_ISSUED'
  | 'VISA_CONTACT_TRAVELER'
  | 'VISA_MISSING_DOCUMENTS'
  | 'VISA_APPROVED'
  | 'VISA_REJECTED'
  | 'VISA_SUBMITTED'
  | 'VISA_RESUBMITTED'
  | 'VISA_QUEUE_NEW_APPLICATION'
  | 'RATING_CODE_ISSUED'
  | 'RATING_THANK_YOU'
  | 'TAILOR_MADE_REQUEST_RECEIVED'
  | 'ITINERARY_APPROVED'
  | 'STAFF_PASSWORD_ISSUED'
  | 'STAFF_PASSWORD_RESET'
  | 'STAFF_ACCOUNT_DEACTIVATED'
  | 'STAFF_ACCOUNT_REACTIVATED'
  | 'ASSIGNMENT_NOTICE_DRIVER'
  | 'ASSIGNMENT_NOTICE_GUIDE'
  | 'ASSIGNMENT_NOTICE_VEHICLE_OWNER';

export interface NotificationRecipient {
  phone: string | null;
  email: string;
}

export interface RenderedMessage {
  subject?: string;
  body: string;
}

export interface NotificationData {
  bookingId?: string;
  amountMinor?: number;
  currency?: Currency;
  travelerName?: string; // VISA_CONTACT_TRAVELER / VISA_MISSING_DOCUMENTS / VISA_APPROVED / VISA_REJECTED / VISA_SUBMITTED / VISA_RESUBMITTED / VISA_QUEUE_NEW_APPLICATION
  message?: string; // VISA_CONTACT_TRAVELER: staff-authored free text
  country?: string; // VISA_MISSING_DOCUMENTS / VISA_SUBMITTED / VISA_RESUBMITTED / VISA_QUEUE_NEW_APPLICATION
  rejectionReason?: string; // VISA_REJECTED: staff-authored, optional
  ratingCode?: string; // RATING_CODE_ISSUED
  countries?: string[]; // TAILOR_MADE_REQUEST_RECEIVED -- Booking.preferredCountries
  seats?: number; // TAILOR_MADE_REQUEST_RECEIVED / PAYMENT_SUCCEEDED
  travelStart?: Date; // TAILOR_MADE_REQUEST_RECEIVED / PAYMENT_SUCCEEDED
  travelEnd?: Date; // TAILOR_MADE_REQUEST_RECEIVED / PAYMENT_SUCCEEDED
  tripTitle?: string; // PAYMENT_SUCCEEDED -- the departure's package title; unset for a TAILOR_MADE booking (no package yet)
  tripCountry?: string; // PAYMENT_SUCCEEDED
  paymentKind?: PaymentKind; // PAYMENT_SUCCEEDED -- DEPOSIT picks "on hold, balance due" wording over BALANCE/FULL's "fully paid and confirmed"
  temporaryPassword?: string; // STAFF_PASSWORD_ISSUED / STAFF_PASSWORD_RESET
  email?: string; // STAFF_PASSWORD_ISSUED -- the new account's own address, for the body copy
  startDate?: Date; // ASSIGNMENT_NOTICE_*
  vehicleLabel?: string; // ASSIGNMENT_NOTICE_*
  driverName?: string; // ASSIGNMENT_NOTICE_GUIDE / ASSIGNMENT_NOTICE_VEHICLE_OWNER
  guideName?: string; // ASSIGNMENT_NOTICE_DRIVER
}

const FALLBACK_ORDER: NotificationChannel[] = ['WHATSAPP', 'SMS', 'EMAIL'];

/** Charter rule 8's fallback order, filtered to what the recipient can
 * actually be reached on. EMAIL is always included (User.email is
 * required+unique); WHATSAPP/SMS need a phone number. */
export function resolveChannelOrder(recipient: NotificationRecipient): NotificationChannel[] {
  return FALLBACK_ORDER.filter((c) => c === 'EMAIL' || !!recipient.phone);
}

// DR-205: which brand wordmark/footer contact an event's rendered email
// uses (renderBrandedEmail's `audience`) -- guest-site copy says "Mufasa
// Safaris & Tours" (DR-168), staff-internal copy keeps "POLCO Tours".
const GUEST_EVENTS = new Set<NotificationEvent>([
  'BOOKING_CONFIRMED',
  'BOOKING_CANCELLED',
  'PAYMENT_SUCCEEDED',
  'PAYMENT_FAILED',
  'QUOTATION_SENT',
  'QUOTATION_ACCEPTED',
  'BOOKING_REFUNDED',
  'INVOICE_ISSUED',
  'VISA_CONTACT_TRAVELER',
  'VISA_MISSING_DOCUMENTS',
  'VISA_APPROVED',
  'VISA_REJECTED',
  'VISA_SUBMITTED',
  'VISA_RESUBMITTED',
  'RATING_CODE_ISSUED',
  'RATING_THANK_YOU',
  'TAILOR_MADE_REQUEST_RECEIVED',
  'ITINERARY_APPROVED',
]);

function audienceFor(event: NotificationEvent): 'guest' | 'staff' {
  return GUEST_EVENTS.has(event) ? 'guest' : 'staff';
}

type Template = (data: NotificationData) => RenderedMessage;

function amount(data: NotificationData, locale: string): string {
  return format(money(data.amountMinor ?? 0, data.currency ?? 'USD'), locale);
}

function formatDate(date: Date | undefined, intlLocale: 'en-US' | 'fr-FR'): string | null {
  if (!date) return null;
  return new Intl.DateTimeFormat(intlLocale, { dateStyle: 'long' }).format(date);
}

function formatDateRange(start: Date | undefined, end: Date | undefined, intlLocale: 'en-US' | 'fr-FR'): string | null {
  const startLabel = formatDate(start, intlLocale);
  if (!startLabel) return null;
  const endLabel = formatDate(end, intlLocale);
  return endLabel && endLabel !== startLabel ? `${startLabel} – ${endLabel}` : startLabel;
}

/** A two-column, inline-styled details block for an email body that needs
 * more structure than a single sentence (explicit user request) -- same
 * font/color tokens as renderBrandedEmail's own shell, since email clients
 * strip <style> blocks (see that file's own comment). Rows with no value
 * are skipped rather than rendered blank. */
function summaryTable(rows: Array<[string, string | null | undefined]>): string {
  const cells = rows
    .filter((row): row is [string, string] => !!row[1])
    .map(
      ([label, value]) => `
      <tr>
        <td style="padding:6px 12px 6px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#8C7D78;white-space:nowrap;vertical-align:top;">${label}</td>
        <td style="padding:6px 0;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;color:#211A1D;">${value}</td>
      </tr>`,
    )
    .join('');
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0;border-top:1px solid #E3D6C8;border-bottom:1px solid #E3D6C8;">${cells}</table>`;
}

/** Wraps an event's per-locale content in the shared branded shell
 * (email-template.ts). `event` picks the wordmark/footer via audienceFor. */
function brand(
  event: NotificationEvent,
  opts: { eyebrow: string; heading: string; bodyHtml: string; cta?: { label: string; url: string } },
): string {
  return renderBrandedEmail({ audience: audienceFor(event), ...opts });
}

const FIND_BOOKING_URL = 'https://mufasasafaris.com/find-booking';
const STAFF_LOGIN_URL = '/staff/login';
const STAFF_SCHEDULE_URL = '/staff/schedule';
const STAFF_VISA_QUEUE_URL = '/staff/visa-queue';

const TEMPLATES: Record<NotificationEvent, Record<Locale, Template>> = {
  BOOKING_CONFIRMED: {
    EN: (d) => ({
      subject: 'Your booking is confirmed',
      body: brand('BOOKING_CONFIRMED', {
        eyebrow: 'Booking confirmed',
        heading: 'You&rsquo;re all set',
        bodyHtml: `Your booking ${d.bookingId} is confirmed. See you soon!`,
        cta: { label: 'View your booking', url: FIND_BOOKING_URL },
      }),
    }),
    FR: (d) => ({
      subject: 'Votre réservation est confirmée',
      body: brand('BOOKING_CONFIRMED', {
        eyebrow: 'Réservation confirmée',
        heading: 'C&rsquo;est confirmé',
        bodyHtml: `Votre réservation ${d.bookingId} est confirmée. À bientôt !`,
        cta: { label: 'Voir ma réservation', url: FIND_BOOKING_URL },
      }),
    }),
  },
  BOOKING_CANCELLED: {
    EN: (d) => ({
      subject: 'Your booking was cancelled',
      body: brand('BOOKING_CANCELLED', {
        eyebrow: 'Booking cancelled',
        heading: 'Your booking was cancelled',
        bodyHtml: `Your booking ${d.bookingId} has been cancelled.`,
      }),
    }),
    FR: (d) => ({
      subject: 'Votre réservation a été annulée',
      body: brand('BOOKING_CANCELLED', {
        eyebrow: 'Réservation annulée',
        heading: 'Votre réservation a été annulée',
        bodyHtml: `Votre réservation ${d.bookingId} a été annulée.`,
      }),
    }),
  },
  // DR-215 (explicit user request): a real booking-confirmation body, not a
  // one-sentence receipt -- a details block (reference, trip, dates,
  // travelers, amount) plus wording that distinguishes a DEPOSIT (balance
  // still owed, not "confirmed" yet) from a BALANCE/FULL payment (fully
  // paid and confirmed). Sent via notifyEmail (Resend) directly by
  // invoicing's applyPaymentOutcome, not through notify()'s fallback chain
  // -- see that call site's own comment for why.
  PAYMENT_SUCCEEDED: {
    EN: (d) => {
      const isDeposit = d.paymentKind === 'DEPOSIT';
      const trip = d.tripTitle
        ? `${d.tripTitle}${d.tripCountry ? ` (${d.tripCountry})` : ''}`
        : d.tripCountry
          ? `Your custom trip to ${d.tripCountry}`
          : null;
      return {
        subject: isDeposit ? 'Deposit received' : 'Payment received',
        body: brand('PAYMENT_SUCCEEDED', {
          eyebrow: isDeposit ? 'Deposit received' : 'Payment received',
          heading: isDeposit ? 'Your spot is on hold' : 'You&rsquo;re all set!',
          bodyHtml:
            (isDeposit
              ? `We received your deposit of ${amount(d, 'en')}. Your booking is on hold &mdash; we'll be in touch about the remaining balance.`
              : `We received your payment of ${amount(d, 'en')}. Your trip is fully paid and confirmed!`) +
            summaryTable([
              ['Booking reference', d.bookingId],
              ['Trip', trip],
              ['Travel dates', formatDateRange(d.travelStart, d.travelEnd, 'en-US')],
              ['Travelers', d.seats ? String(d.seats) : null],
              [isDeposit ? 'Deposit paid' : 'Amount paid', amount(d, 'en')],
            ]),
          cta: { label: 'View your booking', url: FIND_BOOKING_URL },
        }),
      };
    },
    FR: (d) => {
      const isDeposit = d.paymentKind === 'DEPOSIT';
      const trip = d.tripTitle
        ? `${d.tripTitle}${d.tripCountry ? ` (${d.tripCountry})` : ''}`
        : d.tripCountry
          ? `Votre voyage sur mesure en ${d.tripCountry}`
          : null;
      return {
        subject: isDeposit ? 'Acompte reçu' : 'Paiement reçu',
        body: brand('PAYMENT_SUCCEEDED', {
          eyebrow: isDeposit ? 'Acompte reçu' : 'Paiement reçu',
          heading: isDeposit ? 'Votre place est réservée' : 'C&rsquo;est confirmé !',
          bodyHtml:
            (isDeposit
              ? `Nous avons reçu votre acompte de ${amount(d, 'fr')}. Votre réservation est en attente &mdash; nous vous recontacterons au sujet du solde restant.`
              : `Nous avons reçu votre paiement de ${amount(d, 'fr')}. Votre voyage est entièrement payé et confirmé !`) +
            summaryTable([
              ['Référence de réservation', d.bookingId],
              ['Voyage', trip],
              ['Dates du voyage', formatDateRange(d.travelStart, d.travelEnd, 'fr-FR')],
              ['Voyageurs', d.seats ? String(d.seats) : null],
              [isDeposit ? 'Acompte versé' : 'Montant payé', amount(d, 'fr')],
            ]),
          cta: { label: 'Voir ma réservation', url: FIND_BOOKING_URL },
        }),
      };
    },
  },
  PAYMENT_FAILED: {
    EN: (d) => ({
      subject: 'Payment failed',
      body: brand('PAYMENT_FAILED', {
        eyebrow: 'Payment issue',
        heading: 'Your payment didn&rsquo;t go through',
        bodyHtml: `Your payment of ${amount(d, 'en')} could not be processed. Please try again.`,
        cta: { label: 'Try again', url: FIND_BOOKING_URL },
      }),
    }),
    FR: (d) => ({
      subject: 'Paiement échoué',
      body: brand('PAYMENT_FAILED', {
        eyebrow: 'Problème de paiement',
        heading: 'Votre paiement n&rsquo;a pas abouti',
        bodyHtml: `Votre paiement de ${amount(d, 'fr')} n'a pas pu être traité. Merci de réessayer.`,
        cta: { label: 'Réessayer', url: FIND_BOOKING_URL },
      }),
    }),
  },
  QUOTATION_SENT: {
    EN: (d) => ({
      subject: 'Your quotation is ready',
      body: brand('QUOTATION_SENT', {
        eyebrow: 'Your quotation',
        heading: 'Your quotation is ready',
        bodyHtml: `Your quotation for booking ${d.bookingId} is ready: ${amount(d, 'en')}. Log in to review and pay.`,
        cta: { label: 'Review &amp; accept', url: FIND_BOOKING_URL },
      }),
    }),
    FR: (d) => ({
      subject: 'Votre devis est prêt',
      body: brand('QUOTATION_SENT', {
        eyebrow: 'Votre devis',
        heading: 'Votre devis est prêt',
        bodyHtml: `Votre devis pour la réservation ${d.bookingId} est prêt : ${amount(d, 'fr')}. Connectez-vous pour consulter et payer.`,
        cta: { label: 'Consulter et accepter', url: FIND_BOOKING_URL },
      }),
    }),
  },
  QUOTATION_ACCEPTED: {
    EN: (d) => ({
      subject: 'Quotation accepted',
      body: brand('QUOTATION_ACCEPTED', {
        eyebrow: 'Quotation accepted',
        heading: 'You&rsquo;re all set',
        bodyHtml: `Thanks for accepting your quotation for booking ${d.bookingId}. We'll prepare your deposit invoice next &mdash; you'll receive it shortly.`,
        cta: { label: 'View your booking', url: FIND_BOOKING_URL },
      }),
    }),
    FR: (d) => ({
      subject: 'Devis accepté',
      body: brand('QUOTATION_ACCEPTED', {
        eyebrow: 'Devis accepté',
        heading: 'C&rsquo;est confirmé',
        bodyHtml: `Merci d'avoir accepté votre devis pour la réservation ${d.bookingId}. Nous préparons votre facture d'acompte, que vous recevrez très bientôt.`,
        cta: { label: 'Voir ma réservation', url: FIND_BOOKING_URL },
      }),
    }),
  },
  BOOKING_REFUNDED: {
    EN: (d) => ({
      subject: 'Refund processed',
      body: brand('BOOKING_REFUNDED', {
        eyebrow: 'Refund processed',
        heading: 'Your refund is on its way',
        bodyHtml: `We've processed a refund of ${amount(d, 'en')} for booking ${d.bookingId}. Please allow a few business days for it to reflect on your original payment method.`,
      }),
    }),
    FR: (d) => ({
      subject: 'Remboursement effectué',
      body: brand('BOOKING_REFUNDED', {
        eyebrow: 'Remboursement effectué',
        heading: 'Votre remboursement est en cours',
        bodyHtml: `Nous avons traité un remboursement de ${amount(d, 'fr')} pour la réservation ${d.bookingId}. Comptez quelques jours ouvrés pour qu'il apparaisse sur votre moyen de paiement.`,
      }),
    }),
  },
  INVOICE_ISSUED: {
    EN: (d) => ({
      subject: 'Your invoice is ready',
      body: brand('INVOICE_ISSUED', {
        eyebrow: 'Invoice ready',
        heading: 'Your invoice is ready',
        bodyHtml: `An invoice of ${amount(d, 'en')} is ready for booking ${d.bookingId}. Log in to your booking to review and pay.`,
        cta: { label: 'View invoice', url: FIND_BOOKING_URL },
      }),
    }),
    FR: (d) => ({
      subject: 'Votre facture est prête',
      body: brand('INVOICE_ISSUED', {
        eyebrow: 'Facture disponible',
        heading: 'Votre facture est prête',
        bodyHtml: `Une facture de ${amount(d, 'fr')} est disponible pour la réservation ${d.bookingId}. Connectez-vous à votre réservation pour la consulter et la régler.`,
        cta: { label: 'Voir la facture', url: FIND_BOOKING_URL },
      }),
    }),
  },
  VISA_CONTACT_TRAVELER: {
    EN: (d) => ({
      subject: 'A message about your visa application',
      body: brand('VISA_CONTACT_TRAVELER', {
        eyebrow: 'Visa update',
        heading: 'A message about your visa application',
        bodyHtml: `Regarding ${d.travelerName ?? 'your'} visa application: ${d.message ?? ''}`,
      }),
    }),
    FR: (d) => ({
      subject: 'Un message concernant votre demande de visa',
      body: brand('VISA_CONTACT_TRAVELER', {
        eyebrow: 'Mise à jour visa',
        heading: 'Un message concernant votre demande de visa',
        bodyHtml: `Concernant la demande de visa de ${d.travelerName ?? ''} : ${d.message ?? ''}`,
      }),
    }),
  },
  VISA_MISSING_DOCUMENTS: {
    EN: (d) => ({
      subject: 'A document is missing for your visa application',
      body: brand('VISA_MISSING_DOCUMENTS', {
        eyebrow: 'Document needed',
        heading: 'A document is missing',
        bodyHtml: `Please upload the missing visa document for ${d.travelerName ?? 'your traveler'}'s upcoming trip to ${d.country ?? 'your destination'}.`,
        cta: { label: 'Upload document', url: FIND_BOOKING_URL },
      }),
    }),
    FR: (d) => ({
      subject: 'Un document manque pour votre demande de visa',
      body: brand('VISA_MISSING_DOCUMENTS', {
        eyebrow: 'Document requis',
        heading: 'Un document manque',
        bodyHtml: `Merci de téléverser le document de visa manquant pour le prochain voyage de ${d.travelerName ?? 'votre voyageur'} vers ${d.country ?? 'votre destination'}.`,
        cta: { label: 'Téléverser le document', url: FIND_BOOKING_URL },
      }),
    }),
  },
  VISA_APPROVED: {
    EN: (d) => ({
      subject: 'Visa application approved',
      body: brand('VISA_APPROVED', {
        eyebrow: 'Visa approved',
        heading: 'Good news!',
        bodyHtml: `${d.travelerName ?? "Your traveler's"} visa application has been approved. Log in to your booking to download the visa document.`,
        cta: { label: 'Download visa', url: FIND_BOOKING_URL },
      }),
    }),
    FR: (d) => ({
      subject: 'Demande de visa approuvée',
      body: brand('VISA_APPROVED', {
        eyebrow: 'Visa approuvé',
        heading: 'Bonne nouvelle !',
        bodyHtml: `La demande de visa de ${d.travelerName ?? 'votre voyageur'} a été approuvée. Connectez-vous à votre réservation pour télécharger le document de visa.`,
        cta: { label: 'Télécharger le visa', url: FIND_BOOKING_URL },
      }),
    }),
  },
  VISA_REJECTED: {
    EN: (d) => ({
      subject: 'Visa application needs attention',
      body: brand('VISA_REJECTED', {
        eyebrow: 'Visa — action needed',
        heading: 'Your visa application needs attention',
        bodyHtml: `${d.travelerName ?? "Your traveler's"} visa application was rejected${d.rejectionReason ? `: ${d.rejectionReason}` : '.'} Log in to your booking to resubmit.`,
        cta: { label: 'Resubmit', url: FIND_BOOKING_URL },
      }),
    }),
    FR: (d) => ({
      subject: 'Votre demande de visa nécessite une action',
      body: brand('VISA_REJECTED', {
        eyebrow: 'Visa — action requise',
        heading: 'Votre demande de visa nécessite une action',
        bodyHtml: `La demande de visa de ${d.travelerName ?? 'votre voyageur'} a été rejetée${d.rejectionReason ? ` : ${d.rejectionReason}` : '.'} Connectez-vous à votre réservation pour la soumettre à nouveau.`,
        cta: { label: 'Soumettre à nouveau', url: FIND_BOOKING_URL },
      }),
    }),
  },
  VISA_SUBMITTED: {
    EN: (d) => ({
      subject: 'Visa application received',
      body: brand('VISA_SUBMITTED', {
        eyebrow: 'Visa application received',
        heading: 'We&rsquo;ve got your visa application',
        bodyHtml: `${d.travelerName ?? "Your traveler's"} visa application for your trip to ${d.country ?? 'your destination'} has been received and is under review. We'll notify you as soon as there's an update.`,
      }),
    }),
    FR: (d) => ({
      subject: 'Nous avons bien reçu votre demande de visa',
      body: brand('VISA_SUBMITTED', {
        eyebrow: 'Demande de visa reçue',
        heading: 'Nous avons bien reçu votre demande de visa',
        bodyHtml: `La demande de visa de ${d.travelerName ?? 'votre voyageur'} pour votre voyage vers ${d.country ?? 'votre destination'} a été reçue et est en cours d'examen. Nous vous informerons dès qu'il y aura une mise à jour.`,
      }),
    }),
  },
  VISA_RESUBMITTED: {
    EN: (d) => ({
      subject: 'Visa application resubmitted',
      body: brand('VISA_RESUBMITTED', {
        eyebrow: 'Visa resubmitted',
        heading: 'Your visa application is back with us',
        bodyHtml: `${d.travelerName ?? "Your traveler's"} updated visa application has been received and is under review again.`,
      }),
    }),
    FR: (d) => ({
      subject: 'Demande de visa soumise à nouveau',
      body: brand('VISA_RESUBMITTED', {
        eyebrow: 'Visa resoumis',
        heading: 'Votre demande de visa nous est revenue',
        bodyHtml: `La demande de visa mise à jour de ${d.travelerName ?? 'votre voyageur'} a été reçue et est de nouveau en cours d'examen.`,
      }),
    }),
  },
  VISA_QUEUE_NEW_APPLICATION: {
    EN: (d) => ({
      subject: 'New visa application in your queue',
      body: brand('VISA_QUEUE_NEW_APPLICATION', {
        eyebrow: 'Visa queue',
        heading: 'New visa application',
        bodyHtml: `A new visa application for ${d.travelerName ?? 'a traveler'} (${d.country ?? 'destination not set'}) needs review.`,
        cta: { label: 'Open visa queue', url: STAFF_VISA_QUEUE_URL },
      }),
    }),
    FR: (d) => ({
      subject: 'Nouvelle demande de visa dans votre file',
      body: brand('VISA_QUEUE_NEW_APPLICATION', {
        eyebrow: 'File des visas',
        heading: 'Nouvelle demande de visa',
        bodyHtml: `Une nouvelle demande de visa pour ${d.travelerName ?? 'un voyageur'} (${d.country ?? 'destination non définie'}) nécessite votre examen.`,
        cta: { label: 'Ouvrir la file des visas', url: STAFF_VISA_QUEUE_URL },
      }),
    }),
  },
  RATING_CODE_ISSUED: {
    EN: (d) => ({
      subject: 'Rate your trip',
      body: brand('RATING_CODE_ISSUED', {
        eyebrow: 'Rate your trip',
        heading: 'How was your trip?',
        bodyHtml: `Thank you for traveling with us! Once your tour is complete, use booking ${d.bookingId} and Rating Code ${d.ratingCode ?? ''} at mufasasafaris.com/rate to share your feedback.`,
        cta: { label: 'Leave a review', url: 'https://mufasasafaris.com/rate' },
      }),
    }),
    FR: (d) => ({
      subject: 'Évaluez votre voyage',
      body: brand('RATING_CODE_ISSUED', {
        eyebrow: 'Évaluez votre voyage',
        heading: 'Comment s&rsquo;est passé votre voyage ?',
        bodyHtml: `Merci d'avoir voyagé avec nous ! Une fois votre circuit terminé, utilisez la réservation ${d.bookingId} et le code d'évaluation ${d.ratingCode ?? ''} sur mufasasafaris.com/rate pour partager votre avis.`,
        cta: { label: 'Laisser un avis', url: 'https://mufasasafaris.com/rate' },
      }),
    }),
  },
  RATING_THANK_YOU: {
    EN: (d) => ({
      subject: 'Thank you for your feedback',
      body: brand('RATING_THANK_YOU', {
        eyebrow: 'Thank you',
        heading: 'We appreciate your feedback',
        bodyHtml: `Thank you for sharing your feedback on booking ${d.bookingId} &mdash; it genuinely helps us improve every trip that follows yours.`,
      }),
    }),
    FR: (d) => ({
      subject: 'Merci pour votre avis',
      body: brand('RATING_THANK_YOU', {
        eyebrow: 'Merci',
        heading: 'Nous vous remercions pour votre avis',
        bodyHtml: `Merci d'avoir partagé votre avis sur la réservation ${d.bookingId} &mdash; cela nous aide vraiment à améliorer chaque voyage à venir.`,
      }),
    }),
  },
  // DR-055: sent to Booking.contactEmail right when a /plan-my-trip
  // (TAILOR_MADE) request is created -- via notificationsService.notifyEmail,
  // not the User-lookup-based notify(), since an anonymous guest session's
  // User.email is a synthetic placeholder, not a real address (see
  // Booking.contactEmail's own comment in booking/domain.ts).
  TAILOR_MADE_REQUEST_RECEIVED: {
    EN: (d) => {
      const destinations = d.countries?.length ? d.countries.join(', ') : 'Not yet specified';
      const start = formatDate(d.travelStart, 'en-US');
      const end = formatDate(d.travelEnd, 'en-US');
      const dates = start && end ? `${start} to ${end}` : 'Not yet specified';
      return {
        subject: `We received your trip request -- ${d.bookingId}`,
        body: brand('TAILOR_MADE_REQUEST_RECEIVED', {
          eyebrow: 'Trip request received',
          heading: 'Thanks for your trip request!',
          bodyHtml:
            `Here is a summary:<br><br>` +
            `Destination(s): ${destinations}<br>` +
            `Travelers: ${d.seats ?? '-'}<br>` +
            `Travel dates: ${dates}<br><br>` +
            `Your booking reference: <strong>${d.bookingId}</strong><br>` +
            `Please keep this reference and your last name safe -- you'll need both any time you contact us about ` +
            `this trip, including to check its status or accept a quotation.<br><br>` +
            `Our team will be in touch soon with a personalized quotation.`,
        }),
      };
    },
    FR: (d) => {
      const destinations = d.countries?.length ? d.countries.join(', ') : 'Pas encore précisé';
      const start = formatDate(d.travelStart, 'fr-FR');
      const end = formatDate(d.travelEnd, 'fr-FR');
      const dates = start && end ? `du ${start} au ${end}` : 'Pas encore précisées';
      return {
        subject: `Nous avons bien reçu votre demande de voyage -- ${d.bookingId}`,
        body: brand('TAILOR_MADE_REQUEST_RECEIVED', {
          eyebrow: 'Demande reçue',
          heading: 'Merci pour votre demande de voyage !',
          bodyHtml:
            `Voici un résumé :<br><br>` +
            `Destination(s) : ${destinations}<br>` +
            `Voyageurs : ${d.seats ?? '-'}<br>` +
            `Dates de voyage : ${dates}<br><br>` +
            `Votre référence de réservation : <strong>${d.bookingId}</strong><br>` +
            `Merci de conserver cette référence ainsi que votre nom de famille en lieu sûr -- vous en aurez besoin ` +
            `à chaque fois que vous nous contacterez au sujet de ce voyage, y compris pour suivre son statut ou ` +
            `accepter un devis.<br><br>` +
            `Notre équipe vous contactera bientôt avec un devis personnalisé.`,
        }),
      };
    },
  },
  ITINERARY_APPROVED: {
    EN: (d) => ({
      subject: 'Your trip plan is finalized',
      body: brand('ITINERARY_APPROVED', {
        eyebrow: 'Itinerary ready',
        heading: 'Your trip plan is finalized',
        bodyHtml: `The day-by-day itinerary for booking ${d.bookingId} has been finalized. Log in to your booking to view or download it.`,
        cta: { label: 'View itinerary', url: FIND_BOOKING_URL },
      }),
    }),
    FR: (d) => ({
      subject: 'Votre programme de voyage est finalisé',
      body: brand('ITINERARY_APPROVED', {
        eyebrow: 'Itinéraire prêt',
        heading: 'Votre programme de voyage est finalisé',
        bodyHtml: `L'itinéraire jour par jour de la réservation ${d.bookingId} a été finalisé. Connectez-vous à votre réservation pour le consulter ou le télécharger.`,
        cta: { label: 'Voir l&rsquo;itinéraire', url: FIND_BOOKING_URL },
      }),
    }),
  },
  STAFF_PASSWORD_ISSUED: {
    EN: (d) => ({
      subject: 'Your POLCO Tours account is ready',
      body: brand('STAFF_PASSWORD_ISSUED', {
        eyebrow: 'Account created',
        heading: 'Welcome to POLCO Tours',
        bodyHtml:
          `An account was created for you at POLCO Tours (${d.email ?? ''}). Your temporary password is: ` +
          `<strong>${d.temporaryPassword ?? ''}</strong>. You'll be asked to set a new password the first time you ` +
          `sign in &mdash; this temporary one stops working once you do.`,
        cta: { label: 'Sign in', url: STAFF_LOGIN_URL },
      }),
    }),
    FR: (d) => ({
      subject: 'Votre compte POLCO Tours est prêt',
      body: brand('STAFF_PASSWORD_ISSUED', {
        eyebrow: 'Compte créé',
        heading: 'Bienvenue chez POLCO Tours',
        bodyHtml:
          `Un compte a été créé pour vous chez POLCO Tours (${d.email ?? ''}). Votre mot de passe temporaire est : ` +
          `<strong>${d.temporaryPassword ?? ''}</strong>. Il vous sera demandé de définir un nouveau mot de passe dès ` +
          `votre première connexion &mdash; celui-ci ne fonctionnera plus ensuite.`,
        cta: { label: 'Se connecter', url: STAFF_LOGIN_URL },
      }),
    }),
  },
  STAFF_PASSWORD_RESET: {
    EN: (d) => ({
      subject: 'Your POLCO Tours password was reset',
      body: brand('STAFF_PASSWORD_RESET', {
        eyebrow: 'Password reset',
        heading: 'Password reset',
        bodyHtml:
          `Your POLCO Tours password was just reset by an administrator. Your new temporary password is: ` +
          `<strong>${d.temporaryPassword ?? ''}</strong>. You'll be asked to set your own password the next time you ` +
          `sign in. If you didn't expect this, contact your administrator right away.`,
        cta: { label: 'Sign in', url: STAFF_LOGIN_URL },
      }),
    }),
    FR: (d) => ({
      subject: 'Votre mot de passe POLCO Tours a été réinitialisé',
      body: brand('STAFF_PASSWORD_RESET', {
        eyebrow: 'Mot de passe réinitialisé',
        heading: 'Mot de passe réinitialisé',
        bodyHtml:
          `Votre mot de passe POLCO Tours vient d'être réinitialisé par un administrateur. Votre nouveau mot de passe ` +
          `temporaire est : <strong>${d.temporaryPassword ?? ''}</strong>. Il vous sera demandé de définir votre propre ` +
          `mot de passe à la prochaine connexion. Si vous ne vous attendiez pas à ce message, contactez votre ` +
          `administrateur immédiatement.`,
        cta: { label: 'Se connecter', url: STAFF_LOGIN_URL },
      }),
    }),
  },
  STAFF_ACCOUNT_DEACTIVATED: {
    EN: () => ({
      subject: 'Your POLCO Tours account was deactivated',
      body: brand('STAFF_ACCOUNT_DEACTIVATED', {
        eyebrow: 'Account deactivated',
        heading: 'Your account was deactivated',
        bodyHtml: `Your POLCO Tours account has been deactivated. If you believe this is a mistake, contact your administrator.`,
      }),
    }),
    FR: () => ({
      subject: 'Votre compte POLCO Tours a été désactivé',
      body: brand('STAFF_ACCOUNT_DEACTIVATED', {
        eyebrow: 'Compte désactivé',
        heading: 'Votre compte a été désactivé',
        bodyHtml: `Votre compte POLCO Tours a été désactivé. Si vous pensez qu'il s'agit d'une erreur, contactez votre administrateur.`,
      }),
    }),
  },
  STAFF_ACCOUNT_REACTIVATED: {
    EN: () => ({
      subject: 'Your POLCO Tours account is active again',
      body: brand('STAFF_ACCOUNT_REACTIVATED', {
        eyebrow: 'Account reactivated',
        heading: 'You&rsquo;re back in',
        bodyHtml: `Your POLCO Tours account has been reactivated &mdash; you can sign in as usual.`,
        cta: { label: 'Sign in', url: STAFF_LOGIN_URL },
      }),
    }),
    FR: () => ({
      subject: 'Votre compte POLCO Tours est de nouveau actif',
      body: brand('STAFF_ACCOUNT_REACTIVATED', {
        eyebrow: 'Compte réactivé',
        heading: 'Vous êtes de retour',
        bodyHtml: `Votre compte POLCO Tours a été réactivé &mdash; vous pouvez vous connecter normalement.`,
        cta: { label: 'Se connecter', url: STAFF_LOGIN_URL },
      }),
    }),
  },
  ASSIGNMENT_NOTICE_DRIVER: {
    EN: (d) => ({
      subject: "You've been assigned to a departure",
      body: brand('ASSIGNMENT_NOTICE_DRIVER', {
        eyebrow: 'New assignment',
        heading: 'You&rsquo;ve been assigned to a departure',
        bodyHtml:
          `You've been assigned as driver for the departure starting ${formatDate(d.startDate, 'en-US') ?? '-'} ` +
          `(${d.country ?? 'destination not set'}). Vehicle: ${d.vehicleLabel ?? '-'}. Guide: ${d.guideName ?? 'unassigned'}.`,
        cta: { label: 'View schedule', url: STAFF_SCHEDULE_URL },
      }),
    }),
    FR: (d) => ({
      subject: 'Vous avez été affecté à un départ',
      body: brand('ASSIGNMENT_NOTICE_DRIVER', {
        eyebrow: 'Nouvelle affectation',
        heading: 'Vous avez été affecté à un départ',
        bodyHtml:
          `Vous avez été affecté comme chauffeur pour le départ du ${formatDate(d.startDate, 'fr-FR') ?? '-'} ` +
          `(${d.country ?? 'destination non définie'}). Véhicule : ${d.vehicleLabel ?? '-'}. Guide : ${d.guideName ?? 'non affecté'}.`,
        cta: { label: 'Voir le planning', url: STAFF_SCHEDULE_URL },
      }),
    }),
  },
  ASSIGNMENT_NOTICE_GUIDE: {
    EN: (d) => ({
      subject: "You've been assigned to a departure",
      body: brand('ASSIGNMENT_NOTICE_GUIDE', {
        eyebrow: 'New assignment',
        heading: 'You&rsquo;ve been assigned to a departure',
        bodyHtml:
          `You've been assigned as guide for the departure starting ${formatDate(d.startDate, 'en-US') ?? '-'} ` +
          `(${d.country ?? 'destination not set'}). Driver: ${d.driverName ?? '-'}. Vehicle: ${d.vehicleLabel ?? '-'}.`,
        cta: { label: 'View schedule', url: STAFF_SCHEDULE_URL },
      }),
    }),
    FR: (d) => ({
      subject: 'Vous avez été affecté à un départ',
      body: brand('ASSIGNMENT_NOTICE_GUIDE', {
        eyebrow: 'Nouvelle affectation',
        heading: 'Vous avez été affecté à un départ',
        bodyHtml:
          `Vous avez été affecté comme guide pour le départ du ${formatDate(d.startDate, 'fr-FR') ?? '-'} ` +
          `(${d.country ?? 'destination non définie'}). Chauffeur : ${d.driverName ?? '-'}. Véhicule : ${d.vehicleLabel ?? '-'}.`,
        cta: { label: 'Voir le planning', url: STAFF_SCHEDULE_URL },
      }),
    }),
  },
  ASSIGNMENT_NOTICE_VEHICLE_OWNER: {
    EN: (d) => ({
      subject: 'Your vehicle has been scheduled',
      body: brand('ASSIGNMENT_NOTICE_VEHICLE_OWNER', {
        eyebrow: 'Vehicle scheduled',
        heading: 'Your vehicle has been scheduled',
        bodyHtml:
          `Your vehicle ${d.vehicleLabel ?? ''} has been scheduled for the departure starting ` +
          `${formatDate(d.startDate, 'en-US') ?? '-'} (${d.country ?? 'destination not set'}). Driver: ${d.driverName ?? '-'}.`,
      }),
    }),
    FR: (d) => ({
      subject: 'Votre véhicule a été planifié',
      body: brand('ASSIGNMENT_NOTICE_VEHICLE_OWNER', {
        eyebrow: 'Véhicule planifié',
        heading: 'Votre véhicule a été planifié',
        bodyHtml:
          `Votre véhicule ${d.vehicleLabel ?? ''} a été planifié pour le départ du ` +
          `${formatDate(d.startDate, 'fr-FR') ?? '-'} (${d.country ?? 'destination non définie'}). Chauffeur : ${d.driverName ?? '-'}.`,
      }),
    }),
  },
};

export function renderMessage(event: NotificationEvent, locale: Locale, data: NotificationData): RenderedMessage {
  return TEMPLATES[event][locale](data);
}

type SmsTemplate = (data: NotificationData) => string;

// DR-056/DR-205: a separate, plain-text template map -- TEMPLATES' bodies
// are full HTML documents (Resend sends `html: body`); a WhatsApp/SMS
// gateway has no HTML rendering at all, so reusing an HTML body verbatim
// would show literal markup as the message text. Only events actually
// reachable by WHATSAPP/SMS need an entry -- notify() (service.ts) falls
// through to the next channel when an event has none, rather than sending
// raw HTML (the bug this map's expansion fixes, DR-205).
const SMS_TEMPLATES: Partial<Record<NotificationEvent, Record<Locale, SmsTemplate>>> = {
  BOOKING_CONFIRMED: {
    EN: (d) => `MUFASA SAFARIS & TOURS: Booking ${d.bookingId} confirmed. See you soon!`,
    FR: (d) => `MUFASA SAFARIS & TOURS : réservation ${d.bookingId} confirmée. À bientôt !`,
  },
  BOOKING_CANCELLED: {
    EN: (d) => `MUFASA SAFARIS & TOURS: Booking ${d.bookingId} has been cancelled.`,
    FR: (d) => `MUFASA SAFARIS & TOURS : réservation ${d.bookingId} annulée.`,
  },
  PAYMENT_SUCCEEDED: {
    EN: (d) =>
      d.paymentKind === 'DEPOSIT'
        ? `MUFASA SAFARIS & TOURS: Deposit of ${amount(d, 'en')} received. Booking ${d.bookingId} is on hold.`
        : `MUFASA SAFARIS & TOURS: Payment of ${amount(d, 'en')} received. Booking ${d.bookingId} confirmed!`,
    FR: (d) =>
      d.paymentKind === 'DEPOSIT'
        ? `MUFASA SAFARIS & TOURS : acompte de ${amount(d, 'fr')} reçu. Réservation ${d.bookingId} en attente.`
        : `MUFASA SAFARIS & TOURS : paiement de ${amount(d, 'fr')} reçu. Réservation ${d.bookingId} confirmée !`,
  },
  PAYMENT_FAILED: {
    EN: (d) => `MUFASA SAFARIS & TOURS: Payment of ${amount(d, 'en')} failed. Please try again.`,
    FR: (d) => `MUFASA SAFARIS & TOURS : paiement de ${amount(d, 'fr')} échoué. Merci de réessayer.`,
  },
  QUOTATION_SENT: {
    EN: (d) => `MUFASA SAFARIS & TOURS: Quotation for ${d.bookingId} ready: ${amount(d, 'en')}. Log in to review.`,
    FR: (d) => `MUFASA SAFARIS & TOURS : devis pour ${d.bookingId} prêt : ${amount(d, 'fr')}. Connectez-vous pour le consulter.`,
  },
  QUOTATION_ACCEPTED: {
    EN: (d) => `MUFASA SAFARIS & TOURS: Quotation for ${d.bookingId} accepted. Your deposit invoice is on its way.`,
    FR: (d) => `MUFASA SAFARIS & TOURS : devis pour ${d.bookingId} accepté. Votre facture d'acompte arrive bientôt.`,
  },
  BOOKING_REFUNDED: {
    EN: (d) => `MUFASA SAFARIS & TOURS: Refund of ${amount(d, 'en')} processed for booking ${d.bookingId}.`,
    FR: (d) => `MUFASA SAFARIS & TOURS : remboursement de ${amount(d, 'fr')} effectué pour la réservation ${d.bookingId}.`,
  },
  INVOICE_ISSUED: {
    EN: (d) => `MUFASA SAFARIS & TOURS: Invoice of ${amount(d, 'en')} ready for booking ${d.bookingId}.`,
    FR: (d) => `MUFASA SAFARIS & TOURS : facture de ${amount(d, 'fr')} disponible pour la réservation ${d.bookingId}.`,
  },
  VISA_SUBMITTED: {
    EN: (d) => `MUFASA SAFARIS & TOURS: Visa application for ${d.travelerName ?? 'your traveler'} received, under review.`,
    FR: (d) => `MUFASA SAFARIS & TOURS : demande de visa de ${d.travelerName ?? 'votre voyageur'} reçue, en cours d'examen.`,
  },
  VISA_RESUBMITTED: {
    EN: (d) => `MUFASA SAFARIS & TOURS: Updated visa application for ${d.travelerName ?? 'your traveler'} received.`,
    FR: (d) => `MUFASA SAFARIS & TOURS : demande de visa mise à jour pour ${d.travelerName ?? 'votre voyageur'} reçue.`,
  },
  RATING_THANK_YOU: {
    EN: (d) => `MUFASA SAFARIS & TOURS: Thank you for your review of booking ${d.bookingId}!`,
    FR: (d) => `MUFASA SAFARIS & TOURS : merci pour votre avis sur la réservation ${d.bookingId} !`,
  },
  ITINERARY_APPROVED: {
    EN: (d) => `MUFASA SAFARIS & TOURS: Itinerary for booking ${d.bookingId} is finalized and ready to view.`,
    FR: (d) => `MUFASA SAFARIS & TOURS : l'itinéraire de la réservation ${d.bookingId} est finalisé et prêt à consulter.`,
  },
  TAILOR_MADE_REQUEST_RECEIVED: {
    EN: (d) => {
      const destinations = d.countries?.length ? d.countries.join(', ') : 'TBD';
      const start = formatDate(d.travelStart, 'en-US');
      const end = formatDate(d.travelEnd, 'en-US');
      const dates = start && end ? `${start} to ${end}` : 'TBD';
      return (
        `MUFASA SAFARIS & TOURS: Trip request received, ref ${d.bookingId}. ` +
        `${destinations}, ${d.seats ?? '-'} traveler(s), ${dates}. ` +
        `Keep this ref + your last name safe. We'll send a quotation soon.`
      );
    },
    FR: (d) => {
      const destinations = d.countries?.length ? d.countries.join(', ') : 'à préciser';
      const start = formatDate(d.travelStart, 'fr-FR');
      const end = formatDate(d.travelEnd, 'fr-FR');
      const dates = start && end ? `du ${start} au ${end}` : 'à préciser';
      return (
        `MUFASA SAFARIS & TOURS : demande de voyage reçue, réf ${d.bookingId}. ` +
        `${destinations}, ${d.seats ?? '-'} voyageur(s), ${dates}. ` +
        `Conservez cette réf et votre nom de famille. Devis à venir.`
      );
    },
  },
  STAFF_ACCOUNT_DEACTIVATED: {
    EN: () => `POLCO Tours: Your staff account has been deactivated.`,
    FR: () => `POLCO Tours : votre compte a été désactivé.`,
  },
  STAFF_ACCOUNT_REACTIVATED: {
    EN: () => `POLCO Tours: Your staff account is active again.`,
    FR: () => `POLCO Tours : votre compte est de nouveau actif.`,
  },
  ASSIGNMENT_NOTICE_DRIVER: {
    EN: (d) => `POLCO Tours: You're assigned as driver, departure ${formatDate(d.startDate, 'en-US') ?? '-'} (${d.country ?? '-'}).`,
    FR: (d) => `POLCO Tours : vous êtes affecté comme chauffeur, départ du ${formatDate(d.startDate, 'fr-FR') ?? '-'} (${d.country ?? '-'}).`,
  },
  ASSIGNMENT_NOTICE_GUIDE: {
    EN: (d) => `POLCO Tours: You're assigned as guide, departure ${formatDate(d.startDate, 'en-US') ?? '-'} (${d.country ?? '-'}).`,
    FR: (d) => `POLCO Tours : vous êtes affecté comme guide, départ du ${formatDate(d.startDate, 'fr-FR') ?? '-'} (${d.country ?? '-'}).`,
  },
  ASSIGNMENT_NOTICE_VEHICLE_OWNER: {
    EN: (d) => `POLCO Tours: Vehicle ${d.vehicleLabel ?? ''} scheduled for departure ${formatDate(d.startDate, 'en-US') ?? '-'}.`,
    FR: (d) => `POLCO Tours : véhicule ${d.vehicleLabel ?? ''} planifié pour le départ du ${formatDate(d.startDate, 'fr-FR') ?? '-'}.`,
  },
};

export function renderSmsMessage(event: NotificationEvent, locale: Locale, data: NotificationData): string | null {
  return SMS_TEMPLATES[event]?.[locale]?.(data) ?? null;
}
