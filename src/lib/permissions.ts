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
  '/': 'operator',
  '/board': 'manager',
  '/directory': 'operator',
  '/history': 'manager',
  '/attendance': 'viewer',
  '/prayer': 'viewer',
  '/settings': 'viewer',
  '/feedback': 'viewer',
  '/admin/feedback': 'admin',
  '/coordination': 'admin',
};

export interface NavItem {
  href: string;
  label: string;
  minRole: AppRole;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Dashboard', minRole: 'operator' },
  { href: '/board', label: 'Stage', minRole: 'manager' },
  { href: '/directory', label: 'Contacts', minRole: 'operator' },
  { href: '/history', label: 'History', minRole: 'manager' },
  { href: '/attendance', label: 'Attendance', minRole: 'viewer' },
  { href: '/prayer', label: 'Prayer List', minRole: 'viewer' },
  { href: '/coordination', label: 'Coordination Notes', minRole: 'admin' },
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
  if (hasMinRole(role, 'operator')) return '/';
  return '/attendance';
}
