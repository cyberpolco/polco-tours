import Link from 'next/link';
import { requireStaffContext } from '@lib/staff-guard';
import { ASSIGNABLE_ROLES, authService, type PublicUser } from '@modules/auth';
import { emailDomain, listEmailDomains, listPhoneDialCodes, matchesPhoneDialCode, matchesSearch, paginate } from '@lib/directory-filters';
import { Badge } from '@/components/ui/Badge';
import { FormField } from '@/components/ui/FormField';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pagination } from '@/components/ui/Pagination';
import { Select } from '@/components/ui/Select';
import { SubmitButton } from '@/components/ui/SubmitButton';
import { Table, TableHeaderRow, Td, Th, Tr } from '@/components/ui/Table';
import { CreateUserForm } from './create-user-form';
import { deactivateUserAction, reactivateUserAction } from './actions';
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
  const status = params.status === 'active' || params.status === 'inactive' || params.status === 'deactivated' ? params.status : '';
  const sort: SortKey = params.sort === 'name' || params.sort === 'lastLogin' ? params.sort : 'email';
  const dir = params.dir === 'desc' ? 'desc' : 'asc';

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
    <SidebarShell items={SETTINGS_ITEMS} sectionTitle="Settings" roles={ctx.roles} permissions={[...ctx.permissions]}>
      <div className="space-y-8">
        <PageHeader eyebrow="Admin" title="Users" />

        <form method="get" action="/staff/admin/users" className="grid grid-cols-2 gap-4 sm:grid-cols-4">
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
          <FormField label="Status" htmlFor="status" optional>
            <Select name="status" defaultValue={status}>
              <option value="">All</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
              <option value="deactivated">Deactivated</option>
            </Select>
          </FormField>
          <div className="col-span-2 flex items-end gap-3 sm:col-span-4">
            <SubmitButton size="compact">Filter</SubmitButton>
            {(q || domain || dial || status) && (
              <Link href="/staff/admin/users" className="text-sm text-mist hover:underline">
                Clear filters
              </Link>
            )}
          </div>
        </form>

        <p className="text-sm text-mist">
          {totalItems} user{totalItems === 1 ? '' : 's'}
        </p>

        <Table>
          <thead>
            <TableHeaderRow>
              <Th>
                <Link href={sortHref('name')} className="hover:text-navy">
                  Name{sort === 'name' ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}
                </Link>
              </Th>
              <Th>
                <Link href={sortHref('email')} className="hover:text-navy">
                  Email{sort === 'email' ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}
                </Link>
              </Th>
              <Th>Phone</Th>
              <Th>Roles</Th>
              <Th>Status</Th>
              <Th>
                <Link href={sortHref('lastLogin')} className="hover:text-navy">
                  Last login{sort === 'lastLogin' ? (dir === 'asc' ? ' ▲' : ' ▼') : ''}
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
                  {/* DR-084: Inactive (30+ days no sign-in, auto-flagged) is a
                      third state alongside the existing manual Active/
                      Deactivated -- Deactivated always wins when both are
                      true, since that user can't sign in regardless of
                      dormancy. */}
                  <Badge tone={u.deletedAt ? 'danger' : u.inactiveAt ? 'warning' : 'success'}>
                    {u.deletedAt ? 'Deactivated' : u.inactiveAt ? 'Inactive' : 'Active'}
                  </Badge>
                </Td>
                <Td>{u.lastLoginAt ? u.lastLoginAt.toLocaleString() : 'Never'}</Td>
                <Td>
                  <div className="flex items-center gap-3">
                    {u.id !== ctx.userId && (
                      <Link href={`/staff/admin/users/${u.id}`} className="text-forest hover:underline">
                        Edit
                      </Link>
                    )}
                    {u.id !== ctx.userId && !u.deletedAt && !u.inactiveAt && (
                      <form action={deactivateUserAction.bind(null, u.id, currentQuery)}>
                        <SubmitButton
                          variant="secondary"
                          size="compact"
                          confirmMessage={`Deactivate ${u.name ?? u.email}? They will no longer be able to sign in.`}
                        >
                          Deactivate
                        </SubmitButton>
                      </form>
                    )}
                    {!u.deletedAt && u.inactiveAt && (
                      <form action={reactivateUserAction.bind(null, u.id, currentQuery)}>
                        <SubmitButton variant="success" size="compact">
                          Reactivate
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
                  No users match these filters.
                </td>
              </Tr>
            )}
          </tbody>
        </Table>

        <Pagination page={page} totalPages={totalPages} hrefFor={(p) => hrefWith({ page: p === 1 ? undefined : String(p) })} />

        <div>
          <h2 className="mb-3 text-lg font-semibold text-navy">Create a new user</h2>
          <CreateUserForm assignableRoles={ASSIGNABLE_ROLES} />
        </div>
      </div>
    </SidebarShell>
  );
}
