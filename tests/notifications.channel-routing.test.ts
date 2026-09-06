import { describe, it, expect, vi, beforeEach } from 'vitest';

// DR-205: notify() must send the full branded HTML body only over EMAIL,
// and a plain-text (renderSmsMessage) body over WHATSAPP/SMS -- reusing the
// HTML body for those channels (the pre-fix behavior) would leak a raw HTML
// document as literal WhatsApp/SMS text now that TEMPLATES render through
// the branded shell instead of a bare sentence.
const { getUser } = vi.hoisted(() => ({ getUser: vi.fn() }));
vi.mock('@modules/auth', () => ({ authService: { getUser } }));

const { auditMock } = vi.hoisted(() => ({ auditMock: vi.fn() }));
vi.mock('@lib/audit', () => ({ audit: auditMock }));

const { whatsappSend, smsSend, emailSend } = vi.hoisted(() => ({
  whatsappSend: vi.fn(),
  smsSend: vi.fn(),
  emailSend: vi.fn(),
}));
vi.mock('../src/modules/notifications/gateway', () => ({
  gateways: {
    WHATSAPP: { send: whatsappSend },
    SMS: { send: smsSend },
    EMAIL: { send: emailSend },
  },
}));

import { notificationsService } from '../src/modules/notifications/service';

describe('notificationsService.notify channel routing', () => {
  beforeEach(() => {
    getUser.mockReset();
    auditMock.mockReset();
    whatsappSend.mockReset();
    smsSend.mockReset();
    emailSend.mockReset();
  });

  it('sends the plain-text body (never the HTML body) over WHATSAPP when a phone is on file', async () => {
    getUser.mockResolvedValue({ id: 'u1', email: 'a@example.test', phone: '+15551234567', preferredLocale: 'EN' });
    whatsappSend.mockResolvedValue({ providerRef: 'wamid_1' });

    await notificationsService.notify('BOOKING_CONFIRMED', 'u1', 'org1', { bookingId: 'bk_42' });

    expect(whatsappSend).toHaveBeenCalledTimes(1);
    const sentBody = whatsappSend.mock.calls[0]?.[0]?.body as string;
    expect(sentBody).not.toContain('<html');
    expect(sentBody).not.toContain('<!doctype');
    expect(sentBody).toContain('bk_42');
    expect(emailSend).not.toHaveBeenCalled();
  });

  it('falls through to EMAIL (skipping WHATSAPP/SMS) for an event with no plain-text template', async () => {
    getUser.mockResolvedValue({ id: 'u1', email: 'a@example.test', phone: '+15551234567', preferredLocale: 'EN' });
    emailSend.mockResolvedValue({ providerRef: 'email_1' });

    // VISA_MISSING_DOCUMENTS, not VISA_APPROVED -- DR-223 gave
    // VISA_APPROVED/VISA_REJECTED a plain-text heads-up template, so they no
    // longer exercise this "no template at all" case via notify().
    await notificationsService.notify('VISA_MISSING_DOCUMENTS', 'u1', 'org1', { travelerName: 'Jane Doe' });

    expect(whatsappSend).not.toHaveBeenCalled();
    expect(smsSend).not.toHaveBeenCalled();
    expect(emailSend).toHaveBeenCalledTimes(1);
    const sentBody = emailSend.mock.calls[0]?.[0]?.body as string;
    expect(sentBody).toContain('<!doctype');
  });

  it('sends the full branded HTML document over EMAIL', async () => {
    getUser.mockResolvedValue({ id: 'u1', email: 'a@example.test', phone: null, preferredLocale: 'EN' });
    emailSend.mockResolvedValue({ providerRef: 'email_1' });

    await notificationsService.notify('BOOKING_CONFIRMED', 'u1', 'org1', { bookingId: 'bk_42' });

    expect(emailSend).toHaveBeenCalledTimes(1);
    const sentBody = emailSend.mock.calls[0]?.[0]?.body as string;
    expect(sentBody).toContain('<!doctype');
    expect(sentBody).toContain('Mufasa Safaris');
  });
});

// DR-223: notifyEmailWithHeadsUp always sends the full email AND
// independently attempts a short WhatsApp/SMS heads-up -- unlike notify(),
// neither leg substitutes for the other.
describe('notificationsService.notifyEmailWithHeadsUp', () => {
  beforeEach(() => {
    getUser.mockReset();
    auditMock.mockReset();
    whatsappSend.mockReset();
    smsSend.mockReset();
    emailSend.mockReset();
  });

  it('always sends the full email, and a WhatsApp heads-up when a phone is on file', async () => {
    emailSend.mockResolvedValue({ providerRef: 'email_1' });
    whatsappSend.mockResolvedValue({ providerRef: 'wamid_1' });

    await notificationsService.notifyEmailWithHeadsUp(
      'VISA_APPROVED',
      { email: 'lead@example.test', phone: '+15551234567' },
      'EN',
      'org1',
      { travelerName: 'Jane Doe' },
    );

    expect(emailSend).toHaveBeenCalledTimes(1);
    expect(emailSend.mock.calls[0]?.[0]?.to).toBe('lead@example.test');
    expect(whatsappSend).toHaveBeenCalledTimes(1);
    expect(whatsappSend.mock.calls[0]?.[0]?.to).toBe('+15551234567');
    expect(smsSend).not.toHaveBeenCalled();
  });

  it('sends only the email when the recipient has no phone on file', async () => {
    emailSend.mockResolvedValue({ providerRef: 'email_1' });

    await notificationsService.notifyEmailWithHeadsUp(
      'VISA_REJECTED',
      { email: 'lead@example.test', phone: null },
      'EN',
      'org1',
      { travelerName: 'Jane Doe' },
    );

    expect(emailSend).toHaveBeenCalledTimes(1);
    expect(whatsappSend).not.toHaveBeenCalled();
    expect(smsSend).not.toHaveBeenCalled();
  });

  it('falls back to SMS when WhatsApp fails, and still sends the email regardless of text outcome', async () => {
    emailSend.mockRejectedValue(new Error('resend down'));
    whatsappSend.mockRejectedValue(new Error('whatsapp unconfigured'));
    smsSend.mockResolvedValue({ providerRef: 'sms_1' });

    await notificationsService.notifyEmailWithHeadsUp(
      'VISA_APPROVED',
      { email: 'lead@example.test', phone: '+15551234567' },
      'EN',
      'org1',
      { travelerName: 'Jane Doe' },
    );

    expect(emailSend).toHaveBeenCalledTimes(1);
    expect(whatsappSend).toHaveBeenCalledTimes(1);
    expect(smsSend).toHaveBeenCalledTimes(1);
  });
});

// DR-259: notifyEmailAndWhatsApp sends the SAME full content over both
// EMAIL and WHATSAPP independently -- unlike notifyEmailWithHeadsUp's short
// nudge, and with no SMS fallback if WhatsApp fails (email is the
// guaranteed channel for this send shape).
describe('notificationsService.notifyEmailAndWhatsApp (DR-259)', () => {
  beforeEach(() => {
    getUser.mockReset();
    auditMock.mockReset();
    whatsappSend.mockReset();
    smsSend.mockReset();
    emailSend.mockReset();
  });

  it('sends both a full email and a full WhatsApp message (with the disclaimer, and any attachment) when both resolve', async () => {
    emailSend.mockResolvedValue({ providerRef: 'email_1' });
    whatsappSend.mockResolvedValue({ providerRef: 'wamid_1' });
    const attachments = [{ filename: 'invoice.pdf', content: Buffer.from('%PDF-1.7') }];

    await notificationsService.notifyEmailAndWhatsApp(
      'BOOKING_CONFIRMED',
      { email: 'lead@example.test', phone: '+15551234567' },
      'EN',
      'org1',
      { bookingId: 'bk_42' },
      attachments,
    );

    expect(emailSend).toHaveBeenCalledTimes(1);
    expect(emailSend.mock.calls[0]?.[0]?.to).toBe('lead@example.test');
    expect(emailSend.mock.calls[0]?.[0]?.attachments).toBe(attachments);

    expect(whatsappSend).toHaveBeenCalledTimes(1);
    expect(whatsappSend.mock.calls[0]?.[0]?.to).toBe('+15551234567');
    expect(whatsappSend.mock.calls[0]?.[0]?.attachments).toBe(attachments);
    const whatsappBody = whatsappSend.mock.calls[0]?.[0]?.body as string;
    expect(whatsappBody).toContain('bk_42');
    expect(whatsappBody).toContain('Cyber PolCo');
    expect(smsSend).not.toHaveBeenCalled();
  });

  it('still attempts WhatsApp even though the email succeeded (not a fallback chain)', async () => {
    emailSend.mockResolvedValue({ providerRef: 'email_1' });
    whatsappSend.mockResolvedValue({ providerRef: 'wamid_1' });

    await notificationsService.notifyEmailAndWhatsApp('BOOKING_CONFIRMED', { email: 'lead@example.test', phone: '+15551234567' }, 'EN', 'org1', {
      bookingId: 'bk_42',
    });

    expect(emailSend).toHaveBeenCalledTimes(1);
    expect(whatsappSend).toHaveBeenCalledTimes(1);
  });

  it('does not fall back to SMS when WhatsApp fails -- email is the guaranteed channel for this shape', async () => {
    emailSend.mockResolvedValue({ providerRef: 'email_1' });
    whatsappSend.mockRejectedValue(new Error('whatsapp unconfigured'));

    await notificationsService.notifyEmailAndWhatsApp('BOOKING_CONFIRMED', { email: 'lead@example.test', phone: '+15551234567' }, 'EN', 'org1', {
      bookingId: 'bk_42',
    });

    expect(emailSend).toHaveBeenCalledTimes(1);
    expect(whatsappSend).toHaveBeenCalledTimes(1);
    expect(smsSend).not.toHaveBeenCalled();
  });

  it('sends only the email when there is no phone on file', async () => {
    emailSend.mockResolvedValue({ providerRef: 'email_1' });

    await notificationsService.notifyEmailAndWhatsApp('BOOKING_CONFIRMED', { email: 'lead@example.test', phone: null }, 'EN', 'org1', { bookingId: 'bk_42' });

    expect(emailSend).toHaveBeenCalledTimes(1);
    expect(whatsappSend).not.toHaveBeenCalled();
  });

  it('sends only WhatsApp when there is no email on file', async () => {
    whatsappSend.mockResolvedValue({ providerRef: 'wamid_1' });

    await notificationsService.notifyEmailAndWhatsApp('BOOKING_CONFIRMED', { email: null, phone: '+15551234567' }, 'EN', 'org1', { bookingId: 'bk_42' });

    expect(emailSend).not.toHaveBeenCalled();
    expect(whatsappSend).toHaveBeenCalledTimes(1);
  });
});
