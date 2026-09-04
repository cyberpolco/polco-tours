import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { can } from '@lib/rbac';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { RevealGroup } from '@/components/ui/Reveal';
import { SETTINGS_ITEMS } from '../../settings-items';
import { SidebarShell } from '../../sidebar-shell';

// Merges Tax Rates, Platform Rate, Coupons, and Operational Rates -- 4
// previously separate Settings-sidebar entries -- into one Finance card hub,
// same "card hub linking to still-independent pages" shape as DR-095's
// Fleet hub. Each card's own page keeps its existing route/permission gate
// unchanged and links back here (BackLink) instead of appearing in the
// sidebar directly; only this hub's own single "Finance" entry does now
// (settings-items.ts). Unlike the Fleet hub, THIS hub still wraps in
// SidebarShell -- it's the top-nav "Settings" aggregate link's landing page
// (nav.tsx), so it must keep the rest of Settings (Country Regulations,
// Sites, Insights, etc.) one click away, same as every other SETTINGS_ITEMS
// page already does. No permission gate here beyond baseline staff access --
// individual cards are shown/hidden per the caller's own permission, same as
// each destination page already re-checks for itself.
export default async function FinanceHubPage() {
  const ctx = await requireStaffContext();
  const t = await getTranslations('StaffFinanceHub');
  const tSidebar = await getTranslations('StaffSettingsSidebar');

  const canReadSettings = can(ctx, 'platform_settings.read');
  const canReadFinanceConfig = can(ctx, 'finance_config.read');

  const cards = [
    canReadSettings && {
      href: '/staff/settings/tax-rates',
      title: t('taxRatesTitle'),
      description: t('taxRatesDesc'),
    },
    canReadSettings && {
      href: '/staff/settings/platform-rate',
      title: t('platformRateTitle'),
      description: t('platformRateDesc'),
    },
    canReadSettings && {
      href: '/staff/settings/coupons',
      title: t('couponsTitle'),
      description: t('couponsDesc'),
    },
    canReadSettings && {
      href: '/staff/settings/late-booking-rate',
      title: t('lateBookingRateTitle'),
      description: t('lateBookingRateDesc'),
    },
  ].filter((c): c is { href: string; title: string; description: string } => Boolean(c));

  // DR-240 grouped Operational Rates/Flight Fares/eSIM Plans under their own
  // "Add-ons" heading as three separate cards. DR-243 (explicit user
  // correction) went further: Flight Fares and eSIM Plans aren't separate
  // destinations at all anymore -- they're nested inside the Operational
  // Rates page's own "Add-on Services" card now (finance/rates/page.tsx),
  // right alongside Photography/Videography/Translator/Visa Assistance.
  // Only one card is left in this "Add-ons" grouping as a result.
  const addOnCards = [
    canReadFinanceConfig && {
      href: '/staff/finance/rates',
      title: t('operationalRatesTitle'),
      description: t('operationalRatesDesc'),
    },
  ].filter((c): c is { href: string; title: string; description: string } => Boolean(c));

  return (
    <SidebarShell items={SETTINGS_ITEMS} sectionTitle={tSidebar('sectionTitle')} roles={ctx.roles} permissions={[...ctx.permissions]}>
      <div className="space-y-8">
        <PageHeader eyebrow={t('eyebrow')} title={t('title')} />
        <RevealGroup as="div" itemAs="div" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {cards.map((c) => (
            <Card key={c.href} interactive className="p-0">
              <Link href={c.href} className="block p-5">
                <h2 className="text-lg font-semibold text-navy">{c.title}</h2>
                <p className="mt-1 text-sm text-mist">{c.description}</p>
              </Link>
            </Card>
          ))}
        </RevealGroup>
        {addOnCards.length > 0 && (
          <div className="space-y-4">
            <p className="eyebrow text-mist">{t('addOnsSectionTitle')}</p>
            <RevealGroup as="div" itemAs="div" className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {addOnCards.map((c) => (
                <Card key={c.href} interactive className="p-0">
                  <Link href={c.href} className="block p-5">
                    <h2 className="text-lg font-semibold text-navy">{c.title}</h2>
                    <p className="mt-1 text-sm text-mist">{c.description}</p>
                  </Link>
                </Card>
              ))}
            </RevealGroup>
          </div>
        )}
      </div>
    </SidebarShell>
  );
}
