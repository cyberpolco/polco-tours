import { describe, it, expect } from 'vitest';
import { resolveChannelOrder, renderMessage, type NotificationEvent } from '../src/modules/notifications/domain';

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
});
