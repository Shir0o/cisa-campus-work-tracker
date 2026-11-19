// The web mirror of quick add's save (§26): one batch for the contact (or the
// picked match), the interaction, the prayer and the reminder. The phone's
// copy lives in @cisa/core; this pins the web side to the same write.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeBatch } from 'firebase/firestore';
import { saveQuickAdd } from '../lib/quickAdd';

const h = vi.hoisted(() => {
  const batch = { set: vi.fn(), update: vi.fn(), commit: vi.fn().mockResolvedValue(undefined) };
  let n = 0;
  return { batch, next: () => `auto-${++n}`, reset: () => { n = 0; } };
});

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, ...path: string[]) => ({ kind: 'collection', path: path.join('/') })),
  doc: vi.fn((first: { kind?: string; path?: string } | unknown, ...rest: string[]) => {
    const parent = first as { kind?: string; path?: string };
    if (parent && parent.kind === 'collection') {
      const id = h.next();
      return { id, path: `${parent.path}/${id}` };
    }
    return { id: rest[rest.length - 1], path: rest.join('/') };
  }),
  serverTimestamp: vi.fn(() => 'SERVER_TIME'),
  writeBatch: vi.fn(() => h.batch),
}));

vi.mock('../lib/firebase', () => ({ db: {} }));

// The contact write carries its access list and founding/partner ties, so the
// importer can see the person they just added.
vi.mock('../lib/contactTies', () => ({ visibleToOf: vi.fn(() => ['u1']) }));

const by = { uid: 'u1', name: 'Mei Tanaka' };
const input = {
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

beforeEach(() => {
  vi.clearAllMocks();
  h.reset();
  h.batch.commit.mockResolvedValue(undefined);
});

describe('saveQuickAdd (web)', () => {
  it('writes every part in one batch', async () => {
    const result = await saveQuickAdd(input, by);

    expect(result.createdContact).toBe(true);
    expect(writeBatch).toHaveBeenCalledTimes(1);
    expect(h.batch.commit).toHaveBeenCalledTimes(1);

    const paths = h.batch.set.mock.calls.map(([ref]) => (ref as { path: string }).path);
    expect(paths).toEqual([
      'contacts/auto-1',
      'contacts/auto-1/interactions/auto-2',
      'prayers/auto-3',
      'tasks/auto-4',
    ]);
    const [contact] = h.batch.set.mock.calls[0];
    expect(contact).toBeTruthy();
    expect(h.batch.set.mock.calls[0][1]).toMatchObject({
      name: 'Jordan Lee',
      stage: 'contact',
      tags: ['Bible study'],
      createdBy: 'u1',
    });
    expect(h.batch.set.mock.calls[1][1]).toMatchObject({
      content: 'Met at the club table',
      createdAt: 'SERVER_TIME',
    });
    expect(h.batch.set.mock.calls[2][1]).toMatchObject({ burden: 'pray for his exams' });
    expect(h.batch.set.mock.calls[3][1]).toMatchObject({ title: 'Text Jordan about Bible study' });
  });

  it('adds to a picked match instead of creating a second person', async () => {
    const result = await saveQuickAdd({ ...input, matchId: 'c1', matchName: 'Jordan Lee' }, by);
    expect(result.contactId).toBe('c1');
    expect(result.createdContact).toBe(false);
    expect(h.batch.set.mock.calls.map(([ref]) => (ref as { path: string }).path)).toEqual([
      'contacts/c1/interactions/auto-1',
      'prayers/auto-2',
      'tasks/auto-3',
    ]);
  });

  it('refuses with no name and no match', async () => {
    await expect(saveQuickAdd({ ...input, contact: { ...input.contact, name: ' ' } }, by)).rejects.toThrow(
      /name or a matched person/i,
    );
  });
});
