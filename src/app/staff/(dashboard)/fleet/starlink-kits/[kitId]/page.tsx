import { notFound } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { fleetService } from '@modules/fleet';
import { Badge } from '@/components/ui/Badge';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { STARLINK_STATUS_TONE } from '@lib/status-tones';
import { deleteStarlinkKitAction, setStarlinkLocationAction, updateStarlinkKitAction } from './actions';

interface Props {
  params: Promise<{ kitId: string }>;
}

export default async function StarlinkKitDetailPage({ params }: Props) {
  const { kitId } = await params;
  const ctx = await requireStaffContext('fleet.read');

  let kit;
  try {
    kit = await fleetService.getStarlinkKit(ctx, kitId);
  } catch {
    notFound();
  }

  const vehicles = await fleetService.listVehicles(ctx);

  return (
    <div className="max-w-md space-y-8">
      <div className="flex items-center gap-3">
        <PageHeader eyebrow="Starlink kit" title={kit.kitId} />
        <Badge tone={STARLINK_STATUS_TONE[kit.status]}>{kit.status}</Badge>
      </div>

      <form action={updateStarlinkKitAction.bind(null, kitId)} className="space-y-4">
        <div className="survey-rule mb-2" />
        <FormField label="Status" htmlFor="status">
          <select name="status" defaultValue={kit.status} className="w-full rounded-survey border border-rule px-3 py-2">
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
            <option value="MAINTENANCE">MAINTENANCE</option>
          </select>
        </FormField>
        <FormField label="Assigned vehicle" htmlFor="vehicleId" optional>
          <select name="vehicleId" defaultValue={kit.vehicleId ?? ''} className="w-full rounded-survey border border-rule px-3 py-2">
            <option value="">Unassigned</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.make} {v.model} ({v.plateNumber})
              </option>
            ))}
          </select>
        </FormField>
        <SubmitButton>Save changes</SubmitButton>
      </form>

      <div>
        <div className="survey-rule mb-6" />
        <p className="eyebrow text-mist">Last known location</p>
        <p className="mt-1 text-sm text-mist">
          {kit.lastLatitude != null && kit.lastLongitude != null
            ? `${kit.lastLatitude}, ${kit.lastLongitude}${kit.lastLocationAt ? ` · ${kit.lastLocationAt.toLocaleString()}` : ''}`
            : 'Not set'}
        </p>
        <p className="mt-1 text-xs text-mist">
          Staff-entered for now -- no live Starlink API feed yet.
        </p>
        <form action={setStarlinkLocationAction.bind(null, kitId)} className="mt-3 flex flex-wrap items-end gap-3">
          <FormField label="Latitude" htmlFor="latitude">
            <input
              name="latitude"
              type="number"
              step="any"
              defaultValue={kit.lastLatitude ?? undefined}
              required
              className="w-32 rounded-survey border border-rule px-3 py-2"
            />
          </FormField>
          <FormField label="Longitude" htmlFor="longitude">
            <input
              name="longitude"
              type="number"
              step="any"
              defaultValue={kit.lastLongitude ?? undefined}
              required
              className="w-32 rounded-survey border border-rule px-3 py-2"
            />
          </FormField>
          <SubmitButton size="compact" pendingLabel="Saving…">
            Update location
          </SubmitButton>
        </form>
      </div>

      {/* DR-059: SUPERADMIN-only -- see the vehicle detail page's own
          comment for why this role check (not just the route permission)
          is the real gate for rendering the control at all. */}
      {ctx.roles.includes('SUPERADMIN') && (
        <div>
          <div className="survey-rule mb-6" />
          <form action={deleteStarlinkKitAction.bind(null, kitId)}>
            <SubmitButton variant="secondary" pendingLabel="Deleting…">
              Delete Starlink kit
            </SubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
