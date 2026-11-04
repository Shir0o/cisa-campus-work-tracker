import { describe, it, expect, vi, beforeEach } from 'vitest';

const firestoreMock = vi.hoisted(() => ({
  addDoc: vi.fn(async () => ({ id: 'new' })),
  collection: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join('/') })),
  deleteDoc: vi.fn(),
  doc: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join('/') })),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
  Timestamp: class {},
  updateDoc: vi.fn(async () => undefined),
}));

vi.mock('firebase/firestore', () => firestoreMock);

import { addInteraction } from '../src/data/interactions';

beforeEach(() => vi.clearAllMocks());

describe('addInteraction (packages/core)', () => {
  const input = { content: ' Met at lunch ', dateTime: '2026-10-16T12:00', type: 'interaction' };
  const by = { uid: 'ft', name: 'Kate' };

  it('writes the interaction as the logger and stamps the contact', async () => {
    await addInteraction({} as never, 'c1', input, by);
    const [ref, data] = firestoreMock.addDoc.mock.calls[0] as unknown as [{ path: string }, Record<string, unknown>];
    expect(ref.path).toBe('contacts/c1/interactions');
    expect(data).toMatchObject({ userId: 'ft', userName: 'Kate', content: 'Met at lunch', type: 'interaction', createdAt: 'SERVER_TS' });
    expect('reachedById' in data).toBe(false);
    const [, patch] = firestoreMock.updateDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
    expect(patch).toMatchObject({ lastContactedBy: 'Kate', lastContactedById: 'ft' });
  });

  it('logs on a teammate’s behalf when a reacher is named (#1288)', async () => {
    await addInteraction({} as never, 'c1', input, by, { uid: 'jae', name: 'Jae' });
    const [, data] = firestoreMock.addDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
    expect(data).toMatchObject({ userId: 'ft', reachedById: 'jae', reachedByName: 'Jae' });
    const [, patch] = firestoreMock.updateDoc.mock.calls[0] as unknown as [unknown, Record<string, unknown>];
    expect(patch).toMatchObject({ lastContactedBy: 'Jae', lastContactedById: 'jae', updatedBy: 'ft' });
  });
});
