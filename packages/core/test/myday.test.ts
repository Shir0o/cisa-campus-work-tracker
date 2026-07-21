import { describe, it, expect } from 'vitest';
import {
  DAY_MS,
  parseMs,
  daysSince,
  connectedLabel,
  getGreeting,
  agoLabel,
  lastTouchByContact,
  personalContactIdsOf,
  deriveLeaders,
  staleLeaderOf,
  splitTasks,
  DUE_PRESETS,
  duePresetToISO,
  presetForDue,
  dueChip,
  toLocalDate,
  thisWeekEvents,
  splitPrayers,
  type Touch,
} from '../src/myday';
import type { Contact, Event, PrayerRecord, Task } from '../src/types';

const NOW = new Date('2026-07-12T15:00:00Z').getTime(); // a Sunday

const contact = (overrides: Partial<Contact> = {}): Contact => ({
  id: 'c1',
  name: 'Alex',
  role: '',
  location: '',
  email: '',
  phone: '',
  stage: '',
  lastSeen: '',
  initials: 'A',
  ...overrides,
});

describe('date helpers', () => {
  it('parses ISO strings to ms, tolerating empty/invalid input', () => {
    expect(parseMs(undefined)).toBeNull();
    expect(parseMs(null)).toBeNull();
    expect(parseMs('not a date')).toBeNull();
    expect(parseMs('2026-07-01T00:00:00Z')).toBe(new Date('2026-07-01T00:00:00Z').getTime());
  });

  it('computes whole days since a timestamp, floored at 0', () => {
    expect(daysSince(NOW, NOW)).toBe(0);
    expect(daysSince(NOW - DAY_MS, NOW)).toBe(1);
    expect(daysSince(NOW - DAY_MS * 2.9, NOW)).toBe(2);
    expect(daysSince(NOW + DAY_MS, NOW)).toBe(0); // future clamps to 0
  });

  it('labels days-since-connected', () => {
    expect(connectedLabel(0)).toBe('Connected today');
    expect(connectedLabel(1)).toBe('Last connected yesterday');
    expect(connectedLabel(5)).toBe('Last connected 5 days ago');
  });

  it('greets by time of day', () => {
    expect(getGreeting(new Date('2026-07-12T08:00:00').getTime())).toBe('Good morning');
    expect(getGreeting(new Date('2026-07-12T14:00:00').getTime())).toBe('Good afternoon');
    expect(getGreeting(new Date('2026-07-12T20:00:00').getTime())).toBe('Good evening');
  });

  it('labels how long ago an ISO date was', () => {
    expect(agoLabel(new Date(NOW).toISOString(), NOW)).toBe('0 days ago');
    expect(agoLabel(new Date(NOW - DAY_MS).toISOString(), NOW)).toBe('1 day ago');
    expect(agoLabel(new Date(NOW - DAY_MS * 3).toISOString(), NOW)).toBe('3 days ago');
    expect(agoLabel(null, NOW)).toBe('0 days ago');
  });
});

describe('your sheep (leaders)', () => {
  it('keeps only the latest touch per contact', () => {
    const touches: Touch[] = [
      { contactId: 'c1', ms: 100, note: 'old' },
      { contactId: 'c1', ms: 200, note: 'new' },
      { contactId: 'c2', ms: 50, note: 'only' },
    ];
    const map = lastTouchByContact(touches);
    expect(map.get('c1')).toEqual({ ms: 200, note: 'new' });
    expect(map.get('c2')).toEqual({ ms: 50, note: 'only' });
  });

  it('resolves personal contacts: explicit prefs override created-by-me', () => {
    const contacts = [contact({ id: 'c1', createdBy: 'me' }), contact({ id: 'c2', createdBy: 'them' })];
    expect(personalContactIdsOf(['c2'], contacts, 'me')).toEqual(new Set(['c2']));
    expect(personalContactIdsOf(null, contacts, 'me')).toEqual(new Set(['c1']));
    expect(personalContactIdsOf(undefined, contacts, null)).toEqual(new Set());
  });

  it('derives leaders sorted longest-since-connected first', () => {
    const contacts = [
      contact({ id: 'c1', createdAt: new Date(NOW - DAY_MS * 3).toISOString() }),
      contact({ id: 'c2', createdAt: new Date(NOW - DAY_MS * 10).toISOString() }),
    ];
    const personalIds = new Set(['c1', 'c2']);
    const leaders = deriveLeaders(contacts, personalIds, [], NOW);
    expect(leaders.map((l) => l.contact.id)).toEqual(['c2', 'c1']);
    expect(leaders[0].days).toBe(10);
  });

  it('prefers a touch over createdAt, and falls back to contact notes', () => {
    const contacts = [contact({ id: 'c1', createdAt: new Date(NOW).toISOString(), notes: 'fallback note' })];
    const touches: Touch[] = [{ contactId: 'c1', ms: NOW - DAY_MS * 4, note: 'touch note' }];
    const [leader] = deriveLeaders(contacts, new Set(['c1']), touches, NOW);
    expect(leader.days).toBe(4);
    expect(leader.note).toBe('touch note');

    const [leaderNoTouch] = deriveLeaders(contacts, new Set(['c1']), [], NOW);
    expect(leaderNoTouch.note).toBe('fallback note');
  });

  it('a contact with no createdAt and no touch has Infinity days (excluded from stale)', () => {
    const contacts = [contact({ id: 'c1' })];
    const [leader] = deriveLeaders(contacts, new Set(['c1']), [], NOW);
    expect(leader.days).toBe(Infinity);
    expect(staleLeaderOf([leader])).toBeUndefined();
  });

  it('flags the stale leader at >= 7 days', () => {
    const leaders = [
      { contact: contact({ id: 'c1' }), days: 6, note: '' },
      { contact: contact({ id: 'c2' }), days: 7, note: '' },
    ];
    expect(staleLeaderOf(leaders)?.contact.id).toBe('c2');
    expect(staleLeaderOf([leaders[0]])).toBeUndefined();
  });
});

describe('on the horizon (tasks)', () => {
  const task = (overrides: Partial<Task> = {}): Task => ({
    id: overrides.id ?? 't1',
    title: 'Task',
    priority: 'medium',
    status: 'pending',
    ...overrides,
  });

  it('splits assigned (sourced or from someone else) vs personal (mine, sourceless)', () => {
    const tasks = [
      task({ id: 'a', sourceDocId: 'doc1', createdById: 'me' }),
      task({ id: 'b', createdById: 'someone-else' }),
      task({ id: 'c', createdById: 'me' }),
      task({ id: 'd', status: 'canceled', createdById: 'me' }),
    ];
    const { assignedTasks, personalTasks, leftToDo } = splitTasks(tasks, 'me');
    expect(assignedTasks.map((t) => t.id)).toEqual(['a', 'b']);
    expect(personalTasks.map((t) => t.id)).toEqual(['c']);
    expect(leftToDo).toBe(3); // pending, excludes canceled
  });

  it('sorts done-last, then due-date ascending', () => {
    const tasks = [
      task({ id: 'done', status: 'completed', createdById: 'me', dueDate: '2026-01-01' }),
      task({ id: 'later', createdById: 'me', dueDate: '2026-08-01' }),
      task({ id: 'sooner', createdById: 'me', dueDate: '2026-07-13' }),
      task({ id: 'nodue', createdById: 'me' }),
    ];
    const { personalTasks } = splitTasks(tasks, 'me');
    expect(personalTasks.map((t) => t.id)).toEqual(['sooner', 'later', 'nodue', 'done']);
  });
});

describe('due-date presets', () => {
  it('resolves a preset to an ISO date N local days out', () => {
    expect(duePresetToISO(null)).toBeNull();
    expect(duePresetToISO(0)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('finds the best-fit preset for an existing due date', () => {
    expect(presetForDue(null)).toBe('none');
    expect(presetForDue(duePresetToISO(0)!)).toBe('today');
    expect(presetForDue(duePresetToISO(1)!)).toBe('tomorrow');
    expect(presetForDue(duePresetToISO(5)!)).toBe('week');
    expect(presetForDue('2099-01-01')).toBe('custom');
  });

  it('DUE_PRESETS has the four expected options', () => {
    expect(DUE_PRESETS.map((p) => p.key)).toEqual(['today', 'tomorrow', 'week', 'none']);
  });

  it('chips a due date into a label + semantic tone', () => {
    expect(dueChip(null)).toBeNull();
    expect(dueChip(duePresetToISO(0)!)).toEqual({ label: 'Due today', tone: 'soon' });
    expect(dueChip(duePresetToISO(1)!)).toEqual({ label: 'Due tomorrow', tone: 'soon' });
    const overdue = new Date();
    overdue.setDate(overdue.getDate() - 3);
    expect(dueChip(overdue.toISOString().slice(0, 10))).toEqual({ label: 'Overdue', tone: 'overdue' });
  });

  it('parses a bare yyyy-MM-dd as a local-day date, not UTC midnight', () => {
    // A naive `new Date('2026-07-21')` is UTC midnight, which is the previous
    // day in any behind-UTC timezone — toLocalDate must not do that.
    const d = toLocalDate('2026-07-21');
    expect(d).not.toBeNull();
    expect(d!.getFullYear()).toBe(2026);
    expect(d!.getMonth()).toBe(6); // 0-indexed: July
    expect(d!.getDate()).toBe(21);
    expect(toLocalDate(null)).toBeNull();
    expect(toLocalDate(undefined)).toBeNull();
  });
});

describe('your week (events)', () => {
  const event = (overrides: Partial<Event> = {}): Event => ({
    id: overrides.id ?? 'e1',
    name: 'Gathering',
    date: overrides.date ?? new Date(NOW).toISOString(),
    order: 0,
    createdAt: '',
    ...overrides,
  });

  it('keeps events within [now-1d, now+7d], soonest first', () => {
    const events = [
      event({ id: 'past', date: new Date(NOW - DAY_MS * 5).toISOString() }),
      event({ id: 'yesterday', date: new Date(NOW - DAY_MS * 0.5).toISOString() }),
      event({ id: 'soon', date: new Date(NOW + DAY_MS).toISOString() }),
      event({ id: 'later', date: new Date(NOW + DAY_MS * 3).toISOString() }),
      event({ id: 'toofar', date: new Date(NOW + DAY_MS * 10).toISOString() }),
    ];
    const result = thisWeekEvents(events, NOW);
    expect(result.map((x) => x.ev.id)).toEqual(['yesterday', 'soon', 'later']);
  });

  it('breaks ties by event order', () => {
    const sameDay = new Date(NOW + DAY_MS).toISOString();
    const events = [
      event({ id: 'second', date: sameDay, order: 2 }),
      event({ id: 'first', date: sameDay, order: 1 }),
    ];
    const result = thisWeekEvents(events, NOW);
    expect(result.map((x) => x.ev.id)).toEqual(['first', 'second']);
  });

  it('drops events with an unparseable date', () => {
    const events = [event({ id: 'bad', date: 'not a date' })];
    expect(thisWeekEvents(events, NOW)).toEqual([]);
  });
});

describe('your prayers', () => {
  const prayer = (overrides: Partial<PrayerRecord> = {}): PrayerRecord => ({
    id: overrides.id ?? 'p1',
    contactId: 'c1',
    date: new Date(NOW).toISOString(),
    burden: '',
    status: 'pending',
    updatedAt: '',
    ...overrides,
  });

  it('keeps contact prayers on personal contacts, excluding unanswered, oldest first', () => {
    const prayers = [
      prayer({ id: 'newer', contactId: 'c1', date: new Date(NOW).toISOString() }),
      prayer({ id: 'older', contactId: 'c1', date: new Date(NOW - DAY_MS).toISOString() }),
      prayer({ id: 'not-mine', contactId: 'c2' }),
      prayer({ id: 'unanswered', contactId: 'c1', status: 'unanswered' }),
    ];
    const { contactPrayers, prayersCount } = splitPrayers(prayers, new Set(['c1']), []);
    expect(contactPrayers.map((p) => p.id)).toEqual(['older', 'newer']);
    expect(prayersCount).toBe(2);
  });

  it('drops archived personal prayers and counts the rest', () => {
    const personalPrayers = [
      { id: 'pp1', title: 'a', date: '', status: 'open' as const },
      { id: 'pp2', title: 'b', date: '', status: 'archived' as const },
    ];
    const { activePersonalPrayers, prayersCount } = splitPrayers([], new Set(), personalPrayers);
    expect(activePersonalPrayers.map((p) => p.id)).toEqual(['pp1']);
    expect(prayersCount).toBe(1);
  });
});
