import { getTranslations } from 'next-intl/server';
import { DEPARTURE_STATUS_TONE } from '@lib/status-tones';
import { Badge } from '@/components/ui/Badge';
import { Table, TableHeaderRow, Th, Tr, Td } from '@/components/ui/Table';
import type { ScheduleRow } from './build-schedule-rows';

// Extracted from schedule/page.tsx (DR-101) so the three dedicated
// Past/In Progress/Future list pages can render the same table shape the
// hub page used to render inline, without three copies of this JSX.
export async function AssignmentsSection({ title, rows }: { title?: string; rows: ScheduleRow[] }) {
  if (rows.length === 0) return null;
  const t = await getTranslations('StaffSchedule');
  const tDepartureStatus = await getTranslations('DepartureStatusLabel');
  return (
    <div>
      {title && <h2 className="mb-2 text-sm font-semibold text-navy">{title}</h2>}
      <Table>
        <thead>
          <TableHeaderRow>
            <Th>{t('departure')}</Th>
            <Th>{t('vehicle')}</Th>
            <Th>{t('driver')}</Th>
            <Th>{t('guide')}</Th>
            <Th>{t('pickupPoint')}</Th>
          </TableHeaderRow>
        </thead>
        <tbody>
          {rows.map(({ assignment, detail, vehicle, driverProfile, guide, progress }) => (
            <Tr key={assignment.id}>
              <Td>
                {detail.departure.startDate.toLocaleDateString()} · {detail.packageCountry}{' '}
                <Badge tone={DEPARTURE_STATUS_TONE[detail.departure.status]}>{tDepartureStatus(detail.departure.status)}</Badge>
                {progress?.status === 'IN_PROGRESS' && (
                  <>
                    <span className="ml-2 text-xs text-mist">
                      {progress.totalDays != null
                        ? t('dayOfTotal', { day: progress.dayNumber ?? 0, total: progress.totalDays })
                        : t('dayOnly', { day: progress.dayNumber ?? 0 })}
                    </span>
                    {progress.percentComplete != null && (
                      <div className="mt-1 h-1.5 w-32 rounded-full bg-rule">
                        <div
                          className="h-1.5 rounded-full bg-forest"
                          style={{ width: `${progress.percentComplete}%` }}
                        />
                      </div>
                    )}
                  </>
                )}
              </Td>
              <Td>{vehicle ? `${vehicle.make} ${vehicle.model} (${vehicle.plateNumber})` : t('unknownVehicle')}</Td>
              <Td>{driverProfile ? t('licenseLabel', { number: driverProfile.licenseNumber }) : t('unknownDriver')}</Td>
              <Td>{guide ? (guide.name ?? guide.email) : '—'}</Td>
              <Td>
                {detail.departure.pickupLatitude != null && detail.departure.pickupLongitude != null
                  ? `${detail.departure.pickupLatitude.toFixed(4)}, ${detail.departure.pickupLongitude.toFixed(4)}`
                  : t('notSet')}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
