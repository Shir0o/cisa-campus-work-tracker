import { describe, it, expect, vi, beforeEach } from 'vitest';

type Listener = { path: string; next: (snap: unknown) => void; error: (e: unknown) => void; unsub: ReturnType<typeof vi.fn> };
const listeners: Listener[] = [];

const firestoreMock = vi.hoisted(() => ({
  collection: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  collectionGroup: vi.fn((_db: unknown, id: string) => ({ path: `**/${id}` })),
  query: vi.fn((ref: { path: string }) => ref),
  where: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
}));

vi.mock('firebase/firestore', () => firestoreMock);

import { subscribeTiedSubcollection, subscribeTouches } from '../src/data/contacts';
import { subscribeTiedThreads } from '../src/data/threads';

const listenerAt = (path: string) => listeners.filter((l) => l.path === path).pop()!;
const contactsSnap = (ids: string[]) => ({ docs: ids.map((id) => ({ id })) });
const subSnap = (contactId: string, sub: string, ids: string[], data: Record<string, unknown> = {}) => ({
  docs: ids.map((id) => ({ id, ref: { path: `contacts/${contactId}/${sub}/${id}` }, data: () => data })),
});
const paths = (docs: { ref: { path: string } }[]) => docs.map((d) => d.ref.path).sort();

beforeEach(() => {
  vi.clearAllMocks();
  listeners.length = 0;
  firestoreMock.onSnapshot.mockImplementation((q: { path: string }, next: Listener['next'], error: Listener['error']) => {
    const unsub = vi.fn();
    listeners.push({ path: q.path, next, error, unsub });
    return unsub;
  });
});

describe('subscribeTiedSubcollection', () => {
  it('lists each visible contact\'s subcollection and hands back the merged docs', () => {
    const cb = vi.fn();
    subscribeTiedSubcollection({} as never, 'trainee1', 'interactions', cb);

    expect(firestoreMock.where).toHaveBeenCalledWith('visibleTo', 'array-contains', 'trainee1');
    expect(firestoreMock.collectionGroup).not.toHaveBeenCalled();

    listenerAt('contacts').next(contactsSnap(['a', 'b']));
    listenerAt('contacts/a/interactions').next(subSnap('a', 'interactions', ['i1']));
    listenerAt('contacts/b/interactions').next(subSnap('b', 'interactions', ['i2', 'i3']));

    expect(paths(cb.mock.lastCall![0])).toEqual([
      'contacts/a/interactions/i1',
      'contacts/b/interactions/i2',
      'contacts/b/interactions/i3',
    ]);
  });

  it('orders a threads fan-out by `at`, the field thread messages carry', () => {
    subscribeTiedSubcollection({} as never, 'trainee1', 'threads', vi.fn());
    listenerAt('contacts').next(contactsSnap(['a']));

    expect(listenerAt('contacts/a/threads')).toBeDefined();
    expect(firestoreMock.orderBy).toHaveBeenCalledWith('at', 'desc');
    expect(firestoreMock.orderBy).not.toHaveBeenCalledWith('createdAt', 'desc');
  });

  it('follows the contact list: drops a person who is no longer visible and adds a new one', () => {
    const cb = vi.fn();
    subscribeTiedSubcollection({} as never, 'trainee1', 'comments', cb);
    listenerAt('contacts').next(contactsSnap(['a', 'b']));
    const b = listenerAt('contacts/b/comments');
    listenerAt('contacts/a/comments').next(subSnap('a', 'comments', ['c1']));
    b.next(subSnap('b', 'comments', ['c2']));

    listenerAt('contacts').next(contactsSnap(['a', 'c']));

    expect(b.unsub).toHaveBeenCalled();
    expect(paths(cb.mock.lastCall![0])).toEqual(['contacts/a/comments/c1']);
    expect(listeners.filter((l) => l.path === 'contacts/a/comments')).toHaveLength(1);
    listenerAt('contacts/c/comments').next(subSnap('c', 'comments', ['c3']));
    expect(paths(cb.mock.lastCall![0])).toEqual(['contacts/a/comments/c1', 'contacts/c/comments/c3']);
  });

  it('drops one person\'s docs quietly when their read is refused (a tie removed mid-flight)', () => {
    const cb = vi.fn();
    const onError = vi.fn();
    subscribeTiedSubcollection({} as never, 'trainee1', 'interactions', cb, onError);
    listenerAt('contacts').next(contactsSnap(['a']));
    listenerAt('contacts/a/interactions').next(subSnap('a', 'interactions', ['i1']));

    listenerAt('contacts/a/interactions').error(new Error('permission-denied'));

    expect(onError).not.toHaveBeenCalled();
    expect(cb.mock.lastCall![0]).toEqual([]);
  });

  it('reports a failure of the contact list itself', () => {
    const onError = vi.fn();
    subscribeTiedSubcollection({} as never, 'trainee1', 'interactions', vi.fn(), onError);
    const err = new Error('boom');
    listenerAt('contacts').error(err);
    expect(onError).toHaveBeenCalledWith(err);
  });

  it('closes every listener on unsubscribe', () => {
    const unsubscribe = subscribeTiedSubcollection({} as never, 'trainee1', 'interactions', vi.fn());
    listenerAt('contacts').next(contactsSnap(['a', 'b']));
    unsubscribe();
    for (const l of listeners) expect(l.unsub).toHaveBeenCalled();
  });
});

describe('subscribeTouches', () => {
  it('reads the collection-group feeds for a reader who sees every person', () => {
    subscribeTouches({} as never, vi.fn(), undefined, { role: 'admin', staffId: 'u1' });
    expect(listeners.map((l) => l.path).sort()).toEqual(['**/comments', '**/interactions']);
  });

  it('reads a Trainee\'s touches through their visible contacts only', () => {
    const cb = vi.fn();
    subscribeTouches({} as never, cb, undefined, { role: 'manager', staffId: 'trainee1' });
    expect(firestoreMock.collectionGroup).not.toHaveBeenCalled();

    const [forInteractions, forComments] = listeners.filter((l) => l.path === 'contacts');
    forInteractions.next(contactsSnap(['a']));
    forComments.next(contactsSnap(['a']));
    listenerAt('contacts/a/interactions').next(subSnap('a', 'interactions', ['i1'], { createdAt: '2026-01-01T00:00:00Z', content: ' Coffee ' }));
    listenerAt('contacts/a/comments').next(subSnap('a', 'comments', ['c1'], { createdAt: '2026-01-02T00:00:00Z', text: 'Note' }));

    expect(cb.mock.lastCall![0]).toEqual([
      { contactId: 'a', ms: Date.parse('2026-01-01T00:00:00Z'), note: 'Coffee' },
      { contactId: 'a', ms: Date.parse('2026-01-02T00:00:00Z'), note: 'Note' },
    ]);
  });
});

describe('subscribeTiedThreads', () => {
  it('reads a Trainee\'s threads through their visible contacts only, tagged with the contact', () => {
    const cb = vi.fn();
    subscribeTiedThreads({} as never, 'trainee1', cb);

    expect(firestoreMock.collectionGroup).not.toHaveBeenCalled();
    listenerAt('contacts').next(contactsSnap(['a']));
    listenerAt('contacts/a/threads').next({
      docs: [{
        id: 'm1',
        ref: { path: 'contacts/a/threads/m1', parent: { parent: { id: 'a' } } },
        data: () => ({ from: 'u1', fromName: 'Ada', kind: 'question', body: 'q', at: '2026-01-01T00:00:00.000Z', interactionId: null }),
      }],
    });

    expect(cb.mock.lastCall![0]).toEqual([
      { id: 'm1', contactId: 'a', interactionId: null, from: 'u1', fromName: 'Ada', kind: 'question', body: 'q', at: '2026-01-01T00:00:00.000Z' },
    ]);
  });
});
