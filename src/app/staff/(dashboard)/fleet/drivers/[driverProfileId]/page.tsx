import { notFound } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { authService } from '@modules/auth';
import { complianceStatus, fleetService } from '@modules/fleet';
import { updateDriverProfileAction, uploadDriverDocumentAction } from './actions';

interface Props {
  params: Promise<{ driverProfileId: string }>;
  searchParams: Promise<{ error?: string }>;
}

const STATUS_CLASS: Record<string, string> = {
  MISSING: 'text-mist',
  VALID: 'text-forest',
  EXPIRING_SOON: 'text-amber',
  EXPIRED: 'font-semibold text-amber',
};

export default async function DriverDetailPage({ params, searchParams }: Props) {
  const { driverProfileId } = await params;
  const { error } = await searchParams;
  const ctx = await requireStaffContext('fleet.read');

  let driver;
  try {
    driver = await fleetService.getDriverProfile(ctx, driverProfileId);
  } catch {
    notFound();
  }

  const [user, documents] = await Promise.all([
    authService.getUser(driver.userId),
    fleetService.listDriverDocuments(ctx, driverProfileId),
  ]);
  const now = new Date();
  const latestLicense = documents.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
  const status = complianceStatus(latestLicense?.expiresAt ?? null, now);

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <p className="text-xs tracking-survey text-mist">DRIVER</p>
        <h1 className="mt-1 text-2xl font-bold text-navy">{user?.name ?? user?.email ?? driver.userId}</h1>
        <p className="mt-1 text-mist">{user?.email}</p>
      </div>

      <form action={updateDriverProfileAction.bind(null, driverProfileId)} className="space-y-4 border-t border-rule pt-6">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="licenseNumber" className="mb-1 block text-sm text-mist">
              License number
            </label>
            <input
              id="licenseNumber"
              name="licenseNumber"
              defaultValue={driver.licenseNumber}
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
              defaultValue={driver.status}
              className="w-full rounded-survey border border-rule px-3 py-2"
            >
              <option value="ACTIVE">ACTIVE</option>
              <option value="SUSPENDED">SUSPENDED</option>
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="licenseExpiresAt" className="mb-1 block text-sm text-mist">
            License expires on
          </label>
          <input
            id="licenseExpiresAt"
            name="licenseExpiresAt"
            type="date"
            defaultValue={driver.licenseExpiresAt ? driver.licenseExpiresAt.toISOString().slice(0, 10) : undefined}
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </div>
        <button type="submit" className="rounded-survey bg-amber px-4 py-2 text-sm font-semibold text-navy">
          Save changes
        </button>
      </form>

      <div className="border-t border-rule pt-6">
        <div className="flex items-center justify-between">
          <p className="text-xs tracking-survey text-mist">DRIVER LICENSE DOCUMENT</p>
          <span className={STATUS_CLASS[status]}>{status}</span>
        </div>
        {error === 'missing_file' && <p className="mt-2 text-sm text-amber">Choose a file to upload.</p>}
        {latestLicense && (
          <p className="mt-2 text-sm text-mist">
            <a
              href={`/api/v1/fleet/drivers/${driverProfileId}/documents/${latestLicense.id}`}
              className="text-forest hover:underline"
            >
              Download current file
            </a>
            {latestLicense.expiresAt && ` · expires ${latestLicense.expiresAt.toLocaleDateString()}`}
          </p>
        )}
        <form
          action={uploadDriverDocumentAction.bind(null, driverProfileId)}
          className="mt-3 flex flex-wrap items-end gap-3"
        >
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
    </div>
  );
}
