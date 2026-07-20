import { describe, it, expect } from 'vitest';
import { resolveChannelOrder, renderMessage, renderSmsMessage, type NotificationEvent } from '../src/modules/notifications/domain';

const EVENTS: NotificationEvent[] = [
  'BOOKING_CONFIRMED',
  'BOOKING_CANCELLED',
  'PAYMENT_SUCCEEDED',
  'PAYMENT_FAILED',
];
const DATA = { bookingId: 'bk_42', amountMinor: 4400, currency: 'USD' as const };

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
    it.each(EVENTS)('%s renders distinct, non-empty EN and FR bodies', (event) => {
      const en = renderMessage(event, 'EN', DATA);
      const fr = renderMessage(event, 'FR', DATA);
      expect(en.body.length).toBeGreaterThan(0);
      expect(fr.body.length).toBeGreaterThan(0);
      expect(en.body).not.toBe(fr.body);
    });

    it('interpolates the booking id for booking events', () => {
      expect(renderMessage('BOOKING_CONFIRMED', 'EN', DATA).body).toContain('bk_42');
      expect(renderMessage('BOOKING_CANCELLED', 'FR', DATA).body).toContain('bk_42');
    });

    it('formats the amount for payment events', () => {
      expect(renderMessage('PAYMENT_SUCCEEDED', 'EN', DATA).body).toContain('44.00');
      expect(renderMessage('PAYMENT_FAILED', 'EN', DATA).body).toContain('44.00');
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

      it('returns null for an event with no SMS template', () => {
        expect(renderSmsMessage('BOOKING_CONFIRMED', 'EN', { bookingId: 'bk_42' })).toBeNull();
      });
    });
  });
});
