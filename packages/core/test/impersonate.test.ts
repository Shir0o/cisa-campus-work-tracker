import { describe, it, expect } from 'vitest';
import { impGroups } from '../src/impersonate';
import type { AppUser } from '../src/types';

function user(overrides: Partial<AppUser>): AppUser {
  return {
    uid: 'u-default',
    email: 'default@cisa.campus',
    displayName: 'Default User',
    photoURL: '',
    approved: true,
    role: 'admin',
    ...overrides,
  };
}

describe('impGroups — the mobile "See it as they do" roster picker', () => {
  it('never offers yourself', () => {
    const me = user({ uid: 'me-1', displayName: 'Me', role: 'admin' });
    const other = user({ uid: 'ft-2', displayName: 'Ana', role: 'admin' });
    const groups = impGroups([me, other], 'me-1');
    const allKeys = groups.flatMap((g) => g.items.map((t) => t.key));
    expect(allKeys).not.toContain('staff:me-1');
    expect(allKeys).toContain('staff:ft-2');
  });

  it('buckets users into the two role groups', () => {
    const users = [
      user({ uid: 'a', displayName: 'Ana', role: 'admin' }),
      user({ uid: 't', displayName: 'Zion', role: 'manager' }),
    ];
    const groups = impGroups(users, 'me-1');
    const byId = Object.fromEntries(groups.map((g) => [g.id, g]));
    expect(byId.ft.items.map((t) => t.name)).toEqual(['Ana']);
    expect(byId.trainee.items.map((t) => t.name)).toEqual(['Zion']);
  });

  it("carries the design's exact group labels and notes, in order", () => {
    const users = [
      user({ uid: 'a', role: 'admin' }),
      user({ uid: 't', role: 'manager' }),
    ];
    const groups = impGroups(users, 'me-1');
    expect(groups.map((g) => [g.id, g.label, g.note])).toEqual([
      ['ft', 'Full-timers', 'The whole workspace, as they read it.'],
      ['trainee', 'Trainees', 'In training — a smaller window, and only the people they brought in.'],
    ]);
  });

  // The Student and Community groups, and their synthetic personas, are cut.
  it('drops a group entirely when it has no users, with no persona to fall back to', () => {
    const users = [user({ uid: 'a', role: 'admin' })];
    const groups = impGroups(users, 'me-1');
    expect(groups.map((g) => g.id)).toEqual(['ft']);
  });

  it('filters by name and sub across a search query', () => {
    const users = [
      user({ uid: 'a', displayName: 'Ana Full-timer', role: 'admin', email: 'ana@cisa.campus' }),
      user({ uid: 'b', displayName: 'Bea Full-timer', role: 'admin', email: 'bea@cisa.campus' }),
    ];
    const groups = impGroups(users, 'me-1', 'ana');
    const names = groups.flatMap((g) => g.items.map((t) => t.name));
    expect(names).toEqual(['Ana Full-timer']);
  });

  it('excludes unapproved users', () => {
    const users = [
      user({ uid: 'a', displayName: 'Approved', role: 'admin', approved: true }),
      user({ uid: 'b', displayName: 'Pending', role: 'admin', approved: false }),
    ];
    const groups = impGroups(users, 'me-1');
    const ftNames = groups.find((g) => g.id === 'ft')!.items.map((t) => t.name);
    expect(ftNames).toEqual(['Approved']);
  });
});
