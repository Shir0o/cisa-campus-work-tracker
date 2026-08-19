export type AppRole = 'admin' | 'manager' | 'operator' | 'viewer';

export const ROLE_LEVEL: Record<AppRole, number> = {
  viewer: 0,
  operator: 1,
  manager: 2,
  admin: 3,
};

/**
 * User-facing display names. The internal role keys (admin/manager/operator/
 * viewer) are unchanged — these only affect what's shown in the UI.
 */
export const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Full-timer',
  manager: 'Trainee',
  operator: 'Student',
  viewer: 'Community',
};

export function roleLabel(role: AppRole | string | null): string {
  if (!role) return 'Guest';
  return ROLE_LABELS[role as AppRole] ?? role.charAt(0).toUpperCase() + role.slice(1);
}

export interface OwnerViewRoleOption {
  key: AppRole;
  label: string;
  note: string;
}

export const OWNER_VIEW_ROLES: OwnerViewRoleOption[] = [
  { key: 'admin', label: 'Full-timer', note: 'Widgets & full-timer home' },
  { key: 'manager', label: 'Trainee', note: 'Focus queue & drawer' },
  { key: 'operator', label: 'Student', note: 'Member app (Student)' },
  { key: 'viewer', label: 'Community', note: 'Member app (Community)' },
];

const ROUTE_MIN_ROLE: Record<string, AppRole> = {
  '/': 'viewer',
  '/board': 'manager',
  '/directory': 'operator',
  '/history': 'manager',
  '/attendance': 'viewer',
  // Outreach is admin + community — a deliberately non-ladder access, so
  // `canAccessRoute` special-cases it below (viewer and admin only, never
  // operator or manager). This entry only exists so the route has an entry.
  '/outreach': 'viewer',
  // Full-timers only, on both sides: what a visit records is pastoral detail,
  // not team-wide reading.
  '/visits': 'admin',
  '/prayer': 'viewer',
  '/answered': 'viewer',
  '/settings': 'viewer',
  '/messages': 'viewer',
  '/feedback': 'viewer',
  '/admin/feedback': 'admin',
  '/coordination': 'operator',
  '/coordination/trash': 'admin',
  'https://shared-calendar-6u6.pages.dev/': 'admin',
};

export interface NavItem {
  href: string;
  label: string;
  minRole: AppRole;
  isExternal?: boolean;
}

export interface ExternalNavItem {
  id: string;
  label: string;
  href: string;
  roles: AppRole[];
}

export const NAV_EXTERNAL: ExternalNavItem[] = [
  {
    id: 'calendar',
    label: 'Shared Calendar',
    href: 'https://shared-calendar-6u6.pages.dev/',
    roles: ['admin'],
  },
];

export function navExternalFor(role: AppRole | string | null): ExternalNavItem[] {
  if (!role) return [];
  return NAV_EXTERNAL.filter((item) => item.roles.includes(role as AppRole));
}

// Field Notes (#10) — warm, human nav labels. Route hrefs are unchanged; only
// the display labels are relabeled. See epic #8.
export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Home', minRole: 'viewer' },
  { href: '/board', label: 'The Journey', minRole: 'manager' },
  { href: '/directory', label: 'People', minRole: 'operator' },
  { href: '/history', label: 'Looking back', minRole: 'manager' },
  { href: '/attendance', label: 'Gatherings', minRole: 'viewer' },
  { href: '/outreach', label: 'Gospel', minRole: 'viewer' },
  { href: '/visits', label: 'Visits', minRole: 'admin' },
  { href: '/prayer', label: 'On our hearts', minRole: 'viewer' },
  { href: '/answered', label: 'Answered', minRole: 'viewer' },
  { href: '/coordination', label: 'Coordination Notes', minRole: 'operator' },
  { href: '/messages', label: 'Messages', minRole: 'viewer' },
  { href: '/settings', label: 'Settings', minRole: 'viewer' },
];

export function canAccessRoute(role: AppRole | string | null, path: string): boolean {
  if (!role) return false;
  // Outreach is full-timer + community — not a ladder: viewer and admin can,
  // operator (student) and manager (trainee) cannot, even though a viewer-level
  // min role would let them through. Keep it explicit here.
  if (path === '/outreach') return role === 'admin' || role === 'viewer';
  if (role === 'manager') {
    const allowedTraineeRoutes = ['/', '/directory', '/board', '/messages', '/feedback'];
    return allowedTraineeRoutes.includes(path);
  }
  const level = ROLE_LEVEL[role as AppRole] ?? -1;
  const min = ROUTE_MIN_ROLE[path] ?? 'admin';
  return level >= ROLE_LEVEL[min];
}

export function navItemsForRole(role: AppRole | string | null): NavItem[] {
  return NAV_ITEMS.filter((item) => canAccessRoute(role, item.href));
}

// ── Top-anchored navigation (shell bake-off, direction B — picked 18 Aug) ────
// No rail: the three destinations that carry the week sit in the topbar beside
// the mark; every other accessible place lives in one "More" menu. Settings is
// deliberately excluded — it lives in the avatar menu at the right.

export interface NavGroup {
  label?: string;
  items: NavItem[];
}

// The three tabs shown beside the brand, per role. Order matters; each is
// filtered by what the role can actually reach.
const PRIMARY_BY_ROLE: Record<AppRole, string[]> = {
  admin: ['/board', '/directory', '/prayer'],
  manager: ['/', '/directory', '/board'],
  operator: ['/', '/directory', '/prayer'],
  viewer: ['/', '/attendance', '/prayer'],
};

export function primaryNavFor(role: AppRole | string | null): NavItem[] {
  const list = navItemsForRole(role);
  const want = PRIMARY_BY_ROLE[role as AppRole] ?? [];
  const out: NavItem[] = [];
  for (const href of want) {
    const item = list.find((i) => i.href === href);
    if (item && !out.includes(item)) out.push(item);
  }
  return out;
}

// "More" groups the remaining accessible destinations (everything not in the
// three tabs). Grouping mirrors the shell bake-off's flat, ranked menu.
const MORE_GROUPS: { label: string; hrefs: string[] }[] = [
  { label: 'The work', hrefs: ['/board', '/attendance', '/visits', '/outreach', '/coordination'] },
  { label: 'Looking back', hrefs: ['/answered', '/history'] },
  { label: 'Elsewhere', hrefs: ['/messages', '/feedback'] },
];

export function moreNavFor(role: AppRole | string | null): NavGroup[] {
  const primary = primaryNavFor(role).map((i) => i.href);
  const rest = navItemsForRole(role).filter(
    (i) => !primary.includes(i.href) && i.href !== '/settings',
  );
  const groups: NavGroup[] = [];
  for (const g of MORE_GROUPS) {
    const items = rest.filter((i) => g.hrefs.includes(i.href));
    if (items.length) groups.push({ label: g.label, items });
  }
  const grouped = new Set(MORE_GROUPS.flatMap((g) => g.hrefs));
  const extra = rest.filter((i) => !grouped.has(i.href));
  if (extra.length) groups.push({ items: extra });
  return groups;
}

export const canSeeSettings = (role: AppRole | string | null) => role === 'admin';
export const canSeePrefs = (role: AppRole | string | null) => role === 'admin' || role === 'manager';
export const canSeeHistory = (role: AppRole | string | null) => role === 'admin';
export const canSeeBoardNotes = (role: AppRole | string | null) => role === 'admin';
// Outreach: full-timers + the community folk who go out and log the names
// (the design's "community members go out and log these; full-timers oversee").
// Trainees and students don't see it. Visits stays full-timer-only when built.
export const canSeeOutreach = (role: AppRole | string | null) => role === 'admin' || role === 'viewer';
export const canLogOutreach = (role: AppRole | string | null) => role === 'admin' || role === 'viewer';
export const canSeeVisits = (role: AppRole | string | null) => role === 'admin';
export const canLogVisits = (role: AppRole | string | null) => role === 'admin';
export const seesAllPeople = (role: AppRole | string | null) => role !== 'manager';

export function canSeeContact(
  role: AppRole | string | null,
  staffId: string | null | undefined,
  contact: { addedBy?: string; createdBy?: string; owner?: string; coCreators?: string[] } | null | undefined
): boolean {
  if (!contact) return false;
  if (seesAllPeople(role)) return true;
  if (!staffId) return false;
  const added = contact.addedBy || contact.createdBy;
  return added === staffId || contact.owner === staffId || (contact.coCreators || []).includes(staffId);
}

export function visibleContacts<T extends { addedBy?: string; createdBy?: string; owner?: string; coCreators?: string[] }>(
  role: AppRole | string | null,
  staffId: string | null | undefined,
  list: T[]
): T[] {
  if (seesAllPeople(role)) return list.slice();
  return list.filter((c) => canSeeContact(role, staffId, c));
}

export function journeyContacts<T extends { addedBy?: string; createdBy?: string; owner?: string; coCreators?: string[]; season?: string }>(
  role: AppRole | string | null,
  staffId: string | null | undefined,
  list: T[],
  currentSeasonTag?: string
): T[] {
  const visible = visibleContacts(role, staffId, list);
  if (role === 'manager' && currentSeasonTag) {
    return visible.filter((c) => !c.season || c.season === currentSeasonTag);
  }
  return visible;
}

export function hasMinRole(role: AppRole | string | null, min: AppRole): boolean {
  if (!role) return false;
  return (ROLE_LEVEL[role as AppRole] ?? -1) >= ROLE_LEVEL[min];
}

export function defaultRouteForRole(role: AppRole | string | null): string {
  if (hasMinRole(role, 'viewer')) return '/';
  return '/attendance';
}

/**
 * App Owner email address — strictly allowed to access "See their view"
 * impersonation/preview controls.
 */
export const OWNER_EMAIL = 'yilongwang05@gmail.com';

/** Checks whether a user email matches the designated app owner account. */
export function isAppOwner(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === OWNER_EMAIL.toLowerCase();
}

/**
 * Checks whether a user has permission to use "See as they see" (role simulation mode).
 * Allowed for all Full-timers (admins) and the designated app owner account.
 */
export function canSimulateRole(
  actualRole: AppRole | string | null,
  email?: string | null | undefined
): boolean {
  return actualRole === 'admin' || isAppOwner(email);
}

/**
 * Resolves the effective role for a user. If the user is authorized to simulate
 * roles and has an active ownerViewRole override set, returns ownerViewRole; otherwise returns actualRole.
 */
export function getEffectiveRole(
  email: string | null | undefined,
  actualRole: AppRole | null,
  ownerViewRole: AppRole | null
): AppRole | null {
  if (canSimulateRole(actualRole, email) && ownerViewRole) {
    return ownerViewRole;
  }
  return actualRole;
}



