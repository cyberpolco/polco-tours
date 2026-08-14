import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { authService } from '@modules/auth';
import { assignmentService } from '@modules/assignment';
import { catalogService, hasDepartureEnded } from '@modules/catalog';
import { fleetService } from '@modules/fleet';
import { Alert } from '@/components/ui/Alert';
import { Badge } from '@/components/ui/Badge';
import { FormField } from '@/components/ui/FormField';
import { MapLocationPicker } from '@/components/ui/MapLocationPicker';
import { PageHeader } from '@/components/ui/PageHeader';
import { SearchableSelect, type SearchableOption } from '@/components/ui/SearchableSelect';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { formatOrPending } from '@lib/money';
import { DEPARTURE_STATUS_TONE } from '@lib/status-tones';
import { createAssignmentAction, removeAssignmentAction, setPickupLocationAction } from './actions';

interface Props {
  params: Promise<{ departureId: string }>;
  searchParams: Promise<{ error?: string; detail?: string }>;
}

export default async function DepartureDetailPage({ params, searchParams }: Props) {
  const { departureId } = await params;
  const { error, detail } = await searchParams;
  const ctx = await requireStaffContext('assignment.write');
  const t = await getTranslations('StaffDepartureDetail');
  const tDepartureStatus = await getTranslations('DepartureStatusLabel');
  const tCountries = await getTranslations('Countries');

  const ERROR_MESSAGES: Record<string, string> = {
    conflict: t('errorConflict'),
    'validation-failed': t('errorValidationFailed'),
  };

  let detailView;
  try {
    detailView = await catalogService.getDepartureDetail(ctx, departureId);
  } catch {
    notFound();
  }
  const { departure, packageCountry, effectiveUnitPrice } = detailView;
  const departureLocked = hasDepartureEnded(departure.endDate, new Date());

  const [assignments, vehicles, driverProfiles, recommendation] = await Promise.all([
    assignmentService.listForDeparture(ctx, departureId),
    fleetService.listVehicles(ctx),
    fleetService.listDriverProfiles(ctx),
    assignmentService.recommendAssignment(ctx, departureId),
  ]);

  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));
  const driverProfileById = new Map(driverProfiles.map((d) => [d.id, d]));
  const guides = await Promise.all(
    assignments.map((a) => (a.guideUserId ? authService.getUser(a.guideUserId) : Promise.resolve(null))),
  );

  const activeVehicles = vehicles.filter((v) => v.status === 'ACTIVE');
  const activeDriverProfiles = driverProfiles.filter((d) => d.status === 'ACTIVE');
  const seatsCovered = assignments.reduce((sum, a) => sum + (vehicleById.get(a.vehicleId)?.seatCapacity ?? 0), 0);

  // DR-029: a simple rules-based recommendation (capacity fit, maintenance
  // recency, distance-from-pickup where data exists) -- NOT real AI (that's
  // Phase 3 in this project's roadmap). Recommended candidates sort first
  // and pre-select the dropdown's default; every ACTIVE vehicle/driver stays
  // pickable so the admin can still fully override.
  const vehicleScoreById = new Map(recommendation.vehicles.map((v) => [v.vehicle.id, v.score]));
  const eligibleDriverIds = new Set(recommendation.drivers.map((d) => d.id));
  const sortedVehicles = [...activeVehicles].sort(
    (a, b) => (vehicleScoreById.get(b.id) ?? -1) - (vehicleScoreById.get(a.id) ?? -1),
  );
  const sortedDrivers = [...activeDriverProfiles].sort(
    (a, b) => Number(eligibleDriverIds.has(b.id)) - Number(eligibleDriverIds.has(a.id)),
  );
  // DR-078: guides are ranked in the recommendation (by averageRating,
  // unrated last -- DR-037) and now get a real searchable picker, same
  // trust level as vehicle/driver's pre-filled dropdowns above. Resolve
  // name/email for every eligible guide (not just the top pick) so the
  // picker can show and search over the full candidate list.
  const guideUsers = await Promise.all(recommendation.guides.map((g) => authService.getUser(g.userId)));
  const guideOptions: SearchableOption[] = recommendation.guides.flatMap((g, i) => {
    const user = guideUsers[i];
    if (!user) return [];
    const label = user.name ? `${user.name} (${user.email})` : user.email;
    return [
      {
        value: g.userId,
        label,
        searchText: `${user.name ?? ''} ${user.email}`.toLowerCase(),
        hint: g.userId === recommendation.recommendedGuideId ? '★' : undefined,
      },
    ];
  });

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <PageHeader eyebrow={t('eyebrow')} title={`${departure.startDate.toLocaleDateString()} · ${tCountries(packageCountry)}`} />
        <p className="mt-1 flex items-center gap-2 text-mist">
          {t('capacity', { capacity: departure.capacity })} ·{' '}
          <Badge tone={DEPARTURE_STATUS_TONE[departure.status]}>{tDepartureStatus(departure.status)}</Badge> ·{' '}
          {formatOrPending(effectiveUnitPrice?.minor ?? null, effectiveUnitPrice?.currency ?? null)}
          {t('perSeat')}
        </p>
        <p className="mt-1 text-sm text-mist">{t('seatsCovered', { covered: seatsCovered, capacity: departure.capacity })}</p>
      </div>

      <div>
        <div className="survey-rule mb-6" />
        <p className="eyebrow text-mist">{t('pickupLocation')}</p>
        <p className="mt-1 text-sm text-mist">
          {departure.pickupLatitude != null && departure.pickupLongitude != null
            ? `${departure.pickupLatitude}, ${departure.pickupLongitude}`
            : t('pickupLocationNotSet')}
        </p>
        <form action={setPickupLocationAction.bind(null, departureId)} className="mt-3 max-w-md space-y-3">
          <MapLocationPicker initialLatitude={departure.pickupLatitude} initialLongitude={departure.pickupLongitude} />
          <SubmitButton variant="secondary" size="compact" pendingLabel={t('saving')}>
            {t('setPickupLocation')}
          </SubmitButton>
        </form>
      </div>

      <div>
        <div className="survey-rule mb-6" />
        <p className="eyebrow text-mist">{t('assignments')}</p>
        {departureLocked && (
          <div className="mt-2">
            <Alert tone="info">{t('departureEnded')}</Alert>
          </div>
        )}
        {error && (
          <div className="mt-2">
            <Alert tone="error">
              {ERROR_MESSAGES[error] ?? t('errorGeneric')}
              {detail ? ` (${detail})` : ''}
            </Alert>
          </div>
        )}
        {assignments.length === 0 ? (
          <p className="mt-4 text-mist">{t('noAssignmentsYet')}</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {assignments.map((a, i) => {
              const vehicle = vehicleById.get(a.vehicleId);
              const driverProfile = driverProfileById.get(a.driverProfileId);
              const guide = guides[i];
              return (
                <li key={a.id} className="flex items-center justify-between border-b border-rule pb-3 text-sm">
                  <span>
                    {vehicle ? `${vehicle.make} ${vehicle.model} (${vehicle.plateNumber})` : t('unknownVehicle')} ·{' '}
                    {driverProfile ? t('licensePrefix', { number: driverProfile.licenseNumber }) : t('unknownDriver')}
                    {guide && ` · ${t('guidePrefix', { name: guide.name ?? guide.email })}`}
                  </span>
                  {!departureLocked && (
                    <form action={removeAssignmentAction.bind(null, departureId, a.id)}>
                      <SubmitButton
                        variant="secondary"
                        size="compact"
                        pendingLabel={t('removing')}
                        confirmMessage={t('removeAssignmentConfirm')}
                      >
                        {t('remove')}
                      </SubmitButton>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {!departureLocked && (
          <form action={createAssignmentAction.bind(null, departureId)} className="mt-6 space-y-4">
            <p className="text-xs text-mist">{t('recommendationNotice')}</p>
            <FormField label={t('vehicleLabel')} htmlFor="vehicleId">
              <Select name="vehicleId" required defaultValue={recommendation.recommendedVehicleId ?? ''}>
                <option value="">{t('selectVehicle')}</option>
                {sortedVehicles.map((v) => {
                  const score = vehicleScoreById.get(v.id);
                  const isTop = v.id === recommendation.recommendedVehicleId;
                  return (
                    <option key={v.id} value={v.id}>
                      {isTop ? '★ ' : ''}
                      {v.make} {v.model} ({v.plateNumber}) · {v.seatCapacity} {t('seatsSuffix')}
                      {score != null ? ` · ${t('fitSuffix', { pct: Math.round(score * 100) })}` : ''}
                    </option>
                  );
                })}
              </Select>
            </FormField>
            <FormField label={t('driverLabel')} htmlFor="driverProfileId">
              <Select name="driverProfileId" required defaultValue={recommendation.recommendedDriverId ?? ''}>
                <option value="">{t('selectDriver')}</option>
                {sortedDrivers.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.id === recommendation.recommendedDriverId ? '★ ' : ''}
                    {t('licensePrefix', { number: d.licenseNumber })}
                    {!eligibleDriverIds.has(d.id) ? ` · ${t('alreadyBookedSuffix')}` : ''}
                  </option>
                ))}
              </Select>
            </FormField>
            {guideOptions.length === 0 && <Alert tone="info">{t('noEligibleGuides')}</Alert>}
            <FormField label={t('guideLabel')} htmlFor="guideUserId">
              <SearchableSelect
                name="guideUserId"
                options={guideOptions}
                defaultValue={recommendation.recommendedGuideId ?? undefined}
                placeholder={t('searchGuidesPlaceholder')}
                required
              />
            </FormField>
            <SubmitButton>{t('addAssignment')}</SubmitButton>
          </form>
        )}
      </div>
    </div>
  );
}
