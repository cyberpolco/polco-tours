import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { authService } from '@modules/auth';
import { bookingService } from '@modules/booking';
import { emailDomain, listEmailDomains, listPhoneDialCodes, matchesPhoneDialCode, matchesSearch, paginate } from '@lib/directory-filters';
import { Alert } from '@/components/ui/Alert';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { Reveal } from '@/components/ui/Reveal';
import { SearchField } from '@/components/ui/SearchField';
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
  // DR-159: PLATFORM_ADMIN added alongside SUPERADMIN/TOUR_OPERATOR.
  if (!ctx.roles.includes('SUPERADMIN') && !ctx.roles.includes('TOUR_OPERATOR') && !ctx.roles.includes('PLATFORM_ADMIN'))
    redirect('/staff/forbidden');
  const params = await searchParams;
  const { detail } = params;
  const q = params.q ?? '';
  const domain = params.domain ?? '';
  const dial = params.dial ?? '';

  const rawClients = await authService.listClients(ctx);
  // Real, guest-typed email lives on their booking(s) (Booking.contactEmail),
  // never on User.email -- that stays a better-auth-managed anonymous
  // placeholder (temp@<random>.com) for every guest checkout, since two
  // different anonymous guests can share the same real email and User.email
  // is @unique. Substituting it here (display-only, nothing is written back)
  // is what makes this directory actually useful for contacting a client --
  // falls back to the placeholder only for a client with no contactEmail on
  // any booking yet (e.g. a still-in-progress TAILOR_MADE inquiry).
  const contactEmails = await bookingService.listLatestContactEmailsForTourists(
    ctx,
    rawClients.map((c) => c.id),
  );
  const allClients = rawClients.map((c) => ({ ...c, email: contactEmails.get(c.id) ?? c.email }));
  const canDelete = ctx.roles.includes('SUPERADMIN');
  const t = await getTranslations('StaffClients');
  const tSidebar = await getTranslations('StaffSettingsSidebar');

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
    <SidebarShell items={SETTINGS_ITEMS} sectionTitle={tSidebar('sectionTitle')} roles={ctx.roles} permissions={[...ctx.permissions]}>
      <div className="space-y-6">
        <PageHeader eyebrow={t('eyebrow')} title={t('title')} />
        <Reveal className="space-y-6">
        <p className="text-sm text-mist">{t('intro')}</p>
        {detail && <Alert tone="error">{t('deleteError', { detail })}</Alert>}

        <form method="get" action="/staff/admin/clients" className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <FormField label={t('search')} htmlFor="q" optional>
            <SearchField name="q" defaultValue={q} placeholder={t('searchPlaceholder')} />
          </FormField>
          <FormField label={t('emailDomain')} htmlFor="domain" optional>
            <Select name="domain" defaultValue={domain}>
              <option value="">{t('all')}</option>
              {domainOptions.map((d) => (
                <option key={d} value={d}>
                  @{d}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={t('phoneCountry')} htmlFor="dial" optional>
            <Select name="dial" defaultValue={dial}>
              <option value="">{t('all')}</option>
              {dialOptions.map((d) => (
                <option key={d.dialCode} value={d.dialCode}>
                  {d.label}
                </option>
              ))}
            </Select>
          </FormField>
          <div className="col-span-2 flex items-end gap-3 sm:col-span-1">
            <SubmitButton size="compact">{t('filter')}</SubmitButton>
            {(q || domain || dial) && (
              <Link href="/staff/admin/clients" className="text-sm text-mist hover:underline">
                {t('clear')}
              </Link>
            )}
          </div>
        </form>

        <p className="text-sm text-mist">{t('clientCount', { count: totalItems })}</p>

        {totalItems === 0 ? (
          <p className="text-mist">{t('noMatches')}</p>
        ) : (
          <>
            <Table>
              <thead>
                <TableHeaderRow>
                  <Th>{t('name')}</Th>
                  <Th>{t('email')}</Th>
                  <Th>{t('phone')}</Th>
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
                            pendingLabel={t('deleting')}
                            confirmMessage={t('deleteConfirm', { name: c.name ?? c.email })}
                          >
                            {t('delete')}
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
        </Reveal>
      </div>
    </SidebarShell>
  );
}
