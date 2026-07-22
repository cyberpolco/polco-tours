import { notFound } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { authService } from '@modules/auth';
import { complianceStatus, fleetService } from '@modules/fleet';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { COMPLIANCE_STATUS_TONE } from '@lib/status-tones';
import { deleteDriverProfileAction, updateDriverProfileAction, uploadDriverDocumentAction } from './actions';

interface Props {
  params: Promise<{ driverProfileId: string }>;
  searchParams: Promise<{ error?: string }>;
}

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
        <PageHeader eyebrow="Driver" title={user?.name ?? user?.email ?? driver.userId} />
        <p className="mt-1 text-mist">{user?.email}</p>
      </div>

      <form action={updateDriverProfileAction.bind(null, driverProfileId)} className="space-y-4">
        <div className="survey-rule mb-2" />
        <div className="grid grid-cols-2 gap-4">
          <FormField label="License number" htmlFor="licenseNumber">
            <input name="licenseNumber" defaultValue={driver.licenseNumber} required className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label="Status" htmlFor="status">
            <Select name="status" defaultValue={driver.status}>
              <option value="ACTIVE">ACTIVE</option>
              <option value="SUSPENDED">SUSPENDED</option>
            </Select>
          </FormField>
        </div>
        <FormField label="License expires on" htmlFor="licenseExpiresAt" optional>
          <input
            name="licenseExpiresAt"
            type="date"
            defaultValue={driver.licenseExpiresAt ? driver.licenseExpiresAt.toISOString().slice(0, 10) : undefined}
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
        <FormField label="Languages (ISO-639-1 codes, comma-separated, e.g. en, fr)" htmlFor="languages" optional>
          <input
            name="languages"
            defaultValue={driver.languages.join(', ')}
            placeholder="en, fr"
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
        <SubmitButton>Save changes</SubmitButton>
      </form>

      <div>
        <div className="survey-rule mb-6" />
        <div className="flex items-center justify-between">
          <p className="eyebrow text-mist">Driver license document</p>
          <Badge tone={COMPLIANCE_STATUS_TONE[status]}>{status}</Badge>
        </div>
        {error === 'missing_file' && (
          <div className="mt-2">
            <Alert tone="error">Choose a file to upload.</Alert>
          </div>
        )}
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
          <SubmitButton variant="secondary" size="compact" pendingLabel="Uploading…">
            Upload
          </SubmitButton>
        </form>
      </div>

      {/* DR-059: SUPERADMIN-only -- see the vehicle detail page's own
          comment for why this role check (not just the route permission)
          is the real gate for rendering the control at all. */}
      {ctx.roles.includes('SUPERADMIN') && (
        <div>
          <div className="survey-rule mb-6" />
          <form action={deleteDriverProfileAction.bind(null, driverProfileId)}>
            <SubmitButton variant="secondary" pendingLabel="Deleting…">
              Delete driver
            </SubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
