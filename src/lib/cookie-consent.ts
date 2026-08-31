// DR-207: gates the one non-essential cookie on the guest site --
// wizard_session, the plan-my-trip funnel-abandonment analytics cookie
// ((guest)/plan-my-trip/actions.ts's recordWizardStepAction) -- behind an
// explicit guest choice. The auth session cookie and the locale preference
// cookie are both strictly necessary and carry no consent gate; see the
// Cookie Policy tab on /terms for the full disclosure this banner links to.
export const COOKIE_CONSENT_COOKIE = 'cookie_consent';
export type CookieConsentChoice = 'accepted' | 'rejected';

export function isAnalyticsConsentGiven(value: string | undefined): boolean {
  return value === 'accepted';
}
