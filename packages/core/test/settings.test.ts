import { describe, it, expect } from 'vitest';
import {
  emailAlreadyRegistered,
  isTestAccount,
  matchesTeamSearch,
  roleOptionsFor,
  splitTeamRoster,
  settingsCareLine,
  settingsFoot,
  caredForBy,
} from '../src/settings';
import type { AppUser, Invitation } from '../src/types';

const user = (overrides: Partial<AppUser> = {}): AppUser => ({
  uid: 'u1',
  email: 'person@example.com',
  displayName: 'Person Name',
  photoURL: '',
  approved: true,
  role: 'operator',
  ...overrides,
});

const invite = (overrides: Partial<Invitation> = {}): Invitation => ({
  email: 'grace@example.com',
  role: 'operator',
  approved: true,
  invitedBy: 'u1',
  createdAt: null,
  ...overrides,
});

describe('isTestAccount', () => {
  it('flags a "cisa-" prefixed email, case-insensitively', () => {
    expect(isTestAccount({ email: 'CISA-fulltimer@example.com' })).toBe(true);
    expect(isTestAccount({ email: 'ada@example.com' })).toBe(false);
  });

  it('flags a "cisa-" prefixed display name too', () => {
    expect(isTestAccount({ email: 'ada@example.com', displayName: 'cisa-Trainee' })).toBe(true);
  });
});

describe('matchesTeamSearch', () => {
  it('matches on email or displayName, case-insensitively', () => {
    expect(matchesTeamSearch({ email: 'ada@example.com', displayName: 'Ada Lovelace' }, 'lovelace')).toBe(true);
    expect(matchesTeamSearch({ email: 'ada@example.com', displayName: 'Ada Lovelace' }, 'ADA@')).toBe(true);
    expect(matchesTeamSearch({ email: 'ada@example.com', displayName: 'Ada Lovelace' }, 'grace')).toBe(false);
  });

  it('an empty query matches everyone', () => {
    expect(matchesTeamSearch({ email: 'ada@example.com' }, '')).toBe(true);
  });
});

describe('roleOptionsFor', () => {
  it('excludes the admin option when the actor is not an admin', () => {
    const values = roleOptionsFor(false).map((o) => o.value);
    expect(values).not.toContain('admin');
    expect(values).toEqual(['viewer', 'operator', 'manager']);
  });

  it('includes the admin option when the actor is an admin', () => {
    const values = roleOptionsFor(true).map((o) => o.value);
    expect(values).toContain('admin');
  });
});

describe('splitTeamRoster', () => {
  it('excludes test-fixture accounts from both pending and approved', () => {
    const users = [user({ uid: 'a', approved: false }), user({ uid: 'b', email: 'cisa-fulltimer@example.com' })];
    const roster = splitTeamRoster(users, [], '');
    expect(roster.pending.map((u) => u.uid)).toEqual(['a']);
    expect(roster.approved).toEqual([]);
  });

  it('splits users into pending (unapproved) vs. approved', () => {
    const users = [
      user({ uid: 'a', approved: false }),
      user({ uid: 'b', approved: true }),
    ];
    const roster = splitTeamRoster(users, [], '');
    expect(roster.pending.map((u) => u.uid)).toEqual(['a']);
    expect(roster.approved.map((u) => u.uid)).toEqual(['b']);
  });

  it('applies the search filter to both pending and approved users', () => {
    const users = [
      user({ uid: 'a', displayName: 'Ada Lovelace', approved: false }),
      user({ uid: 'b', displayName: 'Grace Hopper', approved: true }),
    ];
    expect(splitTeamRoster(users, [], 'ada').pending.map((u) => u.uid)).toEqual(['a']);
    expect(splitTeamRoster(users, [], 'grace').approved.map((u) => u.uid)).toEqual(['b']);
    expect(splitTeamRoster(users, [], 'nobody').pending).toEqual([]);
  });

  it('excludes invitations whose email already matches an existing user', () => {
    const users = [user({ email: 'grace@example.com' })];
    const invites = [invite({ email: 'grace@example.com' }), invite({ email: 'ada@example.com' })];
    const roster = splitTeamRoster(users, invites, '');
    expect(roster.invites.map((i) => i.email)).toEqual(['ada@example.com']);
  });

  it('matches invitations against the same case-insensitive email match', () => {
    const users = [user({ email: 'GRACE@example.com' })];
    const invites = [invite({ email: 'grace@example.com' })];
    expect(splitTeamRoster(users, invites, '').invites).toEqual([]);
  });

  it('applies the search filter to remaining invitations', () => {
    const invites = [invite({ email: 'ada@example.com' }), invite({ email: 'grace@example.com' })];
    expect(splitTeamRoster([], invites, 'ada').invites.map((i) => i.email)).toEqual(['ada@example.com']);
  });

  it('combines test-account exclusion, search, and split together', () => {
    const users = [
      user({ uid: 'match', email: 'ada.match@example.com', displayName: 'Ada Lovelace', approved: false }),
      user({ uid: 'wrong-search', email: 'grace@example.com', displayName: 'Grace Hopper', approved: false }),
      user({ uid: 'test-fixture', email: 'cisa-ada@example.com', displayName: 'cisa-Ada Fixture', approved: false }),
    ];
    const invites = [invite({ email: 'ada-invite@example.com' })];
    const roster = splitTeamRoster(users, invites, 'ada');
    expect(roster.pending.map((u) => u.uid)).toEqual(['match']);
    expect(roster.invites.map((i) => i.email)).toEqual(['ada-invite@example.com']);
  });
});

describe('emailAlreadyRegistered', () => {
  it('matches case-insensitively against non-test-account users', () => {
    const users = [user({ email: 'ada@example.com' })];
    expect(emailAlreadyRegistered(users, 'ada@example.com')).toBe(true);
    expect(emailAlreadyRegistered(users, 'grace@example.com')).toBe(false);
  });

  it('ignores test-fixture accounts', () => {
    const users = [user({ email: 'cisa-fulltimer@example.com' })];
    expect(emailAlreadyRegistered(users, 'cisa-fulltimer@example.com')).toBe(false);
  });
});

describe('mobile v2 Settings copy', () => {
  it('reports care and what was looked after today', () => {
    expect(settingsCareLine(1, 1)).toBe('1 person in your care · 1 thing looked after today');
    expect(settingsCareLine(4, 0)).toBe('4 people in your care · 0 things looked after today');
    expect(settingsCareLine(4, 2)).toBe('4 people in your care · 2 things looked after today');
  });

  it('drops the second clause for someone with no queue', () => {
    // A full-timer has no focus queue, so "0 things looked after" would be a
    // lie about their day rather than a count.
    expect(settingsCareLine(12, null)).toBe('12 people in your care');
    expect(settingsCareLine(0, null)).toBe('0 people in your care');
  });

  it('ends the page on the role label, through roleLabel', () => {
    expect(settingsFoot('admin')).toContain('Your role here is a label: Full-timer.');
    expect(settingsFoot('manager')).toContain('Your role here is a label: Trainee.');
    expect(settingsFoot(null)).toContain('Your role here is a label: Guest.');
    expect(settingsFoot('admin')).toMatch(/^The team roster and everything admin live on the desktop site\./);
  });

  it('names who cares for you, or says nothing', () => {
    expect(caredForBy('Ana Beltrán')).toBe('Ana cares for you');
    expect(caredForBy(null)).toBe('');
    expect(caredForBy('')).toBe('');
    expect(caredForBy(undefined)).toBe('');
  });
});
