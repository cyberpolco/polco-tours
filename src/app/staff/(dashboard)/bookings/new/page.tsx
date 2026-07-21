import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { catalogService } from '@modules/catalog';
import { Card } from '@/components/ui/Card';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { formatOrPending } from '@lib/money';
import { createStaffPackageBookingAction } from './actions';
import StaffPlanMyTripForm from './staff-plan-my-trip-form';

interface Props {
  searchParams: Promise<{ packageId?: string; tailorMade?: string }>;
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
  const { packageId, tailorMade } = await searchParams;

  if (tailorMade) {
    return (
      <div className="max-w-md">
        <PageHeader eyebrow="New booking" title="Tailor-made request" />
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
          eyebrow="New booking"
          title={`${pkg.title} · ${formatOrPending(pkg.priceMinor, pkg.currency)}/seat`}
        />
        <p className="mt-1 text-sm text-mist">{pkg.durationDays}-day trip</p>
        <form action={createStaffPackageBookingAction.bind(null, packageId)} className="mt-6 space-y-4">
          <FormField label="Client email (or the tour lead's email, for a group)" htmlFor="email">
            <input name="email" type="email" required className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <FormField label="Travel start" htmlFor="startDate">
            <input
              name="startDate"
              type="date"
              min={new Date().toISOString().slice(0, 10)}
              required
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </FormField>
          <FormField label="Seats" htmlFor="seats">
            <input
              name="seats"
              type="number"
              min={1}
              defaultValue={1}
              required
              className="w-full rounded-survey border border-rule px-3 py-2"
            />
          </FormField>
          <FormField label="Special requests" htmlFor="specialRequests" optional>
            <textarea name="specialRequests" rows={2} className="w-full rounded-survey border border-rule px-3 py-2" />
          </FormField>
          <SubmitButton>Create booking</SubmitButton>
        </form>
        <Link href="/staff/bookings/new" className="mt-4 inline-block text-sm text-forest hover:underline">
          ← back
        </Link>
      </div>
    );
  }

  const packages = await catalogService.listPackages(ctx);
  const bookablePackages = packages.filter((p) => p.status === 'PUBLISHED' && p.priceMinor != null && p.durationDays != null);

  return (
    <div>
      <PageHeader eyebrow="New booking" title="Choose a package" />
      <p className="mt-2 text-sm text-mist">
        Nothing in the catalog fits?{' '}
        <Link href="/staff/bookings/new?tailorMade=1" className="text-forest hover:underline">
          Create a tailor-made request
        </Link>
        .
      </p>
      {bookablePackages.length === 0 ? (
        <p className="mt-4 text-mist">No bookable packages yet.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {bookablePackages.map((p) => (
            <Card as="li" key={p.id}>
              <Link href={`/staff/bookings/new?packageId=${p.id}`} className="block text-forest hover:underline">
                {p.title} · {p.country} · {formatOrPending(p.priceMinor, p.currency)}
              </Link>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
