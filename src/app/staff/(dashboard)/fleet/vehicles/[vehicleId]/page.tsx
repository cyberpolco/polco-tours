import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { complianceStatus, fleetService } from '@modules/fleet';
import { Alert } from '@/components/ui/Alert';
import { BackLink } from '@/components/ui/BackLink';
import { Badge } from '@/components/ui/Badge';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Select } from '@/components/ui/Select';
import { SelectOrOther } from '@/components/ui/SelectOrOther';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { format, money } from '@lib/money';
import { AVAILABILITY_STATUS_TONE, COMPLIANCE_STATUS_TONE } from '@lib/status-tones';
import { VEHICLE_TYPES } from '@lib/vehicle-catalog';
import { deleteVehicleAction, addMaintenanceRecordAction, updateVehicleAction, uploadVehicleDocumentAction } from './actions';
import { VehicleMakeModelFields } from '../vehicle-make-model-fields';

interface Props {
  params: Promise<{ vehicleId: string }>;
  searchParams: Promise<{ error?: string }>;
}

const VEHICLE_DOCUMENT_KINDS = [
  { kind: 'VEHICLE_REGISTRATION', labelKey: 'registrationDoc' },
  { kind: 'VEHICLE_INSURANCE', labelKey: 'insuranceDoc' },
  { kind: 'VEHICLE_INSPECTION', labelKey: 'inspectionDoc' },
] as const;

export default async function VehicleDetailPage({ params, searchParams }: Props) {
  const { vehicleId } = await params;
  const { error } = await searchParams;
  const ctx = await requireStaffContext('fleet.read');
  const t = await getTranslations('StaffVehicles');
  const tAvailabilityStatus = await getTranslations('AvailabilityStatusLabel');
  const tVehicleStatus = await getTranslations('VehicleStatusLabel');
  const tComplianceStatus = await getTranslations('ComplianceStatusLabel');

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
      <BackLink href="/staff/fleet/vehicles">{t('backToFleet')}</BackLink>
      <PageHeader eyebrow={t('detailEyebrow')} title={`${vehicle.make} ${vehicle.model} · ${vehicle.plateNumber}`} />
      <p className="-mt-4 text-sm text-mist">
        {t('availabilityLabel')} <Badge tone={AVAILABILITY_STATUS_TONE[vehicle.availability]}>{tAvailabilityStatus(vehicle.availability)}</Badge>
      </p>

      <form action={updateVehicleAction.bind(null, vehicleId)} className="space-y-4">
        <div className="survey-rule mb-2" />
        <div className="grid grid-cols-2 gap-4">
          <FormField label={t('plateNumber')} htmlFor="plateNumber">
            <input name="plateNumber" defaultValue={vehicle.plateNumber} required className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label={t('vin')} htmlFor="vin" optional>
            <input name="vin" defaultValue={vehicle.vin ?? ''} className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
        </div>
        <VehicleMakeModelFields defaultMake={vehicle.make} defaultModel={vehicle.model} />
        <div className="grid grid-cols-2 gap-4">
          <FormField label={t('status')} htmlFor="status">
            <Select name="status" defaultValue={vehicle.status}>
              <option value="ACTIVE">{tVehicleStatus('ACTIVE')}</option>
              <option value="MAINTENANCE">{tVehicleStatus('MAINTENANCE')}</option>
              <option value="RETIRED">{tVehicleStatus('RETIRED')}</option>
            </Select>
          </FormField>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <FormField label={t('type')} htmlFor="vehicleType">
            <SelectOrOther
              name="vehicleType"
              options={VEHICLE_TYPES}
              defaultValue={vehicle.vehicleType}
              placeholder={t('vehicleTypePlaceholder')}
              required
            />
          </FormField>
          <FormField label={t('year')} htmlFor="year" optional>
            <input
              name="year"
              type="number"
              defaultValue={vehicle.year ?? undefined}
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </FormField>
        </div>
        <FormField label={t('seatCapacity')} htmlFor="seatCapacity">
          <input
            name="seatCapacity"
            type="number"
            min={1}
            defaultValue={vehicle.seatCapacity}
            required
            className="w-full rounded-survey border border-rule px-3 py-2"
          />
        </FormField>
        <SubmitButton>{t('saveChanges')}</SubmitButton>
      </form>

      <div>
        <div className="survey-rule mb-6" />
        <p className="eyebrow text-mist">{t('complianceDocuments')}</p>
        {error === 'missing_file' && (
          <div className="mt-2">
            <Alert tone="error">{t('chooseFileToUpload')}</Alert>
          </div>
        )}
        {error === 'invalid_kind' && (
          <div className="mt-2">
            <Alert tone="error">{t('chooseDocumentType')}</Alert>
          </div>
        )}
        <div className="mt-4 space-y-6">
          {VEHICLE_DOCUMENT_KINDS.map(({ kind, labelKey }) => {
            const latest = documents
              .filter((d) => d.kind === kind)
              .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
            const status = complianceStatus(latest?.expiresAt ?? null, now);

            return (
              <div key={kind} className="border-b border-rule pb-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-ink">{t(labelKey)}</span>
                  <Badge tone={COMPLIANCE_STATUS_TONE[status]}>{tComplianceStatus(status)}</Badge>
                </div>
                {latest && (
                  <p className="mt-1 text-sm text-mist">
                    <a
                      href={`/api/v1/fleet/vehicles/${vehicleId}/documents/${latest.id}`}
                      className="text-forest hover:underline"
                    >
                      {t('downloadCurrentFile')}
                    </a>
                    {latest.expiresAt && ` · ${t('expiresOn', { date: latest.expiresAt.toLocaleDateString() })}`}
                  </p>
                )}
                <form
                  action={uploadVehicleDocumentAction.bind(null, vehicleId)}
                  className="mt-2 flex flex-wrap items-end gap-3"
                >
                  <input type="hidden" name="kind" value={kind} />
                  <input type="file" name="file" required className="text-sm" />
                  <div>
                    <label className="mb-1 block text-xs text-mist">{t('expiresOnLabel')}</label>
                    <input type="date" name="expiresAt" className="rounded-survey border border-rule px-2 py-1 text-sm" />
                  </div>
                  <SubmitButton variant="secondary" size="compact" pendingLabel={t('uploading')}>
                    {t('upload')}
                  </SubmitButton>
                </form>
              </div>
            );
          })}
        </div>
      </div>

      <div>
        <div className="survey-rule mb-6" />
        <p className="eyebrow text-mist">{t('maintenanceHistory')}</p>
        {maintenanceRecords.length === 0 ? (
          <p className="mt-2 text-sm text-mist">{t('noMaintenanceYet')}</p>
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
          <FormField label={t('date')} htmlFor="performedAt">
            <input name="performedAt" type="date" required className="rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label={t('description')} htmlFor="description">
            <input name="description" required className="w-64 rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label={t('cost')} htmlFor="amount" optional>
            <input name="amount" type="number" step="0.01" min="0" className="w-28 rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label={t('currency')} htmlFor="currency" optional>
            <Select name="currency">
              <option value="">—</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="NAD">NAD</option>
              <option value="CDF">CDF</option>
            </Select>
          </FormField>
          <SubmitButton size="compact" pendingLabel={t('logging')}>
            {t('logMaintenance')}
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
            <SubmitButton variant="secondary" pendingLabel={t('deleting')} confirmMessage={t('deleteVehicleConfirm')}>
              {t('deleteVehicle')}
            </SubmitButton>
          </form>
        </div>
      )}
    </div>
  );
}
