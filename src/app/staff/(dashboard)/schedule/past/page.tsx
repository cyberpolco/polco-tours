import Link from 'next/link';
import type { DepartureStatus } from '@prisma/client';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { paginate } from '@lib/directory-filters';
import { BackLink } from '@/components/ui/BackLink';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { Reveal } from '@/components/ui/Reveal';
import { SearchField } from '@/components/ui/SearchField';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { AssignmentsSection } from '../assignments-section';
import { buildScheduleRows, matchesScheduleQuery } from '../build-schedule-rows';

const PER_PAGE = 10;
const DEPARTURE_STATUSES: DepartureStatus[] = ['SCHEDULED', 'CANCELLED', 'COMPLETED'];

interface Props {
  searchParams: Promise<{ q?: string; departureStatus?: string; page?: string }>;
}

// DR-101: one of three dedicated list pages (Past/In Progress/Future,
// mirroring the DR-098 Bookings pattern) replacing the single flat
// "Completed" section on the old combined /staff/schedule page.
export default async function PastAssignmentsPage({ searchParams }: Props) {
  const ctx = await requireStaffContext('assignment.read');
  const params = await searchParams;
  const t = await getTranslations('StaffSchedule');
  const tDepartureStatus = await getTranslations('DepartureStatusLabel');
  const q = params.q ?? '';
  const departureStatus = (DEPARTURE_STATUSES as string[]).includes(params.departureStatus ?? '')
    ? (params.departureStatus as DepartureStatus)
    : '';

  const allRows = await buildScheduleRows(ctx);
  const pastRows = allRows.filter((r) => r.progress?.status === 'COMPLETED');

  const filtered = pastRows.filter((r) => {
    if (departureStatus && r.detail.departure.status !== departureStatus) return false;
    if (!matchesScheduleQuery(r, q)) return false;
    return true;
  });
  const { items: rows, page, totalPages, totalItems } = paginate(filtered, Number(params.page ?? '1'), PER_PAGE);

  const baseParams: Record<string, string> = {};
  if (q) baseParams.q = q;
  if (departureStatus) baseParams.departureStatus = departureStatus;

  function hrefWith(overrides: Record<string, string | undefined>): string {
    const merged = { ...baseParams, ...overrides };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v) qs.set(k, v);
    }
    const s = qs.toString();
    return s ? `/staff/schedule/past?${s}` : '/staff/schedule/past';
  }

  return (
    <div className="max-w-4xl space-y-6">
      <BackLink href="/staff/schedule">{t('backToSchedule')}</BackLink>
      <PageHeader eyebrow={t('eyebrow')} title={t('pastAssignmentsTitle')} />

      <Reveal className="space-y-6">
        <form method="get" action="/staff/schedule/past" className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <FormField label={t('search')} htmlFor="q" optional>
            <SearchField name="q" defaultValue={q} placeholder={t('searchPlaceholder')} />
          </FormField>
          <FormField label={t('departureStatus')} htmlFor="departureStatus" optional>
            <Select name="departureStatus" defaultValue={departureStatus}>
              <option value="">{t('all')}</option>
              {DEPARTURE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {tDepartureStatus(s)}
                </option>
              ))}
            </Select>
          </FormField>
          <div className="col-span-2 flex items-end gap-3 sm:col-span-1">
            <SubmitButton size="compact">{t('filter')}</SubmitButton>
            {(q || departureStatus) && (
              <Link href="/staff/schedule/past" className="text-sm text-mist hover:underline">
                {t('clearFilters')}
              </Link>
            )}
          </div>
        </form>

        <p className="text-sm text-mist">{t('assignmentCount', { count: totalItems })}</p>

        {rows.length === 0 ? <p className="text-mist">{t('noPastMatches')}</p> : <AssignmentsSection rows={rows} />}

        <Pagination page={page} totalPages={totalPages} hrefFor={(p) => hrefWith({ page: p === 1 ? undefined : String(p) })} />
      </Reveal>
    </div>
  );
}
