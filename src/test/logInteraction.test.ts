// The multi-person write behind Log interaction (cut-or-keep §5): one
// interaction per person, and when it is more than one person, a shared
// `groupId` so the entries read as the same moment.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeBatch } from 'firebase/firestore';
import { logInteraction } from '../lib/logInteraction';

const h = vi.hoisted(() => {
  const batch = { set: vi.fn(), update: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) };
  let n = 0;
  return { batch, next: () => `auto-${++n}`, reset: () => { n = 0; } };
});

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, ...path: string[]) => ({ kind: 'collection', path: path.join('/') })),
  doc: vi.fn((first: { kind?: string; path?: string } | unknown, ...rest: string[]) => {
    const parent = first as { kind?: string; path?: string };
    // doc(collectionRef) -> a fresh auto id under it; doc(db, ...path) -> that path.
    if (parent && parent.kind === 'collection') {
      return { id: h.next(), path: `${parent.path}/auto` };
    }
    return { id: rest[rest.length - 1], path: rest.join('/') };
  }),
  serverTimestamp: vi.fn(() => 'SERVER_TIME'),
  writeBatch: vi.fn(() => h.batch),
}));

vi.mock('../lib/firebase', () => ({ db: {} }));

const by = { uid: 'u1', name: 'Mei Tanaka' };
const names = { c1: 'Ama Osei', c2: 'Bo Chen', c3: 'Cai Lin' };

const interactionSets = () =>
  h.batch.set.mock.calls
    .filter(([ref]) => (ref as { path: string }).path.includes('/interactions'))
    .map(([ref, data]) => ({ ref: ref as { path: string }, data: data as Record<string, unknown> }));

beforeEach(() => {
  vi.clearAllMocks();
  h.reset();
  h.batch.commit.mockResolvedValue(undefined);
});

describe('logInteraction', () => {
  it('logs a visit for three people as three interactions sharing one groupId', async () => {
    await logInteraction({
      contactIds: ['c1', 'c2', 'c3'],
      contactNames: names,
      type: 'visit',
      dateTime: '2026-11-17',
      content: 'Dinner at the Islams.',
      by,
    });

    const writes = interactionSets();
    expect(writes).toHaveLength(3);
    expect(writes.map((w) => w.data.contactId)).toEqual(['c1', 'c2', 'c3']);
    expect(writes.map((w) => w.ref.path)).toEqual([
      'contacts/c1/interactions/auto',
      'contacts/c2/interactions/auto',
      'contacts/c3/interactions/auto',
    ]);
    for (const w of writes) {
      expect(w.data).toMatchObject({
        type: 'visit',
        content: 'Dinner at the Islams.',
        dateTime: '2026-11-17',
        userId: 'u1',
        userName: 'Mei Tanaka',
        createdAt: 'SERVER_TIME',
      });
    }
    const groupIds = new Set(writes.map((w) => w.data.groupId));
    expect(groupIds.size).toBe(1);
    expect(typeof [...groupIds][0]).toBe('string');
    expect([...groupIds][0]).toBeTruthy();
    expect(h.batch.commit).toHaveBeenCalledTimes(1);
  });

  it('moves every person’s last seen in the same batch', async () => {
    await logInteraction({
      contactIds: ['c1', 'c2'],
      contactNames: names,
      type: 'visit',
      dateTime: '2026-11-17',
      content: 'Coffee.',
      by,
    });
    expect(h.batch.update).toHaveBeenCalledTimes(2);
    expect(h.batch.update.mock.calls.map(([ref]) => (ref as { path: string }).path)).toEqual([
      'contacts/c1',
      'contacts/c2',
    ]);
    expect(h.batch.update.mock.calls[0][1]).toMatchObject({ lastSeen: '2026-11-17', lastContactedBy: 'Mei Tanaka' });
  });

  it('writes no groupId for one person — there is no group to name', async () => {
    const { groupId } = await logInteraction({
      contactIds: ['c1'],
      contactNames: names,
      type: 'call',
      dateTime: '2026-11-17',
      content: 'Quick call.',
      by,
    });
    expect(groupId).toBeNull();
    const [only] = interactionSets();
    expect('groupId' in only.data).toBe(false);
  });

  it('hands back the groupId it wrote for a group', async () => {
    const { groupId } = await logInteraction({
      contactIds: ['c1', 'c2'],
      contactNames: names,
      type: 'visit',
      dateTime: '2026-11-17',
      content: 'x',
      by,
    });
    expect(groupId).toBeTruthy();
    expect(interactionSets().every((w) => w.data.groupId === groupId)).toBe(true);
  });

  it('creates each follow-up once per person, pointing back at that person’s entry', async () => {
    await logInteraction({
      contactIds: ['c1', 'c2'],
      contactNames: names,
      type: 'visit',
      dateTime: '2026-11-17',
      content: 'x',
      by,
      tasks: [{ title: 'Bring the book', dueDate: '2026-11-24', priority: 'high' }, { title: '  ' }],
    });
    const taskWrites = h.batch.set.mock.calls
      .filter(([ref]) => (ref as { path: string }).path.startsWith('tasks'))
      .map(([, data]) => data as Record<string, unknown>);
    expect(taskWrites).toHaveLength(2);
    expect(taskWrites.map((t) => t.contactId)).toEqual(['c1', 'c2']);
    expect(taskWrites[0]).toMatchObject({
      title: 'Bring the book',
      dueDate: '2026-11-24',
      priority: 'high',
      assigneeId: 'u1',
      status: 'pending',
    });
    const interactionIds = interactionSets().map((w) => (w.ref as unknown as { id: string }).id);
    expect(taskWrites.map((t) => t.sourceInteractionId)).toEqual(interactionIds);
  });

  it('commits one batch, so a failure writes none of the people', async () => {
    h.batch.commit.mockRejectedValueOnce(new Error('denied'));
    await expect(
      logInteraction({ contactIds: ['c1', 'c2'], contactNames: names, type: 'visit', dateTime: 'd', content: 'x', by }),
    ).rejects.toThrow('denied');
    expect(writeBatch).toHaveBeenCalledTimes(1);
  });

  it('refuses to log for nobody', async () => {
    await expect(
      logInteraction({ contactIds: [], type: 'visit', dateTime: 'd', content: 'x', by }),
    ).rejects.toThrow(/at least one/i);
  });
});
