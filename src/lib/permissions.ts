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
  // Questions for the team is staff-only on both sides: Trainees ask, Full-timers
  // answer. Students and Community have no ask surface at all (#603).
  '/questions': 'manager',
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
  // "Questions", not "Questions for the team" — the long form does not fit one
  // line in the 224px More menu. The page heading keeps the full name.
  { href: '/questions', label: 'Questions', minRole: 'manager' },
  { href: '/settings', label: 'Settings', minRole: 'viewer' },
];

export function canAccessRoute(role: AppRole | string | null, path: string): boolean {
  if (!role) return false;
  // Outreach is full-timer + community — not a ladder: viewer and admin can,
  // operator (student) and manager (trainee) cannot, even though a viewer-level
  // min role would let them through. Keep it explicit here.
  if (path === '/outreach') return role === 'admin' || role === 'viewer';
  // Person detail is now a real URL route so back/top-nav navigation works.
  // Every approved role can open a person page; individual contact visibility
  // is still enforced inside ContactDetailsModal.
  if (path === '/contact' || path.startsWith('/contact/') || path.startsWith('/people/')) return hasMinRole(role, 'viewer');
  if (role === 'manager') {
    const allowedTraineeRoutes = ['/', '/directory', '/board', '/messages', '/questions', '/feedback', '/contact'];
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

/** Group labels are stable identifiers — the rail renders them in this order. */
export type NavGroupLabel = 'Today' | 'People' | 'Gatherings' | 'Prayer';

export interface NavGroup {
  label?: NavGroupLabel;
  items: NavItem[];
}

// The three tabs shown beside the brand, per role. Order matters; each is
// filtered by what the role can actually reach.
const PRIMARY_BY_ROLE: Record<AppRole, string[]> = {
  admin: ['/coordination', '/directory', '/prayer'],
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

export function moreNavFor(role: AppRole | string | null): NavItem[] {
  const primary = primaryNavFor(role).map((i) => i.href);
  const rest = navItemsForRole(role).filter(
    (i) => !primary.includes(i.href) && i.href !== '/settings',
  );
  const getLabel = (item: NavItem) => (item.href === '/' && role === 'admin' ? 'My Day' : item.label);
  return rest.sort((a, b) => getLabel(a).localeCompare(getLabel(b)));
}

// ── Destination grouping for the rail (issue #662) ──────────────────────────
// The rail ticket (#664) consumes this data, but it lands on its own so that
// the rail ticket is about the rail. Groups and within-group order are fixed
// by the design at docs/design/ink/NavPref.dc.html; role filtering happens
// here, not in the consumer. Settings is excluded — the shell pins it below
// a divider rather than letting it fall into a group.

// Maps each group label to the destinations it contains, in display order.
// Every NAV_ITEMS entry except /settings must appear in exactly one group
// here; the "grouping covers every NAV_ITEMS destination except /settings"
// test in src/test/permissions.test.tsx guards against drift.
const NAV_GROUPS: Record<NavGroupLabel, string[]> = {
  Today: ['/', '/coordination', '/questions'],
  People: ['/board', '/directory', '/visits', '/outreach', '/history'],
  Gatherings: ['/attendance', '/messages'],
  Prayer: ['/prayer', '/answered'],
};

const NAV_GROUP_ORDER: readonly NavGroupLabel[] = ['Today', 'People', 'Gatherings', 'Prayer'];

/**
 * Returns the ordered groups of destinations a given role can reach. The rail
 * (#664) renders this directly. Group order and within-group order are both
 * stable across calls. Settings is excluded — it is pinned by the shell below
 * a divider, not part of the grouped data. Groups that have no items for the
 * role are omitted, so a Community member's "People" group contains only
 * Gospel rather than an empty section.
 */
export function groupedNavFor(role: AppRole | string | null): NavGroup[] {
  // No early return for null/unknown: navItemsForRole / canAccessRoute already
  // resolve unknown roles to an empty reachable set, so every group falls out
  // empty — same shape as primaryNavFor / moreNavFor for unknown input.
  const reachable = new Map(navItemsForRole(role).map((it) => [it.href, it]));
  const out: NavGroup[] = [];
  for (const label of NAV_GROUP_ORDER) {
    const items: NavItem[] = [];
    for (const href of NAV_GROUPS[label]) {
      const item = reachable.get(href);
      if (item) items.push(item);
    }
    if (items.length > 0) out.push({ label, items });
  }
  return out;
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

/**
 * Filter predicate for real people (#366, #367).
 * The staff and contact lists carry logins/records that are not real campus folk —
 * app-store review accounts, cisa-* service logins, test users. One predicate,
 * used by every picker, so non-person accounts are never shown to full-timers.
 */
export const NON_PERSON_RE = /^(cisa[-_. ]|app[-_ ]?store|reviewer\b|review[-_. ]|test[-_. ]|demo[-_. ]|bot[-_. ]|qa[-_. ]|system\b|service\b)/i;

export function isRealPerson(
  x: { displayName?: string; name?: string; id?: string; uid?: string; email?: string; system?: boolean; serviceAccount?: boolean; kind?: string; role?: string } | null | undefined
): boolean {
  if (!x) return false;
  if (x.system || x.serviceAccount || x.kind === 'system' || x.role === 'system') return false;
  const name = String(x.displayName || x.name || x.id || x.uid || '').trim();
  if (!name) return false;
  if (NON_PERSON_RE.test(name)) return false;
  if (/\b(reviewer|app ?store|service account|test account)\b/i.test(name)) return false;
  return true;
}

export function pickableStaff<T extends { displayName?: string; name?: string; id?: string; uid?: string; email?: string; system?: boolean; serviceAccount?: boolean; kind?: string; role?: string }>(
  staff: T[]
): T[] {
  return staff.filter(isRealPerson);
}

export function pickableContacts<T extends { displayName?: string; name?: string; id?: string; uid?: string; email?: string; system?: boolean; serviceAccount?: boolean; kind?: string; role?: string }>(
  contacts: T[]
): T[] {
  return contacts.filter(isRealPerson);
}
