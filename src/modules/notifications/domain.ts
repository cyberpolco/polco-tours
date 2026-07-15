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
  | 'QUOTATION_SENT';

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
};

export function renderMessage(event: NotificationEvent, locale: Locale, data: NotificationData): RenderedMessage {
  return TEMPLATES[event][locale](data);
}
