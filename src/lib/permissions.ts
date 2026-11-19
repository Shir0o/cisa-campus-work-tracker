export { visibleToOf } from './contactTies';
export type { ContactTies } from './contactTies';

export type AppRole = 'admin' | 'manager';

export const ROLE_LEVEL: Record<AppRole, number> = {
  manager: 0,
  admin: 1,
};

/**
 * Reads a stored role. Student (`operator`) and Community (`viewer`) are cut:
 * a legacy or unknown value is no role at all — no access, and no crash.
 */
export function effectiveRole(raw: string | null): AppRole | null {
  return raw === 'admin' || raw === 'manager' ? raw : null;
}

/**
 * User-facing display names. The internal role keys (admin/manager) are
 * unchanged — these only affect what's shown in the UI.
 */
export const ROLE_LABELS: Record<AppRole, string> = {
  admin: 'Full-timer',
  manager: 'Trainee',
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
];

export const ROUTE_MIN_ROLE: Record<string, AppRole> = {
  '/': 'manager',
  '/directory': 'manager',
  // Looking back is the whole team's record — every visit, note quote and
  // prayer burden in one stream — so it stays Full-timer-only. A Trainee takes
  // the allowlist path below and is not on it, so this entry is not what stops
  // them; it must not claim otherwise (#1825).
  '/history': 'admin',
  // Gatherings carries the whole contact database — the missed list, the
  // rosters, the walk-in picker, and a door into every person's detail page.
  // A Trainee takes the allowlist path below and is not on it (#1834).
  '/attendance': 'manager',
  '/prayer': 'manager',
  '/answered': 'manager',
  '/settings': 'manager',
  // Around the team is Full-timer-only (#943): the team's activity is pastoral
  // detail, and the pointer card on My Day is the only door.
  '/around': 'admin',
  // To ask (#1649) — the Full-timer's private notepad. Admin-only.
  '/ask': 'admin',
  // The credential vault (#1967, ADR 0051) — the team's shared logins, sealed
  // with a passphrase the app never stores. Full-timers only, and the door is
  // one row in Settings → Security rather than a nav item.
  '/vault': 'admin',
  '/feedback': 'manager',
  // The Board is Full-timers only (cut-or-keep §19): a Trainee reads no page
  // at all, and its floor says so rather than leaning on the allowlist.
  '/coordination': 'admin',
  '/coordination/trash': 'admin',
  // The Weeks index is the archive, and the archive is Full-timers only
  // (ADR 0011 §6).
  '/bible-study': 'admin',
  // Present mode is any signed-in user's: whoever holds the phone up in the
  // room is often not a Full-timer. It had no entry here, so it fell through
  // to the 'admin' default and contradicted both its own route guard and its
  // comment — a Trainee sent to it was bounced home (#946).
  '/bible-study/present': 'manager',
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
  { href: '/', label: 'Home', minRole: 'manager' },
  { href: '/directory', label: 'People', minRole: 'manager' },
  { href: '/history', label: 'Looking back', minRole: 'manager' },
  { href: '/attendance', label: 'Gatherings', minRole: 'manager' },
  { href: '/bible-study', label: 'Bible study', minRole: 'admin' },
  { href: '/prayer', label: 'On our hearts', minRole: 'manager' },
  { href: '/answered', label: 'Answered', minRole: 'manager' },
  { href: '/coordination', label: 'Coordination Notes', minRole: 'admin' },
  // To ask (#1649) — the Full-timer's private notepad. It sits where Questions
  // used to, in Today; Trainees never reach it.
  { href: '/ask', label: 'To ask', minRole: 'admin' },
  // "Around the team" — the label the team already says, not renamed (#943).
  { href: '/around', label: 'Around the team', minRole: 'admin' },
  // Your reports (`/feedback`) is the submitter's own side of the feedback
  // loop (ADR 0019). It reads as a personal inbox, so it sits in Today
  // beside the other things aimed at you.
  { href: '/feedback', label: 'Your reports', minRole: 'manager' },
  { href: '/settings', label: 'Settings', minRole: 'manager' },
];

/**
 * Trainees are an allowlist, not a rung on the ladder, so a manager-level
 * ROUTE_MIN_ROLE does not reach them — present mode is named here explicitly
 * (#946).
 *
 * '/attendance' is deliberately missing, even though its floor reads
 * "manager and above" (#1834). A Trainee only sees the people they are tied
 * to (`seesAllPeople`), so Gatherings would hand them a partial roster and a
 * partial missed list — worse in the room than no page at all.
 * The prayer pair is deliberately missing as well (#1794, #1822): /prayer
 * and /answered are the team's shared list and the testimonies that came
 * out of it, while a Trainee's prayer surface is the home card's personal
 * list ("just between you and God").
 * '/coordination' is missing because the Board is Full-timers only
 * (cut-or-keep §19); its route floor is admin, so the allowlist and the floor
 * agree.
 * '/settings' is here because a Trainee sets their own preferences. The
 * team surface stays Full-timer-only: Settings branches on isAdmin, so a
 * Trainee lands on the personal page and never the staff one.
 *
 * Exported so the core mirror can be pinned to it (#1940).
 */
export const TRAINEE_ROUTES: readonly string[] = ['/', '/directory', '/feedback', '/settings', '/contact', '/bible-study/present'];

export function canAccessRoute(role: AppRole | string | null, path: string): boolean {
  if (!role) return false;
  // Person detail is now a real URL route so back/top-nav navigation works.
  // Every approved role can open a person page; individual contact visibility
  // is still enforced inside ContactDetailsModal.
  if (path === '/contact' || path.startsWith('/contact/') || path.startsWith('/people/')) return hasMinRole(role, 'manager');
  if (role === 'manager') return TRAINEE_ROUTES.includes(path);
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
  manager: ['/', '/directory'],
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
  Today: ['/', '/coordination', '/ask', '/around', '/feedback'],
  People: ['/directory', '/history'],
  Gatherings: ['/attendance', '/bible-study'],
  Prayer: ['/prayer', '/answered'],
};

const NAV_GROUP_ORDER: readonly NavGroupLabel[] = ['Today', 'People', 'Gatherings', 'Prayer'];

/**
 * Returns the ordered groups of destinations a given role can reach. The rail
 * (#664) renders this directly. Group order and within-group order are both
 * stable across calls. Settings is excluded — it is pinned by the shell below
 * a divider, not part of the grouped data. Groups that have no items for the
 * role are omitted, so a Trainee gets no empty "Prayer" section.
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
// Only a Full-timer reads the whole roster — the rules' seesAllContacts().
export const seesAllPeople = (role: AppRole | string | null) => role === 'admin';

export function canSeeContact(
  role: AppRole | string | null,
  staffId: string | null | undefined,
  contact: { addedBy?: string; createdBy?: string; coCreators?: string[]; founders?: string[]; carers?: string[] } | null | undefined
): boolean {
  if (!contact) return false;
  if (seesAllPeople(role)) return true;
  if (!staffId) return false;
  const added = contact.addedBy || contact.createdBy;
  return (
    added === staffId ||
    (contact.coCreators || []).includes(staffId) ||
    (contact.founders || []).includes(staffId) ||
    (contact.carers || []).includes(staffId)
  );
}

export function canManageCollaborators(
  role: AppRole | string | null,
  staffId: string | null | undefined,
  contact: { founders?: string[]; coCreators?: string[] } | null | undefined
): boolean {
  if (!contact || !staffId) return false;
  if (role === 'admin') return true;
  return (contact.founders || []).includes(staffId) || (contact.coCreators || []).includes(staffId);
}

/** Whether `actorId` may remove `targetUid` from a contact's access list
 *  (#1054). A founder is removable only by a Full-timer — the genuine-mistake
 *  correction — while a deliberately added collaborator stays removable by
 *  anyone with sharing rights. Nothing consults the creator. */
export function canRemoveContactMember(
  role: AppRole | string | null,
  actorId: string | null | undefined,
  contact: { founders?: string[]; coCreators?: string[] } | null | undefined,
  targetUid: string | null | undefined,
): boolean {
  if (!contact || !actorId || !targetUid) return false;
  if (role === 'admin') return true;
  if ((contact.founders || []).includes(targetUid)) return false;
  return canManageCollaborators(role, actorId, contact);
}

/** Whether `uid` may release a contact from their own queue (#1498).
 *  A user who is currently tied to the contact (as creator, adder, founder,
 *  coCreator, or carer) and has not already unfollowed can release themselves. */
export function canReleaseContact(
  uid: string | null | undefined,
  contact: { createdBy?: string | null; addedBy?: string | null; founders?: string[] | null; coCreators?: string[] | null; carers?: string[] | null; unfollowedBy?: string[] | null } | null | undefined,
): boolean {
  if (!contact || !uid) return false;
  if ((contact.unfollowedBy || []).includes(uid)) return false;
  return (
    contact.createdBy === uid ||
    contact.addedBy === uid ||
    (contact.founders || []).includes(uid) ||
    (contact.coCreators || []).includes(uid) ||
    (contact.carers || []).includes(uid)
  );
}

export function visibleContacts<T extends { addedBy?: string; createdBy?: string; coCreators?: string[]; founders?: string[]; carers?: string[] }>(
  role: AppRole | string | null,
  staffId: string | null | undefined,
  list: T[]
): T[] {
  if (seesAllPeople(role)) return list.slice();
  return list.filter((c) => canSeeContact(role, staffId, c));
}

export function hasMinRole(role: AppRole | string | null, min: AppRole): boolean {
  if (!role) return false;
  return (ROLE_LEVEL[role as AppRole] ?? -1) >= ROLE_LEVEL[min];
}

export function defaultRouteForRole(role: AppRole | string | null): string {
  if (hasMinRole(role, 'manager')) return '/';
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
