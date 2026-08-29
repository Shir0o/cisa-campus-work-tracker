import { describe, it, expect } from 'vitest';
import { buildHistoryRows, dayInfo, historyStaff, humanize, peopleRemembered } from '../src/history';
import type { Hist } from '../src/history';

const NOW = new Date('2026-07-13T12:00:00Z').getTime(); // Monday
const DAY_MS = 86_400_000;

const activity = (overrides: Partial<Hist> = {}): Hist => ({
  id: 'a1',
  user: 'Jane Doe',
  action: 'did something',
  target: 'Contact Name',
  contactId: 'c1',
  type: 'edit',
  createdAt: new Date(NOW).toISOString(),
  ...overrides,
});

describe('humanize', () => {
  it('reads a stage move with a from/to description', () => {
    const h = humanize(
      activity({ action: 'Moved contact to stage "Regular attender"', description: 'from Newcomer to Regular attender' }),
    );
    expect(h).toMatchObject({ bucket: 'steps', lead: 'walked', tail: 'a step further', showTarget: true });
    expect(h.detail).toBe('A step forward — from Newcomer toward Regular attender.');
  });

  it('reads contact creation and deletion', () => {
    expect(humanize(activity({ action: 'Created a new contact' }))).toMatchObject({ bucket: 'steps', lead: 'welcomed' });
    expect(humanize(activity({ action: 'Deleted contact' }))).toMatchObject({ bucket: 'steps', lead: 'let go of' });
  });

  it('reads prayer burdens started, edited, and marked', () => {
    expect(humanize(activity({ action: 'Added a prayer burden for Jane', description: 'needs wisdom' }))).toMatchObject({
      bucket: 'prayer',
      lead: 'started praying for',
      detail: 'Began carrying "needs wisdom".',
    });
    expect(humanize(activity({ action: 'Edited a prayer burden for Jane', description: 'more context' }))).toMatchObject({
      bucket: 'prayer',
      lead: 'added to a prayer for',
      detail: '"more context"',
    });
    expect(humanize(activity({ action: 'Marked a prayer burden as answered for Jane' }))).toMatchObject({
      bucket: 'prayer',
      lead: 'gave thanks for an answered prayer for',
      detail: 'Answered, after carrying it together.',
    });
    expect(humanize(activity({ action: 'Marked a prayer burden as ongoing for Jane' }))).toMatchObject({
      bucket: 'prayer',
      lead: 'updated a prayer for',
      detail: 'Now marked ongoing.',
    });
  });

  it('picks a lead verb by interaction type', () => {
    expect(humanize(activity({ action: 'Logged an interaction for Jane', type: 'call' })).lead).toBe('called');
    expect(humanize(activity({ action: 'Logged an interaction for Jane', type: 'email' })).lead).toBe('emailed');
    expect(humanize(activity({ action: 'Logged an interaction for Jane', type: 'event' })).lead).toBe('met with');
    expect(humanize(activity({ action: 'Logged an interaction for Jane', type: 'comment' })).lead).toBe('left a note for');
    expect(humanize(activity({ action: 'Logged an interaction for Jane', type: 'edit' })).lead).toBe('spent time with');
  });

  it('reads interaction updates, comments, and tags', () => {
    expect(humanize(activity({ action: 'Updated an interaction for Jane' }))).toMatchObject({
      bucket: 'talk',
      lead: 'updated a conversation with',
    });
    expect(humanize(activity({ action: 'Deleted an interaction for Jane' }))).toMatchObject({
      bucket: 'talk',
      lead: 'removed a conversation with',
    });
    expect(humanize(activity({ action: 'Left a comment on Jane', description: 'checking in' }))).toMatchObject({
      bucket: 'talk',
      lead: 'left a note for',
      detail: '"checking in"',
    });
    expect(humanize(activity({ action: 'Added a tag for Jane' })).lead).toBe('added a tag for');
    expect(humanize(activity({ action: 'Removed a tag from Jane' })).lead).toBe('removed a tag from');
  });

  it('reads gathering attendance and feedback', () => {
    expect(humanize(activity({ action: 'Updated attendance for "Sunday gathering" to Present for' }))).toMatchObject({
      bucket: 'gather',
      lead: 'noted who gathered at',
    });
    expect(humanize(activity({ action: 'Submitted feedback', description: 'loved it' }))).toMatchObject({
      bucket: 'talk',
      lead: 'shared some feedback',
      showTarget: false,
      detail: '"loved it"',
    });
  });

  it('falls back to the raw action for unmapped verbs', () => {
    const h = humanize(activity({ action: 'Did something unusual', contactId: 'c1' }));
    expect(h).toMatchObject({ bucket: 'talk', lead: 'Did something unusual', showTarget: true });

    const noContact = humanize(activity({ action: 'Did something unusual', contactId: undefined }));
    expect(noContact.showTarget).toBe(false);
  });
});

describe('dayInfo', () => {
  it('labels today, yesterday, this-week, and older dates', () => {
    expect(dayInfo(new Date(NOW).toISOString(), NOW).label).toBe('Today');
    expect(dayInfo(new Date(NOW - DAY_MS).toISOString(), NOW).label).toBe('Yesterday');
    expect(dayInfo(new Date(NOW - 3 * DAY_MS).toISOString(), NOW).label).toBe(
      new Date(NOW - 3 * DAY_MS).toLocaleDateString(undefined, { weekday: 'long' }),
    );
    expect(dayInfo(new Date(NOW - 10 * DAY_MS).toISOString(), NOW).label).toBe(
      new Date(NOW - 10 * DAY_MS).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }),
    );
  });

  it('handles invalid or empty dates gracefully in dayInfo', () => {
    expect(dayInfo('')).toEqual({ label: '', sub: '' });
    expect(dayInfo('invalid-date')).toEqual({ label: '', sub: '' });
    expect(dayInfo(null as any)).toEqual({ label: '', sub: '' });
    expect(dayInfo(undefined as any)).toEqual({ label: '', sub: '' });
  });
});

describe('historyStaff / peopleRemembered', () => {
  it('collects distinct sorted staff names and distinct touched contacts', () => {
    const activities = [
      activity({ id: 'a1', user: 'Zoe', contactId: 'c1' }),
      activity({ id: 'a2', user: 'Amir', contactId: 'c2' }),
      activity({ id: 'a3', user: 'Amir', contactId: 'c1' }),
      activity({ id: 'a4', user: 'Zoe', contactId: undefined, action: 'Submitted feedback' }),
    ];
    expect(historyStaff(activities)).toEqual(['Amir', 'Zoe']);
    expect(peopleRemembered(activities)).toBe(2);
  });
});

describe('buildHistoryRows', () => {
  const today = activity({ id: 'today', user: 'Zoe', createdAt: new Date(NOW).toISOString(), action: 'Logged an interaction for Jane', type: 'call' });
  const alsoToday = activity({ id: 'also-today', user: 'Amir', createdAt: new Date(NOW - 3600_000).toISOString(), action: 'Added a prayer burden for Jane' });
  const yesterday = activity({ id: 'yesterday', user: 'Zoe', createdAt: new Date(NOW - DAY_MS).toISOString(), action: 'Submitted feedback', contactId: undefined });
  const activities = [today, alsoToday, yesterday];

  it('inserts one date marker per day and keeps items newest-first as given', () => {
    const rows = buildHistoryRows(activities, { kind: 'all', who: 'all' });
    expect(rows.map((r) => r.key)).toEqual([
      expect.stringMatching(/^d:/),
      'today',
      'also-today',
      expect.stringMatching(/^d:/),
      'yesterday',
    ]);
  });

  it('filters by kind', () => {
    const rows = buildHistoryRows(activities, { kind: 'prayer', who: 'all' });
    const items = rows.filter((r) => r.type === 'item');
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ a: { id: 'also-today' } });
  });

  it('filters by who', () => {
    const rows = buildHistoryRows(activities, { kind: 'all', who: 'Amir' });
    const items = rows.filter((r) => r.type === 'item');
    expect(items.map((r) => (r as { a: Hist }).a.id)).toEqual(['also-today']);
  });

  it('filters by free-text search across user/action/target/description', () => {
    const rows = buildHistoryRows(activities, { kind: 'all', who: 'all', q: 'feedback' });
    const items = rows.filter((r) => r.type === 'item');
    expect(items.map((r) => (r as { a: Hist }).a.id)).toEqual(['yesterday']);
  });
});
