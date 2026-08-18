import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { fleetService } from '@modules/fleet';
import { BackLink } from '@/components/ui/BackLink';
import { Badge } from '@/components/ui/Badge';
import { FormField } from '@/components/ui/FormField';
import { MapLocationPicker } from '@/components/ui/MapLocationPicker';
import { PageHeader } from '@/components/ui/PageHeader';
import { Reveal } from '@/components/ui/Reveal';
import { Select } from '@/components/ui/Select';
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
  const t = await getTranslations('StaffStarlinkKits');
  const tStarlinkStatus = await getTranslations('StarlinkStatusLabel');

  return (
    <div className="max-w-md space-y-8">
      <BackLink href="/staff/fleet/starlink-kits">{t('backToFleet')}</BackLink>
      <div className="flex items-center gap-3">
        <PageHeader eyebrow={t('detailEyebrow')} title={kit.kitId} />
        <Badge tone={STARLINK_STATUS_TONE[kit.status]}>{tStarlinkStatus(kit.status)}</Badge>
      </div>

      <Reveal>
        <form action={updateStarlinkKitAction.bind(null, kitId)} className="space-y-4">
          <div className="survey-rule mb-2" />
          <FormField label={t('status')} htmlFor="status">
            <Select name="status" defaultValue={kit.status}>
              <option value="ACTIVE">ACTIVE</option>
              <option value="INACTIVE">INACTIVE</option>
              <option value="MAINTENANCE">MAINTENANCE</option>
            </Select>
          </FormField>
          <FormField label={t('assignedVehicle')} htmlFor="vehicleId" optional>
            <Select name="vehicleId" defaultValue={kit.vehicleId ?? ''}>
              <option value="">{t('unassigned')}</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.make} {v.model} ({v.plateNumber})
                </option>
              ))}
            </Select>
          </FormField>
          <SubmitButton>{t('saveChanges')}</SubmitButton>
        </form>
      </Reveal>

      <Reveal delay={0.1}>
        <div className="survey-rule mb-6" />
        <p className="eyebrow text-mist">{t('lastKnownLocation')}</p>
        {kit.lastLatitude != null && kit.lastLongitude != null ? (
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-mist">
            <span className="font-medium text-ink">
              {kit.lastLatitude}, {kit.lastLongitude}
            </span>
            {kit.lastLocationAt && (
              <span className="rounded-pill bg-mist/10 px-2.5 py-1 text-xs font-semibold text-mist">
                {kit.lastLocationAt.toLocaleString()}
              </span>
            )}
          </p>
        ) : (
          <p className="mt-1 text-sm text-mist">{t('notSet')}</p>
        )}
        <p className="mt-1 text-xs text-mist">{t('staffEnteredNotice')}</p>
        <form action={setStarlinkLocationAction.bind(null, kitId)} className="mt-3 space-y-3">
          <MapLocationPicker initialLatitude={kit.lastLatitude} initialLongitude={kit.lastLongitude} />
          <SubmitButton size="compact" pendingLabel={t('saving')}>
            {t('updateLocation')}
          </SubmitButton>
        </form>
      </Reveal>

      {/* DR-059: SUPERADMIN-only -- see the vehicle detail page's own
          comment for why this role check (not just the route permission)
          is the real gate for rendering the control at all. */}
      {ctx.roles.includes('SUPERADMIN') && (
        <Reveal delay={0.15}>
          <div className="survey-rule mb-6" />
          <form action={deleteStarlinkKitAction.bind(null, kitId)}>
            <SubmitButton variant="secondary" pendingLabel={t('deleting')} confirmMessage={t('deleteKitConfirm')}>
              {t('deleteKit')}
            </SubmitButton>
          </form>
        </Reveal>
      )}
    </div>
  );
}
