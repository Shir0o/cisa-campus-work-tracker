import { describe, it, expect, vi, beforeEach } from 'vitest';

const firestoreMock = vi.hoisted(() => ({
  addDoc: vi.fn(),
  collection: vi.fn(),
  collectionGroup: vi.fn(),
  doc: vi.fn(),
  deleteDoc: vi.fn(),
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
    applyRoster([
      { uid: 'u1', role: 'admin' },
      { uid: 'u2', role: 'manager' },
    ]);
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
      { contactName: 'Daniel', stakeholders: {} },
      onNotify,
    );

    const [, data] = firestoreMock.addDoc.mock.calls[0];
    expect(data).toMatchObject({ mentionedUserIds: ['u2', 'u1'] });
    expect(onNotify.mock.calls.map(([p]) => p.userId)).toEqual(['u2']);
    expect(onNotify.mock.calls[0][0].title).toBe('Grace mentioned you on Daniel');
  });

  it('never mentions a Trainee into the Full-timers stream', async () => {
    applyRoster([
      { uid: 'ft1', role: 'admin' },
      { uid: 'tr1', role: 'manager' },
    ]);
    const onNotify = vi.fn();

    await addThreadMessage(
      db,
      'c1',
      {
        interactionId: null,
        scope: 'team',
        from: 'ft1',
        fromName: 'Ruth Chen',
        kind: 'comment',
        body: 'Be gentle',
        mentionedUserIds: ['tr1'],
      },
      { contactName: 'Daniel' },
      onNotify,
    );

    expect(onNotify).not.toHaveBeenCalled();
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

// #1604: mobile posts reach teammates In the Conversation the same way the web
// app does (CONTEXT.md, ADR 0007 amendment).
describe('addThreadMessage reaches teammates In the Conversation', () => {
  const recent = (from: string, extra: Record<string, unknown> = {}) => ({
    id: from + '-msg',
    data: () => ({ from, fromName: from, kind: 'nudge', body: 'Can someone text Mark?', interactionId: null, at: new Date().toISOString(), ...extra }),
  });

  beforeEach(() => {
    applyRoster([
      { uid: 'tony', role: 'admin' },
      { uid: 'anna', role: 'admin' },
      { uid: 'tim', role: 'manager' },
    ]);
  });

  it('tells the asker of a Follow-up ask, not tied and released, when a teammate replies', async () => {
    firestoreMock.getDocs.mockResolvedValueOnce({ docs: [recent('tony')] });
    const onNotify = vi.fn();
    await addThreadMessage(
      db,
      'c1',
      { parentId: 'tony-msg', from: 'anna', fromName: 'Anna Lee', kind: 'comment', body: 'I texted him.' },
      { contactName: 'Mark', stakeholders: { createdBy: 'tim', unfollowedBy: ['tony'] } },
      onNotify,
    );
    expect(onNotify.mock.calls.map((c) => c[0])).toEqual([
      expect.objectContaining({ userId: 'tim', title: 'Anna commented on Mark' }),
      expect.objectContaining({ userId: 'tony', title: 'Anna commented on Mark' }),
    ]);
  });

  it('tells nobody twice, keeps Trainees off the Full-timers stream, and ignores other streams', async () => {
    firestoreMock.getDocs.mockResolvedValueOnce({
      docs: [recent('tim'), recent('tony'), recent('tony', { interactionId: 'i1' })],
    });
    const onNotify = vi.fn();
    await addThreadMessage(
      db,
      'c1',
      { scope: 'team', from: 'anna', fromName: 'Anna', kind: 'comment', body: 'Between us.' },
      { contactName: 'Mark', stakeholders: { coCreators: ['tony'] } },
      onNotify,
    );
    expect(onNotify.mock.calls.map((c) => c[0].userId)).toEqual(['tony']);
  });

  it('reads only the last 14 days of that stream, and a failed read keeps the message', async () => {
    firestoreMock.getDocs.mockRejectedValueOnce(new Error('offline'));
    const onNotify = vi.fn();
    await addThreadMessage(db, 'c1', { from: 'anna', fromName: 'Anna', kind: 'comment', body: 'Hi' }, { contactName: 'Mark' }, onNotify);
    expect(firestoreMock.addDoc).toHaveBeenCalledTimes(1);
    expect(onNotify).not.toHaveBeenCalled();
    const [field, op, value] = firestoreMock.where.mock.calls[0];
    expect([field, op]).toEqual(['at', '>=']);
    expect(Math.round((Date.now() - Date.parse(value)) / 86_400_000)).toBe(14);
  });
});
