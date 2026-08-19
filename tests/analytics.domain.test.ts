import { describe, it, expect } from 'vitest';
import { computeWizardFunnel, WIZARD_STEP_COUNT, WIZARD_STEP_LABELS } from '../src/modules/analytics/domain';

describe('analytics domain', () => {
  describe('computeWizardFunnel', () => {
    it('is cumulative -- each stage counts sessions that reached it or further', () => {
      // 3 sessions: one only reached step 0, one reached step 2, one reached step 8 (finished).
      const funnel = computeWizardFunnel([0, 2, 8]);
      expect(funnel).toHaveLength(WIZARD_STEP_COUNT);
      expect(funnel[0]!.reachedCount).toBe(3); // all 3 reached step 0
      expect(funnel[1]!.reachedCount).toBe(2); // step 0 session dropped off
      expect(funnel[2]!.reachedCount).toBe(2);
      expect(funnel[3]!.reachedCount).toBe(1); // step 2 session dropped off
      expect(funnel[8]!.reachedCount).toBe(1); // only the finisher
    });

    it('never increases from one stage to the next (a real funnel)', () => {
      const funnel = computeWizardFunnel([0, 1, 2, 3, 4, 5, 6, 7, 8, 8, 8]);
      for (let i = 1; i < funnel.length; i++) {
        expect(funnel[i]!.reachedCount).toBeLessThanOrEqual(funnel[i - 1]!.reachedCount);
      }
    });

    it('handles no sessions at all', () => {
      const funnel = computeWizardFunnel([]);
      expect(funnel.every((stage) => stage.reachedCount === 0)).toBe(true);
    });

    it('labels stages in the same order as the plan-my-trip wizard steps', () => {
      const funnel = computeWizardFunnel([]);
      expect(funnel.map((s) => s.label)).toEqual([...WIZARD_STEP_LABELS]);
    });
  });
});
