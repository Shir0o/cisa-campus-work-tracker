import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Contact, Interaction } from '../types';
import type { InteractionSuggestion } from '../lib/bnpb';

const hoisted = vi.hoisted(() => {
  let seq = 0;
  const batch = {
    set: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    commit: vi.fn().mockResolvedValue(undefined),
  };
  return {
    batch,
    nextId: () => `generated-${++seq}`,
    mockOnSnapshot: vi.fn((_query?: unknown, callback?: unknown) => {
      if (typeof callback === 'function') (callback as (snap: unknown) => void)({ docs: [] });
      return vi.fn();
    }),
  };
});

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((...args: unknown[]) => ({ path: args.filter((a) => typeof a === 'string').join('/') })),
  doc: vi.fn((...args: unknown[]) => {
    const parts = args.filter((a) => typeof a === 'string');
    if (parts.length > 0) return { path: parts.join('/'), id: parts[parts.length - 1] };
    const ref = args.find((a) => a && typeof a === 'object' && 'path' in a) as { path: string } | undefined;
    return { path: ref?.path ?? 'collection', id: hoisted.nextId() };
  }),
  writeBatch: vi.fn(() => hoisted.batch),
  onSnapshot: hoisted.mockOnSnapshot,
  query: vi.fn((...args: unknown[]) => ({ args })),
  orderBy: vi.fn((...args: unknown[]) => ({ args })),
  serverTimestamp: vi.fn(() => ({ __ts: true })),
  deleteField: vi.fn(() => ({ __delete: true })),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { CREATE: 'CREATE', UPDATE: 'UPDATE' },
}));

import {
  INTERACTION_SUGGESTIONS_SUBCOLLECTION,
  NOT_A_CISA_PERSON_SUBCOLLECTION,
  SUGGESTION_LINKS_SUBCOLLECTION,
  assignContactToSuggestions,
  buildSuggestionQueue,
  calendarDay,
  confirmSuggestion,
  dismissSuggestion,
  findSameDayInteraction,
  formatDurationMinutes,
  isContactVisible,
  markNotACisaPerson,
  matchSuggestion,
  mediumToType,
  monthKey,
  nameSimilarity,
  normalizeName,
  orderPendingSuggestions,
  subscribeContactInteractions,
  subscribePendingSuggestions,
  subscribeSuggestionLinks,
  undoSuggestionDismiss,
  undoNotACisaPerson,
} from '../lib/bnpb';

const contact = (over: Partial<Contact> = {}): Contact => ({
  id: 'c1',
  name: 'Alex Chen',
  location: '',
  email: '',
  phone: '',
  stage: 'Lead',
  lastSeen: '',
  initials: 'AC',
  ...over,
});

const suggestion = (over: Partial<InteractionSuggestion> = {}): InteractionSuggestion => ({
  id: 'sug-1',
  syncId: 's1',
  bnpbContactId: 'p-1',
  bnpbName: 'Alex Chen',
  occurredAt: '2026-09-10T15:00:00.000Z',
  durationMinutes: 45,
  summary: 'Coffee downtown',
  medium: 'coffee',
  text: 'Coffee downtown',
  status: 'pending',
  ...over,
});

describe('mediumToType', () => {
  it('maps the known media and falls back to interaction', () => {
    expect(mediumToType('call')).toBe('call');
    expect(mediumToType('Phone Call')).toBe('call');
    expect(mediumToType('email')).toBe('email');
    expect(mediumToType('text')).toBe('chat');
    expect(mediumToType('message')).toBe('chat');
    expect(mediumToType('Chat')).toBe('chat');
    expect(mediumToType('coffee')).toBe('meeting');
    expect(mediumToType('meal')).toBe('meeting');
    expect(mediumToType('meeting')).toBe('meeting');
    expect(mediumToType('in person')).toBe('meeting');
    expect(mediumToType('letter')).toBe('interaction');
  });
});

describe('formatDurationMinutes', () => {
  it('renders the tracker duration string', () => {
    expect(formatDurationMinutes(undefined)).toBeUndefined();
    expect(formatDurationMinutes(null)).toBeUndefined();
    expect(formatDurationMinutes(45)).toBe('45 min');
    expect(formatDurationMinutes(60)).toBe('1h');
    expect(formatDurationMinutes(90)).toBe('1h 30m');
  });
});

describe('orderPendingSuggestions', () => {
  it('keeps only pending suggestions, newest first', () => {
    const list = [
      suggestion({ id: 'old', occurredAt: '2026-09-01T10:00:00.000Z' }),
      suggestion({ id: 'new', occurredAt: '2026-09-20T10:00:00.000Z' }),
      suggestion({ id: 'done', occurredAt: '2026-09-30T10:00:00.000Z', status: 'confirmed' }),
    ];
    expect(orderPendingSuggestions(list).map((s) => s.id)).toEqual(['new', 'old']);
  });
});

describe('calendarDay', () => {
  it('reads the leading calendar day from date-only and full timestamps', () => {
    expect(calendarDay('2026-09-10')).toBe('2026-09-10');
    expect(calendarDay('2026-09-10T15:00:00.000Z')).toBe('2026-09-10');
    expect(calendarDay('nonsense')).toBeNull();
  });
});

describe('findSameDayInteraction', () => {
  const interaction = (over: Partial<Interaction> = {}): Interaction => ({
    id: 'i1',
    userId: 'u1',
    userName: 'Owner',
    content: 'Called about the retreat',
    dateTime: '2026-09-10',
    createdAt: '2026-09-10T00:00:00.000Z',
    type: 'call',
    ...over,
  });

  it('finds the owner interaction on the same calendar day', () => {
    const found = findSameDayInteraction([interaction()], 'u1', '2026-09-10T15:00:00.000Z');
    expect(found?.id).toBe('i1');
  });

  it('ignores another person logged on that contact that day', () => {
    const list = [interaction({ userId: 'someone-else' })];
    expect(findSameDayInteraction(list, 'u1', '2026-09-10T15:00:00.000Z')).toBeNull();
  });

  it('ignores a same-contact interaction on a different day', () => {
    expect(findSameDayInteraction([interaction({ dateTime: '2026-09-09' })], 'u1', '2026-09-10')).toBeNull();
  });

  it('returns the latest match when several fall on the day', () => {
    const list = [
      interaction({ id: 'early', dateTime: '2026-09-10T08:00:00.000Z' }),
      interaction({ id: 'late', dateTime: '2026-09-10T18:00:00.000Z' }),
    ];
    expect(findSameDayInteraction(list, 'u1', '2026-09-10')?.id).toBe('late');
  });

  it('returns null when the suggestion has no usable day', () => {
    expect(findSameDayInteraction([interaction()], 'u1', 'not-a-date')).toBeNull();
    expect(findSameDayInteraction([], 'u1', '2026-09-10')).toBeNull();
  });
});

describe('isContactVisible', () => {
  it('shows anyone to non-trainees and only tied contacts to a trainee', () => {
    expect(isContactVisible('admin', 'u1', contact({ createdBy: 'other' }))).toBe(true);
    expect(isContactVisible('operator', 'u1', contact({ createdBy: 'other' }))).toBe(true);
    expect(isContactVisible('manager', 'u1', contact({ createdBy: 'other' }))).toBe(false);
    expect(isContactVisible('manager', 'u1', contact({ createdBy: 'u1' }))).toBe(true);
    expect(isContactVisible('manager', 'u1', null)).toBe(false);
  });
});

describe('confirmSuggestion', () => {
  beforeEach(() => {
    hoisted.batch.set.mockClear();
    hoisted.batch.update.mockClear();
    hoisted.batch.commit.mockClear();
  });

  it('writes the interaction, marks the suggestion confirmed and records the link', async () => {
    await confirmSuggestion({
      uid: 'u1',
      user: { uid: 'u1', displayName: 'Owner', photoURL: '', email: 'owner@example.com' },
      role: 'admin',
      suggestion: suggestion(),
      contact: contact({ id: 'c1' }),
      text: '  Coffee and a walk  ',
    });

    expect(hoisted.batch.commit).toHaveBeenCalledTimes(1);
    const sets = hoisted.batch.set.mock.calls.map(([ref, data]) => ({ path: ref.path, data }));
    const interaction = sets.find((s) => s.path === 'contacts/c1/interactions');
    expect(interaction).toBeTruthy();
    expect(interaction!.data).toMatchObject({
      userId: 'u1',
      content: 'Coffee and a walk',
      dateTime: '2026-09-10T15:00:00.000Z',
      type: 'meeting',
      duration: '45 min',
    });
    const link = sets.find((s) => s.path.startsWith(`users/u1/${SUGGESTION_LINKS_SUBCOLLECTION}/`));
    expect(link).toBeTruthy();
    expect(link!.data).toMatchObject({ bnpbContactId: 'p-1', contactId: 'c1' });

    const [updateRef, updateData] = hoisted.batch.update.mock.calls[0];
    expect(updateRef.path).toBe(`users/u1/${INTERACTION_SUGGESTIONS_SUBCOLLECTION}/sug-1`);
    expect(updateData).toMatchObject({ status: 'confirmed', contactId: 'c1', text: 'Coffee and a walk' });
  });

  it('refuses to confirm onto a contact the person cannot see', async () => {
    await expect(
      confirmSuggestion({
        uid: 'u1',
        user: { uid: 'u1', displayName: 'Owner' },
        role: 'manager',
        suggestion: suggestion(),
        contact: contact({ id: 'c1', createdBy: 'someone-else' }),
        text: 'text',
      }),
    ).rejects.toThrow(/visible/i);
    expect(hoisted.batch.commit).not.toHaveBeenCalled();
  });
});

describe('dismissSuggestion', () => {
  beforeEach(() => {
    hoisted.batch.set.mockClear();
    hoisted.batch.update.mockClear();
    hoisted.batch.commit.mockClear();
  });

  it('sets the suggestion dismissed as a single dismissal', async () => {
    await dismissSuggestion({ uid: 'u1', suggestion: suggestion() });

    const [ref, data] = hoisted.batch.update.mock.calls[0];
    expect(ref.path).toBe(`users/u1/${INTERACTION_SUGGESTIONS_SUBCOLLECTION}/sug-1`);
    expect(data).toMatchObject({ status: 'dismissed', dismissedBy: 'single' });
    expect(hoisted.batch.commit).toHaveBeenCalledTimes(1);
  });
});

describe('undoSuggestionDismiss', () => {
  beforeEach(() => {
    hoisted.batch.update.mockClear();
    hoisted.batch.commit.mockClear();
  });

  it('restores a single dismissal to pending', async () => {
    await undoSuggestionDismiss({ uid: 'u1', suggestionId: 'sug-1' });

    const [ref, data] = hoisted.batch.update.mock.calls[0];
    expect(ref.path).toBe(`users/u1/${INTERACTION_SUGGESTIONS_SUBCOLLECTION}/sug-1`);
    expect(data.status).toBe('pending');
    expect(hoisted.batch.commit).toHaveBeenCalledTimes(1);
  });
});

describe('markNotACisaPerson', () => {
  beforeEach(() => {
    hoisted.batch.set.mockClear();
    hoisted.batch.update.mockClear();
    hoisted.batch.commit.mockClear();
  });

  it('records the choice and dismisses every pending suggestion for that BNPB contact', async () => {
    const list = [
      suggestion({ id: 'a', bnpbContactId: 'p-1' }),
      suggestion({ id: 'b', bnpbContactId: 'p-1' }),
      suggestion({ id: 'c', bnpbContactId: 'p-2' }),
      suggestion({ id: 'd', bnpbContactId: 'p-1', status: 'confirmed' }),
    ];

    const restored = await markNotACisaPerson({ uid: 'u1', bnpbContactId: 'p-1', suggestions: list });

    expect(restored).toEqual(['a', 'b']);
    const choice = hoisted.batch.set.mock.calls.find(([ref]) =>
      ref.path.startsWith(`users/u1/${NOT_A_CISA_PERSON_SUBCOLLECTION}/`),
    );
    expect(choice).toBeTruthy();
    expect(choice![1]).toMatchObject({ bnpbContactId: 'p-1' });

    const updates = hoisted.batch.update.mock.calls.map(([ref, data]) => ({ path: ref.path, data }));
    expect(updates.map((u) => u.path)).toEqual([
      `users/u1/${INTERACTION_SUGGESTIONS_SUBCOLLECTION}/a`,
      `users/u1/${INTERACTION_SUGGESTIONS_SUBCOLLECTION}/b`,
    ]);
    expect(updates[0].data).toMatchObject({ status: 'dismissed', dismissedBy: 'notACisaPerson' });
    expect(hoisted.batch.commit).toHaveBeenCalledTimes(1);
  });
});

describe('undoNotACisaPerson', () => {
  beforeEach(() => {
    hoisted.batch.update.mockClear();
    hoisted.batch.delete.mockClear();
    hoisted.batch.commit.mockClear();
  });

  it('removes the choice and restores exactly the suggestions it dismissed', async () => {
    await undoNotACisaPerson({ uid: 'u1', bnpbContactId: 'p-1', suggestionIds: ['a', 'b'] });

    expect(hoisted.batch.delete).toHaveBeenCalledTimes(1);
    const deletedRef = hoisted.batch.delete.mock.calls[0][0];
    expect(deletedRef.path.startsWith(`users/u1/${NOT_A_CISA_PERSON_SUBCOLLECTION}/`)).toBe(true);

    const updates = hoisted.batch.update.mock.calls;
    expect(updates.map(([ref]) => ref.path)).toEqual([
      `users/u1/${INTERACTION_SUGGESTIONS_SUBCOLLECTION}/a`,
      `users/u1/${INTERACTION_SUGGESTIONS_SUBCOLLECTION}/b`,
    ]);
    expect(updates[0][1].status).toBe('pending');
    expect(hoisted.batch.commit).toHaveBeenCalledTimes(1);
  });
});

describe('subscribePendingSuggestions', () => {
  beforeEach(() => hoisted.mockOnSnapshot.mockClear());

  it('streams pending suggestions newest first', () => {
    hoisted.mockOnSnapshot.mockImplementationOnce((_query: unknown, callback: unknown) => {
      (callback as (snap: unknown) => void)({
        docs: [
          { id: 'done', data: () => ({ ...suggestion({ id: 'done', status: 'confirmed' }) }) },
          { id: 'old', data: () => ({ ...suggestion({ id: 'old', occurredAt: '2026-09-01T10:00:00.000Z' }) }) },
          { id: 'new', data: () => ({ ...suggestion({ id: 'new', occurredAt: '2026-09-20T10:00:00.000Z' }) }) },
        ],
      });
      return vi.fn();
    });

    const seen: InteractionSuggestion[] = [];
    const unsub = subscribePendingSuggestions(
      'u1',
      (list) => seen.push(...list),
      () => {},
    );
    expect(hoisted.mockOnSnapshot).toHaveBeenCalledTimes(1);
    expect(seen.map((s) => s.id)).toEqual(['new', 'old']);
    expect(typeof unsub).toBe('function');
  });
});

describe('subscribeContactInteractions', () => {
  beforeEach(() => hoisted.mockOnSnapshot.mockClear());

  it('streams the selected contact interactions', () => {
    hoisted.mockOnSnapshot.mockImplementationOnce((_query: unknown, callback: unknown) => {
      (callback as (snap: unknown) => void)({
        docs: [
          {
            id: 'i1',
            data: () => ({ userId: 'u1', content: 'Called', dateTime: '2026-09-10', type: 'call' }),
          },
        ],
      });
      return vi.fn();
    });

    const seen: Interaction[][] = [];
    const unsub = subscribeContactInteractions(
      'c1',
      (list) => seen.push(list),
      () => {},
    );
    expect(seen[0][0]).toMatchObject({ id: 'i1', content: 'Called', dateTime: '2026-09-10' });
    expect(typeof unsub).toBe('function');
  });
});

describe('normalizeName and nameSimilarity', () => {
  it('normalises case, accents and punctuation', () => {
    expect(normalizeName('  José  O’Brien ')).toBe('jose o brien');
  });

  it('treats a whole-name containment as a strong short-name guess', () => {
    expect(nameSimilarity('Alex', 'Alex Chen')).toBeGreaterThanOrEqual(0.9);
  });

  it('scores a typo high and a distant name low', () => {
    expect(nameSimilarity('Alx Chen', 'Alex Chen')).toBeGreaterThan(0.7);
    expect(nameSimilarity('Bob Smith', 'Alex Chen')).toBeLessThan(0.7);
  });
});

describe('monthKey', () => {
  it('reads the year and month from a timestamp', () => {
    expect(monthKey('2026-09-10T15:00:00.000Z')).toBe('2026-09');
    expect(monthKey('nonsense')).toBe('unknown');
  });
});

describe('matchSuggestion', () => {
  const contacts = [
    contact({ id: 'c1', name: 'Alex Chen' }),
    contact({ id: 'c2', name: 'Bea Diaz' }),
  ];
  const base = { contacts, links: new Map<string, string>(), role: 'admin', uid: 'u1' };

  it('prefers the chosen contact stored on the suggestion', () => {
    const match = matchSuggestion({ ...base, suggestion: suggestion({ contactId: 'c2' }) });
    expect(match.basis).toBe('chosen');
    expect(match.contact?.id).toBe('c2');
  });

  it('uses a remembered link ahead of the written name', () => {
    const match = matchSuggestion({
      ...base,
      links: new Map([['p-1', 'c2']]),
      suggestion: suggestion(),
    });
    expect(match.basis).toBe('remembered');
    expect(match.contact?.id).toBe('c2');
  });

  it('falls through a link to a contact the owner can no longer see', () => {
    const hidden = contact({ id: 'c2', name: 'Bea Diaz', createdBy: 'someone-else' });
    const match = matchSuggestion({
      contacts: [contact({ id: 'c1', name: 'Alex Chen', createdBy: 'u1' }), hidden],
      links: new Map([['p-1', 'c2']]),
      role: 'manager',
      uid: 'u1',
      suggestion: suggestion(),
    });
    expect(match.basis).toBe('exact');
    expect(match.contact?.id).toBe('c1');
  });

  it('matches an exact name case- and accent-insensitively', () => {
    const match = matchSuggestion({ ...base, suggestion: suggestion({ bnpbName: 'alex chen' }) });
    expect(match.basis).toBe('exact');
    expect(match.contact?.id).toBe('c1');
  });

  it('offers a fuzzy best guess for a near name', () => {
    const match = matchSuggestion({ ...base, suggestion: suggestion({ bnpbName: 'Alx Chen' }) });
    expect(match.basis).toBe('guess');
    expect(match.contact?.id).toBe('c1');
  });

  it('leaves a distant name unmatched', () => {
    const match = matchSuggestion({ ...base, suggestion: suggestion({ bnpbName: 'Zoe Quinn' }) });
    expect(match.basis).toBe('unmatched');
    expect(match.contact).toBeNull();
  });

  it('only matches contacts the owner can see', () => {
    const hidden = contact({ id: 'c3', name: 'Alx Chen', createdBy: 'other' });
    const match = matchSuggestion({
      contacts: [contact({ id: 'c1', name: 'Alex Chen', createdBy: 'u1' }), hidden],
      links: new Map(),
      role: 'manager',
      uid: 'u1',
      suggestion: suggestion({ bnpbName: 'Alx Chen' }),
    });
    expect(match.contact?.id).toBe('c1');
  });
});

describe('buildSuggestionQueue', () => {
  const contacts = [contact({ id: 'c1', name: 'Alex Chen' })];

  it('lists matched suggestions newest first under month dividers', () => {
    const list = [
      suggestion({ id: 'aug', occurredAt: '2026-08-05T10:00:00.000Z' }),
      suggestion({ id: 'sep-old', occurredAt: '2026-09-01T10:00:00.000Z' }),
      suggestion({ id: 'sep-new', occurredAt: '2026-09-20T10:00:00.000Z' }),
    ];
    const queue = buildSuggestionQueue({
      suggestions: list,
      contacts,
      links: new Map(),
      role: 'admin',
      uid: 'u1',
    });
    expect(queue.ready.map((section) => section.month)).toEqual(['2026-09', '2026-08']);
    expect(queue.ready[0].items.map((item) => item.suggestion.id)).toEqual(['sep-new', 'sep-old']);
    expect(queue.whoIsThis).toEqual([]);
  });

  it('groups unmatched suggestions by BNPB contact with count, latest date and samples', () => {
    const list = [
      suggestion({
        id: 'a',
        bnpbContactId: 'p-9',
        bnpbName: 'Zoe Quinn',
        occurredAt: '2026-09-01T10:00:00.000Z',
        summary: 'Older',
      }),
      suggestion({
        id: 'b',
        bnpbContactId: 'p-9',
        bnpbName: 'Zoe Quinn',
        occurredAt: '2026-09-20T10:00:00.000Z',
        summary: 'Newer',
      }),
      suggestion({
        id: 'c',
        bnpbContactId: 'p-8',
        bnpbName: 'Sam Poe',
        occurredAt: '2026-09-10T10:00:00.000Z',
        summary: 'Middle',
      }),
    ];
    const queue = buildSuggestionQueue({
      suggestions: list,
      contacts,
      links: new Map(),
      role: 'admin',
      uid: 'u1',
    });
    expect(queue.ready).toEqual([]);
    expect(queue.whoIsThis.map((group) => group.bnpbContactId)).toEqual(['p-9', 'p-8']);
    const zoe = queue.whoIsThis[0];
    expect(zoe.count).toBe(2);
    expect(zoe.latestOccurredAt).toBe('2026-09-20T10:00:00.000Z');
    expect(zoe.samples.map((s) => s.id)).toEqual(['b', 'a']);
    expect(zoe.suggestions.map((s) => s.id)).toEqual(['b', 'a']);
  });

  it('splits matched from unmatched across both sections', () => {
    const list = [
      suggestion({ id: 'matched', bnpbName: 'Alex Chen', occurredAt: '2026-09-20T10:00:00.000Z' }),
      suggestion({ id: 'who', bnpbName: 'Zoe Quinn', occurredAt: '2026-09-19T10:00:00.000Z' }),
    ];
    const queue = buildSuggestionQueue({
      suggestions: list,
      contacts,
      links: new Map(),
      role: 'admin',
      uid: 'u1',
    });
    expect(queue.ready[0].items.map((i) => i.suggestion.id)).toEqual(['matched']);
    expect(queue.whoIsThis.map((g) => g.suggestions[0].id)).toEqual(['who']);
  });
});

describe('assignContactToSuggestions', () => {
  beforeEach(() => {
    hoisted.batch.set.mockClear();
    hoisted.batch.update.mockClear();
    hoisted.batch.commit.mockClear();
  });

  it('sets the chosen contact on every suggestion without confirming or linking', async () => {
    await assignContactToSuggestions({ uid: 'u1', contactId: 'c1', suggestionIds: ['a', 'b'] });

    const updates = hoisted.batch.update.mock.calls.map(([ref, data]) => ({ path: ref.path, data }));
    expect(updates).toEqual([
      { path: `users/u1/${INTERACTION_SUGGESTIONS_SUBCOLLECTION}/a`, data: { contactId: 'c1' } },
      { path: `users/u1/${INTERACTION_SUGGESTIONS_SUBCOLLECTION}/b`, data: { contactId: 'c1' } },
    ]);
    expect(hoisted.batch.set).not.toHaveBeenCalled();
    expect(hoisted.batch.commit).toHaveBeenCalledTimes(1);
  });

  it('does nothing when there are no suggestions to assign', async () => {
    await assignContactToSuggestions({ uid: 'u1', contactId: 'c1', suggestionIds: [] });
    expect(hoisted.batch.update).not.toHaveBeenCalled();
    expect(hoisted.batch.commit).not.toHaveBeenCalled();
  });
});

describe('subscribeSuggestionLinks', () => {
  beforeEach(() => hoisted.mockOnSnapshot.mockClear());

  it('maps each BNPB contact id to its remembered Contact id', () => {
    hoisted.mockOnSnapshot.mockImplementationOnce((_q: unknown, callback: unknown) => {
      (callback as (snap: unknown) => void)({
        docs: [
          { id: 'b1', data: () => ({ bnpbContactId: 'p-1', contactId: 'c1' }) },
          { id: 'b2', data: () => ({}) },
        ],
      });
      return vi.fn();
    });

    let seen: Map<string, string> | null = null;
    const unsub = subscribeSuggestionLinks('u1', (links) => (seen = links), () => {});
    expect(seen!.get('p-1')).toBe('c1');
    expect(seen!.size).toBe(1);
    expect(typeof unsub).toBe('function');
  });
});
