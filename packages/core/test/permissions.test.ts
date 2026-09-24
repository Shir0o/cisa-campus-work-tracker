import { describe, it, expect } from 'vitest';
import {
  journeyContacts,
  roleLabel,
  canAccessRoute,
  canSeePrefs,
  hasMinRole,
  defaultRouteForRole,
  pickLandingForRole,
  NAV_ITEMS,
  isAppOwner,
  canSimulateRole,
  getEffectiveRole,
  OWNER_EMAIL,
  canManageCollaborators,
  canRemoveContactMember,
  canSeeContact,
  visibleToOf,
} from '../src/permissions';
import { applyPartners } from '../src/data/partners';

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
    // contact details accessible across all approved roles
    expect(canAccessRoute('viewer', '/contact')).toBe(true);
    expect(canAccessRoute('manager', '/contact')).toBe(true);
    expect(canAccessRoute('manager', '/contact/c1')).toBe(true);
    // unknown routes default to admin-only
    expect(canAccessRoute('viewer', '/nonexistent')).toBe(false);
    expect(canAccessRoute('admin', '/nonexistent')).toBe(true);
    // null role is never allowed
    expect(canAccessRoute(null, '/')).toBe(false);
    expect(canAccessRoute(null, '/contact')).toBe(false);
  });

  // What the trainee's mobile drawer and route guards read. Gatherings and The
  // Board are closed to them; Settings is NOT — the queue prefs live there, so
  // that screen gates on canSeePrefs instead (see apps/mobile/app/settings.tsx).
  it('keeps Gatherings and The Board closed to the trainee, but not their prefs', () => {
    expect(canAccessRoute('manager', '/attendance')).toBe(false);
    expect(canAccessRoute('manager', '/coordination')).toBe(false);
    expect(canAccessRoute('admin', '/attendance')).toBe(true);
    expect(canAccessRoute('viewer', '/attendance')).toBe(true);
    expect(canSeePrefs('manager')).toBe(true);
    expect(canSeePrefs('viewer')).toBe(false);
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

  it('identifies app owner correctly', () => {
    expect(isAppOwner(OWNER_EMAIL)).toBe(true);
    expect(isAppOwner('YILONGWANG05@GMAIL.COM')).toBe(true);
    expect(isAppOwner('other@gmail.com')).toBe(false);
    expect(isAppOwner(null)).toBe(false);
    expect(isAppOwner(undefined)).toBe(false);
  });

  it('checks role simulation permissions via canSimulateRole', () => {
    expect(canSimulateRole('admin', 'other@example.com')).toBe(true);
    expect(canSimulateRole('viewer', OWNER_EMAIL)).toBe(true);
    expect(canSimulateRole('manager', 'other@example.com')).toBe(false);
    expect(canSimulateRole('viewer', 'other@example.com')).toBe(false);
    expect(canSimulateRole(null, null)).toBe(false);
  });

  it('resolves effective role for app owner and all admin accounts', () => {
    // App owner with ownerViewRole override
    expect(getEffectiveRole(OWNER_EMAIL, 'admin', 'operator')).toBe('operator');
    expect(getEffectiveRole(OWNER_EMAIL, 'admin', 'viewer')).toBe('viewer');
    // App owner without override returns actual role
    expect(getEffectiveRole(OWNER_EMAIL, 'admin', null)).toBe('admin');
    // Non-owner admin with ownerViewRole returns override
    expect(getEffectiveRole('other-admin@example.com', 'admin', 'operator')).toBe('operator');
    expect(getEffectiveRole('other-admin@example.com', 'admin', 'manager')).toBe('manager');
    // Non-owner non-admin with ownerViewRole returns actual role
    expect(getEffectiveRole('other@example.com', 'viewer', 'admin')).toBe('viewer');
    expect(getEffectiveRole('other@example.com', 'manager', 'admin')).toBe('manager');
  });

  it('canManageCollaborators allows admin, founders, and coCreators — never the creator alone (#1054)', () => {
    const contact = {
      createdBy: 'u-creator',
      founders: ['u-creator', 'u-founder'],
      coCreators: ['u-collab'],
    };

    // Admin can always manage
    expect(canManageCollaborators('admin', 'u-random', contact)).toBe(true);

    // A founder can manage, whether or not they typed the name in
    expect(canManageCollaborators('manager', 'u-founder', contact)).toBe(true);
    expect(canManageCollaborators('manager', 'u-creator', contact)).toBe(true);

    // Co-creators can manage
    expect(canManageCollaborators('manager', 'u-collab', contact)).toBe(true);
    expect(canManageCollaborators('operator', 'u-collab', contact)).toBe(true);

    // Who typed the name is not consulted for permission: a creator who is not
    // a founder (should not exist, but if it does) gains nothing from creation.
    expect(canManageCollaborators('manager', 'u-creator', { coCreators: [] })).toBe(false);

    // Non-collaborator cannot manage
    expect(canManageCollaborators('manager', 'u-random', contact)).toBe(false);
    expect(canManageCollaborators('operator', 'u-random', contact)).toBe(false);
    expect(canManageCollaborators('manager', null, contact)).toBe(false);
    expect(canManageCollaborators('manager', 'u-creator', null)).toBe(false);
  });
});

describe('canSeeContact', () => {
  it('lets every role that sees all people read any contact', () => {
    const contact = { id: 'c1', createdBy: 'other-user', coCreators: [] };
    expect(canSeeContact('admin', 'u1', contact)).toBe(true);
    expect(canSeeContact('operator', 'u1', contact)).toBe(true);
    expect(canSeeContact('viewer', 'u1', contact)).toBe(true);
  });

  it('restricts a trainee to the ties on the record', () => {
    const other = { id: 'c1', createdBy: 'u2', coCreators: ['u3'] };
    const own = { id: 'c2', createdBy: 'u1', coCreators: [] };
    const co = { id: 'c3', createdBy: 'u2', coCreators: ['u1'] };

    expect(canSeeContact('manager', 'u1', other)).toBe(false);
    expect(canSeeContact('manager', 'u1', own)).toBe(true);
    expect(canSeeContact('manager', 'u1', co)).toBe(true);
    expect(canSeeContact('manager', undefined, own)).toBe(false);
    expect(canSeeContact('manager', 'u1', null)).toBe(false);
  });

  it('lets a founder see the person even when they are neither creator nor collaborator (#1049)', () => {
    const founded = { id: 'c1', createdBy: 'u2', founders: ['u2', 'u1'], coCreators: [] };
    expect(canSeeContact('manager', 'u1', founded)).toBe(true);
    const notFounder = { id: 'c2', createdBy: 'u2', founders: ['u2', 'u3'], coCreators: [] };
    expect(canSeeContact('manager', 'u1', notFounder)).toBe(false);
  });

  it('lets a carer see the person they hold in their sheep (#1051)', () => {
    const cared = { id: 'c1', createdBy: 'u2', carers: ['u1', 'u3'], coCreators: [] };
    expect(canSeeContact('manager', 'u1', cared)).toBe(true);
    expect(canSeeContact('manager', 'u3', cared)).toBe(true);
    const notCarer = { id: 'c2', createdBy: 'u2', carers: ['u3'], coCreators: [] };
    expect(canSeeContact('manager', 'u1', notCarer)).toBe(false);
  });

  // #1054: the dynamic current-term widening is retired. Founders are written
  // at creation, so the widening has nothing left to add — and a current
  // partner who is not a founder of *this* person cannot see them.
  it('no longer widens a trainee to a current-term partner who is not a founder (#1054)', () => {
    applyPartners({ 'Fall 2026': [['u1', 'u2']] }, new Date(2026, 8, 1));

    const partnerContact = { id: 'c4', createdBy: 'u2', season: 'Fall 2026', coCreators: [] };
    expect(canSeeContact('manager', 'u1', partnerContact)).toBe(false);

    applyPartners({});
  });

  it('a founder sees the person whatever the term (#1054)', () => {
    applyPartners({ 'Fall 2026': [['u1', 'u2']] }, new Date(2026, 8, 1));

    const founded = { id: 'c4', createdBy: 'u2', season: 'Spring 2026', founders: ['u2', 'u1'], coCreators: [] };
    expect(canSeeContact('manager', 'u1', founded)).toBe(true);
    // The person's partner writes no season either; the founder tie is the rule.
    expect(canSeeContact('manager', 'u1', { createdBy: 'u2', founders: ['u2', 'u1'], coCreators: [] })).toBe(true);

    applyPartners({});
  });
});

describe('canRemoveContactMember (#1054)', () => {
  const contact = {
    createdBy: 'u-creator',
    founders: ['u-creator', 'u-founder'],
    coCreators: ['u-founder', 'u-collab'],
  };

  it('only a Full-timer can remove a founder', () => {
    expect(canRemoveContactMember('admin', 'u-ft', contact, 'u-founder')).toBe(true);
    // Another founder cannot remove a founder.
    expect(canRemoveContactMember('manager', 'u-creator', contact, 'u-founder')).toBe(false);
    // A collaborator cannot remove a founder.
    expect(canRemoveContactMember('manager', 'u-collab', contact, 'u-founder')).toBe(false);
    expect(canRemoveContactMember('manager', 'u-other', contact, 'u-creator')).toBe(false);
  });

  it('a deliberately added collaborator is removable by anyone with sharing rights', () => {
    expect(canRemoveContactMember('manager', 'u-founder', contact, 'u-collab')).toBe(true);
    expect(canRemoveContactMember('manager', 'u-creator', contact, 'u-collab')).toBe(true);
    expect(canRemoveContactMember('manager', 'u-collab', contact, 'u-collab')).toBe(true);
    expect(canRemoveContactMember('admin', 'u-ft', contact, 'u-collab')).toBe(true);
  });

  it('a reader with no sharing rights cannot remove a collaborator', () => {
    expect(canRemoveContactMember('manager', 'u-other', contact, 'u-collab')).toBe(false);
    // A creator who is not a founder gains nothing from creation alone.
    expect(canRemoveContactMember('manager', 'u-creator', { coCreators: [] }, 'u-collab')).toBe(false);
  });

  it('guards nulls', () => {
    expect(canRemoveContactMember('manager', null, contact, 'u-collab')).toBe(false);
    expect(canRemoveContactMember('manager', 'u-founder', null, 'u-collab')).toBe(false);
    expect(canRemoveContactMember('manager', 'u-founder', contact, null)).toBe(false);
  });
});

describe('visibleToOf', () => {
  it('collects creator, adder, collaborators, founders and carers', () => {
    expect(
      visibleToOf({
        createdBy: 'u1',
        addedBy: 'u2',
        coCreators: ['u4', 'u5'],
        founders: ['u1', 'u6'],
      }),
    ).toEqual(['u1', 'u2', 'u4', 'u5', 'u6']);
  });

  it('includes carers — the people holding this person in their sheep (#1051)', () => {
    expect(
      visibleToOf({
        createdBy: 'u1',
        coCreators: ['u2'],
        carers: ['u3', 'u4'],
      }),
    ).toEqual(['u1', 'u2', 'u3', 'u4']);
  });

  it('de-duplicates and drops null/empty ids', () => {
    expect(
      visibleToOf({
        createdBy: 'u1',
        addedBy: null,
        coCreators: ['u1', 'u2', '', null as unknown as string],
        founders: ['u1', 'u3'],
        carers: ['u1', 'u4'],
      }),
    ).toEqual(['u1', 'u2', 'u3', 'u4']);
  });

  it('returns an empty list for a contact with no ties', () => {
    expect(visibleToOf({})).toEqual([]);
    expect(visibleToOf(null)).toEqual([]);
    expect(visibleToOf(undefined)).toEqual([]);
  });

  it('is order-stable: ties come before collaborators', () => {
    expect(visibleToOf({ coCreators: ['c'], createdBy: 'o' })).toEqual(['o', 'c']);
  });
});

// The Journey is outreach (#1152, ADR 0030): a Local saint sits outside it.
// Our own stay, because the church-meeting step is theirs.
describe('journeyContacts excludes Local saints', () => {
  const person = (over: Record<string, unknown>) => ({ addedBy: 'u1', ...over });

  it('drops a local saint from the board', () => {
    const list = [person({ id: 'a', inChurchLife: true, isStudent: false })];
    expect(journeyContacts('admin', 'u1', list)).toHaveLength(0);
  });

  it('keeps our own on the board', () => {
    const list = [person({ id: 'b', inChurchLife: true, isStudent: true })];
    expect(journeyContacts('admin', 'u1', list)).toHaveLength(1);
  });

  it('keeps contacts, including legacy documents carrying neither field', () => {
    const list = [person({ id: 'c' }), person({ id: 'd', inChurchLife: false, isStudent: true })];
    expect(journeyContacts('admin', 'u1', list)).toHaveLength(2);
  });

  it('drops a local saint for a trainee too', () => {
    const list = [person({ id: 'e', inChurchLife: true, isStudent: false, carers: ['u1'] })];
    expect(journeyContacts('manager', 'u1', list)).toHaveLength(0);
  });
});
