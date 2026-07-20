// notifications module — domain types & rules. Pure; no framework or DB
// imports. No repository.ts in this module -- it owns no Prisma table;
// delivery outcomes are recorded via the existing @lib/audit, not a
// bespoke log model (DR-013).
import type { Currency, Locale } from '@prisma/client';
import { format, money } from '@lib/money';

export type NotificationChannel = 'WHATSAPP' | 'SMS' | 'EMAIL';

export type NotificationEvent =
  | 'BOOKING_CONFIRMED'
  | 'BOOKING_CANCELLED'
  | 'PAYMENT_SUCCEEDED'
  | 'PAYMENT_FAILED'
  | 'QUOTATION_SENT'
  | 'VISA_CONTACT_TRAVELER'
  | 'VISA_MISSING_DOCUMENTS'
  | 'RATING_CODE_ISSUED'
  | 'TAILOR_MADE_REQUEST_RECEIVED';

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
  travelerName?: string; // VISA_CONTACT_TRAVELER / VISA_MISSING_DOCUMENTS
  message?: string; // VISA_CONTACT_TRAVELER: staff-authored free text
  country?: string; // VISA_MISSING_DOCUMENTS
  ratingCode?: string; // RATING_CODE_ISSUED
  countries?: string[]; // TAILOR_MADE_REQUEST_RECEIVED -- Booking.preferredCountries
  seats?: number; // TAILOR_MADE_REQUEST_RECEIVED
  travelStart?: Date; // TAILOR_MADE_REQUEST_RECEIVED
  travelEnd?: Date; // TAILOR_MADE_REQUEST_RECEIVED
}

const FALLBACK_ORDER: NotificationChannel[] = ['WHATSAPP', 'SMS', 'EMAIL'];

/** Charter rule 8's fallback order, filtered to what the recipient can
 * actually be reached on. EMAIL is always included (User.email is
 * required+unique); WHATSAPP/SMS need a phone number. */
export function resolveChannelOrder(recipient: NotificationRecipient): NotificationChannel[] {
  return FALLBACK_ORDER.filter((c) => c === 'EMAIL' || !!recipient.phone);
}

type Template = (data: NotificationData) => RenderedMessage;

function amount(data: NotificationData, locale: string): string {
  return format(money(data.amountMinor ?? 0, data.currency ?? 'USD'), locale);
}

function formatDate(date: Date | undefined, intlLocale: 'en-US' | 'fr-FR'): string | null {
  if (!date) return null;
  return new Intl.DateTimeFormat(intlLocale, { dateStyle: 'long' }).format(date);
}

const TEMPLATES: Record<NotificationEvent, Record<Locale, Template>> = {
  BOOKING_CONFIRMED: {
    EN: (d) => ({ subject: 'Your booking is confirmed', body: `Your booking ${d.bookingId} is confirmed. See you soon!` }),
    FR: (d) => ({
      subject: 'Votre réservation est confirmée',
      body: `Votre réservation ${d.bookingId} est confirmée. À bientôt !`,
    }),
  },
  BOOKING_CANCELLED: {
    EN: (d) => ({ subject: 'Your booking was cancelled', body: `Your booking ${d.bookingId} has been cancelled.` }),
    FR: (d) => ({
      subject: 'Votre réservation a été annulée',
      body: `Votre réservation ${d.bookingId} a été annulée.`,
    }),
  },
  PAYMENT_SUCCEEDED: {
    EN: (d) => ({ subject: 'Payment received', body: `We received your payment of ${amount(d, 'en')}. Thank you!` }),
    FR: (d) => ({ subject: 'Paiement reçu', body: `Nous avons reçu votre paiement de ${amount(d, 'fr')}. Merci !` }),
  },
  PAYMENT_FAILED: {
    EN: (d) => ({
      subject: 'Payment failed',
      body: `Your payment of ${amount(d, 'en')} could not be processed. Please try again.`,
    }),
    FR: (d) => ({
      subject: 'Paiement échoué',
      body: `Votre paiement de ${amount(d, 'fr')} n'a pas pu être traité. Merci de réessayer.`,
    }),
  },
  QUOTATION_SENT: {
    EN: (d) => ({
      subject: 'Your quotation is ready',
      body: `Your quotation for booking ${d.bookingId} is ready: ${amount(d, 'en')}. Log in to review and pay.`,
    }),
    FR: (d) => ({
      subject: 'Votre devis est prêt',
      body: `Votre devis pour la réservation ${d.bookingId} est prêt : ${amount(d, 'fr')}. Connectez-vous pour consulter et payer.`,
    }),
  },
  VISA_CONTACT_TRAVELER: {
    EN: (d) => ({
      subject: 'A message about your visa application',
      body: `Regarding ${d.travelerName ?? 'your'} visa application: ${d.message ?? ''}`,
    }),
    FR: (d) => ({
      subject: 'Un message concernant votre demande de visa',
      body: `Concernant la demande de visa de ${d.travelerName ?? ''} : ${d.message ?? ''}`,
    }),
  },
  VISA_MISSING_DOCUMENTS: {
    EN: (d) => ({
      subject: 'A document is missing for your visa application',
      body: `Please upload the missing visa document for ${d.travelerName ?? 'your traveler'}'s upcoming trip to ${d.country ?? 'your destination'}.`,
    }),
    FR: (d) => ({
      subject: 'Un document manque pour votre demande de visa',
      body: `Merci de téléverser le document de visa manquant pour le prochain voyage de ${d.travelerName ?? 'votre voyageur'} vers ${d.country ?? 'votre destination'}.`,
    }),
  },
  RATING_CODE_ISSUED: {
    EN: (d) => ({
      subject: 'Rate your trip',
      body: `Thank you for traveling with us! Once your tour is complete, use booking ${d.bookingId} and Rating Code ${d.ratingCode ?? ''} at polcotours.com/rate to share your feedback.`,
    }),
    FR: (d) => ({
      subject: 'Évaluez votre voyage',
      body: `Merci d'avoir voyagé avec nous ! Une fois votre circuit terminé, utilisez la réservation ${d.bookingId} et le code d'évaluation ${d.ratingCode ?? ''} sur polcotours.com/rate pour partager votre avis.`,
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
        body:
          `Thanks for your trip request! Here is a summary:<br><br>` +
          `Destination(s): ${destinations}<br>` +
          `Travelers: ${d.seats ?? '-'}<br>` +
          `Travel dates: ${dates}<br><br>` +
          `Your booking reference: <strong>${d.bookingId}</strong><br>` +
          `Please keep this reference and your last name safe -- you'll need both any time you contact us about ` +
          `this trip, including to check its status or accept a quotation.<br><br>` +
          `Our team will be in touch soon with a personalized quotation.`,
      };
    },
    FR: (d) => {
      const destinations = d.countries?.length ? d.countries.join(', ') : 'Pas encore précisé';
      const start = formatDate(d.travelStart, 'fr-FR');
      const end = formatDate(d.travelEnd, 'fr-FR');
      const dates = start && end ? `du ${start} au ${end}` : 'Pas encore précisées';
      return {
        subject: `Nous avons bien reçu votre demande de voyage -- ${d.bookingId}`,
        body:
          `Merci pour votre demande de voyage ! Voici un résumé :<br><br>` +
          `Destination(s) : ${destinations}<br>` +
          `Voyageurs : ${d.seats ?? '-'}<br>` +
          `Dates de voyage : ${dates}<br><br>` +
          `Votre référence de réservation : <strong>${d.bookingId}</strong><br>` +
          `Merci de conserver cette référence ainsi que votre nom de famille en lieu sûr -- vous en aurez besoin ` +
          `à chaque fois que vous nous contacterez au sujet de ce voyage, y compris pour suivre son statut ou ` +
          `accepter un devis.<br><br>` +
          `Notre équipe vous contactera bientôt avec un devis personnalisé.`,
      };
    },
  },
};

export function renderMessage(event: NotificationEvent, locale: Locale, data: NotificationData): RenderedMessage {
  return TEMPLATES[event][locale](data);
}

type SmsTemplate = (data: NotificationData) => string;

// DR-056: a separate, plain-text template map -- TEMPLATES' bodies are HTML
// (Resend sends `html: body`, so line breaks need <br>/<strong>); an SMS
// gateway has no HTML rendering at all, so reusing those bodies verbatim
// would show literal "<br>" text in the message. Only events actually sent
// by SMS need an entry here -- SMS_TEMPLATES[event] being undefined is how
// notifySms knows an event isn't SMS-eligible (deliberately not every event
// TEMPLATES has, since none of the others are sent by SMS yet).
const SMS_TEMPLATES: Partial<Record<NotificationEvent, Record<Locale, SmsTemplate>>> = {
  TAILOR_MADE_REQUEST_RECEIVED: {
    EN: (d) => {
      const destinations = d.countries?.length ? d.countries.join(', ') : 'TBD';
      const start = formatDate(d.travelStart, 'en-US');
      const end = formatDate(d.travelEnd, 'en-US');
      const dates = start && end ? `${start} to ${end}` : 'TBD';
      return (
        `POLCO TOURS: Trip request received, ref ${d.bookingId}. ` +
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
        `POLCO TOURS : demande de voyage reçue, réf ${d.bookingId}. ` +
        `${destinations}, ${d.seats ?? '-'} voyageur(s), ${dates}. ` +
        `Conservez cette réf et votre nom de famille. Devis à venir.`
      );
    },
  },
};

export function renderSmsMessage(event: NotificationEvent, locale: Locale, data: NotificationData): string | null {
  return SMS_TEMPLATES[event]?.[locale]?.(data) ?? null;
}
