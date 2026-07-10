import { notFound } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { authService } from '@modules/auth';
import { assignmentService } from '@modules/assignment';
import { catalogService } from '@modules/catalog';
import { fleetService } from '@modules/fleet';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { format } from '@lib/money';
import { DEPARTURE_STATUS_TONE } from '@lib/status-tones';
import { createAssignmentAction, removeAssignmentAction } from './actions';

interface Props {
  params: Promise<{ departureId: string }>;
  searchParams: Promise<{ error?: string; detail?: string }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  guide_not_found: 'No TOUR_GUIDE account found for that email.',
  conflict: 'Could not create the assignment.',
};

export default async function DepartureDetailPage({ params, searchParams }: Props) {
  const { departureId } = await params;
  const { error, detail } = await searchParams;
  const ctx = await requireStaffContext('assignment.write');

  let detailView;
  try {
    detailView = await catalogService.getDepartureDetail(ctx, departureId);
  } catch {
    notFound();
  }
  const { departure, packageCountry, effectiveUnitPrice } = detailView;

  const [assignments, vehicles, driverProfiles] = await Promise.all([
    assignmentService.listForDeparture(ctx, departureId),
    fleetService.listVehicles(ctx),
    fleetService.listDriverProfiles(ctx),
  ]);

  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
  const driverProfileById = new Map(driverProfiles.map((d) => [d.id, d]));
  const guides = await Promise.all(
    assignments.map((a) => (a.guideUserId ? authService.getUser(a.guideUserId) : Promise.resolve(null))),
  );

  const activeVehicles = vehicles.filter((v) => v.status === 'ACTIVE');
  const activeDriverProfiles = driverProfiles.filter((d) => d.status === 'ACTIVE');
  const seatsCovered = assignments.reduce((sum, a) => sum + (vehicleById.get(a.vehicleId)?.seatCapacity ?? 0), 0);

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <PageHeader eyebrow="Departure" title={`${departure.startDate.toLocaleDateString()} · ${packageCountry}`} />
        <p className="mt-1 flex items-center gap-2 text-mist">
          Capacity {departure.capacity} · <Badge tone={DEPARTURE_STATUS_TONE[departure.status]}>{departure.status}</Badge> ·{' '}
          {format(effectiveUnitPrice)}/seat
        </p>
        <p className="mt-1 text-sm text-mist">
          Seats covered by assigned vehicles: {seatsCovered}/{departure.capacity}
        </p>
      </div>

      <div>
        <div className="survey-rule mb-6" />
        <p className="eyebrow text-mist">Assignments</p>
        {error && (
          <div className="mt-2">
            <Alert tone="error">
              {ERROR_MESSAGES[error] ?? 'Something went wrong.'}
              {detail ? ` (${detail})` : ''}
            </Alert>
          </div>
        )}
        {assignments.length === 0 ? (
          <p className="mt-4 text-mist">No assignments yet.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {assignments.map((a, i) => {
              const vehicle = vehicleById.get(a.vehicleId);
              const driverProfile = driverProfileById.get(a.driverProfileId);
              const guide = guides[i];
              return (
                <li key={a.id} className="flex items-center justify-between border-b border-rule pb-3 text-sm">
                  <span>
                    {vehicle ? `${vehicle.make} ${vehicle.model} (${vehicle.plateNumber})` : 'Unknown vehicle'} ·{' '}
                    {driverProfile ? `License ${driverProfile.licenseNumber}` : 'Unknown driver'}
                    {guide && ` · Guide: ${guide.name ?? guide.email}`}
                  </span>
                  <form action={removeAssignmentAction.bind(null, departureId, a.id)}>
                    <SubmitButton variant="secondary" size="compact" pendingLabel="Removing…">
                      Remove
                    </SubmitButton>
                  </form>
                </li>
              );
            })}
          </ul>
        )}

        <form action={createAssignmentAction.bind(null, departureId)} className="mt-6 space-y-4">
          <FormField label="Vehicle" htmlFor="vehicleId">
            <select name="vehicleId" required className="w-full rounded-survey border border-rule px-3 py-2">
              <option value="">Select a vehicle</option>
              {activeVehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.make} {v.model} ({v.plateNumber}) · {v.seatCapacity} seats
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Driver" htmlFor="driverProfileId">
            <select name="driverProfileId" required className="w-full rounded-survey border border-rule px-3 py-2">
              <option value="">Select a driver</option>
              {activeDriverProfiles.map((d) => (
                <option key={d.id} value={d.id}>
                  License {d.licenseNumber}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Guide email (optional -- existing TOUR_GUIDE account)" htmlFor="guideEmail" optional>
            <input name="guideEmail" type="email" className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <SubmitButton>Add assignment</SubmitButton>
        </form>
      </div>
    </div>
  );
}
