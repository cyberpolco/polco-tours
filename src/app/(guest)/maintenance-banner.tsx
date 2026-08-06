import { getTranslations } from 'next-intl/server';

// Sitewide notice while the guest site is mid-rebuild -- pure announcement,
// no functionality gated behind it. Sits above the header in GuestLayout so
// it's the first thing on every guest page, desktop and mobile alike.
export async function MaintenanceBanner() {
  const t = await getTranslations('MaintenanceBanner');

  return (
    <div className="bg-gold px-4 py-2 text-center text-xs font-medium text-ink sm:px-8 sm:text-sm">
      <p>{t('message')}</p>
    </div>
  );
}
