export type AppRole = 'admin' | 'manager';

export const ROLE_LEVEL: Record<AppRole, number> = {
  manager: 0,
  admin: 1,
};

/**
 * Reads a stored role. Student (`operator`) and Community (`viewer`) are cut:
 * a legacy or unknown value is no role at all — no access, and no crash.
 * Mirrors src/lib/permissions.ts.
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

// Mirrors src/lib/permissions.ts (#1940). The web copy is where every access
// decision is recorded; this one is what `apps/mobile` actually calls. Keep the
// entries and the comments identical — route-answer parity is pinned by
// src/test/permissionsRouteParity.test.ts.
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
  // The Board is Full-timers only (cut-or-keep §19): a Trainee reads no page.
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
}

// Field Notes (#10) — warm, human nav labels. Route hrefs are unchanged; only
// the display labels are relabeled. See epic #8.
export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Home', minRole: 'manager' },
  { href: '/directory', label: 'People', minRole: 'manager' },
  { href: '/history', label: 'Looking back', minRole: 'manager' },
  { href: '/attendance', label: 'Gatherings', minRole: 'manager' },
  { href: '/prayer', label: 'On our hearts', minRole: 'manager' },
  { href: '/answered', label: 'Answered', minRole: 'manager' },
  { href: '/coordination', label: 'Coordination Notes', minRole: 'admin' },
  { href: '/ask', label: 'To ask', minRole: 'admin' },
  { href: '/settings', label: 'Settings', minRole: 'manager' },
];

/**
 * The Trainee's allowlist. A Trainee is not a rung on the ladder: a
 * manager-level ROUTE_MIN_ROLE does not reach them, so every route they may
 * open is named here. Mirrors src/lib/permissions.ts (#1940); the reasoning
 * behind each absence lives there and in the route table above.
 */
export const TRAINEE_ROUTES: readonly string[] = ['/', '/directory', '/feedback', '/settings', '/contact', '/bible-study/present'];

export function canAccessRoute(role: AppRole | string | null, path: string): boolean {
  if (!role) return false;
  // Contact details on web (/people/...) and mobile (/contact or /contact/...)
  if (path === '/contact' || path.startsWith('/contact/') || path.startsWith('/people/')) {
    const level = ROLE_LEVEL[role as AppRole] ?? -1;
    return level >= ROLE_LEVEL.manager;
  }
  if (role === 'manager') return TRAINEE_ROUTES.includes(path);
  const level = ROLE_LEVEL[role as AppRole] ?? -1;
  const min = ROUTE_MIN_ROLE[path] ?? 'admin';
  return level >= ROLE_LEVEL[min];
}

export function navItemsForRole(role: AppRole | string | null): NavItem[] {
  return NAV_ITEMS.filter((item) => canAccessRoute(role, item.href));
}

export const NAV_EXTERNAL = [
  { id: 'calendar', label: 'Shared calendar', href: 'https://calendar.google.com', external: true },
];

export const canSeeSettings = (role: AppRole | string | null) => role === 'admin';
export const canSeePrefs = (role: AppRole | string | null) => role === 'admin' || role === 'manager';
export const canSeeHistory = (role: AppRole | string | null) => role === 'admin';
// Only a Full-timer reads the whole roster — the rules' seesAllContacts().
export const seesAllPeople = (role: AppRole | string | null) => role === 'admin';

/** The fields on a contact that grant a reader access, before they are
 * denormalised into `visibleTo`. Kept as its own shape so the helper can be
 * used by creation paths that have not yet written a `Contact` union. */
export interface ContactTies {
  createdBy?: string | null;
  addedBy?: string | null;
  coCreators?: string[] | null;
  founders?: string[] | null;
  carers?: string[] | null;
}

/**
 * The denormalised access list a contact should carry: every persisted tie,
 * de-duplicated and with null/empty ids dropped. This is the single source of
 * truth for `visibleTo` on both the client and (via the backfill) the server,
 * so the rules and the app cannot drift on who is tied to a person (#1024
 * phase 4). Founders join the list so a person brought in by a pair reaches
 * both of them from the moment the contact is written (#1049), and carers join
 * so a person's tie to their sheep is something the rules can see (#1051).
 */
export function visibleToOf(contact: ContactTies | null | undefined): string[] {
  if (!contact) return [];
  const ids = [
    contact.createdBy,
    contact.addedBy,
    ...(contact.coCreators || []),
    ...(contact.founders || []),
    ...(contact.carers || []),
  ];
  return [...new Set(ids.filter((id): id is string => typeof id === 'string' && id.length > 0))];
}


export function canSeeContact(
  role: AppRole | string | null,
  staffId: string | null | undefined,
  contact: {
    addedBy?: string;
    createdBy?: string;
    coCreators?: string[];
    founders?: string[];
    carers?: string[];
  } | null | undefined
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

// Which Home-tab landing a role sees. Mirrors web's `Landing.tsx` dispatcher
// for the two roles. A missing, legacy or unknown role has no landing at all:
// the phone has no route guard in front of Home, so it must never fall through
// to the Full-timer's My Day.
export type LandingKind = 'myday' | 'trainee' | 'none';

export function pickLandingForRole(role: AppRole | string | null): LandingKind {
  if (role === 'manager') return 'trainee';
  if (role === 'admin') return 'myday';
  return 'none';
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



