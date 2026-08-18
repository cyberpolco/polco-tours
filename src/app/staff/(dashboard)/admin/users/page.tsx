import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireStaffContext } from '@lib/staff-guard';
import { ASSIGNABLE_ROLES, authService, isSuperAdmin, type PublicUser } from '@modules/auth';
import { emailDomain, listEmailDomains, listPhoneDialCodes, matchesPhoneDialCode, matchesSearch, paginate } from '@lib/directory-filters';
import { Badge } from '@/components/ui/Badge';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { SearchField } from '@/components/ui/SearchField';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { CreateUserForm } from './create-user-form';
import { deactivateUserAction, deleteUserAction, reactivateUserAction } from './actions';
import { SETTINGS_ITEMS } from '../../settings-items';
import { SidebarShell } from '../../sidebar-shell';

const PER_PAGE = 10;
type SortKey = 'name' | 'email' | 'lastLogin';
type StatusFilter = 'active' | 'inactive' | 'deactivated';

interface Props {
  searchParams: Promise<{
    q?: string;
    domain?: string;
    dial?: string;
    status?: string;
    sort?: string;
    dir?: string;
    page?: string;
  }>;
}

function userStatus(u: PublicUser): StatusFilter {
  if (u.deletedAt) return 'deactivated';
  if (u.inactiveAt) return 'inactive';
  return 'active';
}

function sortUsers(users: PublicUser[], sort: SortKey, dir: 'asc' | 'desc'): PublicUser[] {
  const sorted = [...users].sort((a, b) => {
    if (sort === 'lastLogin') {
      const at = a.lastLoginAt?.getTime() ?? -Infinity;
      const bt = b.lastLoginAt?.getTime() ?? -Infinity;
      return at - bt;
    }
    const av = sort === 'name' ? a.name ?? '' : a.email;
    const bv = sort === 'name' ? b.name ?? '' : b.email;
    return av.localeCompare(bv);
  });
  return dir === 'desc' ? sorted.reverse() : sorted;
}

// DR-091: search + filter (email domain, phone dial code, status) + sort +
// pagination, all query-param-driven (GET, no client JS) -- same
// server-rendered-link convention every other filtered staff list page
// already uses (bookings' status pills, visa-queue's origin pills), just
// combined across more dimensions than a single pill row can express, so a
// form is more natural here than a row of links.
export default async function UsersPage({ searchParams }: Props) {
  const ctx = await requireStaffContext('admin.all');
  const params = await searchParams;
  const q = params.q ?? '';
  const domain = params.domain ?? '';
  const dial = params.dial ?? '';
  const status =
    params.status === 'active' || params.status === 'inactive' || params.status === 'deactivated' ? params.status : '';
  const sort: SortKey = params.sort === 'name' || params.sort === 'lastLogin' ? params.sort : 'email';
  const dir = params.dir === 'desc' ? 'desc' : 'asc';

  const t = await getTranslations('StaffUsers');
  const tSidebar = await getTranslations('StaffSettingsSidebar');
  const allUsers = await authService.listUsers(ctx);
  const domainOptions = listEmailDomains(allUsers);
  const dialOptions = listPhoneDialCodes(allUsers);

  const filtered = allUsers.filter((u) => {
    if (status && userStatus(u) !== status) return false;
    if (domain && emailDomain(u.email) !== domain) return false;
    if (dial && !matchesPhoneDialCode(u, dial)) return false;
    if (!matchesSearch(u, q)) return false;
    return true;
  });
  const sorted = sortUsers(filtered, sort, dir);
  const { items: users, page, totalPages, totalItems } = paginate(sorted, Number(params.page ?? '1'), PER_PAGE);

  const baseParams: Record<string, string> = {};
  if (q) baseParams.q = q;
  if (domain) baseParams.domain = domain;
  if (dial) baseParams.dial = dial;
  if (status) baseParams.status = status;
  if (sort !== 'email') baseParams.sort = sort;
  if (dir !== 'asc') baseParams.dir = dir;

  function hrefWith(overrides: Record<string, string | undefined>): string {
    const merged = { ...baseParams, ...overrides };
    const qs = new URLSearchParams();
    for (const [k, v] of Object.entries(merged)) {
      if (v) qs.set(k, v);
    }
    const s = qs.toString();
    return s ? `/staff/admin/users?${s}` : '/staff/admin/users';
  }

  function sortHref(key: SortKey): string {
    const nextDir = sort === key && dir === 'asc' ? 'desc' : 'asc';
    return hrefWith({ sort: key === 'email' ? undefined : key, dir: nextDir === 'asc' ? undefined : nextDir, page: undefined });
  }

  // Every filter/sort action redirects back here, and every mutation
  // (deactivate/reactivate) needs to preserve the current view too --
  // passed as a plain query string into the bound Server Actions below.
  const currentQuery = hrefWith({ page: page === 1 ? undefined : String(page) }).split('?')[1] ?? '';

  return (
    <SidebarShell items={SETTINGS_ITEMS} sectionTitle={tSidebar('sectionTitle')} roles={ctx.roles} permissions={[...ctx.permissions]}>
      <div className="space-y-8">
        <PageHeader eyebrow={t('eyebrow')} title={t('title')} />

        <form method="get" action="/staff/admin/users" className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
          <FormField label={t('status')} htmlFor="status" optional>
            <Select name="status" defaultValue={status}>
              <option value="">{t('all')}</option>
              <option value="active">{t('active')}</option>
              <option value="inactive">{t('inactive')}</option>
              <option value="deactivated">{t('deactivated')}</option>
            </Select>
          </FormField>
          <div className="col-span-2 flex items-end gap-3 sm:col-span-4">
            <SubmitButton size="compact">{t('filter')}</SubmitButton>
            {(q || domain || dial || status) && (
              <Link href="/staff/admin/users" className="text-sm text-mist hover:underline">
                {t('clearFilters')}
              </Link>
            )}
          </div>
        </form>

        <p className="text-sm text-mist">{t('userCount', { count: totalItems })}</p>

        <Table>
          <thead>
            <TableHeaderRow>
              <Th>
                <Link href={sortHref('name')} className="hover:text-navy">
                  {t('name')}{sort === 'name' ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}
                </Link>
              </Th>
              <Th>
                <Link href={sortHref('email')} className="hover:text-navy">
                  {t('email')}{sort === 'email' ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}
                </Link>
              </Th>
              <Th>{t('phone')}</Th>
              <Th>{t('roles')}</Th>
              <Th>{t('status')}</Th>
              <Th>
                <Link href={sortHref('lastLogin')} className="hover:text-navy">
                  {t('lastLogin')}{sort === 'lastLogin' ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}
                </Link>
              </Th>
              <Th />
            </TableHeaderRow>
          </thead>
          <tbody>
            {users.map((u) => (
              <Tr key={u.id}>
                <Td>{u.name ?? '—'}</Td>
                <Td>{u.email}</Td>
                <Td>{u.phone ?? '—'}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {u.roles.map((r) => (
                      <Badge key={r} tone="neutral">
                        {r}
                      </Badge>
                    ))}
                  </div>
                </Td>
                <Td>
                  {/* DR-084: two states shown here -- a permanently Deleted
                      account (DR-141) is excluded from this list entirely
                      (authRepository.listStaff), so every row reaching this
                      point is at most Deactivated (manual, reversible) or
                      Inactive (dormant, 30+ days no sign-in, auto-flagged) --
                      Deactivated wins over Inactive since it implies it. */}
                  <Badge tone={u.deletedAt ? 'danger' : u.inactiveAt ? 'warning' : 'success'}>
                    {u.deletedAt ? t('deactivated') : u.inactiveAt ? t('inactive') : t('active')}
                  </Badge>
                </Td>
                <Td>{u.lastLoginAt ? u.lastLoginAt.toLocaleString() : t('never')}</Td>
                <Td>
                  <div className="flex items-center gap-3">
                    {u.id !== ctx.userId && (
                      <Link href={`/staff/admin/users/${u.id}`} className="text-forest hover:underline">
                        {t('edit')}
                      </Link>
                    )}
                    {u.id !== ctx.userId && !u.deletedAt && !u.inactiveAt && (
                      <form action={deactivateUserAction.bind(null, u.id, currentQuery)}>
                        <SubmitButton
                          variant="secondary"
                          size="compact"
                          confirmMessage={t('deactivateConfirm', { name: u.name ?? u.email })}
                        >
                          {t('deactivate')}
                        </SubmitButton>
                      </form>
                    )}
                    {(u.deletedAt || u.inactiveAt) && (
                      <form action={reactivateUserAction.bind(null, u.id, currentQuery)}>
                        <SubmitButton variant="success" size="compact">
                          {t('reactivate')}
                        </SubmitButton>
                      </form>
                    )}
                    {/* DR-141: permanent, SUPERADMIN-only -- available
                        regardless of the account's current status (active,
                        dormant, or deactivated). Once used, the account
                        disappears from this list entirely (see the Badge
                        comment above), so there's no "already deleted" state
                        to guard against here. */}
                    {u.id !== ctx.userId && isSuperAdmin(ctx.roles) && (
                      <form action={deleteUserAction.bind(null, u.id, currentQuery)}>
                        <SubmitButton
                          variant="secondary"
                          size="compact"
                          pendingLabel={t('deleting')}
                          confirmMessage={t('deleteConfirm', { name: u.name ?? u.email })}
                        >
                          {t('delete')}
                        </SubmitButton>
                      </form>
                    )}
                  </div>
                </Td>
              </Tr>
            ))}
            {users.length === 0 && (
              <Tr>
                <td colSpan={7} className="py-3 text-mist">
                  {t('noMatches')}
                </td>
              </Tr>
            )}
          </tbody>
        </Table>

        <Pagination page={page} totalPages={totalPages} hrefFor={(p) => hrefWith({ page: p === 1 ? undefined : String(p) })} />

        <div>
          <h2 className="mb-3 text-lg font-semibold text-navy">{t('createNewUser')}</h2>
          <CreateUserForm assignableRoles={ASSIGNABLE_ROLES} />
        </div>
      </div>
    </SidebarShell>
  );
}
