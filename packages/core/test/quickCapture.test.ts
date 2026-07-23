import { describe, it, expect } from 'vitest';
import { format } from 'date-fns';
import {
  quickCaptureRecents,
  quickCaptureSearchMatches,
  reminderDueDate,
  reminderNotificationTrigger,
  reminderNotificationContent,
} from '../src/quickCapture';
import type { Touch } from '../src/myday';
import type { Contact } from '../src/types';

const NOW = new Date('2026-07-20T12:00:00Z').getTime();
const DAY_MS = 86_400_000;

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

const touch = (overrides: Partial<Touch> = {}): Touch => ({
  contactId: 'c1',
  ms: NOW,
  note: '',
  ...overrides,
});

describe('quickCaptureRecents', () => {
  it('sorts most-recently-touched first (opposite of Directory)', () => {
    const contacts = [contact({ id: 'stale' }), contact({ id: 'recent' })];
    const touches: Touch[] = [
      touch({ contactId: 'stale', ms: NOW - DAY_MS * 10 }),
      touch({ contactId: 'recent', ms: NOW - DAY_MS }),
    ];
    const result = quickCaptureRecents(contacts, touches, null, 6, NOW);
    expect(result.map((r) => r.contact.id)).toEqual(['recent', 'stale']);
    expect(result[0].days).toBe(1);
    expect(result[1].days).toBe(10);
  });

  it('puts contacts the caller created first, ahead of more-recent touches', () => {
    const contacts = [
      contact({ id: 'mine', createdBy: 'me' }),
      contact({ id: 'others', createdBy: 'someone-else' }),
    ];
    const touches: Touch[] = [
      touch({ contactId: 'mine', ms: NOW - DAY_MS * 5 }),
      touch({ contactId: 'others', ms: NOW - DAY_MS }),
    ];
    const result = quickCaptureRecents(contacts, touches, 'me', 6, NOW);
    expect(result.map((r) => r.contact.id)).toEqual(['mine', 'others']);
  });

  it('falls back to createdAt, then Infinity, for contacts with no touch', () => {
    const contacts = [
      contact({ id: 'never-touched-no-createdAt' }),
      contact({ id: 'created-only', createdAt: new Date(NOW - DAY_MS * 2).toISOString() }),
    ];
    const result = quickCaptureRecents(contacts, [], null, 6, NOW);
    expect(result.find((r) => r.contact.id === 'created-only')?.days).toBe(2);
    expect(result.find((r) => r.contact.id === 'never-touched-no-createdAt')?.days).toBe(Infinity);
  });

  it('caps at the limit', () => {
    const contacts = Array.from({ length: 10 }, (_, i) => contact({ id: `c${i}` }));
    expect(quickCaptureRecents(contacts, [], null, 6, NOW)).toHaveLength(6);
  });
});

describe('quickCaptureSearchMatches', () => {
  const contacts = [contact({ id: 'a', name: 'Mei Lin' }), contact({ id: 'b', name: 'Sam Cho' })];

  it('matches case-insensitively against name', () => {
    expect(quickCaptureSearchMatches(contacts, 'mei').map((c) => c.id)).toEqual(['a']);
  });

  it('returns nothing for an empty query', () => {
    expect(quickCaptureSearchMatches(contacts, '')).toEqual([]);
    expect(quickCaptureSearchMatches(contacts, '   ')).toEqual([]);
  });

  it('caps at the limit', () => {
    const many = Array.from({ length: 10 }, (_, i) => contact({ id: `c${i}`, name: `Match ${i}` }));
    expect(quickCaptureSearchMatches(many, 'match', 8)).toHaveLength(8);
  });
});

describe('reminderDueDate', () => {
  it('returns a bare yyyy-MM-dd date, not a full ISO datetime', () => {
    // A full ISO datetime (~24 chars) silently fails the deployed `tasks`
    // rule's 20-char cap on dueDate — reproduced live as a "Missing or
    // insufficient permissions" error the first time a reminder was set.
    expect(reminderDueDate('tom', NOW)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(reminderDueDate('week', NOW).length).toBeLessThanOrEqual(20);
  });

  it('resolves the three fixed presets +1/+3/+7 days apart from each other', () => {
    // Date-only ISO strings parse as UTC midnight regardless of local
    // timezone, so this stays reliable wherever the tests run.
    const tom = new Date(reminderDueDate('tom', NOW)).getTime();
    const few = new Date(reminderDueDate('few', NOW)).getTime();
    const week = new Date(reminderDueDate('week', NOW)).getTime();
    expect(Math.round((few - tom) / DAY_MS)).toBe(2);
    expect(Math.round((week - tom) / DAY_MS)).toBe(6);
  });
});

describe('reminderNotificationTrigger', () => {
  it('lands on the same day reminderDueDate resolves to, at 9 AM local', () => {
    const trigger = reminderNotificationTrigger('tom', NOW);
    const dueDate = reminderDueDate('tom', NOW);
    expect(format(trigger, 'yyyy-MM-dd')).toBe(dueDate);
    expect(trigger.getHours()).toBe(9);
    expect(trigger.getMinutes()).toBe(0);
  });

  it('resolves the three fixed presets +1/+3/+7 days apart, same as reminderDueDate', () => {
    const tom = reminderNotificationTrigger('tom', NOW).getTime();
    const few = reminderNotificationTrigger('few', NOW).getTime();
    const week = reminderNotificationTrigger('week', NOW).getTime();
    expect(Math.round((few - tom) / DAY_MS)).toBe(2);
    expect(Math.round((week - tom) / DAY_MS)).toBe(6);
  });
});

describe('reminderNotificationContent', () => {
  it('uses the reminder title as the notification title and contact name as body', () => {
    expect(reminderNotificationContent('Follow up with Alex', 'Alex')).toEqual({
      title: 'Follow up with Alex',
      body: 'Alex',
    });
  });
});
