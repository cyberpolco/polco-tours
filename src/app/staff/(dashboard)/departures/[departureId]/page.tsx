import { notFound } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { authService } from '@modules/auth';
import { assignmentService } from '@modules/assignment';
import { catalogService } from '@modules/catalog';
import { fleetService } from '@modules/fleet';
import { format } from '@lib/money';
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
        <p className="text-xs tracking-survey text-mist">DEPARTURE</p>
        <h1 className="mt-1 text-2xl font-bold text-navy">
          {departure.startDate.toLocaleDateString()} · {packageCountry}
        </h1>
        <p className="mt-1 text-mist">
          Capacity {departure.capacity} · {departure.status} · {format(effectiveUnitPrice)}/seat
        </p>
        <p className="mt-1 text-sm text-mist">
          Seats covered by assigned vehicles: {seatsCovered}/{departure.capacity}
        </p>
      </div>

      <div className="border-t border-rule pt-6">
        <p className="text-xs tracking-survey text-mist">ASSIGNMENTS</p>
        {error && <p className="mt-2 text-sm text-amber">{ERROR_MESSAGES[error] ?? 'Something went wrong.'}{detail ? ` (${detail})` : ''}</p>}
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
                    <button className="rounded-survey border border-rule px-3 py-1 text-xs text-ink">Remove</button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}

        <form action={createAssignmentAction.bind(null, departureId)} className="mt-6 space-y-4">
          <div>
            <label htmlFor="vehicleId" className="mb-1 block text-sm text-mist">
              Vehicle
            </label>
            <select id="vehicleId" name="vehicleId" required className="w-full rounded-survey border border-rule px-3 py-2">
              <option value="">Select a vehicle</option>
              {activeVehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.make} {v.model} ({v.plateNumber}) · {v.seatCapacity} seats
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="driverProfileId" className="mb-1 block text-sm text-mist">
              Driver
            </label>
            <select
              id="driverProfileId"
              name="driverProfileId"
              required
              className="w-full rounded-survey border border-rule px-3 py-2"
            >
              <option value="">Select a driver</option>
              {activeDriverProfiles.map((d) => (
                <option key={d.id} value={d.id}>
                  License {d.licenseNumber}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="guideEmail" className="mb-1 block text-sm text-mist">
              Guide email (optional -- existing TOUR_GUIDE account)
            </label>
            <input
              id="guideEmail"
              name="guideEmail"
              type="email"
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </div>
          <button type="submit" className="rounded-survey bg-amber px-4 py-2 text-sm font-semibold text-navy">
            Add assignment
          </button>
        </form>
      </div>
    </div>
  );
}
