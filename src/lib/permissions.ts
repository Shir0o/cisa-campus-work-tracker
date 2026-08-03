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

const ROUTE_MIN_ROLE: Record<string, AppRole> = {
  '/': 'viewer',
  '/board': 'manager',
  '/directory': 'operator',
  '/history': 'manager',
  '/attendance': 'viewer',
  '/prayer': 'viewer',
  '/answered': 'viewer',
  '/settings': 'viewer',
  '/messages': 'viewer',
  '/feedback': 'viewer',
  '/admin/feedback': 'admin',
  '/coordination': 'operator',
  '/coordination/trash': 'admin',
  'https://shared-calendar-6u6.pages.dev/': 'viewer',
};

export interface NavItem {
  href: string;
  label: string;
  minRole: AppRole;
  isExternal?: boolean;
}

// Field Notes (#10) — warm, human nav labels. Route hrefs are unchanged; only
// the display labels are relabeled. See epic #8.
export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Home', minRole: 'viewer' },
  { href: '/board', label: 'The Journey', minRole: 'manager' },
  { href: '/directory', label: 'People', minRole: 'operator' },
  { href: 'https://shared-calendar-6u6.pages.dev/', label: 'Shared Calendar', minRole: 'viewer', isExternal: true },
  { href: '/history', label: 'Looking back', minRole: 'manager' },
  { href: '/attendance', label: 'Gatherings', minRole: 'viewer' },
  { href: '/prayer', label: 'On our hearts', minRole: 'viewer' },
  { href: '/answered', label: 'Answered', minRole: 'viewer' },
  { href: '/coordination', label: 'Coordination Notes', minRole: 'operator' },
  { href: '/messages', label: 'Messages', minRole: 'viewer' },
  { href: '/settings', label: 'Settings', minRole: 'viewer' },
];

export function canAccessRoute(role: AppRole | string | null, path: string): boolean {
  if (!role) return false;
  const level = ROLE_LEVEL[role as AppRole] ?? -1;
  const min = ROUTE_MIN_ROLE[path] ?? 'admin';
  return level >= ROLE_LEVEL[min];
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
 * Resolves the effective role for a user. If the user is the app owner and has
 * an active ownerViewRole override set, returns ownerViewRole; otherwise returns actualRole.
 */
export function getEffectiveRole(
  email: string | null | undefined,
  actualRole: AppRole | null,
  ownerViewRole: AppRole | null
): AppRole | null {
  if (isAppOwner(email) && ownerViewRole) {
    return ownerViewRole;
  }
  return actualRole;
}

