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

  it('buckets users into the four role groups', () => {
    const users = [
      user({ uid: 'a', displayName: 'Ana', role: 'admin' }),
      user({ uid: 't', displayName: 'Zion', role: 'manager' }),
      user({ uid: 's', displayName: 'Timothy', role: 'operator' }),
      user({ uid: 'c', displayName: 'Philip', role: 'viewer' }),
    ];
    const groups = impGroups(users, 'me-1');
    const byId = Object.fromEntries(groups.map((g) => [g.id, g]));
    expect(byId.ft.items.map((t) => t.name)).toEqual(['Ana']);
    expect(byId.trainee.items.map((t) => t.name)).toEqual(['Zion']);
    expect(byId.student.items.map((t) => t.name)).toEqual(['Timothy']);
    expect(byId.community.items.map((t) => t.name)).toEqual(['Philip']);
  });

  it("carries the design's exact group labels and notes, in order", () => {
    const users = [
      user({ uid: 'a', role: 'admin' }),
      user({ uid: 't', role: 'manager' }),
      user({ uid: 's', role: 'operator' }),
      user({ uid: 'c', role: 'viewer' }),
    ];
    const groups = impGroups(users, 'me-1');
    expect(groups.map((g) => [g.id, g.label, g.note])).toEqual([
      ['ft', 'Full-timers', 'The whole workspace, as they read it.'],
      ['trainee', 'Trainees', 'In training — a smaller window, and only the people they brought in.'],
      ['student', 'Students', "Club members and officers — what's on, prayer, messages."],
      ['community', 'Community', 'Friends of the work — host families, alumni, supporters.'],
    ]);
  });

  it('falls back to the synthetic persona when a student/community group is empty', () => {
    const users = [user({ uid: 'a', role: 'admin' })];
    const groups = impGroups(users, 'me-1');
    const byId = Object.fromEntries(groups.map((g) => [g.id, g]));
    expect(byId.student.items).toHaveLength(1);
    expect(byId.student.items[0].key).toBe('persona:student');
    expect(byId.community.items).toHaveLength(1);
    expect(byId.community.items[0].key).toBe('persona:community');
  });

  it('drops a group entirely when it has no real users and no persona fallback applies', () => {
    // Only a student exists — no full-timers, no trainees, and community falls
    // back to its persona rather than disappearing.
    const users = [user({ uid: 's', role: 'operator', displayName: 'Timothy' })];
    const groups = impGroups(users, 'me-1');
    const ids = groups.map((g) => g.id);
    expect(ids).not.toContain('ft');
    expect(ids).not.toContain('trainee');
    expect(ids).toContain('student');
    expect(ids).toContain('community');
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
