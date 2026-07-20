import { notFound } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { complianceStatus, fleetService } from '@modules/fleet';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { format, money } from '@lib/money';
import { COMPLIANCE_STATUS_TONE } from '@lib/status-tones';
import { deleteVehicleAction, addMaintenanceRecordAction, updateVehicleAction, uploadVehicleDocumentAction } from './actions';

interface Props {
  params: Promise<{ vehicleId: string }>;
  searchParams: Promise<{ error?: string }>;
}

const VEHICLE_DOCUMENT_KINDS = [
  { kind: 'VEHICLE_REGISTRATION', label: 'Registration' },
  { kind: 'VEHICLE_INSURANCE', label: 'Insurance' },
  { kind: 'VEHICLE_INSPECTION', label: 'Inspection' },
] as const;

export default async function VehicleDetailPage({ params, searchParams }: Props) {
  const { vehicleId } = await params;
  const { error } = await searchParams;
  const ctx = await requireStaffContext('fleet.read');

  let vehicle;
  try {
    vehicle = await fleetService.getVehicle(ctx, vehicleId);
  } catch {
    notFound();
  }

  const [documents, maintenanceRecords] = await Promise.all([
    fleetService.listVehicleDocuments(ctx, vehicleId),
    fleetService.listMaintenanceRecords(ctx, vehicleId),
  ]);
  const now = new Date();

  return (
    <div className="max-w-2xl space-y-8">
      <PageHeader eyebrow="Vehicle" title={`${vehicle.make} ${vehicle.model} · ${vehicle.plateNumber}`} />

      <form action={updateVehicleAction.bind(null, vehicleId)} className="space-y-4">
        <div className="survey-rule mb-2" />
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Plate number" htmlFor="plateNumber">
            <input name="plateNumber" defaultValue={vehicle.plateNumber} required className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label="VIN" htmlFor="vin" optional>
            <input name="vin" defaultValue={vehicle.vin ?? ''} className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Make" htmlFor="make">
            <input name="make" defaultValue={vehicle.make} required className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label="Model" htmlFor="model">
            <input name="model" defaultValue={vehicle.model} required className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Status" htmlFor="status">
            <select name="status" defaultValue={vehicle.status} className="w-full rounded-survey border border-rule px-3 py-2">
              <option value="ACTIVE">ACTIVE</option>
              <option value="MAINTENANCE">MAINTENANCE</option>
              <option value="RETIRED">RETIRED</option>
            </select>
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField label="Type" htmlFor="vehicleType">
            <input name="vehicleType" defaultValue={vehicle.vehicleType} required className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label="Year" htmlFor="year" optional>
            <input
              name="year"
              type="number"
              defaultValue={vehicle.year ?? undefined}
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </FormField>
        </div>
        <FormField label="Seat capacity" htmlFor="seatCapacity">
          <input
            name="seatCapacity"
            type="number"
            min={1}
            defaultValue={vehicle.seatCapacity}
            required
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
        <SubmitButton>Save changes</SubmitButton>
      </form>

      <div>
        <div className="survey-rule mb-6" />
        <p className="eyebrow text-mist">Compliance documents</p>
        {error === 'missing_file' && (
          <div className="mt-2">
            <Alert tone="error">Choose a file to upload.</Alert>
          </div>
        )}
        {error === 'invalid_kind' && (
          <div className="mt-2">
            <Alert tone="error">Choose a document type.</Alert>
          </div>
        )}
        <div className="mt-4 space-y-6">
          {VEHICLE_DOCUMENT_KINDS.map(({ kind, label }) => {
            const latest = documents
              .filter((d) => d.kind === kind)
              .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
            const status = complianceStatus(latest?.expiresAt ?? null, now);

            return (
              <div key={kind} className="border-b border-rule pb-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-ink">{label}</span>
                  <Badge tone={COMPLIANCE_STATUS_TONE[status]}>{status}</Badge>
                </div>
                {latest && (
                  <p className="mt-1 text-sm text-mist">
                    <a
                      href={`/api/v1/fleet/vehicles/${vehicleId}/documents/${latest.id}`}
                      className="text-forest hover:underline"
                    >
                      Download current file
                    </a>
                    {latest.expiresAt && ` · expires ${latest.expiresAt.toLocaleDateString()}`}
                  </p>
                )}
                <form
                  action={uploadVehicleDocumentAction.bind(null, vehicleId)}
                  className="mt-2 flex flex-wrap items-end gap-3"
                >
                  <input type="hidden" name="kind" value={kind} />
                  <input type="file" name="file" required className="text-sm" />
                  <div>
                    <label className="mb-1 block text-xs text-mist">Expires on</label>
                    <input type="date" name="expiresAt" className="rounded-survey border border-rule px-2 py-1 text-sm" />
                  </div>
                  <SubmitButton variant="secondary" size="compact" pendingLabel="Uploading…">
                    Upload
                  </SubmitButton>
                </form>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="survey-rule mb-6" />
        <p className="eyebrow text-mist">Maintenance history</p>
        {maintenanceRecords.length === 0 ? (
          <p className="mt-2 text-sm text-mist">No maintenance logged yet.</p>
        ) : (
          <ul className="mt-2 space-y-2 text-sm">
            {maintenanceRecords.map((m) => (
              <li key={m.id} className="flex items-center justify-between border-b border-rule pb-2">
                <span>
                  {m.performedAt.toLocaleDateString()} · {m.description}
                </span>
                {m.costMinor != null && m.currency && <span className="text-mist">{format(money(m.costMinor, m.currency))}</span>}
              </li>
            ))}
          </ul>
        )}

        <form action={addMaintenanceRecordAction.bind(null, vehicleId)} className="mt-4 flex flex-wrap items-end gap-3">
          <FormField label="Date" htmlFor="performedAt">
            <input name="performedAt" type="date" required className="rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label="Description" htmlFor="description">
            <input name="description" required className="w-64 rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label="Cost" htmlFor="amount" optional>
            <input name="amount" type="number" step="0.01" min="0" className="w-28 rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label="Currency" htmlFor="currency" optional>
            <select name="currency" className="rounded-survey border border-rule px-2 py-2">
              <option value="">—</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="NAD">NAD</option>
              <option value="CDF">CDF</option>
            </select>
          </FormField>
          <SubmitButton size="compact" pendingLabel="Logging…">
            Log maintenance
          </SubmitButton>
        </form>
      </div>

      {/* DR-059: SUPERADMIN-only, any status -- the control itself renders
          only for SUPERADMIN (same convention as booking deletion, DR-058)
          since PLATFORM_ADMIN/TOUR_OPERATOR would pass this route's
          fleet.delete permission but still 403 in fleetService
          .deleteVehicle's own isFleetDeleter check. */}
      {ctx.roles.includes('SUPERADMIN') && (
        <div>
          <div className="survey-rule mb-6" />
          <form action={deleteVehicleAction.bind(null, vehicleId)}>
            <SubmitButton variant="secondary" pendingLabel="Deleting…">
              Delete vehicle
            </SubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
