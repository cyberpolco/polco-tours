import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireStaffContext } from '@lib/staff-guard';
import { authService } from '@modules/auth';
import { emailDomain, listEmailDomains, listPhoneDialCodes, matchesPhoneDialCode, matchesSearch, paginate } from '@lib/directory-filters';
import { Alert } from '@/components/ui/Alert';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { SETTINGS_ITEMS } from '../../settings-items';
import { SidebarShell } from '../../sidebar-shell';
import { deleteClientAction } from './actions';

const PER_PAGE = 10;

interface Props {
  searchParams: Promise<{ error?: string; detail?: string; q?: string; domain?: string; dial?: string; page?: string }>;
}

// Directory of every bare/anonymous TOURIST contact record in the org --
// none of these can ever sign in (createBareTourist creates no Account/
// credential row; a guest's own anonymous session has no password either).
// SUPERADMIN/TOUR_OPERATOR can both view (explicit user choice, the roles
// that actually create/interact with these records via /staff/bookings/new);
// only SUPERADMIN can delete one, and only once every one of the client's
// non-deleted bookings is COMPLETED and reviewed (or already deleted by a
// superadmin) -- see src/lib/client-deletion.ts for the actual guard.
//
// DR-091: search + email-domain/phone-dial-code filters + pagination, same
// mechanism as the Users page -- no Status/last-login here, since a client
// has neither a meaningful login history nor a visible "deactivated" state
// (a deleted client is already excluded entirely at the query level, same
// as it always was; this directory never shows one at all).
export default async function ClientsPage({ searchParams }: Props) {
  const ctx = await requireStaffContext('booking.create');
  if (!ctx.roles.includes('SUPERADMIN') && !ctx.roles.includes('TOUR_OPERATOR')) redirect('/staff/forbidden');
  const params = await searchParams;
  const { detail } = params;
  const q = params.q ?? '';
  const domain = params.domain ?? '';
  const dial = params.dial ?? '';

  const allClients = await authService.listClients(ctx);
  const canDelete = ctx.roles.includes('SUPERADMIN');

  const domainOptions = listEmailDomains(allClients);
  const dialOptions = listPhoneDialCodes(allClients);

  const filtered = allClients.filter((c) => {
    if (domain && emailDomain(c.email) !== domain) return false;
    if (dial && !matchesPhoneDialCode(c, dial)) return false;
    if (!matchesSearch(c, q)) return false;
    return true;
  });
  const { items: clients, page, totalPages, totalItems } = paginate(filtered, Number(params.page ?? '1'), PER_PAGE);

  const baseParams: Record<string, string> = {};
  if (q) baseParams.q = q;
  if (domain) baseParams.domain = domain;
  if (dial) baseParams.dial = dial;

  function hrefWith(overrides: Record<string, string | undefined>): string {
    const merged = { ...baseParams, ...overrides };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v) qs.set(k, v);
    }
    const s = qs.toString();
    return s ? `/staff/admin/clients?${s}` : '/staff/admin/clients';
  }

  const currentQuery = hrefWith({ page: page === 1 ? undefined : String(page) }).split('?')[1] ?? '';

  return (
    <SidebarShell items={SETTINGS_ITEMS} sectionTitle="Settings" roles={ctx.roles} permissions={[...ctx.permissions]}>
      <div className="space-y-6">
        <PageHeader eyebrow="Settings" title="Clients" />
        <p className="text-sm text-mist">
          Every client contact record on file -- from a guest browsing packages, a `/plan-my-trip` request, or a
          booking created manually here. None of these are staff/login accounts; the email/phone exist only for
          booking notifications.
        </p>
        {detail && <Alert tone="error">Could not delete this client: {detail}</Alert>}

        <form method="get" action="/staff/admin/clients" className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <FormField label="Search" htmlFor="q" optional>
            <input
              type="text"
              name="q"
              defaultValue={q}
              placeholder="Name, email, or phone"
              className="w-full rounded-survey border border-rule px-3 py-2 text-sm"
            />
          </FormField>
          <FormField label="Email domain" htmlFor="domain" optional>
            <Select name="domain" defaultValue={domain}>
              <option value="">All</option>
              {domainOptions.map((d) => (
                <option key={d} value={d}>
                  @{d}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Phone country" htmlFor="dial" optional>
            <Select name="dial" defaultValue={dial}>
              <option value="">All</option>
              {dialOptions.map((d) => (
                <option key={d.dialCode} value={d.dialCode}>
                  {d.label}
                </option>
              ))}
            </Select>
          </FormField>
          <div className="col-span-2 flex items-end gap-3 sm:col-span-1">
            <SubmitButton size="compact">Filter</SubmitButton>
            {(q || domain || dial) && (
              <Link href="/staff/admin/clients" className="text-sm text-mist hover:underline">
                Clear
              </Link>
            )}
          </div>
        </form>

        <p className="text-sm text-mist">
          {totalItems} client{totalItems === 1 ? '' : 's'}
        </p>

        {totalItems === 0 ? (
          <p className="text-mist">No clients match these filters.</p>
        ) : (
          <>
            <Table>
              <thead>
                <TableHeaderRow>
                  <Th>Name</Th>
                  <Th>Email</Th>
                  <Th>Phone</Th>
                  {canDelete && <Th />}
                </TableHeaderRow>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <Tr key={c.id}>
                    <Td>{c.name ?? '—'}</Td>
                    <Td>{c.email}</Td>
                    <Td>{c.phone ?? '—'}</Td>
                    {canDelete && (
                      <Td>
                        <form action={deleteClientAction.bind(null, c.id, currentQuery)}>
                          <SubmitButton
                            variant="secondary"
                            size="compact"
                            pendingLabel="Deleting…"
                            confirmMessage={`Delete ${c.name ?? c.email}? This cannot be undone.`}
                          >
                            Delete
                          </SubmitButton>
                        </form>
                      </Td>
                    )}
                  </Tr>
                ))}
              </tbody>
            </Table>
            <Pagination page={page} totalPages={totalPages} hrefFor={(p) => hrefWith({ page: p === 1 ? undefined : String(p) })} />
          </>
        )}
      </div>
    </SidebarShell>
  );
}
