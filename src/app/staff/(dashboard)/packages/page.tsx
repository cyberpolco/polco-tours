import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { catalogService } from '@modules/catalog';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';

// DR-097: split into a card hub (this page, counts only) + two dedicated
// list pages -- Public (status PUBLISHED, the only ones isPackageVisible
// ever shows a guest) and Customized (DRAFT/ARCHIVED, staff-only, never
// reflected on the guest site) -- same card-hub-plus-list-pages shape
// DR-095 already established for the fleet dashboard.
export default async function PackagesPage() {
  const ctx = await requireStaffContext('catalog.read');
  const packages = await catalogService.listPackages(ctx);
  const publicCount = packages.filter((p) => p.status === 'PUBLISHED').length;
  const customizedCount = packages.length - publicCount;
  const t = await getTranslations('StaffPackages');

  const sections = [
    {
      href: '/staff/packages/public',
      title: t('publicTitle'),
      count: publicCount,
      description: t('publicDesc'),
    },
    {
      href: '/staff/packages/customized',
      title: t('customizedTitle'),
      count: customizedCount,
      description: t('customizedDesc'),
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader eyebrow={t('dashboardEyebrow')} title={t('title')} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {sections.map((s) => (
          <Card key={s.href} interactive className="p-0">
            <Link href={s.href} className="block p-5">
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-semibold text-navy">{s.title}</h2>
                <span className="text-2xl font-bold text-navy">{s.count}</span>
              </div>
              <p className="mt-1 text-sm text-mist">{s.description}</p>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
