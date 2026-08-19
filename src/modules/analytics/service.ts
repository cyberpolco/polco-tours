// analytics module — service. Business logic.
import type { AuthContext } from '@modules/auth';
import { assertCan } from '@lib/rbac';
import { Errors } from '@lib/errors';
import { assertWriteNotRateLimited } from '@lib/rate-limit';
import { getPrimaryOrgId } from '@lib/primary-org';
import { computeWizardFunnel, WIZARD_STEP_COUNT, type WizardFunnelStage } from './domain';
import { analyticsRepository } from './repository';

const WIZARD_STEP_RATE_LIMIT_WINDOW_MINUTES = 15;
const WIZARD_STEP_RATE_LIMIT_MAX_ATTEMPTS = 60; // generous -- legitimate back/forth across 9 steps is expected
const WIZARD_PROGRESS_RETENTION_DAYS = 30;

// Same "route passes a possibly-null organizationId, the service is the one
// place that must actually assert it" convention as invoicing/service.ts's
// own requireOrg.
function requireOrg(ctx: AuthContext): string {
  if (!ctx.organizationId) throw Errors.forbidden('No organization membership');
  return ctx.organizationId;
}

export const analyticsService = {
  /** Public, no-ctx -- mirrors ratingsService.submitRating's shape exactly
   * (no AuthContext exists yet; the guest hasn't submitted anything). Never
   * throws to the caller on anything other than the rate limit itself --
   * this is a best-effort tracking write, not a step the wizard depends on,
   * same "never fail X over a Y issue" posture as
   * provisionFleetProfilesForUser. */
  async recordWizardStep(params: { sessionToken: string; step: number; ip: string | undefined }): Promise<void> {
    const { sessionToken, step, ip } = params;
    if (!Number.isInteger(step) || step < 0 || step >= WIZARD_STEP_COUNT) return;

    try {
      const organizationId = await getPrimaryOrgId();
      if (ip) {
        await assertWriteNotRateLimited({
          organizationId,
          action: 'analytics.wizard_step',
          ip,
          windowMinutes: WIZARD_STEP_RATE_LIMIT_WINDOW_MINUTES,
          maxAttempts: WIZARD_STEP_RATE_LIMIT_MAX_ATTEMPTS,
        });
      }
      await analyticsRepository.upsertProgress(organizationId, sessionToken, step);
    } catch {
      // Best-effort -- a rate-limit throw, a transient DB hiccup, or a
      // missing primary org must never surface to the guest wizard.
    }
  },

  async getWizardFunnel(ctx: AuthContext): Promise<WizardFunnelStage[]> {
    assertCan(ctx, 'insights.read');
    const highestSteps = await analyticsRepository.listHighestSteps(requireOrg(ctx));
    return computeWizardFunnel(highestSteps);
  },

  /** Called only by the daily QStash purge job (api/jobs/purge-wizard-progress)
   * -- no ctx, same shape as authService's own dormancy sweep. Every wizard-
   * progress row is written against the primary org (see recordWizardStep
   * above), so purging that one org is sufficient. */
  async purgeOldEvents(): Promise<{ purged: number }> {
    const organizationId = await getPrimaryOrgId();
    const cutoff = new Date(Date.now() - WIZARD_PROGRESS_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const purged = await analyticsRepository.purgeOlderThan(organizationId, cutoff);
    return { purged };
  },
};
