// Settings (DR-042) -- shared source of truth for both the top-level
// StaffNav "Settings" aggregate link (visible if the caller holds ANY of
// these permissions) and the SidebarShell rendered on each of these pages.
// Reorganizes 5 pre-existing tabs (unchanged URLs/permissions) plus the two
// new Settings pages this DR adds.
import type { SidebarItem } from './sidebar-shell';

export const SETTINGS_ITEMS: SidebarItem[] = [
  // Finance: merges Tax Rates, Platform Rate, Coupons, and Operational
  // Rates into one card hub (/staff/settings/finance) -- those 4 pages kept
  // their own routes/permission gates and dropped out of this sidebar list,
  // linking back to the hub instead of appearing here individually. Visible
  // if the caller holds EITHER underlying permission (platform_settings.read
  // for the first 3 cards, finance_config.read for Operational Rates) --
  // in practice every role that holds one holds both, but anyPermission
  // expresses that honestly rather than picking one arbitrarily.
  // DR-159: narrowed to SUPERADMIN-only (both platform_settings.read and
  // finance_config.read are now granted to nobody else) -- superadminOnly
  // is belt-and-suspenders with that, same convention as Site Content.
  { href: '/staff/settings/finance', labelKey: 'finance', anyPermission: ['platform_settings.read', 'finance_config.read'], superadminOnly: true },
  // Content (DR-071): About page + FAQ CRUD. content.read is never seeded to
  // any role (explicit user choice) -- superadminOnly here is belt-and-
  // suspenders with that, matching Permissions/My Profile below.
  { href: '/staff/content', labelKey: 'siteContent', permission: 'content.read', superadminOnly: true },
  { href: '/staff/country-regulations', labelKey: 'countryRegulations', permission: 'country_regulation.read' },
  // Sites (DR-083): staff-managed reference list powering the itinerary
  // day form's "planned sites" picker -- moved here from the top-level nav
  // per explicit user direction (a reference-data admin screen, same
  // category as Hotels/Restaurants conceptually, but those stayed
  // top-level since they're edited far more often day-to-day).
  { href: '/staff/sites', labelKey: 'sites', permission: 'itinerary.write' },
  { href: '/staff/insights', labelKey: 'insights', permission: 'insights.read' },
  { href: '/staff/admin/users', labelKey: 'users', permission: 'admin.all' },
  // Contact directory for bare/anonymous TOURIST records (DR-036) --
  // SUPERADMIN/TOUR_OPERATOR-only, the roles that actually create/interact
  // with these via /staff/bookings/new. Deliberately not gated on
  // admin.all like Users above -- these aren't staff accounts at all, and
  // TOUR_OPERATOR (who creates most of them) doesn't hold admin.all.
  // DR-159: PLATFORM_ADMIN added alongside TOUR_OPERATOR.
  { href: '/staff/admin/clients', labelKey: 'clients', requiresAnyRole: ['TOUR_OPERATOR', 'PLATFORM_ADMIN'] },
  // SUPERADMIN-only (explicit user correction to DR-059's original "any
  // staff role" design) -- every other role's name/phone is instead edited
  // by an admin via /staff/admin/users/{userId}. `permission` is left unset
  // (profile.write is still held by every role) since the real narrowing
  // happens on the page itself, same layering as Permissions below.
  { href: '/staff/profile', labelKey: 'myProfile', superadminOnly: true },
];
