// Quick add's save is one batch (§26): the contact (or the picked match),
// the interaction, the prayer and the reminder land together, so a refused
// write leaves none of them behind.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const firestoreMock = vi.hoisted(() => ({
  collection: vi.fn(),
  doc: vi.fn(),
  writeBatch: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TIME'),
}));
const batch = vi.hoisted(() => ({
  set: vi.fn(),
  update: vi.fn(),
  commit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('firebase/firestore', () => firestoreMock);

import { saveQuickAdd } from '../src/data/quickAdd';

const by = { uid: 'u1', name: 'Mei Tanaka' };

const full = {
  contact: {
    name: 'Jordan Lee',
    phone: '(555) 010-2030',
    email: 'jordan-lee-contact',
    year: 'Sophomore',
    step: 'contact',
    tags: ['Bible study'],
  },
  interaction: { type: 'meeting', when: '2026-11-17', notes: 'Met at the club table' },
  prayer: 'pray for his exams',
  reminder: { when: '2026-11-24', text: 'Text Jordan about Bible study' },
};

const writes = () =>
  batch.set.mock.calls.map(([ref, data]) => ({
    path: (ref as { path: string }).path,
    data: data as Record<string, unknown>,
  }));

beforeEach(() => {
  vi.clearAllMocks();
  batch.commit.mockResolvedValue(undefined);
  firestoreMock.writeBatch.mockReturnValue(batch);
  firestoreMock.collection.mockImplementation((_db: unknown, ...parts: string[]) => ({
    kind: 'collection',
    path: parts.join('/'),
  }));
  firestoreMock.doc.mockImplementation((first: unknown, ...rest: string[]) => {
    const parent = first as { kind?: string; path?: string };
    if (parent?.kind === 'collection') {
      return { id: 'new-contact', path: `${parent.path}/new-contact`, kind: 'doc' };
    }
    return { id: rest[rest.length - 1], path: rest.join('/'), kind: 'doc' };
  });
});

describe('saveQuickAdd (packages/core)', () => {
  it('writes a new contact, its interaction, the prayer and the reminder in one batch', async () => {
    const result = await saveQuickAdd({} as never, full, by);

    expect(result).toEqual({ contactId: 'new-contact', createdContact: true });
    expect(firestoreMock.writeBatch).toHaveBeenCalledTimes(1);
    expect(batch.commit).toHaveBeenCalledTimes(1);

    const all = writes();
    expect(all.map((w) => w.path)).toEqual([
      'contacts/new-contact',
      'contacts/new-contact/interactions/new-contact',
      'prayers/new-contact',
      'tasks/new-contact',
    ]);

    expect(all[0].data).toMatchObject({
      name: 'Jordan Lee',
      phone: '(555) 010-2030',
      email: 'jordan-lee-contact',
      year: 'Sophomore',
      stage: 'contact',
      tags: ['Bible study'],
      createdBy: 'u1',
      createdByName: 'Mei Tanaka',
      lastSeen: '2026-11-17',
      lastContactedBy: 'Mei Tanaka',
    });
    expect(all[0].data.visibleTo).toContain('u1');

    expect(all[1].data).toMatchObject({
      type: 'meeting',
      dateTime: '2026-11-17',
      content: 'Met at the club table',
      userId: 'u1',
      userName: 'Mei Tanaka',
      createdAt: 'SERVER_TIME',
    });

    expect(all[2].data).toMatchObject({
      contactId: 'new-contact',
      burden: 'pray for his exams',
      status: 'pending',
      teamPrayer: false,
    });

    expect(all[3].data).toMatchObject({
      title: 'Text Jordan about Bible study',
      dueDate: '2026-11-24',
      status: 'pending',
      priority: 'medium',
      assigneeId: 'u1',
      contactId: 'new-contact',
      contactName: 'Jordan Lee',
    });
  });

  it('uses a picked match instead of creating a contact, and still writes the rest', async () => {
    const result = await saveQuickAdd(
      {} as never,
      { ...full, matchId: 'c1', matchName: 'Jordan Lee' },
      by,
    );

    expect(result).toEqual({ contactId: 'c1', createdContact: false });
    const all = writes();
    expect(all.some((w) => w.path === 'contacts/c1')).toBe(false);
    expect(all.map((w) => w.path)).toEqual([
      'contacts/c1/interactions/new-contact',
      'prayers/new-contact',
      'tasks/new-contact',
    ]);
  });

  it('updates the person’s last seen when an interaction is saved', async () => {
    await saveQuickAdd({} as never, { ...full, matchId: 'c1', matchName: 'Jordan Lee' }, by);
    expect(batch.update).toHaveBeenCalledTimes(1);
    const [ref, patch] = batch.update.mock.calls[0];
    expect((ref as { path: string }).path).toBe('contacts/c1');
    expect(patch).toMatchObject({ lastSeen: '2026-11-17', lastContactedBy: 'Mei Tanaka' });
  });

  it('refuses to save with no name and no match', async () => {
    await expect(
      saveQuickAdd(
        {} as never,
        {
          contact: { name: '  ', phone: '', email: '', year: '', step: '', tags: [] },
          interaction: null,
          prayer: null,
          reminder: null,
        },
        by,
      ),
    ).rejects.toThrow(/name or a matched person/i);
    expect(firestoreMock.writeBatch).not.toHaveBeenCalled();
  });
});
