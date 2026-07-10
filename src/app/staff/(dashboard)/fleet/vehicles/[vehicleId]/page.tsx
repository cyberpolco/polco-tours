import { notFound } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { complianceStatus, fleetService } from '@modules/fleet';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { COMPLIANCE_STATUS_TONE } from '@lib/status-tones';
import { updateVehicleAction, uploadVehicleDocumentAction } from './actions';

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

  const documents = await fleetService.listVehicleDocuments(ctx, vehicleId);
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
          <FormField label="Status" htmlFor="status">
            <select name="status" defaultValue={vehicle.status} className="w-full rounded-survey border border-rule px-3 py-2">
              <option value="ACTIVE">ACTIVE</option>
              <option value="MAINTENANCE">MAINTENANCE</option>
              <option value="RETIRED">RETIRED</option>
            </select>
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
    </div>
  );
}
