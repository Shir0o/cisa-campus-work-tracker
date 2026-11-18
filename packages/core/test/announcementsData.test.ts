import { describe, it, expect, vi, beforeEach } from 'vitest';

const firestoreMock = vi.hoisted(() => ({
  collection: vi.fn(),
  addDoc: vi.fn(),
  doc: vi.fn(),
  updateDoc: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  serverTimestamp: vi.fn(),
}));

vi.mock('firebase/firestore', () => firestoreMock);

import { markGotIt, postAnnouncement, subscribeAnnouncements } from '../src/data/announcements';

const SERVER_TS = { __serverTimestamp: true };
const COLLECTION = { __collection: 'announcements' };

beforeEach(() => {
  vi.clearAllMocks();
  firestoreMock.collection.mockReturnValue(COLLECTION);
  firestoreMock.serverTimestamp.mockReturnValue(SERVER_TS);
  firestoreMock.addDoc.mockResolvedValue({ id: 'a1' });
  firestoreMock.doc.mockImplementation((_db: unknown, ...path: string[]) => ({ __doc: path.join('/') }));
});

describe('postAnnouncement', () => {
  const author = { uid: 'ana', name: 'Ana Admin' };

  it('writes the announcement with an empty gotIt map and returns its id', async () => {
    const id = await postAnnouncement({} as never, author, '  Retreat moves to Saturday  ', ['ben'], vi.fn());
    expect(id).toBe('a1');
    expect(firestoreMock.collection).toHaveBeenCalledWith({}, 'announcements');
    expect(firestoreMock.addDoc).toHaveBeenCalledWith(COLLECTION, {
      body: 'Retreat moves to Saturday',
      authorId: 'ana',
      authorName: 'Ana Admin',
      createdAt: SERVER_TS,
      gotIt: {},
    });
  });

  it('writes one bell notification per recipient, so push follows from the bell', async () => {
    const onNotify = vi.fn();
    await postAnnouncement({} as never, author, 'Retreat moves to Saturday', ['ben', 'cal', 'dee'], onNotify);
    expect(onNotify).toHaveBeenCalledTimes(3);
    expect(onNotify.mock.calls.map(([n]) => n.userId)).toEqual(['ben', 'cal', 'dee']);
    expect(onNotify.mock.calls[0][0]).toMatchObject({
      title: 'Ana Admin posted an announcement',
      message: 'Retreat moves to Saturday',
      type: 'info',
      targetId: 'a1',
      link: '/',
    });
  });

  it('does not notify the poster, and notifies a repeated recipient once', async () => {
    const onNotify = vi.fn();
    await postAnnouncement({} as never, author, 'Hello', ['ana', 'ben', 'ben', ''], onNotify);
    expect(onNotify.mock.calls.map(([n]) => n.userId)).toEqual(['ben']);
  });

  it('refuses an empty or over-long body and writes nothing', async () => {
    const onNotify = vi.fn();
    await expect(postAnnouncement({} as never, author, '   ', ['ben'], onNotify)).rejects.toThrow();
    await expect(postAnnouncement({} as never, author, 'x'.repeat(2001), ['ben'], onNotify)).rejects.toThrow();
    expect(firestoreMock.addDoc).not.toHaveBeenCalled();
    expect(onNotify).not.toHaveBeenCalled();
  });

  it('writes no notification when the announcement itself is refused by the rules', async () => {
    firestoreMock.addDoc.mockRejectedValue(new Error('permission-denied'));
    const onNotify = vi.fn();
    await expect(postAnnouncement({} as never, author, 'Hello', ['ben'], onNotify)).rejects.toThrow('permission-denied');
    expect(onNotify).not.toHaveBeenCalled();
  });
});

describe('markGotIt', () => {
  it("stamps only the caller's own entry in the gotIt map", async () => {
    await markGotIt({} as never, 'a1', 'ben');
    expect(firestoreMock.doc).toHaveBeenCalledWith({}, 'announcements', 'a1');
    expect(firestoreMock.updateDoc).toHaveBeenCalledWith({ __doc: 'announcements/a1' }, { 'gotIt.ben': SERVER_TS });
  });
});

describe('subscribeAnnouncements', () => {
  it('reads the newest 50 and maps each document, normalising timestamps', () => {
    firestoreMock.orderBy.mockReturnValue({ __orderBy: true });
    firestoreMock.limit.mockReturnValue({ __limit: true });
    firestoreMock.query.mockReturnValue({ __query: true });
    firestoreMock.onSnapshot.mockImplementation((_q: unknown, cb: (snap: { docs: unknown[] }) => void) => {
      cb({
        docs: [
          {
            id: 'a1',
            data: () => ({
              body: 'Hello',
              authorId: 'ana',
              authorName: 'Ana Admin',
              createdAt: { toDate: () => new Date('2026-11-18T10:00:00.000Z') },
              gotIt: { ben: { toDate: () => new Date('2026-11-18T10:05:00.000Z') } },
            }),
          },
          // A write still waiting on its server timestamp.
          { id: 'a2', data: () => ({ body: 'Soon', authorId: 'ana', authorName: 'Ana Admin', createdAt: null }) },
        ],
      });
      return () => {};
    });
    const cb = vi.fn();
    subscribeAnnouncements({} as never, cb);
    expect(firestoreMock.orderBy).toHaveBeenCalledWith('createdAt', 'desc');
    expect(firestoreMock.limit).toHaveBeenCalledWith(50);
    expect(cb).toHaveBeenCalledWith([
      {
        id: 'a1',
        body: 'Hello',
        authorId: 'ana',
        authorName: 'Ana Admin',
        createdAt: '2026-11-18T10:00:00.000Z',
        gotIt: { ben: '2026-11-18T10:05:00.000Z' },
      },
      { id: 'a2', body: 'Soon', authorId: 'ana', authorName: 'Ana Admin', createdAt: null, gotIt: {} },
    ]);
  });
});
