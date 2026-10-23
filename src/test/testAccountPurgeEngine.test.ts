import { describe, it, expect } from 'vitest';
import { TestAccountPurgeEngine, type PurgeAuth, type PurgeDb } from '../server/testAccountPurgeEngine';

const OWNER = 'owner@example.com';

// In-memory Firestore double: documents keyed by full path.
function createFakeDb(seed: Record<string, Record<string, any>>, failOn: string[] = []) {
  const docs = new Map(Object.entries(seed));
  const snap = (match: (path: string) => boolean) => ({
    docs: [...docs.entries()]
      .filter(([path]) => match(path))
      .map(([path, data]) => ({ id: path.split('/').pop()!, ref: { path }, data: () => data })),
  });
  const db: PurgeDb = {
    collection: (name) => ({
      get: async () => snap((p) => p.split('/').length === name.split('/').length + 1 && p.startsWith(`${name}/`)),
    }),
    collectionGroup: (id) => ({
      get: async () => snap((p) => { const s = p.split('/'); return s.length % 2 === 0 && s[s.length - 2] === id; }),
    }),
    doc: (path) => ({ path }),
    recursiveDelete: async (ref: any) => {
      if (failOn.includes(ref.path)) throw new Error('boom');
      for (const p of [...docs.keys()]) if (p === ref.path || p.startsWith(`${ref.path}/`)) docs.delete(p);
    },
  };
  return { db, docs };
}

function createFakeAuth(users: { uid: string; email?: string; displayName?: string }[]) {
  const live = new Map(users.map((u) => [u.uid, u]));
  const auth: PurgeAuth = {
    listUsers: async () => ({ users: [...live.values()] }),
    deleteUsers: async (uids) => {
      uids.forEach((u) => live.delete(u));
      return { errors: [] };
    },
  };
  return { auth, live };
}

const user = (email: string, displayName: string) => ({ email, displayName, role: 'operator', approved: true });

function seed() {
  return {
    'users/me': user('cisa-admin@cisa.campus', 'cisa-admin'),
    'users/real': user('sarah@campus.edu', 'Sarah Lee'),
    'users/rev': user('reviewer@gmail.com', 'App Store Reviewer'),
    'users/rev/personalPrayers/p1': { text: 'x' },
    'users/rev/pushDevices/d1': { token: 't' },
    'users/real/personalPrayers/p2': { text: 'y' },
    'userPreferences/rev': { theme: 'dark' },
    'userPreferences/real': { theme: 'light' },
    'events/e1/rsvps/rev': { at: 1 },
    'events/e1/rsvps/real': { at: 1 },
    'invitations/reviewer2@gmail.com': { email: 'reviewer2@gmail.com' },
    'invitations/cisa-admin@cisa.campus': { email: 'cisa-admin@cisa.campus' },
    'invitations/bob@campus.edu': { email: 'bob@campus.edu' },
    'contacts/cReal': { name: 'Real', createdBy: 'real' },
    'contacts/cReal/interactions/i1': { userId: 'rev' },
    'contacts/cReal/interactions/i2': { userId: 'real' },
    'contacts/cReal/interactions/i3': { createdById: 'rev' },
    'contacts/cReal/comments/m1': { userId: 'rev' },
    'contacts/cReal/threads/t1': { from: 'rev' },
    'contacts/cTest': { name: 'Test', createdBy: 'rev' },
    'contacts/cTest/interactions/i4': { userId: 'real' },
    'chatRooms/rTest': { memberIds: ['rev', 'authOnly'] },
    'chatRooms/rTest/messages/x': { senderId: 'rev' },
    'chatRooms/rMixed': { memberIds: ['rev', 'real'], createdById: 'rev' },
    'chatRooms/rMixed/messages/a': { senderId: 'rev' },
    'chatRooms/rMixed/messages/b': { senderId: 'real' },
    'notifications/n1': { userId: 'rev' },
    'notifications/n2': { userId: 'real' },
    'activities/a1': { userId: 'rev' },
    'asks/k1': { from: 'rev', owner: 'real' },
    'asks/k2': { from: 'real', owner: 'real' },
    'prayerRequests/q1': { uid: 'rev' },
    'feedback/f1': { userId: 'rev' },
    'feedback/f1/replies/r1': { body: 'hi' },
  };
}

const authUsers = [
  { uid: 'me', email: 'cisa-admin@cisa.campus' },
  { uid: 'real', email: 'sarah@campus.edu' },
  { uid: 'rev', email: 'reviewer@gmail.com' },
  { uid: 'authOnly', email: 'cisa-ghost@gmail.com' },
  { uid: 'owner', email: OWNER, displayName: 'cisa-owner' },
];

describe('TestAccountPurgeEngine', () => {
  it('plans every trace of the test accounts and nothing of real people', async () => {
    const { db } = createFakeDb(seed());
    const { auth } = createFakeAuth(authUsers);
    const plan = await new TestAccountPurgeEngine({ db, auth, ownerEmail: OWNER }).scan('me');

    expect(plan.accounts).toEqual(['users/rev']);
    expect(plan.logins.sort()).toEqual(['authOnly', 'rev']);
    expect(plan.invitations).toEqual(['invitations/reviewer2@gmail.com']);
    expect(plan.personal.sort()).toEqual(['events/e1/rsvps/rev', 'userPreferences/rev']);
    expect(plan.interactions.sort()).toEqual(['contacts/cReal/interactions/i1', 'contacts/cReal/interactions/i3']);
    expect(plan.notes.sort()).toEqual(['contacts/cReal/comments/m1', 'contacts/cReal/threads/t1']);
    // The all-test room goes whole; in the mixed room only the test message goes.
    expect(plan.chats.sort()).toEqual(['chatRooms/rMixed/messages/a', 'chatRooms/rTest']);
    expect(plan.activity.sort()).toEqual(['activities/a1', 'notifications/n1']);
    expect(plan.asks.sort()).toEqual(['asks/k1', 'prayerRequests/q1']);
    expect(plan.feedback).toEqual(['feedback/f1']);
    expect(plan.contacts).toEqual(['contacts/cTest']);
    expect(plan.keptSelf).toEqual(['cisa-admin@cisa.campus']);
  });

  it('never deletes the account running the purge, even when it looks like a test account', async () => {
    const { db, docs } = createFakeDb(seed());
    const { auth, live } = createFakeAuth(authUsers);
    const engine = new TestAccountPurgeEngine({ db, auth, ownerEmail: OWNER });
    const res = await engine.purge(await engine.scan('me'), { deleteTestContacts: false });

    expect(res.failed).toEqual([]);
    expect(docs.has('users/me')).toBe(true);
    expect(docs.has('invitations/cisa-admin@cisa.campus')).toBe(true);
    expect(live.has('me')).toBe(true);
    expect(live.has('owner')).toBe(true);
  });

  it('removes the test traces, with what is nested under them, and keeps real data', async () => {
    const { db, docs } = createFakeDb(seed());
    const { auth, live } = createFakeAuth(authUsers);
    const engine = new TestAccountPurgeEngine({ db, auth, ownerEmail: OWNER });
    const res = await engine.purge(await engine.scan('me'), { deleteTestContacts: false });

    for (const gone of [
      'users/rev',
      'users/rev/personalPrayers/p1',
      'users/rev/pushDevices/d1',
      'chatRooms/rTest/messages/x',
      'feedback/f1/replies/r1',
    ]) {
      expect(docs.has(gone), gone).toBe(false);
    }
    for (const kept of [
      'users/real/personalPrayers/p2',
      'userPreferences/real',
      'contacts/cReal/interactions/i2',
      'chatRooms/rMixed',
      'chatRooms/rMixed/messages/b',
      'asks/k2',
      'contacts/cTest',
    ]) {
      expect(docs.has(kept), kept).toBe(true);
    }
    expect([...live.keys()].sort()).toEqual(['me', 'owner', 'real']);
    // 15 docs (contacts not chosen) + 2 logins.
    expect(res.deletedCount).toBe(17);
  });

  it('deletes an opted-in contact with everything logged on it', async () => {
    const { db, docs } = createFakeDb(seed());
    const { auth } = createFakeAuth(authUsers);
    const engine = new TestAccountPurgeEngine({ db, auth, ownerEmail: OWNER });
    await engine.purge(await engine.scan('me'), { deleteTestContacts: true });

    expect(docs.has('contacts/cTest')).toBe(false);
    expect(docs.has('contacts/cTest/interactions/i4')).toBe(false);
  });

  it('keeps going past a target that fails and reports it', async () => {
    const { db, docs } = createFakeDb(seed(), ['notifications/n1']);
    const { auth, live } = createFakeAuth(authUsers);
    const engine = new TestAccountPurgeEngine({ db, auth, ownerEmail: OWNER });
    const res = await engine.purge(await engine.scan('me'), { deleteTestContacts: false });

    expect(res.failed).toEqual([{ target: 'notifications/n1', error: 'boom' }]);
    expect(docs.has('users/rev')).toBe(false);
    expect(live.has('rev')).toBe(false);
  });
});
