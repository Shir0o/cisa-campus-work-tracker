import { describe, it, expect, vi, beforeEach } from 'vitest';

const firestoreMock = vi.hoisted(() => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  collectionGroup: vi.fn(),
  doc: vi.fn(),
  deleteDoc: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  updateDoc: vi.fn(),
}));

vi.mock('firebase/firestore', () => firestoreMock);

import {
  addThreadMessage,
  closeFollowUpAsk,
  deleteThreadMessage,
  subscribeThreads,
} from '../src/data/threads';
import { applyRoster } from '../src/walking';

const DOC_REF = { __docRef: true };
const db = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  firestoreMock.collection.mockImplementation((_db, ...path: string[]) => ({ path: path.join('/') }));
  firestoreMock.query.mockImplementation((col) => col);
  firestoreMock.addDoc.mockResolvedValue({ id: 'new' });
});

describe('deleteThreadMessage', () => {
  it('calls deleteDoc on the specific thread message document', async () => {
    firestoreMock.doc.mockReturnValue(DOC_REF);
    firestoreMock.deleteDoc.mockResolvedValue(undefined);

    await deleteThreadMessage(db, 'c1', 'm1');

    expect(firestoreMock.doc).toHaveBeenCalledWith(db, 'contacts', 'c1', 'threads', 'm1');
    expect(firestoreMock.deleteDoc).toHaveBeenCalledWith(DOC_REF);
  });

  it('deletes a Full-timers message from teamThreads', async () => {
    firestoreMock.doc.mockReturnValue(DOC_REF);

    await deleteThreadMessage(db, 'c1', 'm1', 'team');

    expect(firestoreMock.doc).toHaveBeenCalledWith(db, 'contacts', 'c1', 'teamThreads', 'm1');
  });
});

describe('closeFollowUpAsk', () => {
  it('stamps who closed the ask, and when, on the open stream message', async () => {
    firestoreMock.doc.mockReturnValue(DOC_REF);

    await closeFollowUpAsk(db, 'c1', 'm1', { uid: 'u1', name: 'Grace Liu' });

    expect(firestoreMock.doc).toHaveBeenCalledWith(db, 'contacts', 'c1', 'threads', 'm1');
    expect(firestoreMock.updateDoc).toHaveBeenCalledWith(DOC_REF, {
      closedBy: 'u1',
      closedByName: 'Grace Liu',
      closedAt: expect.any(String),
    });
  });
});

describe('addThreadMessage', () => {
  it('writes a reply with its parent into the open stream', async () => {
    await addThreadMessage(db, 'c1', {
      interactionId: null,
      parentId: 'p1',
      from: 'u1',
      fromName: 'Grace',
      kind: 'comment',
      body: ' hi ',
    });

    const [col, data] = firestoreMock.addDoc.mock.calls[0];
    expect(col).toEqual({ path: 'contacts/c1/threads' });
    expect(data).toMatchObject({ interactionId: null, parentId: 'p1', scope: null, body: 'hi' });
  });

  it('writes a Full-timers message to teamThreads and tells only Full-timers', async () => {
    applyRoster([
      { uid: 'ft1', role: 'admin' },
      { uid: 'ft2', role: 'admin' },
      { uid: 'tr1', role: 'manager' },
    ]);
    const onNotify = vi.fn();

    await addThreadMessage(
      db,
      'c1',
      { interactionId: null, scope: 'team', from: 'ft1', fromName: 'Ruth Chen', kind: 'comment', body: 'Be gentle' },
      { contactName: 'Daniel', stakeholders: { createdBy: 'tr1', coCreators: ['ft2'] } },
      onNotify,
    );

    const [col, data] = firestoreMock.addDoc.mock.calls[0];
    expect(col).toEqual({ path: 'contacts/c1/teamThreads' });
    expect(data).toMatchObject({ scope: 'team' });
    expect(onNotify.mock.calls.map(([p]) => p.userId)).toEqual(['ft2']);
    expect(onNotify.mock.calls[0][0].title).toBe('Ruth posted in the Full-timers thread on Daniel');
  });
});

describe('subscribeThreads', () => {
  const snap = (docs: Array<{ id: string; data: Record<string, unknown> }>) => ({
    docs: docs.map((d) => ({ id: d.id, data: () => d.data })),
  });

  it('keeps each message’s parent, scope and ask state', () => {
    const cb = vi.fn();
    firestoreMock.onSnapshot.mockImplementation((_q, next) => {
      next(
        snap([
          {
            id: 'm1',
            data: {
              interactionId: null,
              parentId: 'p1',
              from: 'u1',
              fromName: 'G',
              kind: 'nudge',
              body: 'x',
              at: '2026-09-01T00:00:00.000Z',
              closedBy: 'u2',
              closedByName: 'M',
              closedAt: '2026-09-02T00:00:00.000Z',
            },
          },
        ]),
      );
      return () => {};
    });

    subscribeThreads(db, 'c1', cb);

    expect(cb).toHaveBeenCalledWith([
      expect.objectContaining({ parentId: 'p1', scope: null, closedBy: 'u2', closedByName: 'M', closedAt: '2026-09-02T00:00:00.000Z' }),
    ]);
  });

  it('adds the Full-timers stream, marked team, only when asked to', () => {
    const cb = vi.fn();
    firestoreMock.onSnapshot.mockImplementation((q, next) => {
      const team = q.path.endsWith('teamThreads');
      next(snap([{ id: team ? 't1' : 'o1', data: { from: 'u', fromName: 'U', kind: 'comment', body: 'b', at: team ? '2026-09-02T00:00:00.000Z' : '2026-09-01T00:00:00.000Z' } }]));
      return () => {};
    });

    subscribeThreads(db, 'c1', cb);
    expect(firestoreMock.onSnapshot).toHaveBeenCalledTimes(1);

    cb.mockClear();
    firestoreMock.onSnapshot.mockClear();
    subscribeThreads(db, 'c1', cb, undefined, { includeTeam: true });

    expect(firestoreMock.onSnapshot).toHaveBeenCalledTimes(2);
    const last = cb.mock.calls[cb.mock.calls.length - 1][0];
    expect(last.map((m: { id: string; scope: string | null }) => [m.id, m.scope])).toEqual([
      ['o1', null],
      ['t1', 'team'],
    ]);
  });
});
