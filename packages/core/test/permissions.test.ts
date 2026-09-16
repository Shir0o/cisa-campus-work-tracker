import { describe, it, expect } from 'vitest';
import {
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
  canTransferOwnership,
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

  it('canManageCollaborators allows admin, owner, creator, and coCreators', () => {
    const contact = {
      owner: 'u-owner',
      createdBy: 'u-creator',
      coCreators: ['u-partner1', 'u-partner2'],
    };

    // Admin can always manage
    expect(canManageCollaborators('admin', 'u-random', contact)).toBe(true);

    // Primary owner can manage
    expect(canManageCollaborators('manager', 'u-owner', contact)).toBe(true);

    // Creator can manage
    expect(canManageCollaborators('manager', 'u-creator', contact)).toBe(true);

    // Co-creators can manage
    expect(canManageCollaborators('manager', 'u-partner1', contact)).toBe(true);
    expect(canManageCollaborators('operator', 'u-partner2', contact)).toBe(true);

    // Non-collaborator cannot manage
    expect(canManageCollaborators('manager', 'u-random', contact)).toBe(false);
    expect(canManageCollaborators('operator', 'u-random', contact)).toBe(false);
    expect(canManageCollaborators('manager', null, contact)).toBe(false);
    expect(canManageCollaborators('manager', 'u-owner', null)).toBe(false);
  });

  it('canTransferOwnership only allows admin, owner, or creator', () => {
    const contact = {
      owner: 'u-owner',
      createdBy: 'u-creator',
      coCreators: ['u-partner1'],
    };

    expect(canTransferOwnership('admin', 'u-random', contact)).toBe(true);
    expect(canTransferOwnership('manager', 'u-owner', contact)).toBe(true);
    expect(canTransferOwnership('manager', 'u-creator', contact)).toBe(true);

    // Co-creator CANNOT transfer ownership
    expect(canTransferOwnership('manager', 'u-partner1', contact)).toBe(false);
    expect(canTransferOwnership('manager', 'u-random', contact)).toBe(false);
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

  // Mirrors the web app's copy in src/test/permissions.test.tsx so the two
  // rules stay in step (#1024 phase 3).
  it('widens a trainee to a current-term gospel partner, and only for that term', () => {
    applyPartners({ 'Fall 2026': [['u1', 'u2']] }, new Date(2026, 8, 1));

    const partnerCurrent = { id: 'c4', createdBy: 'u2', season: 'Fall 2026', coCreators: [] };
    expect(canSeeContact('manager', 'u1', partnerCurrent)).toBe(true);

    const partnerPast = { id: 'c5', createdBy: 'u2', season: 'Spring 2026', coCreators: [] };
    expect(canSeeContact('manager', 'u1', partnerPast)).toBe(false);

    // Pairings change in Settings: u1 now goes out with u3.
    applyPartners({ 'Fall 2026': [['u1', 'u3']] }, new Date(2026, 8, 1));
    const newPartner = { id: 'c6', createdBy: 'u3', season: 'Fall 2026', coCreators: [] };
    expect(canSeeContact('manager', 'u1', newPartner)).toBe(true);
    expect(canSeeContact('manager', 'u1', partnerCurrent)).toBe(false);

    // Co-created with a past partner: the tie outlives the term.
    const coCreated = { id: 'c7', createdBy: 'u2', season: 'Fall 2026', coCreators: ['u1'] };
    expect(canSeeContact('manager', 'u1', coCreated)).toBe(true);

    applyPartners({});
  });

  it('reads the term from tags when the record carries no season', () => {
    applyPartners({ 'Fall 2026': [['u1', 'u2']] }, new Date(2026, 8, 1));

    expect(canSeeContact('manager', 'u1', { createdBy: 'u2', tags: ['Fall 2026'], coCreators: [] })).toBe(true);
    expect(canSeeContact('manager', 'u1', { createdBy: 'u2', tags: ['Spring 2026'], coCreators: [] })).toBe(false);
    // No season and no tag: the dynamic widening does not apply.
    expect(canSeeContact('manager', 'u1', { createdBy: 'u2', coCreators: [] })).toBe(false);

    applyPartners({});
  });

  it('widens on the partner as owner too, not only as adder', () => {
    applyPartners({ 'Fall 2026': [['u1', 'u2']] }, new Date(2026, 8, 1));

    expect(canSeeContact('manager', 'u1', { owner: 'u2', createdBy: 'someone', season: 'Fall 2026' })).toBe(true);
    expect(canSeeContact('manager', 'u1', { owner: 'u3', createdBy: 'someone', season: 'Fall 2026' })).toBe(false);

    applyPartners({});
  });
});

describe('visibleToOf', () => {
  it('collects creator, adder, caregiver, collaborators and founders', () => {
    expect(
      visibleToOf({
        createdBy: 'u1',
        addedBy: 'u2',
        owner: 'u3',
        coCreators: ['u4', 'u5'],
        founders: ['u1', 'u6'],
      }),
    ).toEqual(['u1', 'u2', 'u3', 'u4', 'u5', 'u6']);
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
        owner: 'u1',
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
    expect(visibleToOf({ coCreators: ['c'], owner: 'o' })).toEqual(['o', 'c']);
  });
});
