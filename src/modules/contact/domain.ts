// contact module — domain types & rules. Pure; no framework or DB imports.
// No repository.ts in this module -- it owns no Prisma table (DR-255):
// a guest contact-form submission is validated, rate-limited, and routed
// straight into a notification, deliberately never persisted (explicit
// user decision -- see service.ts's own comment for the accepted
// tradeoff). Same shape as notifications/insights/tracking/weather.
import { z } from 'zod';
import type { Role } from '@prisma/client';

export const CONTACT_TOPICS = ['GENERAL_INQUIRY', 'BOOKING_QUESTION', 'VISA_IMMIGRATION', 'PARTNERSHIP_MEDIA', 'OTHER'] as const;
export type ContactTopic = (typeof CONTACT_TOPICS)[number];

export const SubmitContactMessageInput = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().email().max(254),
  phone: z.string().trim().max(30).optional(),
  topic: z.enum(CONTACT_TOPICS),
  message: z.string().trim().min(10).max(4000),
  // Honeypot: a real submitter never sees or fills this field (kept
  // off-screen in the form, see ContactForm.tsx). Any non-empty value here
  // means an automated submission -- checked via isHoneypotTripped below,
  // never surfaced as a zod validation error, so a bot never learns the
  // field is a trap.
  honeypot: z.string().max(200).optional().default(''),
});
export type SubmitContactMessageInput = z.infer<typeof SubmitContactMessageInput>;

// Explicit user correction: SUPERADMIN + TOUR_OPERATOR only -- these two
// are the established "gets all emails" set; PLATFORM_ADMIN is
// deliberately excluded from this alert.
export const OPS_LEADERSHIP_ROLES: readonly Role[] = ['SUPERADMIN', 'TOUR_OPERATOR'];

/** Pure routing rule: which extra role(s) beyond OPS_LEADERSHIP_ROLES a
 * topic additionally alerts. Kept as a map (not an if/else in service.ts)
 * so a future topic -> role addition is a one-line change here, covered by
 * a plain unit test with no mocking. */
export function additionalRolesForTopic(topic: ContactTopic): readonly Role[] {
  return topic === 'VISA_IMMIGRATION' ? ['VISA_FACILITATOR'] : [];
}

export function isHoneypotTripped(input: Pick<SubmitContactMessageInput, 'honeypot'>): boolean {
  return input.honeypot.length > 0;
}
