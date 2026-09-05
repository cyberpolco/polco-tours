import { describe, it, expect } from 'vitest';
import { SubmitContactMessageInput, additionalRolesForTopic, isHoneypotTripped, CONTACT_TOPICS } from '../src/modules/contact/domain';

const VALID = {
  name: 'Jane Doe',
  email: 'jane@example.test',
  topic: 'GENERAL_INQUIRY',
  message: 'This message is long enough to pass validation.',
};

describe('contact domain', () => {
  describe('SubmitContactMessageInput', () => {
    it('accepts a valid payload with no phone/honeypot supplied', () => {
      const parsed = SubmitContactMessageInput.safeParse(VALID);
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.honeypot).toBe('');
      }
    });

    it('accepts an optional phone', () => {
      const parsed = SubmitContactMessageInput.safeParse({ ...VALID, phone: '+264811234567' });
      expect(parsed.success).toBe(true);
    });

    it.each(['name', 'email', 'topic', 'message'] as const)('rejects a missing %s', (field) => {
      const { [field]: _omit, ...rest } = VALID;
      const parsed = SubmitContactMessageInput.safeParse(rest);
      expect(parsed.success).toBe(false);
    });

    it('rejects an invalid email', () => {
      const parsed = SubmitContactMessageInput.safeParse({ ...VALID, email: 'not-an-email' });
      expect(parsed.success).toBe(false);
    });

    it('rejects a message that is too short', () => {
      const parsed = SubmitContactMessageInput.safeParse({ ...VALID, message: 'short' });
      expect(parsed.success).toBe(false);
    });

    it('rejects a message longer than the max', () => {
      const parsed = SubmitContactMessageInput.safeParse({ ...VALID, message: 'x'.repeat(4001) });
      expect(parsed.success).toBe(false);
    });

    it('rejects an unknown topic value', () => {
      const parsed = SubmitContactMessageInput.safeParse({ ...VALID, topic: 'NOT_A_REAL_TOPIC' });
      expect(parsed.success).toBe(false);
    });
  });

  describe('additionalRolesForTopic', () => {
    it('routes VISA_IMMIGRATION to VISA_FACILITATOR', () => {
      expect(additionalRolesForTopic('VISA_IMMIGRATION')).toEqual(['VISA_FACILITATOR']);
    });

    it.each(CONTACT_TOPICS.filter((t) => t !== 'VISA_IMMIGRATION'))('adds no extra role for %s', (topic) => {
      expect(additionalRolesForTopic(topic)).toEqual([]);
    });
  });

  describe('isHoneypotTripped', () => {
    it('is false for an empty honeypot', () => {
      expect(isHoneypotTripped({ honeypot: '' })).toBe(false);
    });

    it('is true for any non-empty honeypot value', () => {
      expect(isHoneypotTripped({ honeypot: 'http://spam.example' })).toBe(true);
    });
  });
});
