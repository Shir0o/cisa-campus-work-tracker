// Mirror of packages/core/test/tiedSubcollection.test.ts for the web copy in
// src/lib/contactQueries.ts (this app mirrors @cisa/core rather than importing it).
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
vi.mock('../lib/firebase', () => ({ db: {} }));

import { subscribeTiedSubcollection } from '../lib/contactQueries';

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
    subscribeTiedSubcollection('trainee1', 'interactions', cb);

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

  it('follows the contact list: drops a person who is no longer visible and adds a new one', () => {
    const cb = vi.fn();
    subscribeTiedSubcollection('trainee1', 'comments', cb);
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
    subscribeTiedSubcollection('trainee1', 'interactions', cb, onError);
    listenerAt('contacts').next(contactsSnap(['a']));
    listenerAt('contacts/a/interactions').next(subSnap('a', 'interactions', ['i1']));

    listenerAt('contacts/a/interactions').error(new Error('permission-denied'));

    expect(onError).not.toHaveBeenCalled();
    expect(cb.mock.lastCall![0]).toEqual([]);
  });

  it('reports a failure of the contact list itself', () => {
    const onError = vi.fn();
    subscribeTiedSubcollection('trainee1', 'interactions', vi.fn(), onError);
    const err = new Error('boom');
    listenerAt('contacts').error(err);
    expect(onError).toHaveBeenCalledWith(err);
  });

  it('closes every listener on unsubscribe', () => {
    const unsubscribe = subscribeTiedSubcollection('trainee1', 'interactions', vi.fn());
    listenerAt('contacts').next(contactsSnap(['a', 'b']));
    unsubscribe();
    for (const l of listeners) expect(l.unsub).toHaveBeenCalled();
  });
});
