import { describe, it, expect } from 'vitest';
import {
  ANNOUNCEMENT_MAX_LENGTH,
  announcementAudience,
  announcementNotification,
  gotItProgress,
  openAnnouncements,
  whoHasNot,
  yourAnnouncements,
  type Announcement,
} from '../src/announcements';
import type { AppUser } from '../src/types';

const user = (uid: string, over: Partial<AppUser> = {}): AppUser => ({
  uid,
  email: `${uid}@example.com`,
  displayName: uid.toUpperCase(),
  photoURL: '',
  approved: true,
  role: 'manager',
  ...over,
});

const ana = user('ana', { role: 'admin', displayName: 'Ana Admin' }); // the poster
const ben = user('ben', { displayName: 'Ben Trainee' });
const cal = user('cal', { displayName: 'Cal Trainee' });
const dee = user('dee', { role: 'admin', displayName: 'Dee Admin' });
const pending = user('pending', { approved: false });
const team = [ana, ben, cal, dee, pending];

const announcement = (over: Partial<Announcement> = {}): Announcement => ({
  id: 'a1',
  body: 'Retreat moves to Saturday',
  authorId: 'ana',
  authorName: 'Ana Admin',
  createdAt: '2026-11-18T10:00:00.000Z',
  gotIt: {},
  ...over,
});

describe('announcementAudience', () => {
  it('is every approved Full-timer and Trainee except the poster', () => {
    expect(announcementAudience(team, 'ana').map((u) => u.uid).sort()).toEqual(['ben', 'cal', 'dee']);
  });

  it('leaves out anyone not approved, and any role that is not Full-timer or Trainee', () => {
    const legacy = user('old', { role: 'operator' as never });
    expect(announcementAudience([ana, pending, legacy, ben], 'ana').map((u) => u.uid)).toEqual(['ben']);
  });
});

describe('whoHasNot', () => {
  it('names everyone in the audience who has not said Got it', () => {
    const a = announcement({ gotIt: { ben: '2026-11-18T10:05:00.000Z' } });
    expect(whoHasNot(a, team).map((u) => u.displayName)).toEqual(['Cal Trainee', 'Dee Admin']);
  });

  it('never lists the poster, even though the poster has not said Got it', () => {
    expect(whoHasNot(announcement(), team).map((u) => u.uid)).not.toContain('ana');
  });

  it('is empty once everyone has got it', () => {
    const a = announcement({
      gotIt: { ben: 't', cal: 't', dee: 't' },
    });
    expect(whoHasNot(a, team)).toEqual([]);
  });

  it('does not count a Got it from someone who is no longer on the team', () => {
    const a = announcement({ gotIt: { ghost: 't' } });
    expect(whoHasNot(a, team)).toHaveLength(3);
  });
});

describe('gotItProgress', () => {
  it('counts who got it out of everyone it reached, poster excluded', () => {
    const a = announcement({ gotIt: { ben: 't', dee: 't' } });
    const p = gotItProgress(a, team);
    expect(p.got).toBe(2);
    expect(p.total).toBe(3);
    expect(p.missing.map((u) => u.uid)).toEqual(['cal']);
  });

  it('does not count the poster or a departed person toward the total or the got count', () => {
    const a = announcement({ gotIt: { ana: 't', ghost: 't', ben: 't' } });
    expect(gotItProgress(a, team)).toMatchObject({ got: 1, total: 3 });
  });
});

describe('openAnnouncements', () => {
  const older = announcement({ id: 'old', createdAt: '2026-11-17T10:00:00.000Z' });
  const newer = announcement({ id: 'new', createdAt: '2026-11-18T10:00:00.000Z' });

  it('lists what this person has not marked Got it, newest first', () => {
    expect(openAnnouncements([older, newer], 'ben').map((a) => a.id)).toEqual(['new', 'old']);
  });

  it('drops the ones this person already got', () => {
    const got = { ...newer, gotIt: { ben: '2026-11-18T11:00:00.000Z' } };
    expect(openAnnouncements([older, got], 'ben').map((a) => a.id)).toEqual(['old']);
    // …and someone else's Got it does not hide it from Ben.
    expect(openAnnouncements([{ ...newer, gotIt: { cal: 't' } }], 'ben')).toHaveLength(1);
  });

  it("leaves the poster's own announcement out of the poster's card", () => {
    expect(openAnnouncements([newer], 'ana')).toEqual([]);
  });

  it('sorts an announcement still waiting on its server timestamp first', () => {
    const pendingWrite = announcement({ id: 'now', createdAt: null });
    expect(openAnnouncements([older, pendingWrite], 'ben').map((a) => a.id)).toEqual(['now', 'old']);
  });
});

describe('yourAnnouncements', () => {
  const NOW = Date.parse('2026-11-18T12:00:00.000Z');

  it("is the poster's own, newest first, and nobody else's", () => {
    const mine = announcement({ id: 'm1', createdAt: '2026-11-17T10:00:00.000Z' });
    const mine2 = announcement({ id: 'm2', createdAt: '2026-11-18T10:00:00.000Z' });
    const theirs = announcement({ id: 't1', authorId: 'dee' });
    expect(yourAnnouncements([mine, theirs, mine2], 'ana', NOW).map((a) => a.id)).toEqual(['m2', 'm1']);
  });

  it('keeps one a week and drops older ones, so the list does not grow for ever', () => {
    const recent = announcement({ id: 'recent', createdAt: '2026-11-12T13:00:00.000Z' });
    const old = announcement({ id: 'old', createdAt: '2026-11-11T11:00:00.000Z' });
    expect(yourAnnouncements([old, recent], 'ana', NOW).map((a) => a.id)).toEqual(['recent']);
  });

  it('keeps one still waiting on its server timestamp', () => {
    const pendingWrite = announcement({ id: 'now', createdAt: null });
    expect(yourAnnouncements([pendingWrite], 'ana', NOW).map((a) => a.id)).toEqual(['now']);
  });
});

describe('announcementNotification', () => {
  it('addresses one person, names the poster, and opens home', () => {
    const n = announcementNotification(announcement({ id: 'a9' }), 'ben');
    expect(n).toEqual({
      userId: 'ben',
      title: 'Ana Admin posted an announcement',
      message: 'Retreat moves to Saturday',
      type: 'info',
      targetId: 'a9',
      link: '/',
    });
  });

  it('fits the bell: a long body is cut under the 512-character limit', () => {
    const n = announcementNotification(announcement({ body: 'x'.repeat(ANNOUNCEMENT_MAX_LENGTH) }), 'ben');
    expect(n.message.length).toBeLessThanOrEqual(200);
    expect(n.message.endsWith('…')).toBe(true);
  });
});
