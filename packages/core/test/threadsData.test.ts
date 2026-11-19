import { describe, it, expect, vi, beforeEach } from 'vitest';

const firestoreMock = vi.hoisted(() => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  collectionGroup: vi.fn(),
  doc: vi.fn(),
  deleteDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  updateDoc: vi.fn(),
  where: vi.fn(),
}));

vi.mock('firebase/firestore', () => firestoreMock);

import {
  addThreadMessage,
  closeFollowUpAsk,
  deleteThreadMessage,
  editThreadMessage,
  subscribeAllThreads,
  subscribeThreads,
} from '../src/data/threads';

const DOC_REF = { __docRef: true };
const db = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  firestoreMock.collection.mockImplementation((_db, ...path: string[]) => ({ path: path.join('/') }));
  firestoreMock.query.mockImplementation((col) => col);
  firestoreMock.addDoc.mockResolvedValue({ id: 'new' });
  firestoreMock.getDoc.mockResolvedValue({ exists: () => false, data: () => ({}) });
  firestoreMock.getDocs.mockResolvedValue({ docs: [] });
});

describe('deleteThreadMessage', () => {
  it('calls deleteDoc on the specific thread message document', async () => {
    firestoreMock.doc.mockReturnValue(DOC_REF);
    firestoreMock.deleteDoc.mockResolvedValue(undefined);

    await deleteThreadMessage(db, 'c1', 'm1');

    expect(firestoreMock.doc).toHaveBeenCalledWith(db, 'contacts', 'c1', 'threads', 'm1');
    expect(firestoreMock.deleteDoc).toHaveBeenCalledWith(DOC_REF);
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

describe('editThreadMessage', () => {
  it("rewrites the body and stamps editedAt on the author's message", async () => {
    firestoreMock.doc.mockReturnValue(DOC_REF);

    await editThreadMessage(db, 'c1', 'm1', '  new words  ');

    expect(firestoreMock.doc).toHaveBeenCalledWith(db, 'contacts', 'c1', 'threads', 'm1');
    expect(firestoreMock.updateDoc).toHaveBeenCalledWith(DOC_REF, {
      body: 'new words',
      editedAt: expect.any(String),
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

  it('writes a picked mention and notifies them — never the author (ADR 0007)', async () => {
    const onNotify = vi.fn();

    await addThreadMessage(
      db,
      'c1',
      {
        interactionId: null,
        from: 'u1',
        fromName: 'Grace Liu',
        kind: 'comment',
        body: 'Hey @Zion Park, can you look?',
        mentionedUserIds: ['u2', 'u1'],
      },
      { contactName: 'Daniel' },
      onNotify,
    );

    const [, data] = firestoreMock.addDoc.mock.calls[0];
    expect(data).toMatchObject({ mentionedUserIds: ['u2', 'u1'] });
    expect(onNotify.mock.calls.map(([p]) => p.userId)).toEqual(['u2']);
    expect(onNotify.mock.calls[0][0].title).toBe('Grace mentioned you on Daniel');
  });


  it('writes every message to the open thread, with no team scope', async () => {
    await addThreadMessage(
      db,
      'c1',
      { interactionId: null, from: 'ft1', fromName: 'Ruth Chen', kind: 'comment', body: 'Be gentle' },
      { contactName: 'Daniel' },
    );

    const [col, data] = firestoreMock.addDoc.mock.calls[0];
    expect(col).toEqual({ path: 'contacts/c1/threads' });
    expect(data).toMatchObject({ scope: null });
  });

  it('sends nothing for a message with no @mention', async () => {
    const onNotify = vi.fn();
    await addThreadMessage(
      db,
      'c1',
      { interactionId: null, from: 'ft1', fromName: 'Ruth Chen', kind: 'comment', body: 'He is doing well.' },
      { contactName: 'Daniel', to: 'tr1', stakeholders: { createdBy: 'tr1' } } as never,
      onNotify,
    );
    expect(onNotify).not.toHaveBeenCalled();
  });

  it('sends a reply to nobody but the people it @mentions', async () => {
    firestoreMock.getDoc.mockResolvedValueOnce({
      exists: () => true,
      data: () => ({ from: 'tr1', fromName: 'Trainee', kind: 'comment', body: '?' }),
    });
    const onNotify = vi.fn();
    await addThreadMessage(
      db,
      'c1',
      { parentId: 'p1', from: 'ft1', fromName: 'Ruth Chen', kind: 'comment', body: 'Texted him.', mentionedUserIds: ['u9'] },
      { contactName: 'Daniel', stakeholders: { createdBy: 'tr1' } } as never,
      onNotify,
    );
    expect(onNotify.mock.calls.map(([p]) => p.userId)).toEqual(['u9']);
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
              editedAt: '2026-09-03T00:00:00.000Z',
            },
          },
        ]),
      );
      return () => {};
    });

    subscribeThreads(db, 'c1', cb);

    expect(cb).toHaveBeenCalledWith([
      expect.objectContaining({ parentId: 'p1', scope: null, closedBy: 'u2', closedByName: 'M', closedAt: '2026-09-02T00:00:00.000Z', editedAt: '2026-09-03T00:00:00.000Z' }),
    ]);
  });

  it('reads only the open thread and skips a legacy team document', () => {
    const cb = vi.fn();
    firestoreMock.onSnapshot.mockImplementation((_q, next) => {
      next(snap([
        { id: 'o1', data: { from: 'u', fromName: 'U', kind: 'comment', body: 'b', at: '2026-09-01T00:00:00.000Z' } },
        { id: 't1', data: { from: 'u', fromName: 'U', kind: 'comment', body: 'b', at: '2026-09-02T00:00:00.000Z', scope: 'team' } },
      ]));
      return () => {};
    });

    subscribeThreads(db, 'c1', cb);
    expect(firestoreMock.onSnapshot).toHaveBeenCalledTimes(1);
    const last = cb.mock.calls[cb.mock.calls.length - 1][0];
    expect(last.map((m: { id: string }) => m.id)).toEqual(['o1']);
  });
});

describe('subscribeAllThreads', () => {
  const docOf = (id: string, contactId: string, data: Record<string, unknown>) => ({
    id,
    ref: { parent: { parent: { id: contactId } } },
    data: () => data,
  });

  it('tags each message with its contact and keeps its parent and ask state', () => {
    const cb = vi.fn();
    firestoreMock.onSnapshot.mockImplementation((_q, next) => {
      next({
        docs: [
          docOf('m1', 'c1', {
            from: 'u1', fromName: 'G', kind: 'nudge', body: 'x', at: '2026-09-01T00:00:00.000Z',
            parentId: 'p1', closedAt: '2026-09-02T00:00:00.000Z', closedByName: 'M',
          }),
        ],
      });
      return () => {};
    });

    subscribeAllThreads(db, cb);

    expect(firestoreMock.onSnapshot).toHaveBeenCalledTimes(1);
    expect(cb).toHaveBeenCalledWith([
      expect.objectContaining({ id: 'm1', contactId: 'c1', parentId: 'p1', scope: null, closedAt: '2026-09-02T00:00:00.000Z', closedByName: 'M' }),
    ]);
  });

  it('reads only the open threads and skips a legacy team document', () => {
    const cb = vi.fn();
    firestoreMock.collectionGroup.mockImplementation((_db, name: string) => ({ group: name }));
    firestoreMock.onSnapshot.mockImplementation((_q, next) => {
      next({ docs: [
        docOf('o1', 'c1', { from: 'u', kind: 'question', body: 'b', at: '2026-09-01T00:00:00.000Z' }),
        docOf('t1', 'c1', { from: 'u', kind: 'question', body: 'b', at: '2026-09-02T00:00:00.000Z', scope: 'team' }),
      ] });
      return () => {};
    });

    subscribeAllThreads(db, cb);
    expect(firestoreMock.onSnapshot).toHaveBeenCalledTimes(1);
    const last = cb.mock.calls[cb.mock.calls.length - 1][0];
    expect(last.map((m: { id: string }) => m.id)).toEqual(['o1']);
  });
});

// An @mention closes, for everyone it named, on the first reply from one of them.
describe('addThreadMessage closes the @mention a reply answers', () => {
  const parent = (over: Record<string, unknown> = {}) => ({
    exists: () => true,
    data: () => ({ from: 'tony', fromName: 'Tony', kind: 'comment', body: '@Anna ?', at: '2020-01-01T00:00:00.000Z', mentionedUserIds: ['anna'], ...over }),
  });

  it('closes the parent as the replier when they are named, and not otherwise', async () => {
    firestoreMock.doc.mockImplementation((_db, ...path: string[]) => ({ path: path.join('/') }));
    firestoreMock.updateDoc.mockResolvedValue(undefined);
    firestoreMock.getDoc.mockResolvedValueOnce(parent());
    await addThreadMessage(db, 'c1', { parentId: 'mn', from: 'anna', fromName: 'Anna Lee', kind: 'comment', body: 'Done it.' });
    expect(firestoreMock.updateDoc).toHaveBeenCalledWith(
      { path: 'contacts/c1/threads/mn' },
      expect.objectContaining({ closedBy: 'anna', closedByName: 'Anna Lee' }),
    );

    firestoreMock.updateDoc.mockClear();
    firestoreMock.getDoc.mockResolvedValueOnce(parent());
    await addThreadMessage(db, 'c1', { parentId: 'mn', from: 'jae', fromName: 'Jae', kind: 'comment', body: 'Me too.' });
    expect(firestoreMock.updateDoc).not.toHaveBeenCalled();
  });
});
