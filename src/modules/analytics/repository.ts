// analytics module — repository. The only place that touches the DB for
// this module.
import { randomUUID } from 'crypto';
import { withOrg } from '@lib/db';

export const analyticsRepository = {
  /** Monotonic: raises highestStep, never lowers it (a guest navigating
   * "Back" shouldn't erase progress already recorded). A raw parameterized
   * upsert (rather than read-then-write) keeps this a single round trip and
   * race-free under concurrent step-change fires from the same session. */
  async upsertProgress(organizationId: string, sessionToken: string, step: number): Promise<void> {
    const id = randomUUID();
    await withOrg(organizationId, async (tx) => {
      await tx.$executeRaw`
        INSERT INTO wizard_progress_events (id, "organizationId", "sessionToken", "highestStep", "createdAt", "updatedAt")
        VALUES (${id}::uuid, ${organizationId}::uuid, ${sessionToken}, ${step}, now(), now())
        ON CONFLICT ("sessionToken")
        DO UPDATE SET "highestStep" = GREATEST(wizard_progress_events."highestStep", EXCLUDED."highestStep"), "updatedAt" = now()
      `;
    });
  },

  async listHighestSteps(organizationId: string): Promise<number[]> {
    return withOrg(organizationId, async (tx) => {
      const rows = await tx.wizardProgressEvent.findMany({ select: { highestStep: true } });
      return rows.map((r) => r.highestStep);
    });
  },

  /** organizationId is always the primary org -- every write goes through
   * getPrimaryOrgId() (no authenticated session exists yet to attribute a
   * different org), so purging that one org's stale rows is sufficient; see
   * analytics/service.ts's recordWizardStep/purgeOldEvents. */
  async purgeOlderThan(organizationId: string, cutoff: Date): Promise<number> {
    return withOrg(organizationId, async (tx) => {
      const { count } = await tx.wizardProgressEvent.deleteMany({ where: { createdAt: { lt: cutoff } } });
      return count;
    });
  },
};
