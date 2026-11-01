// Route parity (#1940): the web app's route gate and the shared core's must
// give the same answer for every role and every path, or a screen opens on one
// platform and is refused on the other. The web copy is where every access
// decision is recorded; the core copy is what `apps/mobile` actually calls,
// through `canAccessRoute` re-exported from `@cisa/core`.
//
// This web app deliberately has no `@cisa/core` dependency (see the note at
// the top of src/types.ts), so the two copies are mirrored rather than shared.
// This corpus is the contract between the mirrors — the same shape as
// contactVisibilityParity and bibleStudyMirrorParity.
//
// The path corpus is the union of both tables' own keys, so a route added to
// one copy is exercised against the other without anyone remembering to list
// it here. The table assertions catch a floor that differs without changing an
// answer today but would the moment a screen gated on it.
import { describe, it, expect } from 'vitest';
import {
  canAccessRoute as webCanAccess,
  ROUTE_MIN_ROLE as webFloors,
  TRAINEE_ROUTES as webTraineeRoutes,
} from '../lib/permissions';
// Direct relative imports into the workspace package -- resolved for tests only.
import {
  canAccessRoute as coreCanAccess,
  ROUTE_MIN_ROLE as coreFloors,
  TRAINEE_ROUTES as coreTraineeRoutes,
} from '../../packages/core/src/permissions';

const ROLES = ['admin', 'manager', 'operator', 'viewer', 'unknown', '', null] as const;

// Everything either copy knows, plus the path shapes `canAccessRoute`
// special-cases (contact/person detail) and an unknown path, which falls
// through to the admin default.
const PATHS = [
  ...new Set([
    ...Object.keys(webFloors),
    ...Object.keys(coreFloors),
    '/contact',
    '/contact/c1',
    '/people/p1',
    '/nonexistent',
  ]),
];

const sortedEntries = (table: Record<string, string>) =>
  Object.entries(table).sort(([a], [b]) => a.localeCompare(b));

describe('route permissions: web and core mirrors agree (#1940)', () => {
  it('carries the same route floors', () => {
    expect(sortedEntries(coreFloors)).toEqual(sortedEntries(webFloors));
  });

  it('carries the same Trainee allowlist', () => {
    expect([...coreTraineeRoutes].sort()).toEqual([...webTraineeRoutes].sort());
  });

  it('answers "can this role open this path" identically on every input', () => {
    for (const role of ROLES) {
      for (const path of PATHS) {
        expect(
          coreCanAccess(role, path),
          `${String(role)} → ${path}`,
        ).toBe(webCanAccess(role, path));
      }
    }
  });

  // The concrete calls the phone makes, so a green corpus cannot hide a
  // disagreement behind a path neither app actually routes to.
  it('agrees on the routes mobile gates on today', () => {
    const GATED = ['/contact', '/coordination', '/attendance', '/directory', '/board'];
    for (const role of ROLES) {
      for (const path of GATED) {
        expect(
          coreCanAccess(role, path),
          `${String(role)} → ${path}`,
        ).toBe(webCanAccess(role, path));
      }
    }
  });
});
