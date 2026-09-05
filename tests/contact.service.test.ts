import { describe, it, expect, vi, beforeEach } from 'vitest';

const { listUsersByRole } = vi.hoisted(() => ({ listUsersByRole: vi.fn() }));
vi.mock('@modules/auth', () => ({ authService: { listUsersByRole } }));

const { notify, notifyEmail } = vi.hoisted(() => ({ notify: vi.fn(), notifyEmail: vi.fn() }));
vi.mock('@modules/notifications', () => ({ notificationsService: { notify, notifyEmail } }));

const { assertWriteNotRateLimited } = vi.hoisted(() => ({ assertWriteNotRateLimited: vi.fn() }));
vi.mock('@lib/rate-limit', () => ({ assertWriteNotRateLimited }));

const { getPrimaryOrgId } = vi.hoisted(() => ({ getPrimaryOrgId: vi.fn() }));
vi.mock('@lib/primary-org', () => ({ getPrimaryOrgId }));

import { Errors } from '../src/lib/errors';
import { contactService } from '../src/modules/contact/service';

const VALID = {
  name: 'Jane Doe',
  email: 'jane@example.test',
  topic: 'GENERAL_INQUIRY' as const,
  message: 'This message is long enough to pass validation.',
};

describe('contactService.submitContactMessage', () => {
  beforeEach(() => {
    listUsersByRole.mockReset();
    notify.mockReset();
    notifyEmail.mockReset();
    assertWriteNotRateLimited.mockReset();
    getPrimaryOrgId.mockReset();

    getPrimaryOrgId.mockResolvedValue('org1');
    assertWriteNotRateLimited.mockResolvedValue(undefined);
    notify.mockResolvedValue(undefined);
    notifyEmail.mockResolvedValue(undefined);
    listUsersByRole.mockResolvedValue([]);
  });

  it('queries only SUPERADMIN + TOUR_OPERATOR for a non-visa topic, no PLATFORM_ADMIN', async () => {
    listUsersByRole.mockImplementation(async (_org: string, role: string) =>
      role === 'SUPERADMIN' ? [{ id: 'u-superadmin' }] : role === 'TOUR_OPERATOR' ? [{ id: 'u-operator' }] : [],
    );

    const result = await contactService.submitContactMessage(VALID, { ip: '1.2.3.4', locale: 'EN' });

    expect(result).toEqual({ ok: true });
    const queriedRoles = listUsersByRole.mock.calls.map((call) => call[1]);
    expect(queriedRoles).toEqual(['SUPERADMIN', 'TOUR_OPERATOR']);
    expect(notify).toHaveBeenCalledTimes(2);
    expect(notify.mock.calls.map((c) => c[1]).sort()).toEqual(['u-operator', 'u-superadmin']);
    expect(notifyEmail).toHaveBeenCalledTimes(1);
    expect(notifyEmail).toHaveBeenCalledWith('CONTACT_FORM_CONFIRMATION', VALID.email, 'EN', 'org1', { contactName: VALID.name });
  });

  it('additionally alerts VISA_FACILITATOR when the topic is Visa & Immigration', async () => {
    listUsersByRole.mockImplementation(async (_org: string, role: string) =>
      role === 'VISA_FACILITATOR' ? [{ id: 'u-facilitator' }] : [{ id: `u-${role.toLowerCase()}` }],
    );

    await contactService.submitContactMessage({ ...VALID, topic: 'VISA_IMMIGRATION' }, { ip: '1.2.3.4', locale: 'EN' });

    const queriedRoles = listUsersByRole.mock.calls.map((call) => call[1]);
    expect(queriedRoles).toEqual(['SUPERADMIN', 'TOUR_OPERATOR', 'VISA_FACILITATOR']);
  });

  it('dedupes a recipient who qualifies under more than one role', async () => {
    // Same user id comes back for both SUPERADMIN and TOUR_OPERATOR (e.g. the
    // seeded Lam account, which holds both roles via Membership).
    listUsersByRole.mockResolvedValue([{ id: 'u-shared' }]);

    await contactService.submitContactMessage(VALID, { ip: '1.2.3.4', locale: 'EN' });

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('CONTACT_FORM_RECEIVED', 'u-shared', 'org1', expect.any(Object));
  });

  it('fakes success and sends nothing when the honeypot is filled', async () => {
    const result = await contactService.submitContactMessage({ ...VALID, honeypot: 'http://spam.example' }, { ip: '1.2.3.4', locale: 'EN' });

    expect(result).toEqual({ ok: true });
    expect(listUsersByRole).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(notifyEmail).not.toHaveBeenCalled();
  });

  it('surfaces a rate-limit rejection as an error, without notifying anyone', async () => {
    assertWriteNotRateLimited.mockRejectedValue(Errors.rateLimited('Too many attempts -- try again later'));

    const result = await contactService.submitContactMessage(VALID, { ip: '1.2.3.4', locale: 'EN' });

    expect(result.ok).toBe(false);
    expect(notify).not.toHaveBeenCalled();
    expect(notifyEmail).not.toHaveBeenCalled();
  });

  it('surfaces invalid input as an error before any downstream call', async () => {
    const result = await contactService.submitContactMessage({ ...VALID, email: 'not-an-email' }, { ip: '1.2.3.4', locale: 'EN' });

    expect(result.ok).toBe(false);
    expect(getPrimaryOrgId).not.toHaveBeenCalled();
    expect(listUsersByRole).not.toHaveBeenCalled();
    expect(notify).not.toHaveBeenCalled();
    expect(notifyEmail).not.toHaveBeenCalled();
  });

  it('still reports success to the guest even if every downstream notification fails', async () => {
    listUsersByRole.mockResolvedValue([{ id: 'u-superadmin' }]);
    notify.mockRejectedValue(new Error('all channels down'));
    notifyEmail.mockRejectedValue(new Error('resend down'));

    const result = await contactService.submitContactMessage(VALID, { ip: '1.2.3.4', locale: 'EN' });

    expect(result).toEqual({ ok: true });
  });
});
