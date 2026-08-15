import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { catalogService } from '@modules/catalog';
import { BackLink } from '@/components/ui/BackLink';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { formatOrPending } from '@lib/money';
import { createStaffPackageBookingAction } from './actions';
import StaffPlanMyTripForm from './staff-plan-my-trip-form';

interface Props {
  searchParams: Promise<{ mode?: string; packageId?: string; tailorMade?: string }>;
}

// Explicit user direction: only SUPERADMIN and TOUR_OPERATOR may create a
// booking manually on a client's behalf here -- narrower than booking.create
// itself (also held by TOURIST for guest checkout, and PLATFORM_ADMIN for
// unrelated reasons), same "route/page narrows beyond the base permission"
// pattern as /staff/admin/permissions.
function requireNewBookingAccess(roles: string[]): void {
  if (!roles.includes('SUPERADMIN') && !roles.includes('TOUR_OPERATOR')) redirect('/staff/forbidden');
}

// Two entry points, each reusing the EXACT SAME form a guest fills out --
// "from an existing package" mirrors (guest)/book-package/[packageId]
// (start date only, no departure picker -- DR-054 creates a fresh Departure
// from that date, trip length is the package's own staff-set durationDays);
// "tailor-made request" mirrors (guest)/plan-my-trip's 9-step wizard
// verbatim. The only staff-specific addition is identifying which client the
// booking is for (email, resolved/created via authService
// .findOrCreateTouristByEmail, DR-036) -- for the tailor-made path this is
// already one of the wizard's own fields, no extra step needed.
export default async function NewBookingPage({ searchParams }: Props) {
  const ctx = await requireStaffContext('booking.create');
  requireNewBookingAccess(ctx.roles);
  const { mode, packageId, tailorMade } = await searchParams;
  const t = await getTranslations('StaffBookings');
  const tCountries = await getTranslations('Countries');
  const tBookingStart = await getTranslations('BookingStart');

  if (tailorMade) {
    return (
      <div className="max-w-md">
        <BackLink href="/staff/bookings/new">{t('back')}</BackLink>
        <PageHeader eyebrow={t('newBookingEyebrow')} title={t('tailorMadeTitle')} />
        <StaffPlanMyTripForm />
      </div>
    );
  }

  if (packageId) {
    const pkg = await catalogService.getPackage(ctx, packageId);
    // Same bookable gate the guest page itself enforces (DR-054) --
    // catalogService.createDepartureForBooking would otherwise 409.
    if (pkg.status !== 'PUBLISHED' || pkg.priceMinor == null || pkg.durationDays == null) redirect('/staff/bookings/new');

    return (
      <div className="max-w-md">
        <PageHeader
          eyebrow={t('newBookingEyebrow')}
          title={`${pkg.title} · ${formatOrPending(pkg.priceMinor, pkg.currency)}${tBookingStart('perSeat')}`}
        />
        <p className="mt-1 text-sm text-mist">{t('dayTrip', { days: pkg.durationDays })}</p>
        <form action={createStaffPackageBookingAction.bind(null, packageId)} className="mt-6 space-y-4">
          <FormField label={t('clientEmailLabel')} htmlFor="email">
            <input name="email" type="email" required className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label={t('travelStart')} htmlFor="startDate">
            <input
              name="startDate"
              type="date"
              min={new Date().toISOString().slice(0, 10)}
              required
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </FormField>
          <FormField label={t('seats')} htmlFor="seats">
            <input
              name="seats"
              type="number"
              min={1}
              defaultValue={1}
              required
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </FormField>
          <FormField label={t('specialRequests')} htmlFor="specialRequests" optional>
            <textarea name="specialRequests" rows={2} className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <SubmitButton>{t('createBooking')}</SubmitButton>
        </form>
        <BackLink href="/staff/bookings/new?mode=packages" className="mt-4">
          {t('back')}
        </BackLink>
      </div>
    );
  }

  if (mode === 'packages') {
    const packages = await catalogService.listPackages(ctx);
    const bookablePackages = packages.filter((p) => p.status === 'PUBLISHED' && p.priceMinor != null && p.durationDays != null);

    return (
      <div>
        <BackLink href="/staff/bookings/new">{t('back')}</BackLink>
        <PageHeader eyebrow={t('newBookingEyebrow')} title={t('choosePackageTitle')} />
        {bookablePackages.length === 0 ? (
          <p className="mt-4 text-mist">{t('noBookablePackages')}</p>
        ) : (
          <ul className="mt-4 space-y-2">
            {bookablePackages.map((p) => (
              <Card as="li" key={p.id}>
                <Link href={`/staff/bookings/new?packageId=${p.id}`} className="block text-forest hover:underline">
                  {/* DR-114: every country a combo package touches, not just its primary one. */}
                  {p.title} · {p.countries.map((c) => tCountries(c)).join(' + ')} · {formatOrPending(p.priceMinor, p.currency)}
                </Link>
              </Card>
            ))}
          </ul>
        )}
      </div>
    );
  }

  // Top-level chooser -- explicit user request for two cards here, rather
  // than the package list defaulting to the whole page with the
  // tailor-made path relegated to a small inline text link.
  const sections = [
    {
      href: '/staff/bookings/new?mode=packages',
      title: t('fromPackagesTitle'),
      description: t('fromPackagesDesc'),
    },
    {
      href: '/staff/bookings/new?tailorMade=1',
      title: t('tailorMadeChooserTitle'),
      description: t('tailorMadeChooserDesc'),
    },
  ];

  return (
    <div className="space-y-8">
      <PageHeader eyebrow={t('dashboardEyebrow')} title={t('newBookingEyebrow')} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {sections.map((s) => (
          <Card key={s.href} interactive className="p-0">
            <Link href={s.href} className="block p-5">
              <h2 className="text-lg font-semibold text-navy">{s.title}</h2>
              <p className="mt-1 text-sm text-mist">{s.description}</p>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
