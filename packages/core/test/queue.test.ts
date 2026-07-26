import { describe, it, expect } from 'vitest';
import {
  QUEUE_PREF_DEFAULTS,
  buildQueue,
  dueInDays,
  isOnCampus,
  personColor,
  queueDates,
  queueWeek,
  type QueueInput,
} from '../src/queue';
import type { ThreadMessageWithContact } from '../src/threads';
import type { Contact, Event, Interaction, PrayerRecord, Task } from '../src/types';

const NOW = new Date('2026-07-15T09:00:00Z').getTime(); // a Wednesday
const DAY_MS = 86_400_000;
const iso = (offsetDays: number) => new Date(NOW + offsetDays * DAY_MS).toISOString();

const contact = (overrides: Partial<Contact> = {}): Contact => ({
  id: 'c1',
  name: 'Rio Alvarez',
  role: '',
  location: '',
  email: '',
  phone: '',
  stage: '',
  lastSeen: iso(0),
  initials: 'RA',
  createdBy: 'me',
  ...overrides,
});

const task = (overrides: Partial<Task> = {}): Task => ({
  id: 't1',
  title: 'Check in with Rio',
  priority: 'medium',
  status: 'pending',
  assigneeId: 'me',
  ...overrides,
});

const message = (overrides: Partial<ThreadMessageWithContact> = {}): ThreadMessageWithContact => ({
  id: 'm1',
  contactId: 'c1',
  interactionId: null,
  from: 'ft',
  fromName: 'Mei Tanaka',
  kind: 'question',
  body: 'How did coffee go with Rio?',
  at: iso(-1),
  reactions: [],
  ...overrides,
});

const prayer = (overrides: Partial<PrayerRecord> = {}): PrayerRecord => ({
  id: 'p1',
  contactId: 'c1',
  date: iso(-3),
  burden: 'Her grandmother is ill',
  status: 'pending',
  updatedAt: iso(-3),
  ...overrides,
});

const interaction = (overrides: Partial<Interaction> = {}): Interaction => ({
  id: 'i1',
  contactId: 'c1',
  content: 'Coffee after class.',
  dateTime: iso(-4),
  type: 'coffee',
  createdAt: iso(-4),
  userId: 'me',
  ...overrides,
});

const input = (overrides: Partial<QueueInput> = {}): QueueInput => ({
  uid: 'me',
  fullTimer: 'ft',
  contacts: [],
  tasks: [],
  threads: [],
  interactions: [],
  prayers: [],
  isRead: () => false,
  handled: {},
  later: {},
  now: NOW,
  ...overrides,
});

describe('buildQueue — card kinds', () => {
  it('makes a due card for a to-do assigned to me and due within a day', () => {
    const q = buildQueue(
      input({
        tasks: [
          task({ id: 'due-today', dueDate: iso(0), sourceDocTitle: 'Friday Night — week 8' }),
          task({ id: 'due-later', dueDate: iso(5) }),
          task({ id: 'someone-else', dueDate: iso(0), assigneeId: 'other' }),
          task({ id: 'already-done', dueDate: iso(0), status: 'completed' }),
        ],
      }),
    );

    expect(q.map((c) => c.id)).toEqual(['todo:due-today']);
    expect(q[0]).toMatchObject({
      kind: 'due',
      group: 0,
      label: 'Due today',
      ago: 'from Friday Night — week 8',
    });
  });

  it('labels an overdue and a tomorrow to-do distinctly', () => {
    const q = buildQueue(
      input({ tasks: [task({ id: 'a', dueDate: iso(-2) }), task({ id: 'b', dueDate: iso(1) })] }),
    );
    expect(q.map((c) => c.label)).toEqual(['Overdue', 'Due tomorrow']);
  });

  it('makes a msg card only for unacknowledged messages from my full-timer', () => {
    const q = buildQueue(
      input({
        contacts: [contact()],
        threads: [
          message({ id: 'unread' }),
          message({ id: 'read-already' }),
          message({ id: 'from-someone-else', from: 'other' }),
          message({ id: 'wrong-kind', kind: 'note' }),
        ],
        isRead: (id) => id === 'thread:read-already',
      }),
    );

    expect(q.map((c) => c.id)).toEqual(['ftmsg:unread']);
    expect(q[0]).toMatchObject({ kind: 'msg', group: 1, label: 'Mei asked you something' });
    expect(q[0].contact?.id).toBe('c1');
  });

  it('makes a follow card for a to-do with a person on it and no imminent due date', () => {
    const q = buildQueue(
      input({
        contacts: [contact()],
        tasks: [task({ id: 'promised', contactId: 'c1', dueDate: iso(6) })],
        interactions: [interaction()],
      }),
    );

    expect(q.map((c) => c.id)).toEqual(['task:promised']);
    expect(q[0]).toMatchObject({ kind: 'follow', group: 2, label: "You said you'd follow up" });
    expect(q[0].ago).toBe('had coffee 4 days ago');
  });

  it('makes a quiet card for my people past the quiet threshold, and never doubles up with a follow', () => {
    const q = buildQueue(
      input({
        contacts: [
          contact({ id: 'quiet-one', name: 'Lila Chen', lastSeen: iso(-9) }),
          contact({ id: 'seen-today', name: 'Kofi Mensah', lastSeen: iso(0) }),
          contact({ id: 'promised-already', name: 'Rio Alvarez', lastSeen: iso(-12) }),
          contact({ id: 'not-mine', name: 'Someone Else', lastSeen: iso(-30), createdBy: 'other' }),
        ],
        tasks: [task({ id: 'p', contactId: 'promised-already', dueDate: iso(6) })],
      }),
    );

    expect(q.map((c) => c.id)).toEqual(['task:p', 'quiet:quiet-one']);
    expect(q[1]).toMatchObject({ kind: 'quiet', group: 2, label: "It's gone quiet", ago: '9 days quiet' });
  });

  it('caps quiet people at quietMax, longest-quiet first', () => {
    const q = buildQueue(
      input({
        contacts: [
          contact({ id: 'a', lastSeen: iso(-4) }),
          contact({ id: 'b', lastSeen: iso(-20) }),
          contact({ id: 'c', lastSeen: iso(-11) }),
        ],
      }),
    );
    expect(q.map((c) => c.id)).toEqual(['quiet:b', 'quiet:c']);
  });

  it('makes a pray card, newest first, capped by prefs', () => {
    const q = buildQueue(
      input({
        contacts: [contact()],
        prayers: [prayer({ id: 'old', date: iso(-30) }), prayer({ id: 'new', date: iso(-1) })],
      }),
      { ...QUEUE_PREF_DEFAULTS, prayers: 1 },
    );

    expect(q.map((c) => c.id)).toEqual(['pray:new']);
    expect(q[0]).toMatchObject({ kind: 'pray', group: 3, label: 'Pray for Rio' });
  });

  it('carries only open prayers — an answered one belongs on the Answered wall', () => {
    const q = buildQueue(
      input({
        contacts: [contact()],
        prayers: [
          prayer({ id: 'open', status: 'pending' }),
          prayer({ id: 'ongoing', status: 'ongoing' }),
          prayer({ id: 'answered', status: 'answered' }),
        ],
      }),
    );
    expect(q.map((c) => c.id).sort()).toEqual(['pray:ongoing', 'pray:open']);
  });
});

describe('buildQueue — order and state', () => {
  const busy = () =>
    input({
      contacts: [contact({ id: 'c1', lastSeen: iso(-9) })],
      tasks: [task({ id: 'due', dueDate: iso(0) }), task({ id: 'promise', contactId: 'c1', dueDate: iso(9) })],
      threads: [message()],
      prayers: [prayer()],
    });

  it('sorts due → full-timer message → follow-ups/quiet → prayers', () => {
    expect(buildQueue(busy()).map((c) => c.kind)).toEqual(['due', 'msg', 'follow', 'pray']);
  });

  it('drops handled cards and pushes "later" cards to the back in the order they were deferred', () => {
    const q = buildQueue({
      ...busy(),
      handled: { 'ftmsg:m1': 1 },
      later: { 'todo:due': 200, 'task:promise': 100 },
    });
    expect(q.map((c) => c.id)).toEqual(['pray:p1', 'task:promise', 'todo:due']);
  });
});

describe('buildQueue — the day cap', () => {
  // 1 due to-do + 4 messages + 3 follow-ups + 3 prayers = 11 cards.
  const many = () =>
    input({
      contacts: Array.from({ length: 3 }, (_, i) => contact({ id: `c${i}`, lastSeen: iso(0) })),
      tasks: [
        task({ id: 'due', dueDate: iso(0) }),
        ...Array.from({ length: 3 }, (_, i) => task({ id: `f${i}`, contactId: `c${i}`, dueDate: iso(9) })),
      ],
      threads: Array.from({ length: 4 }, (_, i) => message({ id: `m${i}`, at: iso(-i) })),
      prayers: Array.from({ length: 3 }, (_, i) => prayer({ id: `p${i}`, date: iso(-i) })),
    });

  it('holds nothing when uncapped', () => {
    const q = buildQueue(many(), { ...QUEUE_PREF_DEFAULTS, dayCap: 0 });
    expect(q).toHaveLength(11);
    expect(q.held).toBe(0);
  });

  it('trims to the cap at the default and reports what is waiting', () => {
    const q = buildQueue(many());
    expect(q).toHaveLength(8);
    expect(q.held).toBe(3);
  });

  it('never holds back a to-do that is actually due', () => {
    const q = buildQueue(many(), { ...QUEUE_PREF_DEFAULTS, dayCap: 1, prayers: 3 });
    // The cap keeps 1, but group 0 is a promise and rides along regardless — here
    // it is already first, so the shape to check is that it survives at cap 1.
    expect(q.map((c) => c.id)).toContain('todo:due');
    expect(q).toHaveLength(1);

    // Deferring it proves the rule: even pushed to the back it is not held.
    const deferred = buildQueue({ ...many(), later: { 'todo:due': 1 } }, {
      ...QUEUE_PREF_DEFAULTS,
      dayCap: 1,
    });
    expect(deferred.map((c) => c.id)).toContain('todo:due');
    expect(deferred).toHaveLength(2);
    expect(deferred.held).toBe(9);
  });
});

describe('queue helpers', () => {
  it('counts due days from midnight, not from the clock', () => {
    expect(dueInDays(iso(0), NOW)).toBe(0);
    expect(dueInDays(new Date(NOW + DAY_MS).toISOString(), NOW)).toBe(1);
    expect(dueInDays(new Date(NOW - 3 * DAY_MS).toISOString(), NOW)).toBe(-3);
    expect(dueInDays(null, NOW)).toBeNull();
  });

  it('gives a person the same colour every time', () => {
    expect(personColor('c1')).toBe(personColor('c1'));
    expect(personColor('')).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('keeps recurring gatherings out of the end-of-queue dates', () => {
    const event = (o: Partial<Event>): Event => ({
      id: 'e',
      name: 'Something',
      date: iso(3),
      order: 0,
      createdAt: iso(-30),
      ...o,
    });
    const dates = queueDates(
      [
        event({ id: 'weekly', name: 'Friday Night', type: 'Gathering', isRecurring: true }),
        event({ id: 'retreat', name: 'Spring retreat', type: 'Retreat', location: 'Big Bear' }),
        event({ id: 'past', name: 'Old outreach', type: 'Outreach', date: iso(-10) }),
        event({ id: 'club', name: 'Club rush', type: 'Special', date: iso(1) }),
      ],
      NOW,
    );
    expect(dates.map((d) => d.id)).toEqual(['club', 'retreat']);
    expect(dates[1].sub).toBe('Retreat · Big Bear');
  });

  it('looks back only at what I logged in the last week', () => {
    const week = queueWeek(
      [
        interaction({ id: 'mine-recent', dateTime: iso(-2) }),
        interaction({ id: 'mine-old', dateTime: iso(-30) }),
        interaction({ id: 'theirs', dateTime: iso(-1), userId: 'other' }),
      ],
      'me',
      NOW,
    );
    expect(week.map((i) => i.id)).toEqual(['mine-recent']);
  });

  it('knows when the on-campus window is open', () => {
    // NOW is a Wednesday 09:00 UTC — outside 12–3 in UTC, so pin the check to
    // an explicit local hour instead of relying on the runner's zone.
    const wed2pm = new Date(2026, 6, 15, 14, 0, 0).getTime();
    const wed9am = new Date(2026, 6, 15, 9, 0, 0).getTime();
    const mon2pm = new Date(2026, 6, 13, 14, 0, 0).getTime();
    expect(isOnCampus(undefined, wed2pm)).toBe(true);
    expect(isOnCampus(undefined, wed9am)).toBe(false);
    expect(isOnCampus(undefined, mon2pm)).toBe(false);
  });
});
