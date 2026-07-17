// Settings (DR-042) -- shared source of truth for both the top-level
// StaffNav "Settings" aggregate link (visible if the caller holds ANY of
// these permissions) and the SidebarShell rendered on each of these pages.
// Reorganizes 5 pre-existing tabs (unchanged URLs/permissions) plus the two
// new Settings pages this DR adds.
import type { SidebarItem } from './sidebar-shell';

export const SETTINGS_ITEMS: SidebarItem[] = [
  { href: '/staff/settings/tax-rates', label: 'Tax Rates', permission: 'platform_settings.read' },
  { href: '/staff/settings/platform-rate', label: 'Platform Rate', permission: 'platform_settings.read' },
  { href: '/staff/country-regulations', label: 'Country Regulations', permission: 'country_regulation.read' },
  { href: '/staff/finance/rates', label: 'Operational Rates', permission: 'finance_config.read' },
  { href: '/staff/insights', label: 'Insights', permission: 'insights.read' },
  { href: '/staff/admin/users', label: 'Users', permission: 'admin.all' },
  // DR-035: SUPERADMIN-only regardless of who else holds admin.all --
  // PLATFORM_ADMIN is seeded with admin.all by default but must NOT see
  // this link, matching the page's own explicit SUPERADMIN-only gate.
  { href: '/staff/admin/permissions', label: 'Permissions', permission: 'admin.all', superadminOnly: true },
];
