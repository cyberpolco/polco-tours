import { getTranslations } from 'next-intl/server';

// Also outside (dashboard) -- reached when authenticated but lacking the
// baseline staff permission (src/lib/staff-guard.ts).
export default async function StaffForbiddenPage() {
  const t = await getTranslations('StaffForbidden');
  const tChrome = await getTranslations('StaffChrome');
  return (
    <main className="staff-shell flex min-h-screen items-center justify-center bg-navy px-8 text-bone">
      <div className="max-w-sm text-center">
        <p className="mb-2 text-xs font-semibold tracking-survey text-amber">{tChrome('brandEyebrow')}</p>
        <h1 className="mb-2 text-2xl font-bold">{t('title')}</h1>
        <p className="text-mist">{t('body')}</p>
      </div>
    </main>
  );
}
