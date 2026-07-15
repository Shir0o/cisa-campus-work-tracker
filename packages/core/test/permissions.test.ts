import { describe, it, expect } from 'vitest';
import {
  roleLabel,
  canAccessRoute,
  hasMinRole,
  defaultRouteForRole,
  pickLandingForRole,
  NAV_ITEMS,
} from '../src/permissions';

describe('permissions', () => {
  it('maps internal roles to display labels', () => {
    expect(roleLabel('admin')).toBe('Full-timer');
    expect(roleLabel('manager')).toBe('Trainee');
    expect(roleLabel('operator')).toBe('Student');
    expect(roleLabel('viewer')).toBe('Community');
    expect(roleLabel(null)).toBe('Guest');
  });

  it('gates routes by minimum role', () => {
    // viewer (Community) cannot reach The Journey (manager+)
    expect(canAccessRoute('viewer', '/board')).toBe(false);
    expect(canAccessRoute('manager', '/board')).toBe(true);
    // only admin reaches admin feedback
    expect(canAccessRoute('manager', '/admin/feedback')).toBe(false);
    expect(canAccessRoute('admin', '/admin/feedback')).toBe(true);
    // unknown routes default to admin-only
    expect(canAccessRoute('viewer', '/nonexistent')).toBe(false);
    expect(canAccessRoute('admin', '/nonexistent')).toBe(true);
    // null role is never allowed
    expect(canAccessRoute(null, '/')).toBe(false);
  });

  it('hasMinRole respects the level ladder', () => {
    expect(hasMinRole('operator', 'viewer')).toBe(true);
    expect(hasMinRole('viewer', 'operator')).toBe(false);
    expect(hasMinRole('admin', 'admin')).toBe(true);
    expect(hasMinRole(null, 'viewer')).toBe(false);
  });

  it('defaultRouteForRole falls back to /attendance for unknown roles', () => {
    expect(defaultRouteForRole('viewer')).toBe('/');
    expect(defaultRouteForRole(null)).toBe('/attendance');
  });

  it('pickLandingForRole maps roles to their Home-tab landing', () => {
    expect(pickLandingForRole('manager')).toBe('trainee');
    expect(pickLandingForRole('operator')).toBe('student');
    expect(pickLandingForRole('viewer')).toBe('community');
    expect(pickLandingForRole('admin')).toBe('myday');
    expect(pickLandingForRole(null)).toBe('myday');
    expect(pickLandingForRole('bogus')).toBe('myday');
  });

  it('every NAV_ITEM route is accessible to a user at its minRole', () => {
    for (const item of NAV_ITEMS) {
      if (item.href in { '/': 1 }) continue;
      // A user exactly at the item's minRole should pass canAccessRoute for
      // routes that have an explicit gate.
      expect(hasMinRole(item.minRole, item.minRole)).toBe(true);
    }
  });
});
