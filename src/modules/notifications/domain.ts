// notifications module — domain types & rules. Pure; no framework or DB
// imports. No repository.ts in this module -- it owns no Prisma table;
// delivery outcomes are recorded via the existing @lib/audit, not a
// bespoke log model (DR-013).
//
// DR-217: every email event's eyebrow/heading/body copy is now staff-
// editable via the cms module's CmsTextBlock table (key `email.<KEY>`),
// with the strings below as the coded EN/FR default -- same "degrades to
// default" convention as every other CmsTextBlock-backed page. This file
// stays pure (no cms/DB import): resolveContent takes an already-fetched
// overrides map as a plain argument, and notifications/service.ts (which
// DOES import @modules/cms) is the one that fetches it and threads it
// through renderMessage. Subject lines and CTA buttons are NOT part of
// this -- explicit user scoping decision, kept fully code-driven -- and
// any event with real structured/branching content (PAYMENT_SUCCEEDED's
// deposit-vs-full wording, the summary tables) keeps that part fixed too;
// only the editable prose sits in EMAIL_TEMPLATE_DEFAULTS.
import type { Currency, Locale, PaymentKind } from '@prisma/client';
import { format, money } from '@lib/money';
import { FONT_SANS, renderBrandedEmail } from './email-template';

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
  | 'ASSIGNMENT_NOTICE_VEHICLE_OWNER'
  | 'CONTACT_FORM_RECEIVED'
  | 'CONTACT_FORM_CONFIRMATION';

export interface NotificationRecipient {
  phone: string | null;
  email: string;
}

export interface RenderedMessage {
  subject?: string;
  body: string;
}

// DR-250: originally an email-only concept (a WhatsApp/SMS body had no
// attachment mechanism) -- AfricasTalkingSmsGateway's own send() still
// never looks at this. DR-259 extends it to WHATSAPP too:
// BaileysWhatsAppGateway.send() sends the first attachment as a WhatsApp
// document message (caption = the text body) when one is present, which is
// why the name stays generic rather than "EmailAttachment" being renamed --
// it's really "the one PDF a notification carries," not email-specific
// anymore.
export interface EmailAttachment {
  filename: string;
  content: Buffer;
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
  contactName?: string; // CONTACT_FORM_RECEIVED / CONTACT_FORM_CONFIRMATION
  contactEmail?: string; // CONTACT_FORM_RECEIVED
  contactPhone?: string; // CONTACT_FORM_RECEIVED
  contactTopic?: string; // CONTACT_FORM_RECEIVED -- a ContactTopic enum value, humanized in TEMPLATES
  contactMessage?: string; // CONTACT_FORM_RECEIVED
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
  'CONTACT_FORM_CONFIRMATION',
  // DR-260: ITINERARY_APPROVED moved OUT of this set -- it now notifies the
  // assigned staff (driver/guide/vehicle owner), never the guest, so it
  // takes the staff/POLCO Tours wordmark like ASSIGNMENT_NOTICE_* below.
]);

function audienceFor(event: NotificationEvent): 'guest' | 'staff' {
  return GUEST_EVENTS.has(event) ? 'guest' : 'staff';
}

// ------------------------------------------------------- DR-217 CMS overrides

/** What a staff CmsTextBlock override looks like once notifications/
 * service.ts has fetched+mapped it (title -> heading, body -> bodyTemplate)
 * -- kept as this module's own minimal shape rather than importing
 * CmsTextBlockView, so this file never imports @modules/cms (pure module
 * rule). */
export interface EmailTemplateOverride {
  eyebrow: string | null;
  heading: string;
  bodyTemplate: string;
}
export type EmailTemplateOverrides = Record<string, EmailTemplateOverride>;

export interface EmailTemplateDefault {
  eyebrow: string;
  heading: string;
  bodyTemplate: string;
}

/** Every CMS-backed email template key. Almost 1:1 with NotificationEvent,
 * except PAYMENT_SUCCEEDED splits into _DEPOSIT/_FULL -- the only event
 * whose default copy genuinely branches into two different sentences
 * (not just an optional word), so it needs two independently-editable
 * defaults rather than one staff override losing that distinction. */
export const EMAIL_TEMPLATE_DEFAULTS: Record<string, Record<Locale, EmailTemplateDefault>> = {
  BOOKING_CONFIRMED: {
    EN: { eyebrow: 'Booking confirmed', heading: 'You’re all set', bodyTemplate: 'Your booking {{bookingId}} is confirmed. See you soon!' },
    FR: { eyebrow: 'Réservation confirmée', heading: 'C’est confirmé', bodyTemplate: 'Votre réservation {{bookingId}} est confirmée. À bientôt !' },
  },
  BOOKING_CANCELLED: {
    EN: { eyebrow: 'Booking cancelled', heading: 'Your booking was cancelled', bodyTemplate: 'Your booking {{bookingId}} has been cancelled.' },
    FR: { eyebrow: 'Réservation annulée', heading: 'Votre réservation a été annulée', bodyTemplate: 'Votre réservation {{bookingId}} a été annulée.' },
  },
  PAYMENT_SUCCEEDED_DEPOSIT: {
    EN: {
      eyebrow: 'Deposit received',
      heading: 'Your spot is on hold',
      bodyTemplate: "We received your deposit of {{amount}}. Your booking is on hold — we'll be in touch about the remaining balance.",
    },
    FR: {
      eyebrow: 'Acompte reçu',
      heading: 'Votre place est réservée',
      bodyTemplate: 'Nous avons reçu votre acompte de {{amount}}. Votre réservation est en attente — nous vous recontacterons au sujet du solde restant.',
    },
  },
  PAYMENT_SUCCEEDED_FULL: {
    EN: {
      eyebrow: 'Payment received',
      heading: 'You’re all set!',
      bodyTemplate: 'We received your payment of {{amount}}. Your trip is fully paid and confirmed!',
    },
    FR: {
      eyebrow: 'Paiement reçu',
      heading: 'C’est confirmé !',
      bodyTemplate: 'Nous avons reçu votre paiement de {{amount}}. Votre voyage est entièrement payé et confirmé !',
    },
  },
  PAYMENT_FAILED: {
    EN: {
      eyebrow: 'Payment issue',
      heading: 'Your payment didn’t go through',
      bodyTemplate: 'Your payment of {{amount}} could not be processed. Please try again.',
    },
    FR: {
      eyebrow: 'Problème de paiement',
      heading: 'Votre paiement n’a pas abouti',
      bodyTemplate: "Votre paiement de {{amount}} n'a pas pu être traité. Merci de réessayer.",
    },
  },
  QUOTATION_SENT: {
    EN: {
      eyebrow: 'Your quotation',
      heading: 'Your quotation is ready',
      bodyTemplate: 'Your quotation for booking {{bookingId}} is ready: {{amount}}. Open it below to accept and finish your booking details — no account needed.',
    },
    FR: {
      eyebrow: 'Votre devis',
      heading: 'Votre devis est prêt',
      bodyTemplate: 'Votre devis pour la réservation {{bookingId}} est prêt : {{amount}}. Ouvrez-le ci-dessous pour l’accepter et compléter votre réservation — aucun compte nécessaire.',
    },
  },
  QUOTATION_ACCEPTED: {
    EN: {
      eyebrow: 'Quotation accepted',
      heading: 'You’re all set',
      bodyTemplate: "Thanks for accepting your quotation for booking {{bookingId}}. We'll prepare your deposit invoice next — you'll receive it shortly.",
    },
    FR: {
      eyebrow: 'Devis accepté',
      heading: 'C’est confirmé',
      bodyTemplate:
        "Merci d'avoir accepté votre devis pour la réservation {{bookingId}}. Nous préparons votre facture d'acompte, que vous recevrez très bientôt.",
    },
  },
  BOOKING_REFUNDED: {
    EN: {
      eyebrow: 'Refund processed',
      heading: 'Your refund is on its way',
      bodyTemplate:
        "We've processed a refund of {{amount}} for booking {{bookingId}}. Please allow a few business days for it to reflect on your original payment method.",
    },
    FR: {
      eyebrow: 'Remboursement effectué',
      heading: 'Votre remboursement est en cours',
      bodyTemplate:
        "Nous avons traité un remboursement de {{amount}} pour la réservation {{bookingId}}. Comptez quelques jours ouvrés pour qu'il apparaisse sur votre moyen de paiement.",
    },
  },
  INVOICE_ISSUED: {
    EN: {
      eyebrow: 'Invoice ready',
      heading: 'Your invoice is ready',
      bodyTemplate: 'An invoice of {{amount}} is ready for booking {{bookingId}}. Log in to your booking to review and pay.',
    },
    FR: {
      eyebrow: 'Facture disponible',
      heading: 'Votre facture est prête',
      bodyTemplate: 'Une facture de {{amount}} est disponible pour la réservation {{bookingId}}. Connectez-vous à votre réservation pour la consulter et la régler.',
    },
  },
  VISA_CONTACT_TRAVELER: {
    EN: { eyebrow: 'Visa update', heading: 'A message about your visa application', bodyTemplate: 'Regarding {{travelerName}} visa application: {{message}}' },
    FR: {
      eyebrow: 'Mise à jour visa',
      heading: 'Un message concernant votre demande de visa',
      bodyTemplate: 'Concernant la demande de visa de {{travelerName}} : {{message}}',
    },
  },
  VISA_MISSING_DOCUMENTS: {
    EN: {
      eyebrow: 'Document needed',
      heading: 'A document is missing',
      bodyTemplate: "Please upload the missing visa document for {{travelerName}}'s upcoming trip to {{country}}.",
    },
    FR: {
      eyebrow: 'Document requis',
      heading: 'Un document manque',
      bodyTemplate: 'Merci de téléverser le document de visa manquant pour le prochain voyage de {{travelerName}} vers {{country}}.',
    },
  },
  VISA_APPROVED: {
    EN: {
      eyebrow: 'Visa approved',
      heading: 'Good news!',
      bodyTemplate: '{{travelerName}} visa application has been approved. Log in to your booking to download the visa document.',
    },
    FR: {
      eyebrow: 'Visa approuvé',
      heading: 'Bonne nouvelle !',
      bodyTemplate: 'La demande de visa de {{travelerName}} a été approuvée. Connectez-vous à votre réservation pour télécharger le document de visa.',
    },
  },
  VISA_REJECTED: {
    EN: {
      eyebrow: 'Visa — action needed',
      heading: 'Your visa application needs attention',
      bodyTemplate: '{{travelerName}} visa application was rejected{{rejectionClause}} Log in to your booking to resubmit.',
    },
    FR: {
      eyebrow: 'Visa — action requise',
      heading: 'Votre demande de visa nécessite une action',
      bodyTemplate: 'La demande de visa de {{travelerName}} a été rejetée{{rejectionClause}} Connectez-vous à votre réservation pour la soumettre à nouveau.',
    },
  },
  VISA_SUBMITTED: {
    EN: {
      eyebrow: 'Visa application received',
      heading: 'We’ve got your visa application',
      bodyTemplate:
        "{{travelerName}} visa application for your trip to {{country}} has been received and is under review. We'll notify you as soon as there's an update.",
    },
    FR: {
      eyebrow: 'Demande de visa reçue',
      heading: 'Nous avons bien reçu votre demande de visa',
      bodyTemplate:
        "La demande de visa de {{travelerName}} pour votre voyage vers {{country}} a été reçue et est en cours d'examen. Nous vous informerons dès qu'il y aura une mise à jour.",
    },
  },
  VISA_RESUBMITTED: {
    EN: {
      eyebrow: 'Visa resubmitted',
      heading: 'Your visa application is back with us',
      bodyTemplate: '{{travelerName}} updated visa application has been received and is under review again.',
    },
    FR: {
      eyebrow: 'Visa resoumis',
      heading: 'Votre demande de visa nous est revenue',
      bodyTemplate: "La demande de visa mise à jour de {{travelerName}} a été reçue et est de nouveau en cours d'examen.",
    },
  },
  VISA_QUEUE_NEW_APPLICATION: {
    EN: { eyebrow: 'Visa queue', heading: 'New visa application', bodyTemplate: 'A new visa application for {{travelerName}} ({{country}}) needs review.' },
    FR: {
      eyebrow: 'File des visas',
      heading: 'Nouvelle demande de visa',
      bodyTemplate: 'Une nouvelle demande de visa pour {{travelerName}} ({{country}}) nécessite votre examen.',
    },
  },
  RATING_CODE_ISSUED: {
    EN: {
      eyebrow: 'Rate your trip',
      heading: 'How was your trip?',
      bodyTemplate:
        'Thank you for traveling with us! Once your tour is complete, use booking {{bookingId}} and Rating Code {{ratingCode}} at mufasasafaris.com/rate to share your feedback.',
    },
    FR: {
      eyebrow: 'Évaluez votre voyage',
      heading: 'Comment s’est passé votre voyage ?',
      bodyTemplate:
        "Merci d'avoir voyagé avec nous ! Une fois votre circuit terminé, utilisez la réservation {{bookingId}} et le code d'évaluation {{ratingCode}} sur mufasasafaris.com/rate pour partager votre avis.",
    },
  },
  RATING_THANK_YOU: {
    EN: {
      eyebrow: 'Thank you',
      heading: 'We appreciate your feedback',
      bodyTemplate: 'Thank you for sharing your feedback on booking {{bookingId}} — it genuinely helps us improve every trip that follows yours.',
    },
    FR: {
      eyebrow: 'Merci',
      heading: 'Nous vous remercions pour votre avis',
      bodyTemplate: "Merci d'avoir partagé votre avis sur la réservation {{bookingId}} — cela nous aide vraiment à améliorer chaque voyage à venir.",
    },
  },
  TAILOR_MADE_REQUEST_RECEIVED: {
    EN: {
      eyebrow: 'Trip request received',
      heading: 'Thanks for your trip request!',
      bodyTemplate:
        'Here is a summary:\n\n' +
        'Destination(s): {{destinations}}\n' +
        'Travelers: {{travelers}}\n' +
        'Travel dates: {{dates}}\n\n' +
        'Your booking reference: {{bookingId}}\n' +
        "Please keep this reference and your last name safe -- you'll need both any time you contact us about this trip, including to check its status or accept a quotation.\n\n" +
        'Our team will be in touch soon with a personalized quotation.',
    },
    FR: {
      eyebrow: 'Demande reçue',
      heading: 'Merci pour votre demande de voyage !',
      bodyTemplate:
        'Voici un résumé :\n\n' +
        'Destination(s) : {{destinations}}\n' +
        'Voyageurs : {{travelers}}\n' +
        'Dates de voyage : {{dates}}\n\n' +
        'Votre référence de réservation : {{bookingId}}\n' +
        "Merci de conserver cette référence ainsi que votre nom de famille en lieu sûr -- vous en aurez besoin à chaque fois que vous nous contacterez au sujet de ce voyage, y compris pour suivre son statut ou accepter un devis.\n\n" +
        'Notre équipe vous contactera bientôt avec un devis personnalisé.',
    },
  },
  // DR-260: staff-facing since ITINERARY_APPROVED moved out of GUEST_EVENTS
  // -- addressed to the driver/guide/vehicle owner assigned to the
  // departure, not the guest.
  ITINERARY_APPROVED: {
    EN: {
      eyebrow: 'Itinerary approved',
      heading: 'An itinerary is ready to run',
      bodyTemplate: 'The day-by-day itinerary for booking {{bookingId}} has been approved. Review it on your schedule before departure.',
    },
    FR: {
      eyebrow: 'Itinéraire approuvé',
      heading: 'Un itinéraire est prêt',
      bodyTemplate: "L'itinéraire jour par jour de la réservation {{bookingId}} a été approuvé. Consultez-le dans votre planning avant le départ.",
    },
  },
  STAFF_PASSWORD_ISSUED: {
    EN: {
      eyebrow: 'Account created',
      heading: 'Welcome to POLCO Tours',
      bodyTemplate:
        "An account was created for you at POLCO Tours ({{email}}). Your temporary password is: {{temporaryPassword}}. You'll be asked to set a new password the first time you sign in — this temporary one stops working once you do.",
    },
    FR: {
      eyebrow: 'Compte créé',
      heading: 'Bienvenue chez POLCO Tours',
      bodyTemplate:
        'Un compte a été créé pour vous chez POLCO Tours ({{email}}). Votre mot de passe temporaire est : {{temporaryPassword}}. Il vous sera demandé de définir un nouveau mot de passe dès votre première connexion — celui-ci ne fonctionnera plus ensuite.',
    },
  },
  STAFF_PASSWORD_RESET: {
    EN: {
      eyebrow: 'Password reset',
      heading: 'Password reset',
      bodyTemplate:
        "Your POLCO Tours password was just reset by an administrator. Your new temporary password is: {{temporaryPassword}}. You'll be asked to set your own password the next time you sign in. If you didn't expect this, contact your administrator right away.",
    },
    FR: {
      eyebrow: 'Mot de passe réinitialisé',
      heading: 'Mot de passe réinitialisé',
      bodyTemplate:
        "Votre mot de passe POLCO Tours vient d'être réinitialisé par un administrateur. Votre nouveau mot de passe temporaire est : {{temporaryPassword}}. Il vous sera demandé de définir votre propre mot de passe à la prochaine connexion. Si vous ne vous attendiez pas à ce message, contactez votre administrateur immédiatement.",
    },
  },
  STAFF_ACCOUNT_DEACTIVATED: {
    EN: {
      eyebrow: 'Account deactivated',
      heading: 'Your account was deactivated',
      bodyTemplate: 'Your POLCO Tours account has been deactivated. If you believe this is a mistake, contact your administrator.',
    },
    FR: {
      eyebrow: 'Compte désactivé',
      heading: 'Votre compte a été désactivé',
      bodyTemplate: "Votre compte POLCO Tours a été désactivé. Si vous pensez qu'il s'agit d'une erreur, contactez votre administrateur.",
    },
  },
  STAFF_ACCOUNT_REACTIVATED: {
    EN: {
      eyebrow: 'Account reactivated',
      heading: 'You’re back in',
      bodyTemplate: 'Your POLCO Tours account has been reactivated — you can sign in as usual.',
    },
    FR: {
      eyebrow: 'Compte réactivé',
      heading: 'Vous êtes de retour',
      bodyTemplate: 'Votre compte POLCO Tours a été réactivé — vous pouvez vous connecter normalement.',
    },
  },
  ASSIGNMENT_NOTICE_DRIVER: {
    EN: {
      eyebrow: 'New assignment',
      heading: 'You’ve been assigned to a departure',
      bodyTemplate:
        "You've been assigned as driver for the departure starting {{startDate}} ({{country}}). Vehicle: {{vehicleLabel}}. Guide: {{guideName}}.",
    },
    FR: {
      eyebrow: 'Nouvelle affectation',
      heading: 'Vous avez été affecté à un départ',
      bodyTemplate: 'Vous avez été affecté comme chauffeur pour le départ du {{startDate}} ({{country}}). Véhicule : {{vehicleLabel}}. Guide : {{guideName}}.',
    },
  },
  ASSIGNMENT_NOTICE_GUIDE: {
    EN: {
      eyebrow: 'New assignment',
      heading: 'You’ve been assigned to a departure',
      bodyTemplate: "You've been assigned as guide for the departure starting {{startDate}} ({{country}}). Driver: {{driverName}}. Vehicle: {{vehicleLabel}}.",
    },
    FR: {
      eyebrow: 'Nouvelle affectation',
      heading: 'Vous avez été affecté à un départ',
      bodyTemplate: 'Vous avez été affecté comme guide pour le départ du {{startDate}} ({{country}}). Chauffeur : {{driverName}}. Véhicule : {{vehicleLabel}}.',
    },
  },
  ASSIGNMENT_NOTICE_VEHICLE_OWNER: {
    EN: {
      eyebrow: 'Vehicle scheduled',
      heading: 'Your vehicle has been scheduled',
      bodyTemplate: 'Your vehicle {{vehicleLabel}} has been scheduled for the departure starting {{startDate}} ({{country}}). Driver: {{driverName}}.',
    },
    FR: {
      eyebrow: 'Véhicule planifié',
      heading: 'Votre véhicule a été planifié',
      bodyTemplate: 'Votre véhicule {{vehicleLabel}} a été planifié pour le départ du {{startDate}} ({{country}}). Chauffeur : {{driverName}}.',
    },
  },
  // DR-255: CONTACT_FORM_RECEIVED alerts SUPERADMIN+TOUR_OPERATOR (plus
  // VISA_FACILITATOR when the guest's topic is Visa & Immigration) that a
  // new /contact submission arrived; CONTACT_FORM_CONFIRMATION is the
  // guest's own auto-reply receipt. Neither is persisted anywhere --
  // contact/service.ts's submitContactMessage validates + rate-limits +
  // notifies only, by explicit user decision.
  CONTACT_FORM_RECEIVED: {
    EN: {
      eyebrow: 'Contact form',
      heading: 'New message from the contact form',
      bodyTemplate: 'From: {{contactName}} ({{contactEmail}}{{contactPhoneClause}})\nTopic: {{contactTopic}}\n\n{{contactMessage}}',
    },
    FR: {
      eyebrow: 'Formulaire de contact',
      heading: 'Nouveau message via le formulaire de contact',
      bodyTemplate: 'De : {{contactName}} ({{contactEmail}}{{contactPhoneClause}})\nSujet : {{contactTopic}}\n\n{{contactMessage}}',
    },
  },
  CONTACT_FORM_CONFIRMATION: {
    EN: {
      eyebrow: 'Message received',
      heading: 'Thanks for reaching out, {{contactName}}',
      bodyTemplate:
        "We've received your message and will get back to you soon. In the meantime, you may find your answer already on our FAQ page.",
    },
    FR: {
      eyebrow: 'Message bien reçu',
      heading: 'Merci de nous avoir contactés, {{contactName}}',
      bodyTemplate:
        "Nous avons bien reçu votre message et reviendrons vers vous rapidement. En attendant, vous trouverez peut-être déjà votre réponse dans notre FAQ.",
    },
  },
};

/** Which {{tokens}} a template key's body may reference -- shown as a hint
 * on the staff editor so an edit doesn't guess a wrong/typo'd token name.
 * Locale-independent (same variable names in both languages). */
export const EMAIL_TEMPLATE_TOKENS: Record<string, readonly string[]> = {
  BOOKING_CONFIRMED: ['bookingId'],
  BOOKING_CANCELLED: ['bookingId'],
  PAYMENT_SUCCEEDED_DEPOSIT: ['amount'],
  PAYMENT_SUCCEEDED_FULL: ['amount'],
  PAYMENT_FAILED: ['amount'],
  QUOTATION_SENT: ['bookingId', 'amount'],
  QUOTATION_ACCEPTED: ['bookingId'],
  BOOKING_REFUNDED: ['amount', 'bookingId'],
  INVOICE_ISSUED: ['amount', 'bookingId'],
  VISA_CONTACT_TRAVELER: ['travelerName', 'message'],
  VISA_MISSING_DOCUMENTS: ['travelerName', 'country'],
  VISA_APPROVED: ['travelerName'],
  VISA_REJECTED: ['travelerName', 'rejectionClause'],
  VISA_SUBMITTED: ['travelerName', 'country'],
  VISA_RESUBMITTED: ['travelerName'],
  VISA_QUEUE_NEW_APPLICATION: ['travelerName', 'country'],
  RATING_CODE_ISSUED: ['bookingId', 'ratingCode'],
  RATING_THANK_YOU: ['bookingId'],
  TAILOR_MADE_REQUEST_RECEIVED: ['destinations', 'travelers', 'dates', 'bookingId'],
  ITINERARY_APPROVED: ['bookingId'],
  STAFF_PASSWORD_ISSUED: ['email', 'temporaryPassword'],
  STAFF_PASSWORD_RESET: ['temporaryPassword'],
  STAFF_ACCOUNT_DEACTIVATED: [],
  STAFF_ACCOUNT_REACTIVATED: [],
  ASSIGNMENT_NOTICE_DRIVER: ['startDate', 'country', 'vehicleLabel', 'guideName'],
  ASSIGNMENT_NOTICE_GUIDE: ['startDate', 'country', 'driverName', 'vehicleLabel'],
  ASSIGNMENT_NOTICE_VEHICLE_OWNER: ['vehicleLabel', 'startDate', 'country', 'driverName'],
  CONTACT_FORM_RECEIVED: ['contactName', 'contactEmail', 'contactPhoneClause', 'contactTopic', 'contactMessage'],
  CONTACT_FORM_CONFIRMATION: ['contactName'],
};

/** Grouping for the staff /staff/cms Emails tab -- `groupKey` (not a
 * hardcoded label) so the tab can translate the group heading via
 * next-intl, same i18n convention as everywhere else in the staff shell. */
export const EMAIL_TEMPLATE_GROUPS: Array<{ groupKey: string; keys: string[] }> = [
  { groupKey: 'booking', keys: ['BOOKING_CONFIRMED', 'BOOKING_CANCELLED', 'BOOKING_REFUNDED'] },
  {
    groupKey: 'payment',
    keys: ['PAYMENT_SUCCEEDED_DEPOSIT', 'PAYMENT_SUCCEEDED_FULL', 'PAYMENT_FAILED', 'QUOTATION_SENT', 'QUOTATION_ACCEPTED', 'INVOICE_ISSUED'],
  },
  {
    groupKey: 'visa',
    keys: ['VISA_CONTACT_TRAVELER', 'VISA_MISSING_DOCUMENTS', 'VISA_APPROVED', 'VISA_REJECTED', 'VISA_SUBMITTED', 'VISA_RESUBMITTED', 'VISA_QUEUE_NEW_APPLICATION'],
  },
  { groupKey: 'rating', keys: ['RATING_CODE_ISSUED', 'RATING_THANK_YOU'] },
  { groupKey: 'tripPlanning', keys: ['TAILOR_MADE_REQUEST_RECEIVED'] },
  { groupKey: 'staffAccounts', keys: ['STAFF_PASSWORD_ISSUED', 'STAFF_PASSWORD_RESET', 'STAFF_ACCOUNT_DEACTIVATED', 'STAFF_ACCOUNT_REACTIVATED'] },
  // DR-260: ITINERARY_APPROVED joins the staff-assignment group -- it's now
  // addressed to assigned staff, not the guest.
  { groupKey: 'staffAssignments', keys: ['ITINERARY_APPROVED', 'ASSIGNMENT_NOTICE_DRIVER', 'ASSIGNMENT_NOTICE_GUIDE', 'ASSIGNMENT_NOTICE_VEHICLE_OWNER'] },
  { groupKey: 'contact', keys: ['CONTACT_FORM_RECEIVED', 'CONTACT_FORM_CONFIRMATION'] },
];

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/** Turns a staff-authored (or coded-default) plain-text template into safe
 * HTML: escapes the template text first (so an edit can never inject
 * markup), substitutes {{token}} placeholders with equally-escaped
 * pre-formatted values, then turns newlines into <br> -- the same
 * "plain text, not HTML" contract every other CmsTextBlock.body already
 * has on the guest site (rendered there as plain JSX text). An unknown
 * {{token}} is left as literal text rather than silently dropped, so a
 * staff typo is visible in the sent email instead of vanishing. */
function applyBodyTemplate(template: string, tokens: Record<string, string>): string {
  const escapedTemplate = escapeHtml(template);
  const substituted = escapedTemplate.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
    const value = tokens[key];
    return value !== undefined ? escapeHtml(value) : match;
  });
  return substituted.replace(/\n/g, '<br>');
}

/** Resolves one template key's effective eyebrow/heading/body -- the staff
 * CmsTextBlock override when one exists, else the coded default -- and
 * renders the body through applyBodyTemplate. Eyebrow/heading are escaped
 * too (defense in depth: a SUPERADMIN-only edit, but still staff input
 * landing in a transactional email). */
function resolveContent(
  templateKey: string,
  locale: Locale,
  tokens: Record<string, string>,
  overrides: EmailTemplateOverrides,
): { eyebrow: string; heading: string; bodyHtml: string } {
  const defaultsForKey = EMAIL_TEMPLATE_DEFAULTS[templateKey];
  if (!defaultsForKey) throw new Error(`resolveContent: unknown email template key "${templateKey}"`);
  const defaults = defaultsForKey[locale];
  const override = overrides[templateKey];
  const eyebrow = override?.eyebrow ?? defaults.eyebrow;
  const heading = override?.heading ?? defaults.heading;
  const bodyTemplate = override?.bodyTemplate ?? defaults.bodyTemplate;
  return { eyebrow: escapeHtml(eyebrow), heading: escapeHtml(heading), bodyHtml: applyBodyTemplate(bodyTemplate, tokens) };
}

type Template = (data: NotificationData, overrides: EmailTemplateOverrides) => RenderedMessage;

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
 * are skipped rather than rendered blank. Always code-driven, never part
 * of a staff-editable body template (DR-217) -- it's structured data, not
 * prose. */
function summaryTable(rows: Array<[string, string | null | undefined]>): string {
  const cells = rows
    .filter((row): row is [string, string] => !!row[1])
    .map(
      ([label, value]) => `
      <tr>
        <td style="padding:6px 12px 6px 0;font-family:${FONT_SANS};font-size:13px;color:#8C7D78;white-space:nowrap;vertical-align:top;">${label}</td>
        <td style="padding:6px 0;font-family:${FONT_SANS};font-size:13px;font-weight:700;color:#211A1D;">${value}</td>
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
// DR-257: the quotation email is the ONLY way most guests get back in --
// their 30-minute anonymous session is long gone by the time they read it,
// and guests have no accounts to log into. This lands them on the
// three-factor verify step with the reference already filled in. Safe from
// staff edits: a cta is assembled here in code, outside the escaped,
// staff-editable body (see applyBodyTemplate).
const COMPLETE_BOOKING_URL = 'https://mufasasafaris.com/complete-booking';
function completeBookingUrl(bookingReference: string): string {
  return bookingReference ? `${COMPLETE_BOOKING_URL}?ref=${encodeURIComponent(bookingReference)}` : COMPLETE_BOOKING_URL;
}
// Absolute, like every other CTA URL in this file -- a relative path has no
// origin to resolve against inside an HTML email (no containing document,
// no <base> tag), so it either fails to open or resolves against the mail
// client's own origin instead of mufasasafaris.com.
const STAFF_LOGIN_URL = 'https://mufasasafaris.com/staff/login';
const STAFF_SCHEDULE_URL = 'https://mufasasafaris.com/staff/schedule';
const STAFF_VISA_QUEUE_URL = 'https://mufasasafaris.com/staff/visa-queue';
const FAQ_URL = 'https://mufasasafaris.com/faq';

// Humanized labels for ContactData.contactTopic -- the raw ContactTopic enum
// value (e.g. 'VISA_IMMIGRATION') is never shown to a reader directly.
const CONTACT_TOPIC_LABELS: Record<string, { EN: string; FR: string }> = {
  GENERAL_INQUIRY: { EN: 'General inquiry', FR: 'Demande générale' },
  BOOKING_QUESTION: { EN: 'Booking question', FR: 'Question sur une réservation' },
  VISA_IMMIGRATION: { EN: 'Visa & immigration', FR: 'Visa et immigration' },
  PARTNERSHIP_MEDIA: { EN: 'Partnership / media', FR: 'Partenariat / média' },
  OTHER: { EN: 'Other', FR: 'Autre' },
};
function contactTopicLabel(topic: string | undefined, locale: Locale): string {
  return (topic && CONTACT_TOPIC_LABELS[topic]?.[locale]) ?? topic ?? '-';
}

const TEMPLATES: Record<NotificationEvent, Record<Locale, Template>> = {
  BOOKING_CONFIRMED: {
    EN: (d, ov) => {
      const content = resolveContent('BOOKING_CONFIRMED', 'EN', { bookingId: d.bookingId ?? '' }, ov);
      return {
        subject: 'Your booking is confirmed',
        body: brand('BOOKING_CONFIRMED', { ...content, cta: { label: 'View your booking', url: FIND_BOOKING_URL } }),
      };
    },
    FR: (d, ov) => {
      const content = resolveContent('BOOKING_CONFIRMED', 'FR', { bookingId: d.bookingId ?? '' }, ov);
      return {
        subject: 'Votre réservation est confirmée',
        body: brand('BOOKING_CONFIRMED', { ...content, cta: { label: 'Voir ma réservation', url: FIND_BOOKING_URL } }),
      };
    },
  },
  BOOKING_CANCELLED: {
    EN: (d, ov) => ({
      subject: 'Your booking was cancelled',
      body: brand('BOOKING_CANCELLED', resolveContent('BOOKING_CANCELLED', 'EN', { bookingId: d.bookingId ?? '' }, ov)),
    }),
    FR: (d, ov) => ({
      subject: 'Votre réservation a été annulée',
      body: brand('BOOKING_CANCELLED', resolveContent('BOOKING_CANCELLED', 'FR', { bookingId: d.bookingId ?? '' }, ov)),
    }),
  },
  // DR-215 (explicit user request): a real booking-confirmation body, not a
  // one-sentence receipt -- a details block (reference, trip, dates,
  // travelers, amount) plus wording that distinguishes a DEPOSIT (balance
  // still owed, not "confirmed" yet) from a BALANCE/FULL payment (fully
  // paid and confirmed). Sent via notifyEmail (Resend) directly by
  // invoicing's applyPaymentOutcome, not through notify()'s fallback chain
  // -- see that call site's own comment for why. DR-217: the intro
  // sentence is staff-editable per variant (PAYMENT_SUCCEEDED_DEPOSIT/
  // _FULL); the details block stays fixed, code-driven structured data.
  PAYMENT_SUCCEEDED: {
    EN: (d, ov) => {
      const isDeposit = d.paymentKind === 'DEPOSIT';
      const trip = d.tripTitle
        ? `${d.tripTitle}${d.tripCountry ? ` (${d.tripCountry})` : ''}`
        : d.tripCountry
          ? `Your custom trip to ${d.tripCountry}`
          : null;
      const content = resolveContent(isDeposit ? 'PAYMENT_SUCCEEDED_DEPOSIT' : 'PAYMENT_SUCCEEDED_FULL', 'EN', { amount: amount(d, 'en') }, ov);
      return {
        subject: isDeposit ? 'Deposit received' : 'Payment received',
        body: brand('PAYMENT_SUCCEEDED', {
          ...content,
          bodyHtml:
            content.bodyHtml +
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
    FR: (d, ov) => {
      const isDeposit = d.paymentKind === 'DEPOSIT';
      const trip = d.tripTitle
        ? `${d.tripTitle}${d.tripCountry ? ` (${d.tripCountry})` : ''}`
        : d.tripCountry
          ? `Votre voyage sur mesure en ${d.tripCountry}`
          : null;
      const content = resolveContent(isDeposit ? 'PAYMENT_SUCCEEDED_DEPOSIT' : 'PAYMENT_SUCCEEDED_FULL', 'FR', { amount: amount(d, 'fr') }, ov);
      return {
        subject: isDeposit ? 'Acompte reçu' : 'Paiement reçu',
        body: brand('PAYMENT_SUCCEEDED', {
          ...content,
          bodyHtml:
            content.bodyHtml +
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
    EN: (d, ov) => ({
      subject: 'Payment failed',
      body: brand('PAYMENT_FAILED', {
        ...resolveContent('PAYMENT_FAILED', 'EN', { amount: amount(d, 'en') }, ov),
        cta: { label: 'Try again', url: FIND_BOOKING_URL },
      }),
    }),
    FR: (d, ov) => ({
      subject: 'Paiement échoué',
      body: brand('PAYMENT_FAILED', {
        ...resolveContent('PAYMENT_FAILED', 'FR', { amount: amount(d, 'fr') }, ov),
        cta: { label: 'Réessayer', url: FIND_BOOKING_URL },
      }),
    }),
  },
  QUOTATION_SENT: {
    EN: (d, ov) => ({
      subject: 'Your quotation is ready',
      body: brand('QUOTATION_SENT', {
        ...resolveContent('QUOTATION_SENT', 'EN', { bookingId: d.bookingId ?? '', amount: amount(d, 'en') }, ov),
        cta: { label: 'Review &amp; accept', url: completeBookingUrl(d.bookingId ?? '') },
      }),
    }),
    FR: (d, ov) => ({
      subject: 'Votre devis est prêt',
      body: brand('QUOTATION_SENT', {
        ...resolveContent('QUOTATION_SENT', 'FR', { bookingId: d.bookingId ?? '', amount: amount(d, 'fr') }, ov),
        cta: { label: 'Consulter et accepter', url: completeBookingUrl(d.bookingId ?? '') },
      }),
    }),
  },
  QUOTATION_ACCEPTED: {
    EN: (d, ov) => ({
      subject: 'Quotation accepted',
      body: brand('QUOTATION_ACCEPTED', {
        ...resolveContent('QUOTATION_ACCEPTED', 'EN', { bookingId: d.bookingId ?? '' }, ov),
        cta: { label: 'View your booking', url: FIND_BOOKING_URL },
      }),
    }),
    FR: (d, ov) => ({
      subject: 'Devis accepté',
      body: brand('QUOTATION_ACCEPTED', {
        ...resolveContent('QUOTATION_ACCEPTED', 'FR', { bookingId: d.bookingId ?? '' }, ov),
        cta: { label: 'Voir ma réservation', url: FIND_BOOKING_URL },
      }),
    }),
  },
  BOOKING_REFUNDED: {
    EN: (d, ov) => ({
      subject: 'Refund processed',
      body: brand('BOOKING_REFUNDED', resolveContent('BOOKING_REFUNDED', 'EN', { amount: amount(d, 'en'), bookingId: d.bookingId ?? '' }, ov)),
    }),
    FR: (d, ov) => ({
      subject: 'Remboursement effectué',
      body: brand('BOOKING_REFUNDED', resolveContent('BOOKING_REFUNDED', 'FR', { amount: amount(d, 'fr'), bookingId: d.bookingId ?? '' }, ov)),
    }),
  },
  INVOICE_ISSUED: {
    EN: (d, ov) => ({
      subject: 'Your invoice is ready',
      body: brand('INVOICE_ISSUED', {
        ...resolveContent('INVOICE_ISSUED', 'EN', { amount: amount(d, 'en'), bookingId: d.bookingId ?? '' }, ov),
        cta: { label: 'View invoice', url: FIND_BOOKING_URL },
      }),
    }),
    FR: (d, ov) => ({
      subject: 'Votre facture est prête',
      body: brand('INVOICE_ISSUED', {
        ...resolveContent('INVOICE_ISSUED', 'FR', { amount: amount(d, 'fr'), bookingId: d.bookingId ?? '' }, ov),
        cta: { label: 'Voir la facture', url: FIND_BOOKING_URL },
      }),
    }),
  },
  VISA_CONTACT_TRAVELER: {
    EN: (d, ov) => ({
      subject: 'A message about your visa application',
      body: brand(
        'VISA_CONTACT_TRAVELER',
        resolveContent('VISA_CONTACT_TRAVELER', 'EN', { travelerName: d.travelerName ?? 'your', message: d.message ?? '' }, ov),
      ),
    }),
    FR: (d, ov) => ({
      subject: 'Un message concernant votre demande de visa',
      body: brand(
        'VISA_CONTACT_TRAVELER',
        resolveContent('VISA_CONTACT_TRAVELER', 'FR', { travelerName: d.travelerName ?? '', message: d.message ?? '' }, ov),
      ),
    }),
  },
  VISA_MISSING_DOCUMENTS: {
    EN: (d, ov) => ({
      subject: 'A document is missing for your visa application',
      body: brand('VISA_MISSING_DOCUMENTS', {
        ...resolveContent(
          'VISA_MISSING_DOCUMENTS',
          'EN',
          { travelerName: d.travelerName ?? 'your traveler', country: d.country ?? 'your destination' },
          ov,
        ),
        cta: { label: 'Upload document', url: FIND_BOOKING_URL },
      }),
    }),
    FR: (d, ov) => ({
      subject: 'Un document manque pour votre demande de visa',
      body: brand('VISA_MISSING_DOCUMENTS', {
        ...resolveContent(
          'VISA_MISSING_DOCUMENTS',
          'FR',
          { travelerName: d.travelerName ?? 'votre voyageur', country: d.country ?? 'votre destination' },
          ov,
        ),
        cta: { label: 'Téléverser le document', url: FIND_BOOKING_URL },
      }),
    }),
  },
  VISA_APPROVED: {
    EN: (d, ov) => ({
      subject: 'Visa application approved',
      body: brand('VISA_APPROVED', {
        ...resolveContent('VISA_APPROVED', 'EN', { travelerName: d.travelerName ?? "Your traveler's" }, ov),
        cta: { label: 'Download visa', url: FIND_BOOKING_URL },
      }),
    }),
    FR: (d, ov) => ({
      subject: 'Demande de visa approuvée',
      body: brand('VISA_APPROVED', {
        ...resolveContent('VISA_APPROVED', 'FR', { travelerName: d.travelerName ?? 'votre voyageur' }, ov),
        cta: { label: 'Télécharger le visa', url: FIND_BOOKING_URL },
      }),
    }),
  },
  VISA_REJECTED: {
    EN: (d, ov) => ({
      subject: 'Visa application needs attention',
      body: brand('VISA_REJECTED', {
        ...resolveContent(
          'VISA_REJECTED',
          'EN',
          { travelerName: d.travelerName ?? "Your traveler's", rejectionClause: d.rejectionReason ? `: ${d.rejectionReason}` : '.' },
          ov,
        ),
        cta: { label: 'Resubmit', url: FIND_BOOKING_URL },
      }),
    }),
    FR: (d, ov) => ({
      subject: 'Votre demande de visa nécessite une action',
      body: brand('VISA_REJECTED', {
        ...resolveContent(
          'VISA_REJECTED',
          'FR',
          { travelerName: d.travelerName ?? 'votre voyageur', rejectionClause: d.rejectionReason ? ` : ${d.rejectionReason}` : '.' },
          ov,
        ),
        cta: { label: 'Soumettre à nouveau', url: FIND_BOOKING_URL },
      }),
    }),
  },
  VISA_SUBMITTED: {
    EN: (d, ov) => ({
      subject: 'Visa application received',
      body: brand(
        'VISA_SUBMITTED',
        resolveContent('VISA_SUBMITTED', 'EN', { travelerName: d.travelerName ?? "Your traveler's", country: d.country ?? 'your destination' }, ov),
      ),
    }),
    FR: (d, ov) => ({
      subject: 'Nous avons bien reçu votre demande de visa',
      body: brand(
        'VISA_SUBMITTED',
        resolveContent('VISA_SUBMITTED', 'FR', { travelerName: d.travelerName ?? 'votre voyageur', country: d.country ?? 'votre destination' }, ov),
      ),
    }),
  },
  VISA_RESUBMITTED: {
    EN: (d, ov) => ({
      subject: 'Visa application resubmitted',
      body: brand('VISA_RESUBMITTED', resolveContent('VISA_RESUBMITTED', 'EN', { travelerName: d.travelerName ?? "Your traveler's" }, ov)),
    }),
    FR: (d, ov) => ({
      subject: 'Demande de visa soumise à nouveau',
      body: brand('VISA_RESUBMITTED', resolveContent('VISA_RESUBMITTED', 'FR', { travelerName: d.travelerName ?? 'votre voyageur' }, ov)),
    }),
  },
  VISA_QUEUE_NEW_APPLICATION: {
    EN: (d, ov) => ({
      subject: 'New visa application in your queue',
      body: brand('VISA_QUEUE_NEW_APPLICATION', {
        ...resolveContent('VISA_QUEUE_NEW_APPLICATION', 'EN', { travelerName: d.travelerName ?? 'a traveler', country: d.country ?? 'destination not set' }, ov),
        cta: { label: 'Open visa queue', url: STAFF_VISA_QUEUE_URL },
      }),
    }),
    FR: (d, ov) => ({
      subject: 'Nouvelle demande de visa dans votre file',
      body: brand('VISA_QUEUE_NEW_APPLICATION', {
        ...resolveContent(
          'VISA_QUEUE_NEW_APPLICATION',
          'FR',
          { travelerName: d.travelerName ?? 'un voyageur', country: d.country ?? 'destination non définie' },
          ov,
        ),
        cta: { label: 'Ouvrir la file des visas', url: STAFF_VISA_QUEUE_URL },
      }),
    }),
  },
  RATING_CODE_ISSUED: {
    EN: (d, ov) => ({
      subject: 'Rate your trip',
      body: brand('RATING_CODE_ISSUED', {
        ...resolveContent('RATING_CODE_ISSUED', 'EN', { bookingId: d.bookingId ?? '', ratingCode: d.ratingCode ?? '' }, ov),
        cta: { label: 'Leave a review', url: 'https://mufasasafaris.com/rate' },
      }),
    }),
    FR: (d, ov) => ({
      subject: 'Évaluez votre voyage',
      body: brand('RATING_CODE_ISSUED', {
        ...resolveContent('RATING_CODE_ISSUED', 'FR', { bookingId: d.bookingId ?? '', ratingCode: d.ratingCode ?? '' }, ov),
        cta: { label: 'Laisser un avis', url: 'https://mufasasafaris.com/rate' },
      }),
    }),
  },
  RATING_THANK_YOU: {
    EN: (d, ov) => ({
      subject: 'Thank you for your feedback',
      body: brand('RATING_THANK_YOU', resolveContent('RATING_THANK_YOU', 'EN', { bookingId: d.bookingId ?? '' }, ov)),
    }),
    FR: (d, ov) => ({
      subject: 'Merci pour votre avis',
      body: brand('RATING_THANK_YOU', resolveContent('RATING_THANK_YOU', 'FR', { bookingId: d.bookingId ?? '' }, ov)),
    }),
  },
  // DR-055: sent to Booking.contactEmail right when a /plan-my-trip
  // (TAILOR_MADE) request is created -- via notificationsService.notifyEmail,
  // not the User-lookup-based notify(), since an anonymous guest session's
  // User.email is a synthetic placeholder, not a real address (see
  // Booking.contactEmail's own comment in booking/domain.ts).
  TAILOR_MADE_REQUEST_RECEIVED: {
    EN: (d, ov) => {
      const destinations = d.countries?.length ? d.countries.join(', ') : 'Not yet specified';
      const start = formatDate(d.travelStart, 'en-US');
      const end = formatDate(d.travelEnd, 'en-US');
      const dates = start && end ? `${start} to ${end}` : 'Not yet specified';
      return {
        subject: `We received your trip request -- ${d.bookingId}`,
        body: brand(
          'TAILOR_MADE_REQUEST_RECEIVED',
          resolveContent(
            'TAILOR_MADE_REQUEST_RECEIVED',
            'EN',
            { destinations, travelers: d.seats ? String(d.seats) : '-', dates, bookingId: d.bookingId ?? '' },
            ov,
          ),
        ),
      };
    },
    FR: (d, ov) => {
      const destinations = d.countries?.length ? d.countries.join(', ') : 'Pas encore précisé';
      const start = formatDate(d.travelStart, 'fr-FR');
      const end = formatDate(d.travelEnd, 'fr-FR');
      const dates = start && end ? `du ${start} au ${end}` : 'Pas encore précisées';
      return {
        subject: `Nous avons bien reçu votre demande de voyage -- ${d.bookingId}`,
        body: brand(
          'TAILOR_MADE_REQUEST_RECEIVED',
          resolveContent(
            'TAILOR_MADE_REQUEST_RECEIVED',
            'FR',
            { destinations, travelers: d.seats ? String(d.seats) : '-', dates, bookingId: d.bookingId ?? '' },
            ov,
          ),
        ),
      };
    },
  },
  ITINERARY_APPROVED: {
    EN: (d, ov) => ({
      subject: 'An itinerary is ready to run',
      body: brand('ITINERARY_APPROVED', {
        ...resolveContent('ITINERARY_APPROVED', 'EN', { bookingId: d.bookingId ?? '' }, ov),
        cta: { label: 'View schedule', url: STAFF_SCHEDULE_URL },
      }),
    }),
    FR: (d, ov) => ({
      subject: 'Un itinéraire est prêt',
      body: brand('ITINERARY_APPROVED', {
        ...resolveContent('ITINERARY_APPROVED', 'FR', { bookingId: d.bookingId ?? '' }, ov),
        cta: { label: 'Voir le planning', url: STAFF_SCHEDULE_URL },
      }),
    }),
  },
  STAFF_PASSWORD_ISSUED: {
    EN: (d, ov) => ({
      subject: 'Your POLCO Tours account is ready',
      body: brand('STAFF_PASSWORD_ISSUED', {
        ...resolveContent('STAFF_PASSWORD_ISSUED', 'EN', { email: d.email ?? '', temporaryPassword: d.temporaryPassword ?? '' }, ov),
        cta: { label: 'Sign in', url: STAFF_LOGIN_URL },
      }),
    }),
    FR: (d, ov) => ({
      subject: 'Votre compte POLCO Tours est prêt',
      body: brand('STAFF_PASSWORD_ISSUED', {
        ...resolveContent('STAFF_PASSWORD_ISSUED', 'FR', { email: d.email ?? '', temporaryPassword: d.temporaryPassword ?? '' }, ov),
        cta: { label: 'Se connecter', url: STAFF_LOGIN_URL },
      }),
    }),
  },
  STAFF_PASSWORD_RESET: {
    EN: (d, ov) => ({
      subject: 'Your POLCO Tours password was reset',
      body: brand('STAFF_PASSWORD_RESET', {
        ...resolveContent('STAFF_PASSWORD_RESET', 'EN', { temporaryPassword: d.temporaryPassword ?? '' }, ov),
        cta: { label: 'Sign in', url: STAFF_LOGIN_URL },
      }),
    }),
    FR: (d, ov) => ({
      subject: 'Votre mot de passe POLCO Tours a été réinitialisé',
      body: brand('STAFF_PASSWORD_RESET', {
        ...resolveContent('STAFF_PASSWORD_RESET', 'FR', { temporaryPassword: d.temporaryPassword ?? '' }, ov),
        cta: { label: 'Se connecter', url: STAFF_LOGIN_URL },
      }),
    }),
  },
  STAFF_ACCOUNT_DEACTIVATED: {
    EN: (_d, ov) => ({
      subject: 'Your POLCO Tours account was deactivated',
      body: brand('STAFF_ACCOUNT_DEACTIVATED', resolveContent('STAFF_ACCOUNT_DEACTIVATED', 'EN', {}, ov)),
    }),
    FR: (_d, ov) => ({
      subject: 'Votre compte POLCO Tours a été désactivé',
      body: brand('STAFF_ACCOUNT_DEACTIVATED', resolveContent('STAFF_ACCOUNT_DEACTIVATED', 'FR', {}, ov)),
    }),
  },
  STAFF_ACCOUNT_REACTIVATED: {
    EN: (_d, ov) => ({
      subject: 'Your POLCO Tours account is active again',
      body: brand('STAFF_ACCOUNT_REACTIVATED', {
        ...resolveContent('STAFF_ACCOUNT_REACTIVATED', 'EN', {}, ov),
        cta: { label: 'Sign in', url: STAFF_LOGIN_URL },
      }),
    }),
    FR: (_d, ov) => ({
      subject: 'Votre compte POLCO Tours est de nouveau actif',
      body: brand('STAFF_ACCOUNT_REACTIVATED', {
        ...resolveContent('STAFF_ACCOUNT_REACTIVATED', 'FR', {}, ov),
        cta: { label: 'Se connecter', url: STAFF_LOGIN_URL },
      }),
    }),
  },
  ASSIGNMENT_NOTICE_DRIVER: {
    EN: (d, ov) => ({
      subject: "You've been assigned to a departure",
      body: brand('ASSIGNMENT_NOTICE_DRIVER', {
        ...resolveContent(
          'ASSIGNMENT_NOTICE_DRIVER',
          'EN',
          { startDate: formatDate(d.startDate, 'en-US') ?? '-', country: d.country ?? 'destination not set', vehicleLabel: d.vehicleLabel ?? '-', guideName: d.guideName ?? 'unassigned' },
          ov,
        ),
        cta: { label: 'View schedule', url: STAFF_SCHEDULE_URL },
      }),
    }),
    FR: (d, ov) => ({
      subject: 'Vous avez été affecté à un départ',
      body: brand('ASSIGNMENT_NOTICE_DRIVER', {
        ...resolveContent(
          'ASSIGNMENT_NOTICE_DRIVER',
          'FR',
          { startDate: formatDate(d.startDate, 'fr-FR') ?? '-', country: d.country ?? 'destination non définie', vehicleLabel: d.vehicleLabel ?? '-', guideName: d.guideName ?? 'non affecté' },
          ov,
        ),
        cta: { label: 'Voir le planning', url: STAFF_SCHEDULE_URL },
      }),
    }),
  },
  ASSIGNMENT_NOTICE_GUIDE: {
    EN: (d, ov) => ({
      subject: "You've been assigned to a departure",
      body: brand('ASSIGNMENT_NOTICE_GUIDE', {
        ...resolveContent(
          'ASSIGNMENT_NOTICE_GUIDE',
          'EN',
          { startDate: formatDate(d.startDate, 'en-US') ?? '-', country: d.country ?? 'destination not set', driverName: d.driverName ?? '-', vehicleLabel: d.vehicleLabel ?? '-' },
          ov,
        ),
        cta: { label: 'View schedule', url: STAFF_SCHEDULE_URL },
      }),
    }),
    FR: (d, ov) => ({
      subject: 'Vous avez été affecté à un départ',
      body: brand('ASSIGNMENT_NOTICE_GUIDE', {
        ...resolveContent(
          'ASSIGNMENT_NOTICE_GUIDE',
          'FR',
          { startDate: formatDate(d.startDate, 'fr-FR') ?? '-', country: d.country ?? 'destination non définie', driverName: d.driverName ?? '-', vehicleLabel: d.vehicleLabel ?? '-' },
          ov,
        ),
        cta: { label: 'Voir le planning', url: STAFF_SCHEDULE_URL },
      }),
    }),
  },
  ASSIGNMENT_NOTICE_VEHICLE_OWNER: {
    EN: (d, ov) => ({
      subject: 'Your vehicle has been scheduled',
      body: brand(
        'ASSIGNMENT_NOTICE_VEHICLE_OWNER',
        resolveContent(
          'ASSIGNMENT_NOTICE_VEHICLE_OWNER',
          'EN',
          { vehicleLabel: d.vehicleLabel ?? '', startDate: formatDate(d.startDate, 'en-US') ?? '-', country: d.country ?? 'destination not set', driverName: d.driverName ?? '-' },
          ov,
        ),
      ),
    }),
    FR: (d, ov) => ({
      subject: 'Votre véhicule a été planifié',
      body: brand(
        'ASSIGNMENT_NOTICE_VEHICLE_OWNER',
        resolveContent(
          'ASSIGNMENT_NOTICE_VEHICLE_OWNER',
          'FR',
          { vehicleLabel: d.vehicleLabel ?? '', startDate: formatDate(d.startDate, 'fr-FR') ?? '-', country: d.country ?? 'destination non définie', driverName: d.driverName ?? '-' },
          ov,
        ),
      ),
    }),
  },
  CONTACT_FORM_RECEIVED: {
    EN: (d, ov) => ({
      subject: 'New message from the contact form',
      body: brand(
        'CONTACT_FORM_RECEIVED',
        resolveContent(
          'CONTACT_FORM_RECEIVED',
          'EN',
          {
            contactName: d.contactName ?? 'A guest',
            contactEmail: d.contactEmail ?? '',
            contactPhoneClause: d.contactPhone ? `, ${d.contactPhone}` : '',
            contactTopic: contactTopicLabel(d.contactTopic, 'EN'),
            contactMessage: d.contactMessage ?? '',
          },
          ov,
        ),
      ),
    }),
    FR: (d, ov) => ({
      subject: 'Nouveau message via le formulaire de contact',
      body: brand(
        'CONTACT_FORM_RECEIVED',
        resolveContent(
          'CONTACT_FORM_RECEIVED',
          'FR',
          {
            contactName: d.contactName ?? 'Un visiteur',
            contactEmail: d.contactEmail ?? '',
            contactPhoneClause: d.contactPhone ? `, ${d.contactPhone}` : '',
            contactTopic: contactTopicLabel(d.contactTopic, 'FR'),
            contactMessage: d.contactMessage ?? '',
          },
          ov,
        ),
      ),
    }),
  },
  CONTACT_FORM_CONFIRMATION: {
    EN: (d, ov) => ({
      subject: 'We received your message',
      body: brand('CONTACT_FORM_CONFIRMATION', {
        ...resolveContent('CONTACT_FORM_CONFIRMATION', 'EN', { contactName: d.contactName ?? 'there' }, ov),
        cta: { label: 'Browse FAQs', url: FAQ_URL },
      }),
    }),
    FR: (d, ov) => ({
      subject: 'Nous avons bien reçu votre message',
      body: brand('CONTACT_FORM_CONFIRMATION', {
        ...resolveContent('CONTACT_FORM_CONFIRMATION', 'FR', { contactName: d.contactName ?? '' }, ov),
        cta: { label: 'Consulter la FAQ', url: FAQ_URL },
      }),
    }),
  },
};

export function renderMessage(
  event: NotificationEvent,
  locale: Locale,
  data: NotificationData,
  overrides: EmailTemplateOverrides = {},
): RenderedMessage {
  return TEMPLATES[event][locale](data, overrides);
}

type SmsTemplate = (data: NotificationData) => string;

// DR-056/DR-205: a separate, plain-text template map -- TEMPLATES' bodies
// are full HTML documents (Resend sends `html: body`); a WhatsApp/SMS
// gateway has no HTML rendering at all, so reusing an HTML body verbatim
// would show literal markup as the message text. Only events actually
// reachable by WHATSAPP/SMS need an entry -- notify() (service.ts) falls
// through to the next channel when an event has none, rather than sending
// raw HTML (the bug this map's expansion fixes, DR-205). Not part of
// DR-217's CMS-editable scope (explicit user request was about email
// templates only) -- these stay coded.
// DR-259 (explicit user request): BOOKING_CONFIRMED's WhatsApp/SMS body
// carries the same trip/dates/travelers detail PAYMENT_SUCCEEDED's HTML
// email already shows via summaryTable -- this is plain text, so a simple
// line-per-fact block instead of an HTML table. Kept local to this one
// template rather than factored into a shared helper: PAYMENT_SUCCEEDED's
// own SMS entry deliberately stays a one-line receipt (out of scope here,
// not touched), so there's no second caller yet to justify one.
function bookingConfirmedDetailLines(d: NotificationData, intlLocale: 'en-US' | 'fr-FR'): string[] {
  const trip = d.tripTitle
    ? `${d.tripTitle}${d.tripCountry ? ` (${d.tripCountry})` : ''}`
    : d.tripCountry
      ? intlLocale === 'fr-FR'
        ? `Voyage sur mesure en ${d.tripCountry}`
        : `Custom trip to ${d.tripCountry}`
      : null;
  const dates = formatDateRange(d.travelStart, d.travelEnd, intlLocale);
  const lines: string[] = [];
  if (trip) lines.push(intlLocale === 'fr-FR' ? `Voyage : ${trip}` : `Trip: ${trip}`);
  if (dates) lines.push(intlLocale === 'fr-FR' ? `Dates : ${dates}` : `Dates: ${dates}`);
  if (d.seats) lines.push(intlLocale === 'fr-FR' ? `Voyageurs : ${d.seats}` : `Travelers: ${d.seats}`);
  return lines;
}

const SMS_TEMPLATES: Partial<Record<NotificationEvent, Record<Locale, SmsTemplate>>> = {
  BOOKING_CONFIRMED: {
    EN: (d) =>
      [`MUFASA SAFARIS & TOURS: Your booking is confirmed!`, `Reference: ${d.bookingId}`, ...bookingConfirmedDetailLines(d, 'en-US'), `See you soon!`].join('\n'),
    FR: (d) =>
      [`MUFASA SAFARIS & TOURS : votre réservation est confirmée !`, `Référence : ${d.bookingId}`, ...bookingConfirmedDetailLines(d, 'fr-FR'), `À bientôt !`].join(
        '\n',
      ),
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
  // DR-223 (explicit user decision): a short heads-up only -- the real
  // content (download link / rejection reason / resubmit CTA) stays
  // email-only, sent in parallel via notifyEmailWithHeadsUp, not through
  // this template. See that call site's own comment.
  VISA_APPROVED: {
    EN: (d) => `MUFASA SAFARIS & TOURS: Good news -- ${d.travelerName ?? "your traveler's"} visa application was approved. Check your email for details.`,
    FR: (d) => `MUFASA SAFARIS & TOURS : bonne nouvelle -- la demande de visa de ${d.travelerName ?? 'votre voyageur'} a été approuvée. Consultez votre e-mail pour les détails.`,
  },
  VISA_REJECTED: {
    EN: (d) => `MUFASA SAFARIS & TOURS: ${d.travelerName ?? "Your traveler's"} visa application needs attention. Check your email for details.`,
    FR: (d) => `MUFASA SAFARIS & TOURS : la demande de visa de ${d.travelerName ?? 'votre voyageur'} nécessite une action. Consultez votre e-mail pour les détails.`,
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
    EN: (d) => `POLCO Tours: Itinerary for booking ${d.bookingId} has been approved. Check your schedule.`,
    FR: (d) => `POLCO Tours : l'itinéraire de la réservation ${d.bookingId} a été approuvé. Consultez votre planning.`,
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

// DR-259 (explicit user request): every WhatsApp send -- regardless of
// event -- must disclose that Cyber PolCo operates the number on Mufasa
// Safaris & Tours' behalf, tell the recipient not to reply to it, and give
// a real contact number instead. Deliberately NOT part of SMS_TEMPLATES
// (SMS has no equivalent requirement) and NOT staff-editable via cms's
// email.* override mechanism (DR-217's scope was email copy only) -- this
// is a fixed compliance line, appended by every WHATSAPP-channel call site
// in service.ts after resolving the event's own template body, never
// baked into a per-event template itself so it can't be missed by a future
// event that forgets to include it.
const WHATSAPP_DISCLAIMER: Record<Locale, string> = {
  EN: 'This automated message is managed by Cyber PolCo on behalf of Mufasa Safaris & Tours. Please do not reply to this number -- for assistance, contact us directly at +264 81 27 23 921.',
  FR: 'Ce message automatique est géré par Cyber PolCo pour le compte de Mufasa Safaris & Tours. Merci de ne pas répondre à ce numéro -- pour toute assistance, contactez-nous directement au +264 81 27 23 921.',
};

export function withWhatsAppDisclaimer(body: string, locale: Locale): string {
  return `${body}\n\n${WHATSAPP_DISCLAIMER[locale]}`;
}
