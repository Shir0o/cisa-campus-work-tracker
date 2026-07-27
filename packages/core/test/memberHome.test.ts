import { describe, it, expect } from 'vitest';
import {
  MEMBER_TABS,
  announcementRows,
  inviteMessage,
  memberAsks,
  memberEventSub,
  memberFoot,
  memberGreeting,
  memberIntro,
  memberPrayerGroups,
  memberRoleOf,
  memberSenderName,
  memberUpcoming,
  memberWhenWords,
  noteFromTheTeam,
  teamHolding,
} from '../src/memberHome';
import type { PersonalPrayer } from '../src/myday';
import type {
  ChatMessage,
  ChatRoom,
  Contact,
  Event,
  PrayerRecord,
  PrayerRequest,
} from '../src/types';

const NOW = new Date('2026-07-15T09:00:00Z').getTime(); // a Wednesday
const DAY_MS = 86_400_000;
const iso = (offsetDays: number) => new Date(NOW + offsetDays * DAY_MS).toISOString();
// A bare yyyy-MM-dd N days out — the shape an Event.date carries.
const day = (offsetDays: number) => new Date(NOW + offsetDays * DAY_MS).toISOString().slice(0, 10);

const event = (overrides: Partial<Event> = {}): Event => ({
  id: 'e1',
  name: 'Friday Night',
  date: day(2),
  order: 0,
  type: 'Gathering',
  location: 'Hillside 204',
  createdAt: iso(-30),
  ...overrides,
});

const room = (overrides: Partial<ChatRoom> = {}): ChatRoom => ({
  id: 'r1',
  type: 'direct',
  memberIds: ['me', 'ft1'],
  createdById: 'ft1',
  createdByName: 'Mei Tanaka',
  createdAt: iso(-30),
  lastMessage: {
    text: 'Thinking of you this week.',
    senderId: 'ft1',
    senderName: 'Mei Tanaka',
    timestamp: iso(-1),
  },
  ...overrides,
});

const personalPrayer = (overrides: Partial<PersonalPrayer> = {}): PersonalPrayer => ({
  id: 'pp1',
  title: 'Daniel — midterms are wrecking him',
  date: iso(-4),
  status: 'open',
  ...overrides,
});

const request = (overrides: Partial<PrayerRequest> = {}): PrayerRequest => ({
  id: 'pr1',
  uid: 'me',
  name: 'Lila Chen',
  body: 'A job after graduation',
  status: 'open',
  createdAt: iso(-2),
  updatedAt: iso(-2),
  ...overrides,
});

const prayer = (overrides: Partial<PrayerRecord> = {}): PrayerRecord => ({
  id: 'p1',
  contactId: 'c1',
  date: iso(-3),
  burden: 'A job before graduation',
  status: 'pending',
  updatedAt: iso(-3),
  ...overrides,
});

const contact = (overrides: Partial<Contact> = {}): Contact => ({
  id: 'c1',
  name: 'Rio Alvarez',
  role: '',
  location: '',
  email: '',
  phone: '',
  stage: 'Growing',
  lastSeen: iso(-3),
  initials: 'RA',
  ...overrides,
});

const message = (overrides: Partial<ChatMessage> = {}): ChatMessage => ({
  id: 'm1',
  roomId: 'r1',
  text: 'hi',
  senderId: 'ft1',
  senderName: 'Mei Tanaka',
  timestamp: iso(0),
  type: 'text',
  ...overrides,
});

// ── the header ─────────────────────────────────────────────────────────────

describe('the header copy', () => {
  it('greets a student and a community member differently', () => {
    expect(memberGreeting('student', 'Lila Chen')).toBe('Hi Lila.');
    expect(memberGreeting('community', 'Grace Okafor')).toBe('Hello, Grace.');
  });

  it('falls back to "Someone" rather than an empty greeting', () => {
    expect(memberGreeting('student', '')).toBe('Hi Someone.');
  });

  it('says something honest and different to each role', () => {
    expect(memberIntro('student')).toContain("You're welcome at any of it");
    expect(memberIntro('community')).toContain('room at your table');
    expect(memberFoot('student')).toBe('You belong here — exactly as you are today.');
    expect(memberFoot('community')).toBe('Thank you for making room for these students.');
  });

  it('names the tabs per role — a student has a Today, a guest has a What\'s on', () => {
    expect(MEMBER_TABS.student[0]).toBe('Today');
    expect(MEMBER_TABS.community[0]).toBe("What's on");
    expect(MEMBER_TABS.student.slice(1)).toEqual(['Prayer', 'Messages', 'You']);
  });
});

describe('memberRoleOf', () => {
  it('names the member app a role opens', () => {
    expect(memberRoleOf('operator')).toBe('student');
    expect(memberRoleOf('viewer')).toBe('community');
  });

  it('is null for staff, so they keep their own screens', () => {
    expect(memberRoleOf('admin')).toBeNull();
    expect(memberRoleOf('manager')).toBeNull();
  });

  it('is null before the role has loaded', () => {
    expect(memberRoleOf(null)).toBeNull();
    expect(memberRoleOf(undefined)).toBeNull();
  });
});

// ── when something is ──────────────────────────────────────────────────────

describe('memberWhenWords', () => {
  it('reads today and tomorrow as words', () => {
    expect(memberWhenWords(day(0), NOW)).toBe('today');
    expect(memberWhenWords(day(1), NOW)).toBe('tomorrow');
  });

  it('names the weekday inside the week', () => {
    expect(memberWhenWords(day(2), NOW)).toBe('Friday');
    expect(memberWhenWords(day(6), NOW)).toBe('Tuesday');
  });

  it('counts the days once it is further out', () => {
    expect(memberWhenWords(day(9), NOW)).toBe('in 9 days');
  });

  it('says "already been" for something past', () => {
    expect(memberWhenWords(day(-1), NOW)).toBe('already been');
  });

  it('reads a bare yyyy-MM-dd as a LOCAL day, not UTC midnight', () => {
    // The whole reason this goes through toLocalDate: `new Date('2026-07-15')`
    // is UTC midnight, which is the 14th anywhere behind UTC.
    const noon = new Date('2026-07-15T12:00:00').getTime();
    expect(memberWhenWords('2026-07-15', noon)).toBe('today');
  });

  it('is empty for a date it cannot read', () => {
    expect(memberWhenWords('', NOW)).toBe('');
  });
});

describe('memberUpcoming', () => {
  it('puts the soonest thing in the hero and the rest underneath', () => {
    const a = event({ id: 'a', date: day(1) });
    const b = event({ id: 'b', date: day(4) });
    const c = event({ id: 'c', date: day(8) });
    const { next, rest } = memberUpcoming([c, a, b], NOW);
    expect(next?.id).toBe('a');
    expect(rest.map((e) => e.id)).toEqual(['b', 'c']);
  });

  it('shows at most three under the hero', () => {
    const events = [0, 1, 2, 3, 4, 5].map((i) => event({ id: `e${i}`, date: day(i + 1) }));
    expect(memberUpcoming(events, NOW).rest).toHaveLength(3);
  });

  it('has no hero when nothing is coming up', () => {
    expect(memberUpcoming([], NOW)).toEqual({ next: null, rest: [] });
  });

  it('keeps today\'s event on the hero even though the day has started, and drops what is well past', () => {
    // upcomingEventsForRsvp's grace window is `now - DAY_MS`, measured against
    // the date's UTC midnight — so today is still "upcoming" all day.
    expect(memberUpcoming([event({ date: day(0) })], NOW).next?.id).toBe('e1');
    expect(memberUpcoming([event({ date: day(-3) })], NOW).next).toBeNull();
  });
});

describe('memberEventSub', () => {
  it('reads type · location', () => {
    expect(memberEventSub(event())).toBe('Gathering · Hillside 204');
  });

  it('drops whichever half is missing', () => {
    expect(memberEventSub(event({ type: undefined }))).toBe('Hillside 204');
    expect(memberEventSub(event({ location: '' }))).toBe('Gathering');
    expect(memberEventSub(event({ type: undefined, location: '' }))).toBe('');
  });
});

// ── a note from the team ───────────────────────────────────────────────────

describe('noteFromTheTeam', () => {
  it('finds the newest direct message a full-timer sent me', () => {
    const note = noteFromTheTeam([room()], 'me', ['ft1']);
    expect(note).toEqual({
      roomId: 'r1',
      fromUid: 'ft1',
      fromName: 'Mei Tanaka',
      body: 'Thinking of you this week.',
      at: iso(-1),
    });
  });

  it('prefers the most recent of several', () => {
    const older = room();
    const newer = room({
      id: 'r2',
      memberIds: ['me', 'ft2'],
      lastMessage: { text: 'Newer', senderId: 'ft2', senderName: 'Jordan Park', timestamp: iso(0) },
    });
    expect(noteFromTheTeam([older, newer], 'me', ['ft1', 'ft2'])?.roomId).toBe('r2');
  });

  it('ignores a message I sent myself', () => {
    const mine = room({
      lastMessage: { text: 'Hey', senderId: 'me', senderName: 'Lila', timestamp: iso(0) },
    });
    expect(noteFromTheTeam([mine], 'me', ['ft1'])).toBeNull();
  });

  it('ignores a direct chat with someone who is not on the team', () => {
    const peer = room({
      memberIds: ['me', 'student2'],
      lastMessage: { text: 'yo', senderId: 'student2', senderName: 'Sam', timestamp: iso(0) },
    });
    expect(noteFromTheTeam([peer], 'me', ['ft1'])).toBeNull();
  });

  it('ignores groups and announcements — a note is a note', () => {
    expect(noteFromTheTeam([room({ type: 'group' })], 'me', ['ft1'])).toBeNull();
    expect(noteFromTheTeam([room({ type: 'announcement' })], 'me', ['ft1'])).toBeNull();
  });

  it('is null with no room, no message, or no signed-in user', () => {
    expect(noteFromTheTeam([], 'me', ['ft1'])).toBeNull();
    expect(noteFromTheTeam([room({ lastMessage: undefined })], 'me', ['ft1'])).toBeNull();
    expect(noteFromTheTeam([room()], null, ['ft1'])).toBeNull();
  });
});

// ── announcements ──────────────────────────────────────────────────────────

describe('announcementRows', () => {
  const ann = (overrides: Partial<ChatRoom> = {}) =>
    room({
      id: 'a1',
      type: 'announcement',
      name: 'Weekly notes',
      memberIds: ['me', 'ft1'],
      ...overrides,
    });

  it('lists the announcements I am in, newest first', () => {
    const older = ann();
    const newer = ann({
      id: 'a2',
      name: 'Campus updates',
      lastMessage: { text: 'Later', senderId: 'ft1', senderName: 'Mei', timestamp: iso(0) },
    });
    expect(announcementRows([older, newer], 'me', () => false).map((r) => r.roomId)).toEqual([
      'a2',
      'a1',
    ]);
  });

  it('carries the unread flag through from the caller', () => {
    const rows = announcementRows([ann()], 'me', (r) => r.id === 'a1');
    expect(rows[0].unread).toBe(true);
  });

  it('falls back to "Announcement" when the room was never named', () => {
    expect(announcementRows([ann({ name: '' })], 'me', () => false)[0].name).toBe('Announcement');
  });

  it('leaves out empty rooms, rooms I am not in, and other room kinds', () => {
    expect(announcementRows([ann({ lastMessage: undefined })], 'me', () => false)).toEqual([]);
    expect(announcementRows([ann({ memberIds: ['ft1'] })], 'me', () => false)).toEqual([]);
    expect(announcementRows([room({ type: 'group' })], 'me', () => false)).toEqual([]);
  });

  it('is empty with no signed-in user', () => {
    expect(announcementRows([ann()], null, () => false)).toEqual([]);
  });
});

// ── prayer ─────────────────────────────────────────────────────────────────

describe('memberPrayerGroups', () => {
  it('splits the people on your heart into open and looking back', () => {
    const groups = memberPrayerGroups([
      personalPrayer(),
      personalPrayer({ id: 'pp2', status: 'answered' }),
    ]);
    expect(groups.open.map((p) => p.id)).toEqual(['pp1']);
    expect(groups.answered.map((p) => p.id)).toEqual(['pp2']);
  });

  it('hides an archived row from both, as the landing already does', () => {
    const groups = memberPrayerGroups([personalPrayer({ status: 'archived' })]);
    expect(groups.open).toEqual([]);
    expect(groups.answered).toEqual([]);
  });

  it('is two empty lists when there is nobody yet', () => {
    expect(memberPrayerGroups([])).toEqual({ open: [], answered: [] });
  });
});

describe('memberAsks', () => {
  it('splits my own asks and puts the newest first', () => {
    const groups = memberAsks([
      request(),
      request({ id: 'pr2', createdAt: iso(0) }),
      request({ id: 'pr3', status: 'answered', createdAt: iso(-5) }),
    ]);
    expect(groups.open.map((r) => r.id)).toEqual(['pr2', 'pr1']);
    expect(groups.answered.map((r) => r.id)).toEqual(['pr3']);
  });

  it('does not mutate what it was given', () => {
    const list = [request(), request({ id: 'pr2', createdAt: iso(0) })];
    memberAsks(list);
    expect(list.map((r) => r.id)).toEqual(['pr1', 'pr2']);
  });

  it('is two empty lists when nothing has been asked', () => {
    expect(memberAsks([])).toEqual({ open: [], answered: [] });
  });
});

describe('teamHolding', () => {
  it('names the person, never the contact id', () => {
    expect(teamHolding([prayer()], [contact()])).toEqual([
      { prayerId: 'p1', who: 'Rio', burden: 'A job before graduation' },
    ]);
  });

  it('shows the newest first', () => {
    const rows = teamHolding(
      [prayer(), prayer({ id: 'p2', date: iso(0), burden: 'Newer' })],
      [contact()],
    );
    expect(rows.map((r) => r.prayerId)).toEqual(['p2', 'p1']);
  });

  it('leaves out answered and unanswered prayers', () => {
    expect(teamHolding([prayer({ status: 'answered' })], [contact()])).toEqual([]);
    expect(teamHolding([prayer({ status: 'unanswered' })], [contact()])).toEqual([]);
  });

  it('drops a prayer with no name behind it — names, not cases', () => {
    expect(teamHolding([prayer({ contactId: 'gone' })], [contact()])).toEqual([]);
  });

  it('caps the window rather than handing over a caseload', () => {
    const many = Array.from({ length: 10 }, (_, i) => prayer({ id: `p${i}`, date: iso(-i) }));
    expect(teamHolding(many, [contact()])).toHaveLength(6);
    expect(teamHolding(many, [contact()], 2)).toHaveLength(2);
  });
});

// ── bringing someone with you ──────────────────────────────────────────────

describe('inviteMessage', () => {
  it('writes the invitation as "come with me"', () => {
    expect(inviteMessage(event(), NOW)).toBe(
      "Hey — I'm going to Friday Night Friday at Hillside 204. Come with me?",
    );
  });

  it('leaves the place out when the event has none', () => {
    expect(inviteMessage(event({ location: '' }), NOW)).toBe(
      "Hey — I'm going to Friday Night Friday. Come with me?",
    );
  });

  it('still says something warm when nothing is on the calendar', () => {
    expect(inviteMessage(null, NOW)).toBe('Come along to something with me this week?');
  });
});

// ── messages ───────────────────────────────────────────────────────────────

describe('memberSenderName', () => {
  it('says "You" for my own message and a first name for everyone else', () => {
    expect(memberSenderName(message({ senderId: 'me' }), 'me')).toBe('You');
    expect(memberSenderName(message(), 'me')).toBe('Mei');
  });

  it('falls back to "Someone" rather than an empty name', () => {
    expect(memberSenderName(message({ senderName: '' }), 'me')).toBe('Someone');
  });
});
