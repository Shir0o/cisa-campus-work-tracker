import { describe, it, expect } from 'vitest';
import { traineeMyPeople, weighedInContactIds } from '../src/landing';
import type { ThreadMessageWithContact } from '../src/threads';
import type { Contact } from '../src/types';

const NOW = new Date('2026-07-13T12:00:00Z').getTime();
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

const message = (overrides: Partial<ThreadMessageWithContact> = {}): ThreadMessageWithContact => ({
  id: 'm1',
  contactId: 'c1',
  interactionId: null,
  from: 'ft',
  fromName: 'A Full-timer',
  kind: 'comment',
  body: '',
  at: new Date(NOW).toISOString(),
  reactions: [],
  ...overrides,
});

describe('traineeMyPeople', () => {
  it('keeps only contacts created by the trainee, longest-since-seen first', () => {
    const contacts = [
      contact({ id: 'mine-recent', createdBy: 'me', lastSeen: new Date(NOW - DAY_MS).toISOString() }),
      contact({ id: 'not-mine', createdBy: 'someone-else' }),
      contact({ id: 'mine-stale', createdBy: 'me', lastSeen: new Date(NOW - DAY_MS * 10).toISOString() }),
      contact({ id: 'partner-shared', createdBy: 'partner', coCreators: ['me'], lastSeen: new Date(NOW - DAY_MS * 5).toISOString() }),
    ];
    const result = traineeMyPeople(contacts, 'me', NOW);
    expect(result.map((p) => p.contact.id)).toEqual(['mine-stale', 'partner-shared', 'mine-recent']);
    expect(result[0].days).toBe(10);
    expect(result[1].days).toBe(5);
    expect(result[2].days).toBe(1);
  });

  it('falls back to createdAt when lastSeen is missing, and Infinity when both are', () => {
    const contacts = [
      contact({ id: 'via-created', createdBy: 'me', lastSeen: '', createdAt: new Date(NOW - DAY_MS * 3).toISOString() }),
      contact({ id: 'never', createdBy: 'me', lastSeen: '', createdAt: undefined }),
    ];
    const result = traineeMyPeople(contacts, 'me', NOW);
    expect(result.find((p) => p.contact.id === 'via-created')?.days).toBe(3);
    expect(result.find((p) => p.contact.id === 'never')?.days).toBe(Infinity);
  });

  it('returns nothing for a null/undefined uid', () => {
    expect(traineeMyPeople([contact({ createdBy: 'me' })], null, NOW)).toEqual([]);
    expect(traineeMyPeople([contact({ createdBy: 'me' })], undefined, NOW)).toEqual([]);
  });
});

describe('weighedInContactIds', () => {
  it('collects contact ids a full-timer has messaged on', () => {
    const threads = [
      message({ contactId: 'a', from: 'ft' }),
      message({ contactId: 'b', from: 'trainee' }),
      message({ contactId: 'c', from: 'ft' }),
    ];
    expect(weighedInContactIds(threads, ['ft'])).toEqual(new Set(['a', 'c']));
  });

  it('returns an empty set when there is no full-timer', () => {
    expect(weighedInContactIds([message({ contactId: 'a', from: 'ft' })], null)).toEqual(new Set());
  });
});
