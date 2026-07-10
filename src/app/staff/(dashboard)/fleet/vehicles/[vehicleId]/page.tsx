import { notFound } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { complianceStatus, fleetService } from '@modules/fleet';
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

const STATUS_CLASS: Record<string, string> = {
  MISSING: 'text-mist',
  VALID: 'text-forest',
  EXPIRING_SOON: 'text-amber',
  EXPIRED: 'font-semibold text-amber',
};

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
      <div>
        <p className="text-xs tracking-survey text-mist">VEHICLE</p>
        <h1 className="mt-1 text-2xl font-bold text-navy">
          {vehicle.make} {vehicle.model} · {vehicle.plateNumber}
        </h1>
      </div>

      <form action={updateVehicleAction.bind(null, vehicleId)} className="space-y-4 border-t border-rule pt-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="plateNumber" className="mb-1 block text-sm text-mist">
              Plate number
            </label>
            <input
              id="plateNumber"
              name="plateNumber"
              defaultValue={vehicle.plateNumber}
              required
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </div>
          <div>
            <label htmlFor="status" className="mb-1 block text-sm text-mist">
              Status
            </label>
            <select
              id="status"
              name="status"
              defaultValue={vehicle.status}
              className="w-full rounded-survey border border-rule px-3 py-2"
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="MAINTENANCE">MAINTENANCE</option>
              <option value="RETIRED">RETIRED</option>
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="make" className="mb-1 block text-sm text-mist">
              Make
            </label>
            <input
              id="make"
              name="make"
              defaultValue={vehicle.make}
              required
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </div>
          <div>
            <label htmlFor="model" className="mb-1 block text-sm text-mist">
              Model
            </label>
            <input
              id="model"
              name="model"
              defaultValue={vehicle.model}
              required
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="vehicleType" className="mb-1 block text-sm text-mist">
              Type
            </label>
            <input
              id="vehicleType"
              name="vehicleType"
              defaultValue={vehicle.vehicleType}
              required
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </div>
          <div>
            <label htmlFor="year" className="mb-1 block text-sm text-mist">
              Year
            </label>
            <input
              id="year"
              name="year"
              type="number"
              defaultValue={vehicle.year ?? undefined}
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </div>
        </div>
        <div>
          <label htmlFor="seatCapacity" className="mb-1 block text-sm text-mist">
            Seat capacity
          </label>
          <input
            id="seatCapacity"
            name="seatCapacity"
            type="number"
            min={1}
            defaultValue={vehicle.seatCapacity}
            required
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </div>
        <button type="submit" className="rounded-survey bg-amber px-4 py-2 text-sm font-semibold text-navy">
          Save changes
        </button>
      </form>

      <div className="border-t border-rule pt-6">
        <p className="text-xs tracking-survey text-mist">COMPLIANCE DOCUMENTS</p>
        {error === 'missing_file' && <p className="mt-2 text-sm text-amber">Choose a file to upload.</p>}
        {error === 'invalid_kind' && <p className="mt-2 text-sm text-amber">Choose a document type.</p>}
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
                  <span className={STATUS_CLASS[status]}>{status}</span>
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
                  <button type="submit" className="rounded-survey border border-rule px-3 py-1 text-sm text-ink">
                    Upload
                  </button>
                </form>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
