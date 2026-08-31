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

    await notificationsService.notify('VISA_APPROVED', 'u1', 'org1', { travelerName: 'Jane Doe' });

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
