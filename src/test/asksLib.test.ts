import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  subscribeAsks,
  subscribeStaffAsks,
  askQuestions,
  askQuestionsBy,
  askRepliesOf,
  askAnswered,
  askWaitedDays,
  askWaitedWords,
  askWaitedText,
  askStacksFor,
  askTakenBy,
  askOrigin,
  askOriginText,
  askVisibleFor,
  askUnreadFor,
  addAsk,
  addAskFor,
  addAskReply,
  deleteAsk,
  deleteAskReply,
  AskMessage,
} from '../lib/asks';
import * as firestore from 'firebase/firestore';
import * as firebaseLib from '../lib/firebase';
import { t as translate } from '../lib/i18n';

vi.mock('../lib/firebase', () => ({
  db: { _type: 'firestore' },
  handleFirestoreError: vi.fn(),
  sendNotification: vi.fn(),
  OperationType: { LIST: 'LIST', CREATE: 'CREATE', UPDATE: 'UPDATE', DELETE: 'DELETE' },
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, name) => ({ path: name })),
  doc: vi.fn((_db, name, id) => ({ path: `${name}/${id}` })),
  query: vi.fn((c, ..._w) => c),
  where: vi.fn(),
  onSnapshot: vi.fn(),
  addDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDocs: vi.fn(),
  writeBatch: vi.fn(),
}));

describe('src/lib/asks.ts full coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const mockMessages: AskMessage[] = [
    {
      id: 'q1',
      parentId: null,
      owner: 't1',
      from: 't1',
      fromName: 'Zion Park',
      kind: 'question',
      body: 'Question 1',
      at: new Date(Date.now() - 86400000 * 3).toISOString(), // 3 days ago
    },
    {
      id: 'r1',
      parentId: 'q1',
      owner: 't1',
      from: 'ft1',
      fromName: 'Mei Lin',
      kind: 'comment',
      body: 'Answer from Mei',
      at: new Date(Date.now() - 86400000 * 2).toISOString(),
    },
    {
      id: 'q2',
      parentId: null,
      owner: 't2',
      from: 't2',
      fromName: 'Ana Lei',
      takenBy: 'ft1',
      takenByName: 'Mei Lin',
      kind: 'question',
      body: 'Question 2 in person',
      at: new Date().toISOString(), // today
    },
    {
      id: 'q3',
      parentId: null,
      owner: 't3',
      from: 't3',
      fromName: 'Bob',
      kind: 'question',
      body: 'Question 3',
      at: new Date(Date.now() - 86400000).toISOString(), // yesterday
    },
  ];

  it('subscribes to all asks and converts documents', () => {
    let callback: any;
    (firestore.onSnapshot as any).mockImplementation((_col: any, cb: any) => {
      callback = cb;
      return () => {};
    });

    const received: AskMessage[][] = [];
    subscribeAsks((msgs) => received.push(msgs));

    callback({
      docs: [
        {
          id: 'doc1',
          data: () => ({
            from: 'u1',
            fromName: 'User 1',
            body: 'Hello',
          }),
        },
      ],
    });

    expect(received[0].length).toBe(1);
    expect(received[0][0].id).toBe('doc1');
    expect(received[0][0].owner).toBe('u1');
    expect(received[0][0].parentId).toBeNull();
  });

  it('subscribes to the staff feed — no owner filter', () => {
    let callback: any;
    (firestore.onSnapshot as any).mockImplementation((_col: any, cb: any) => {
      callback = cb;
      return () => {};
    });

    const received: AskMessage[][] = [];
    subscribeStaffAsks('t1', (msgs) => received.push(msgs));

    callback({
      docs: [],
    });

    expect(firestore.where).not.toHaveBeenCalled();
    expect(received.length).toBe(1);
  });

  it('subscribes to the whole team\'s asks for a trainee (staff) — no owner filter', () => {
    (firestore.onSnapshot as any).mockImplementation((_col: any, cb: any) => {
      cb({ docs: [] });
      return () => {};
    });

    const received: AskMessage[][] = [];
    subscribeAsks((msgs) => received.push(msgs), undefined, { uid: 't1', isStaff: true });
    expect(firestore.where).not.toHaveBeenCalled();
    expect(received.length).toBe(1);
  });

  it('subscribes with options scoping to owner when non-staff', () => {
    (firestore.onSnapshot as any).mockImplementation((_col: any, cb: any) => {
      cb({ docs: [] });
      return () => {};
    });

    const received: AskMessage[][] = [];
    subscribeAsks((msgs) => received.push(msgs), undefined, { uid: 't1', isStaff: false });
    expect(firestore.where).toHaveBeenCalledWith('owner', '==', 't1');
    expect(received.length).toBe(1);
  });

  it('subscribes with options passed as 2nd parameter without onError', () => {
    (firestore.onSnapshot as any).mockImplementation((_col: any, cb: any) => {
      cb({ docs: [] });
      return () => {};
    });

    const received: AskMessage[][] = [];
    subscribeAsks((msgs) => received.push(msgs), { uid: 't1', isStaff: false });
    expect(firestore.where).toHaveBeenCalledWith('owner', '==', 't1');
    expect(received.length).toBe(1);
  });

  it('safely handles non-staff subscription without uid by yielding empty array', () => {
    const received: AskMessage[][] = [];
    const unsub = subscribeAsks((msgs) => received.push(msgs), { isStaff: false });
    expect(received).toEqual([[]]);
    expect(typeof unsub).toBe('function');
  });

  it('handles error in subscribeAsks and subscribeStaffAsks', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (firestore.onSnapshot as any).mockImplementation((_col: any, _cb: any, errCb: any) => {
      errCb(new Error('snapshot err'));
      return () => {};
    });

    const customErr = vi.fn();
    subscribeAsks(vi.fn(), customErr);
    expect(customErr).toHaveBeenCalled();

    subscribeStaffAsks('t1', vi.fn(), customErr);
    expect(customErr).toHaveBeenCalledTimes(2);

    errorSpy.mockRestore();
  });

  it('tests pure helpers: askQuestions, askQuestionsBy, askRepliesOf, askAnswered, askWaitedDays, askWaitedWords, askStacksFor', () => {
    const qs = askQuestions(mockMessages);
    expect(qs.length).toBe(3);

    const byT1 = askQuestionsBy(mockMessages, 't1');
    expect(byT1.length).toBe(1);

    const replies = askRepliesOf(mockMessages, 'q1');
    expect(replies.length).toBe(1);

    expect(askAnswered(mockMessages, mockMessages[0])).toBe(true);
    expect(askAnswered(mockMessages, mockMessages[2])).toBe(false);

    expect(askWaitedDays(mockMessages[0])).toBe(3);
    expect(askWaitedWords(mockMessages[0])).toBe('waiting 3 days');
    expect(askWaitedWords(mockMessages[2])).toBe('asked today');
    expect(askWaitedWords(mockMessages[3])).toBe('waiting since yesterday');

    const stacks = askStacksFor(mockMessages, 'ft1');
    expect(stacks.length).toBe(2); // q2 and q3 are unanswered and not by ft1
  });

  it('askUnreadFor counts other people\'s unanswered, unread questions only (#1859)', () => {
    // mockMessages: q1 is answered, q2 and q3 are still waiting.
    expect(askUnreadFor(mockMessages, 'ft1', true, () => false)).toBe(2);
    // Reading one drops the count.
    expect(askUnreadFor(mockMessages, 'ft1', true, (k) => k === 'ask:q2')).toBe(1);
    // A question the full-timer asked themselves never counts.
    const own: AskMessage = {
      id: 'q4',
      parentId: null,
      owner: 'ft1',
      from: 'ft1',
      fromName: 'Mei Lin',
      kind: 'question',
      body: 'My own question',
      at: new Date().toISOString(),
    };
    expect(askUnreadFor([...mockMessages, own], 'ft1', true, () => false)).toBe(2);
    // Answering clears it.
    const answer: AskMessage = {
      id: 'r3',
      parentId: 'q3',
      owner: 't3',
      from: 'ft1',
      fromName: 'Mei Lin',
      kind: 'comment',
      body: 'Answered',
      at: new Date().toISOString(),
    };
    expect(askUnreadFor([...mockMessages, answer], 'ft1', true, () => false)).toBe(1);
  });

  it('adds ask message and handles failure', async () => {
    (firestore.addDoc as any).mockResolvedValueOnce({ id: 'new_ask' });
    await addAsk({ from: 't1', fromName: 'Zion', body: 'My question' });
    expect(firestore.addDoc).toHaveBeenCalled();

    (firestore.addDoc as any).mockRejectedValueOnce(new Error('write fail'));
    await addAsk({ from: 't1', fromName: 'Zion', body: 'My question' });
    expect(firebaseLib.handleFirestoreError).toHaveBeenCalledWith(
      expect.any(Error),
      firebaseLib.OperationType.CREATE,
      'asks'
    );
  });

  it('adds in-person askFor message and handles failure', async () => {
    (firestore.addDoc as any).mockResolvedValueOnce({ id: 'new_ask_for' });
    await addAskFor({
      askerId: 't1',
      askerName: 'Zion',
      takenBy: 'ft1',
      takenByName: 'Mei',
      body: 'Verbal question',
    });
    expect(firestore.addDoc).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        owner: 't1',
        from: 't1',
        takenBy: 'ft1',
        takenByName: 'Mei',
      })
    );

    (firestore.addDoc as any).mockRejectedValueOnce(new Error('write fail'));
    await addAskFor({
      askerId: 't1',
      askerName: 'Zion',
      takenBy: 'ft1',
      takenByName: 'Mei',
      body: 'Verbal question',
    });
    expect(firebaseLib.handleFirestoreError).toHaveBeenCalled();
  });

  it('adds ask reply with notification truncation and handles failure', async () => {
    const longBody = 'A'.repeat(200);
    (firestore.addDoc as any).mockResolvedValueOnce({ id: 'new_reply' });
    await addAskReply(
      'q1',
      { from: 'ft1', fromName: 'Mei Lin', body: longBody },
      't1',
      't1'
    );

    expect(firebaseLib.sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 't1',
        title: 'Mei answered your question',
        message: expect.stringMatching(/…$/),
        link: '/questions',
      })
    );

    (firestore.addDoc as any).mockRejectedValueOnce(new Error('write fail'));
    await addAskReply(
      'q1',
      { from: 'ft1', fromName: 'Mei Lin', body: 'Short' },
      't1'
    );
    expect(firebaseLib.handleFirestoreError).toHaveBeenCalled();
  });

  it('correctly reports askOrigin across different viewers and origin types', () => {
    const direct: AskMessage = {
      id: 'd1',
      parentId: null,
      owner: 't1',
      from: 't1',
      fromName: 'Zion Park',
      kind: 'question',
      body: 'Direct question',
      at: new Date().toISOString(),
    };

    // Viewed by other
    expect(askOrigin(direct, 'ft1')).toEqual({
      written: false,
      pen: null,
      icon: 'msg',
      text: 'Asked here, in their own words',
      short: 'Asked here',
    });

    // Viewed by asker
    expect(askOrigin(direct, 't1')).toEqual({
      written: false,
      pen: null,
      icon: 'msg',
      text: 'You asked this here, in your own words',
      short: 'You asked this here',
    });

    const recorded: AskMessage = {
      ...direct,
      id: 'r1',
      takenBy: 'ft1',
      takenByName: 'Mei Lin',
    };

    // Viewed by third party
    expect(askOrigin(recorded, 'ft2')).toEqual({
      written: true,
      pen: { uid: 'ft1', name: 'Mei Lin' },
      icon: 'edit',
      text: 'Asked in person · written down by Mei',
      short: 'Written down by Mei',
    });

    // Viewed by recorder
    expect(askOrigin(recorded, 'ft1')).toEqual({
      written: true,
      pen: { uid: 'ft1', name: 'Mei Lin' },
      icon: 'edit',
      text: 'Asked in person · written down by you',
      short: 'Written down by you',
    });

    // Viewed by asker
    expect(askOrigin(recorded, 't1')).toEqual({
      written: true,
      pen: { uid: 'ft1', name: 'Mei Lin' },
      icon: 'edit',
      text: 'Asked in person · Mei wrote it down for you',
      short: 'Mei wrote it down for you',
    });

    // Fallback when takenByName is empty
    const recordedFallback: AskMessage = {
      ...direct,
      id: 'r2',
      takenBy: 'ft3',
      takenByName: '',
    };
    expect(askOrigin(recordedFallback, 'other')).toEqual({
      written: true,
      pen: { uid: 'ft3', name: 'ft3' },
      icon: 'edit',
      text: 'Asked in person · written down by ft3',
      short: 'Written down by ft3',
    });
  });

  it('composes the origin sentence in the reader language, name intact (#1831)', () => {
    const en = (k: string, f?: string) => translate(k, 'en', f);
    const es = (k: string, f?: string) => translate(k, 'es', f);

    const direct: AskMessage = {
      id: 'd1',
      parentId: null,
      owner: 't1',
      from: 't1',
      fromName: 'Zion Park',
      kind: 'question',
      body: 'Direct question',
      at: new Date().toISOString(),
    };
    const recorded: AskMessage = {
      ...direct,
      id: 'r1',
      takenBy: 'ft1',
      takenByName: 'Mei Lin',
    };

    // All four variants, second person where the viewer is the asker.
    expect(askOriginText(direct, 't1', es)).toBe('La preguntaste aquí, con tus propias palabras');
    expect(askOriginText(direct, 'ft1', es)).toBe('Preguntada aquí, con sus propias palabras');
    expect(askOriginText(recorded, 't1', es)).toBe('Preguntada en persona · Mei la escribió por ti');
    expect(askOriginText(recorded, 'ft2', es)).toBe('Preguntada en persona · escrita por Mei');
    // The pen reading their own handwriting gets the `origin_you` slot.
    expect(askOriginText(recorded, 'ft1', es)).toBe('Preguntada en persona · escrita por ti');

    // English is byte-for-byte what `askOrigin().text` says.
    expect(askOriginText(direct, 't1', en)).toBe('You asked this here, in your own words');
    expect(askOriginText(direct, 'ft1', en)).toBe('Asked here, in their own words');
    expect(askOriginText(recorded, 't1', en)).toBe('Asked in person · Mei wrote it down for you');
    expect(askOriginText(recorded, 'ft2', en)).toBe('Asked in person · written down by Mei');
    expect(askOriginText(recorded, 'ft1', en)).toBe('Asked in person · written down by you');
  });

  it('says the wait in the reader language, never "1 días" (#1831)', () => {
    const en = (k: string, f?: string) => translate(k, 'en', f);
    const es = (k: string, f?: string) => translate(k, 'es', f);

    const daysAgo = (n: number): AskMessage => ({
      id: `w${n}`,
      parentId: null,
      owner: 't1',
      from: 't1',
      fromName: 'Zion Park',
      kind: 'question',
      body: 'Waiting',
      at: new Date(Date.now() - n * 86400000).toISOString(),
    });

    expect(askWaitedText(daysAgo(0), es)).toBe('preguntada hoy');
    expect(askWaitedText(daysAgo(1), es)).toBe('esperando desde ayer');
    expect(askWaitedText(daysAgo(2), es)).toBe('esperando 2 días');
    expect(askWaitedText(daysAgo(2), es)).not.toContain('1 días');

    expect(askWaitedText(daysAgo(0), en)).toBe('asked today');
    expect(askWaitedText(daysAgo(1), en)).toBe('waiting since yesterday');
    expect(askWaitedText(daysAgo(2), en)).toBe('waiting 2 days');
  });

  it('deleteAsk removes the question and every answer on it in one batch', async () => {
    const del = vi.fn();
    const commit = vi.fn().mockResolvedValue(undefined);
    (firestore.writeBatch as any).mockReturnValue({ delete: del, commit });
    (firestore.getDocs as any).mockResolvedValueOnce({
      forEach: (fn: (d: unknown) => void) => {
        [{ ref: { path: 'asks/r1' } }, { ref: { path: 'asks/r2' } }].forEach(fn);
      },
    });

    await deleteAsk('q1');

    // both replies + the question doc
    expect(del).toHaveBeenCalledTimes(3);
    expect(del).toHaveBeenCalledWith({ path: 'asks/r1' });
    expect(del).toHaveBeenCalledWith({ path: 'asks/r2' });
    expect(del).toHaveBeenCalledWith({ path: 'asks/q1' });
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('deleteAsk routes a failure through handleFirestoreError', async () => {
    (firestore.getDocs as any).mockRejectedValueOnce(new Error('nope'));
    await deleteAsk('q1');
    expect(firebaseLib.handleFirestoreError).toHaveBeenCalledWith(
      expect.any(Error),
      firebaseLib.OperationType.DELETE,
      'asks/q1',
    );
  });

  it('deleteAskReply removes a single reply by id (#680)', async () => {
    vi.mocked(firestore.deleteDoc).mockResolvedValueOnce(undefined as never);

    await deleteAskReply('r1');

    expect(firestore.doc).toHaveBeenCalledWith(expect.anything(), 'asks', 'r1');
    expect(firestore.deleteDoc).toHaveBeenCalledTimes(1);
    expect(firestore.deleteDoc).toHaveBeenCalledWith({ path: 'asks/r1' });
  });

  it('deleteAskReply routes a failure through handleFirestoreError', async () => {
    vi.mocked(firestore.deleteDoc).mockRejectedValueOnce(new Error('nope'));
    await deleteAskReply('r1');
    expect(firebaseLib.handleFirestoreError).toHaveBeenCalledWith(
      expect.any(Error),
      firebaseLib.OperationType.DELETE,
      'asks/r1',
    );
  });
});

