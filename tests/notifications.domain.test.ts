import { describe, it, expect } from 'vitest';
import { resolveChannelOrder, renderMessage, renderSmsMessage, withWhatsAppDisclaimer, type NotificationEvent } from '../src/modules/notifications/domain';

// Every event with a plain-text (WhatsApp/SMS) template -- kept in sync
// manually with domain.ts's SMS_TEMPLATES map; the "no SMS template" test
// below exercises an event deliberately left out of it.
const SMS_EVENTS: NotificationEvent[] = [
  'BOOKING_CONFIRMED',
  'BOOKING_CANCELLED',
  'PAYMENT_SUCCEEDED',
  'PAYMENT_FAILED',
  'QUOTATION_SENT',
  'QUOTATION_ACCEPTED',
  'BOOKING_REFUNDED',
  'INVOICE_ISSUED',
  'VISA_SUBMITTED',
  'VISA_RESUBMITTED',
  // DR-223: a short heads-up template only (real content stays email-only,
  // see notifyEmailWithHeadsUp) -- still belongs in this list since
  // renderSmsMessage returns a real non-null body for both.
  'VISA_APPROVED',
  'VISA_REJECTED',
  'RATING_THANK_YOU',
  'ITINERARY_APPROVED',
  'STAFF_ACCOUNT_DEACTIVATED',
  'STAFF_ACCOUNT_REACTIVATED',
  'ASSIGNMENT_NOTICE_DRIVER',
  'ASSIGNMENT_NOTICE_GUIDE',
  'ASSIGNMENT_NOTICE_VEHICLE_OWNER',
];

const GUEST_EVENTS: NotificationEvent[] = [
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
  'CONTACT_FORM_CONFIRMATION',
];

const STAFF_EVENTS: NotificationEvent[] = [
  'STAFF_PASSWORD_ISSUED',
  'STAFF_PASSWORD_RESET',
  'STAFF_ACCOUNT_DEACTIVATED',
  'STAFF_ACCOUNT_REACTIVATED',
  'ASSIGNMENT_NOTICE_DRIVER',
  'ASSIGNMENT_NOTICE_GUIDE',
  'ASSIGNMENT_NOTICE_VEHICLE_OWNER',
  'VISA_QUEUE_NEW_APPLICATION',
  'CONTACT_FORM_RECEIVED',
];

const ALL_EVENTS: NotificationEvent[] = [...GUEST_EVENTS, ...STAFF_EVENTS];

// Deliberately minimal/generic -- every TEMPLATES entry defaults every
// field it doesn't find here, so this exercises every event without
// throwing regardless of which fields that particular event actually uses.
const DATA = {
  bookingId: 'bk_42',
  amountMinor: 4400,
  currency: 'USD' as const,
  travelerName: 'Jane Doe',
  country: 'Namibia',
  ratingCode: 'RC-9',
  temporaryPassword: 'Tmp-Password-123',
  email: 'staff@example.test',
  startDate: new Date('2027-03-10T00:00:00Z'),
  vehicleLabel: 'Toyota Land Cruiser (NAM-1234)',
  driverName: 'John Smith',
  guideName: 'Alice Brown',
};

describe('notifications domain', () => {
  describe('resolveChannelOrder', () => {
    it('includes WhatsApp, SMS, and email when a phone is on file', () => {
      expect(resolveChannelOrder({ phone: '+15551234567', email: 'a@example.test' })).toEqual([
        'WHATSAPP',
        'SMS',
        'EMAIL',
      ]);
    });

    it('falls back to email-only when no phone is on file', () => {
      expect(resolveChannelOrder({ phone: null, email: 'a@example.test' })).toEqual(['EMAIL']);
    });
  });

  describe('renderMessage', () => {
    it.each(ALL_EVENTS)('%s renders distinct, non-empty, branded EN and FR bodies', (event) => {
      const en = renderMessage(event, 'EN', DATA);
      const fr = renderMessage(event, 'FR', DATA);
      expect(en.body.length).toBeGreaterThan(0);
      expect(fr.body.length).toBeGreaterThan(0);
      expect(en.body).not.toBe(fr.body);
      expect(en.body).toContain('<!doctype');
      // DR-205: every email closes with the same automated-message notice,
      // regardless of event -- guaranteed by the shared shell, not by each
      // TEMPLATES entry remembering to pass one.
      expect(en.body).toContain('do not reply');
    });

    it.each(GUEST_EVENTS)('%s uses the guest brand wordmark, not the staff one', (event) => {
      const { body } = renderMessage(event, 'EN', DATA);
      expect(body).toContain('Mufasa Safaris');
      expect(body).not.toContain('POLCO TOURS');
    });

    it.each(STAFF_EVENTS)('%s uses the staff brand wordmark, not the guest one', (event) => {
      const { body } = renderMessage(event, 'EN', DATA);
      expect(body).toContain('POLCO TOURS');
      expect(body).not.toContain('Mufasa Safaris');
    });

    it('interpolates the booking id for booking events', () => {
      expect(renderMessage('BOOKING_CONFIRMED', 'EN', DATA).body).toContain('bk_42');
      expect(renderMessage('BOOKING_CANCELLED', 'FR', DATA).body).toContain('bk_42');
    });

    it('formats the amount for payment events', () => {
      expect(renderMessage('PAYMENT_SUCCEEDED', 'EN', DATA).body).toContain('44.00');
      expect(renderMessage('PAYMENT_FAILED', 'EN', DATA).body).toContain('44.00');
    });

    it('interpolates the amount for the new INVOICE_ISSUED/BOOKING_REFUNDED events', () => {
      expect(renderMessage('INVOICE_ISSUED', 'EN', DATA).body).toContain('44.00');
      expect(renderMessage('BOOKING_REFUNDED', 'EN', DATA).body).toContain('44.00');
    });

    it('interpolates the temporary password for the staff password events', () => {
      expect(renderMessage('STAFF_PASSWORD_ISSUED', 'EN', DATA).body).toContain('Tmp-Password-123');
      expect(renderMessage('STAFF_PASSWORD_RESET', 'EN', DATA).body).toContain('Tmp-Password-123');
    });

    it('interpolates driver/guide/vehicle details for assignment notices', () => {
      expect(renderMessage('ASSIGNMENT_NOTICE_DRIVER', 'EN', DATA).body).toContain('Alice Brown');
      expect(renderMessage('ASSIGNMENT_NOTICE_GUIDE', 'EN', DATA).body).toContain('John Smith');
      expect(renderMessage('ASSIGNMENT_NOTICE_VEHICLE_OWNER', 'EN', DATA).body).toContain('Toyota Land Cruiser');
    });
  });

  // DR-055: fires on /plan-my-trip (TAILOR_MADE) request creation, sent via
  // notifyEmail straight to Booking.contactEmail.
  describe('TAILOR_MADE_REQUEST_RECEIVED', () => {
    const tripData = {
      bookingId: 'N9M0W8',
      countries: ['NA', 'ZM'],
      seats: 3,
      travelStart: new Date('2027-03-10T00:00:00Z'),
      travelEnd: new Date('2027-03-17T00:00:00Z'),
    };

    it('renders distinct, non-empty EN and FR bodies', () => {
      const en = renderMessage('TAILOR_MADE_REQUEST_RECEIVED', 'EN', tripData);
      const fr = renderMessage('TAILOR_MADE_REQUEST_RECEIVED', 'FR', tripData);
      expect(en.body.length).toBeGreaterThan(0);
      expect(fr.body.length).toBeGreaterThan(0);
      expect(en.body).not.toBe(fr.body);
    });

    it('includes the booking reference and destination countries', () => {
      const { body } = renderMessage('TAILOR_MADE_REQUEST_RECEIVED', 'EN', tripData);
      expect(body).toContain('N9M0W8');
      expect(body).toContain('NA, ZM');
      expect(body).toContain('3');
    });

    it('falls back to placeholder text when countries/dates are missing', () => {
      const { body } = renderMessage('TAILOR_MADE_REQUEST_RECEIVED', 'EN', { bookingId: 'N9M0W8' });
      expect(body).toContain('Not yet specified');
    });

    // DR-056: a separate plain-text template for SMS (no HTML markup, no
    // subject) -- reusing the HTML email body directly would show literal
    // "<br>"/"<strong>" tags in a text message.
    describe('renderSmsMessage', () => {
      it('renders distinct, non-empty EN and FR plain-text bodies with no HTML markup', () => {
        const en = renderSmsMessage('TAILOR_MADE_REQUEST_RECEIVED', 'EN', tripData);
        const fr = renderSmsMessage('TAILOR_MADE_REQUEST_RECEIVED', 'FR', tripData);
        expect(en).toBeTruthy();
        expect(fr).toBeTruthy();
        expect(en).not.toBe(fr);
        expect(en).not.toContain('<br>');
        expect(en).not.toContain('<strong>');
      });

      it('includes the booking reference and destination countries', () => {
        expect(renderSmsMessage('TAILOR_MADE_REQUEST_RECEIVED', 'EN', tripData)).toContain('N9M0W8');
        expect(renderSmsMessage('TAILOR_MADE_REQUEST_RECEIVED', 'EN', tripData)).toContain('NA, ZM');
      });
    });
  });

  describe('renderSmsMessage', () => {
    it.each(SMS_EVENTS)('%s renders a distinct, non-empty EN and FR plain-text body with no HTML markup', (event) => {
      const en = renderSmsMessage(event, 'EN', DATA);
      const fr = renderSmsMessage(event, 'FR', DATA);
      expect(en).toBeTruthy();
      expect(fr).toBeTruthy();
      expect(en).not.toBe(fr);
      expect(en).not.toContain('<');
    });

    // DR-205: notify()'s channel-routing fix relies on this returning null
    // (not a stringified HTML body) for any event with no plain-text
    // template -- VISA_MISSING_DOCUMENTS is deliberately email-only today
    // (DR-223 explicit user decision, unlike its sibling VISA_APPROVED/
    // VISA_REJECTED which gained a heads-up template the same round).
    it('returns null for an event with no SMS template', () => {
      expect(renderSmsMessage('VISA_MISSING_DOCUMENTS', 'EN', DATA)).toBeNull();
    });

    it('never renders a plain-text body for the email-only staff password events', () => {
      expect(renderSmsMessage('STAFF_PASSWORD_ISSUED', 'EN', DATA)).toBeNull();
      expect(renderSmsMessage('STAFF_PASSWORD_RESET', 'EN', DATA)).toBeNull();
    });

    // DR-259 (explicit user request): BOOKING_CONFIRMED's WhatsApp/SMS body
    // now carries the same trip/dates/travelers detail PAYMENT_SUCCEEDED's
    // email already shows.
    describe('BOOKING_CONFIRMED detail block (DR-259)', () => {
      const bookingData = {
        bookingId: 'bk_42',
        seats: 4,
        tripTitle: 'The Nomad Loop',
        tripCountry: 'Namibia',
        travelStart: new Date('2027-03-10T00:00:00Z'),
        travelEnd: new Date('2027-03-20T00:00:00Z'),
      };

      it('includes trip, dates, and traveler count when present (EN)', () => {
        const body = renderSmsMessage('BOOKING_CONFIRMED', 'EN', bookingData);
        expect(body).toContain('bk_42');
        expect(body).toContain('The Nomad Loop (Namibia)');
        expect(body).toContain('Travelers: 4');
      });

      it('includes trip, dates, and traveler count when present (FR)', () => {
        const body = renderSmsMessage('BOOKING_CONFIRMED', 'FR', bookingData);
        expect(body).toContain('bk_42');
        expect(body).toContain('The Nomad Loop (Namibia)');
        expect(body).toContain('Voyageurs : 4');
      });

      it('omits detail lines it has no data for, without throwing', () => {
        const body = renderSmsMessage('BOOKING_CONFIRMED', 'EN', { bookingId: 'bk_1' });
        expect(body).toContain('bk_1');
        expect(body).not.toContain('Trip:');
        expect(body).not.toContain('Travelers:');
      });

      it('falls back to a generic "custom trip" line for a TAILOR_MADE booking with no package title', () => {
        const body = renderSmsMessage('BOOKING_CONFIRMED', 'EN', { bookingId: 'bk_2', tripCountry: 'Zambia' });
        expect(body).toContain('Custom trip to Zambia');
      });
    });
  });

  describe('withWhatsAppDisclaimer (DR-259)', () => {
    it('appends the Cyber PolCo / Mufasa Safaris & Tours disclaimer with the real contact number, in the given locale', () => {
      const en = withWhatsAppDisclaimer('Original message', 'EN');
      const fr = withWhatsAppDisclaimer('Original message', 'FR');

      expect(en.startsWith('Original message')).toBe(true);
      expect(en).toContain('Cyber PolCo');
      expect(en).toContain('Mufasa Safaris & Tours');
      expect(en).toContain('+264 81 27 23 921');
      expect(en).not.toBe(fr);
      expect(fr).toContain('Cyber PolCo');
      expect(fr).toContain('+264 81 27 23 921');
    });
  });
});
