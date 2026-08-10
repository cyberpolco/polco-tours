import Link from 'next/link';
import { requireStaffContext } from '@lib/staff-guard';
import { fleetService } from '@modules/fleet';
import { Card } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';

// DR-095: the fleet dashboard used to be one page with all four tables
// (Vehicles/Drivers/Guides/Starlink Kits) rendered end to end -- fine while
// each list was small, but with no pagination it would only get worse as
// the fleet grows. Split into a card hub (this page, counts only) plus one
// dedicated list page per type (./vehicles, ./drivers, ./guides,
// ./starlink-kits), each with its own search/filter/pagination -- same
// "search+filter+paginate a bounded list" convention DR-091 already
// established for the admin Users/Clients directories.
export default async function FleetPage() {
  const ctx = await requireStaffContext('fleet.read');
  const [vehicles, drivers, guides, starlinkKits] = await Promise.all([
    fleetService.listVehicles(ctx),
    fleetService.listDriverProfiles(ctx),
    fleetService.listGuideProfiles(ctx),
    fleetService.listStarlinkKits(ctx),
  ]);

  const sections = [
    { href: '/staff/fleet/vehicles', title: 'Vehicles', count: vehicles.length, description: 'Registration, compliance documents, maintenance history.' },
    { href: '/staff/fleet/drivers', title: 'Drivers', count: drivers.length, description: 'License details, availability, compliance documents.' },
    { href: '/staff/fleet/guides', title: 'Guides', count: guides.length, description: 'Languages, specialties, availability.' },
    { href: '/staff/fleet/starlink-kits', title: 'Starlink Kits', count: starlinkKits.length, description: 'Vehicle assignment and last known location.' },
  ];

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Fleet" title="Fleet" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {sections.map((s) => (
          <Card key={s.href} interactive className="p-0">
            <Link href={s.href} className="block p-5">
              <div className="flex items-baseline justify-between">
                <h2 className="text-lg font-semibold text-navy">{s.title}</h2>
                <span className="text-2xl font-bold text-navy">{s.count}</span>
              </div>
              <p className="mt-1 text-sm text-mist">{s.description}</p>
            </Link>
          </Card>
        ))}
      </div>
    </div>
  );
}
