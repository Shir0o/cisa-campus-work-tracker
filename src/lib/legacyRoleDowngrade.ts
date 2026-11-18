// The Student (`operator`) and Community (`viewer`) roles are cut. Any account
// still carrying one becomes an unapproved Trainee: the app already reads the
// legacy role as no role, and a Full-timer can approve the person as a Trainee
// if they should be in at all. Planned here, pure, so it is unit tested; the
// Firestore pass is scripts/downgrade-legacy-roles.ts.

const LEGACY_ROLES = ['operator', 'viewer'];

export interface LegacyRoleUser {
  id: string;
  role?: unknown;
  approved?: unknown;
}

export interface LegacyRoleDowngradeRow {
  id: string;
  from: string;
  set: { role: 'manager'; approved: false };
}

export function planLegacyRoleDowngrade(users: LegacyRoleUser[]): LegacyRoleDowngradeRow[] {
  return users
    .filter((u): u is LegacyRoleUser & { role: string } => typeof u.role === 'string' && LEGACY_ROLES.includes(u.role))
    .map((u) => ({ id: u.id, from: u.role, set: { role: 'manager', approved: false } }));
}
