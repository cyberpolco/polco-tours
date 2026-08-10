import { DEPARTURE_STATUS_TONE } from '@lib/status-tones';
import { Badge } from '@/components/ui/Badge';
import { Table, TableHeaderRow, Th, Tr, Td } from '@/components/ui/Table';
import type { ScheduleRow } from './build-schedule-rows';

// Extracted from schedule/page.tsx (DR-101) so the three dedicated
// Past/In Progress/Future list pages can render the same table shape the
// hub page used to render inline, without three copies of this JSX.
export function AssignmentsSection({ title, rows }: { title?: string; rows: ScheduleRow[] }) {
  if (rows.length === 0) return null;
  return (
    <div>
      {title && <h2 className="mb-2 text-sm font-semibold text-navy">{title}</h2>}
      <Table>
        <thead>
          <TableHeaderRow>
            <Th>Departure</Th>
            <Th>Vehicle</Th>
            <Th>Driver</Th>
            <Th>Guide</Th>
            <Th>Pickup point</Th>
          </TableHeaderRow>
        </thead>
        <tbody>
          {rows.map(({ assignment, detail, vehicle, driverProfile, guide, progress }) => (
            <Tr key={assignment.id}>
              <Td>
                {detail.departure.startDate.toLocaleDateString()} · {detail.packageCountry}{' '}
                <Badge tone={DEPARTURE_STATUS_TONE[detail.departure.status]}>{detail.departure.status}</Badge>
                {progress?.status === 'IN_PROGRESS' && (
                  <>
                    <span className="ml-2 text-xs text-mist">
                      {progress.totalDays != null ? `Day ${progress.dayNumber} of ${progress.totalDays}` : `Day ${progress.dayNumber}`}
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
              <Td>{vehicle ? `${vehicle.make} ${vehicle.model} (${vehicle.plateNumber})` : 'Unknown vehicle'}</Td>
              <Td>{driverProfile ? `License ${driverProfile.licenseNumber}` : 'Unknown driver'}</Td>
              <Td>{guide ? (guide.name ?? guide.email) : '—'}</Td>
              <Td>
                {detail.departure.pickupLatitude != null && detail.departure.pickupLongitude != null
                  ? `${detail.departure.pickupLatitude.toFixed(4)}, ${detail.departure.pickupLongitude.toFixed(4)}`
                  : 'Not set'}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
