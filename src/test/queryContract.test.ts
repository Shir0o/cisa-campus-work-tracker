/**
 * Query-contract harness (#1474).
 *
 * The rules unit suite (`firestore.rules.test.ts`) pins rule *shapes*. It does
 * not catch the escapes that mattered most since 8-17: a rules change landing
 * without its call sites, or a client feature running a query/write the rules
 * deny. In every case the rules suite passed, because the bug sits *between*
 * the rules and the client's real query.
 *
 * This harness runs the app's REAL builders — the pure helpers and the
 * `db`-parameterised `packages/core/src/data/*` functions (or their `src/lib`
 * mirrors) — against the rules emulator, seeded with approved `/users` docs, and
 * asserts the query/write is allowed for the roles that run it and denied or
 * empty for the roles that must not. Each test names the escape row of the e2e
 * coverage audit (#1460) it pens.
 *
 * Runs only with the Firestore emulator ($FIRESTORE_EMULATOR_HOST), like the
 * rules suite:
 *   firebase emulators:exec --config firebase.rules-tests.json \
 *     --only firestore,database --project demo-campus-hub \
 *     "npx vitest run src/test/queryContract.test.ts"
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';

// The app's real builders. `src/lib/contactQueries` is the web mirror the
// board, Directory, My Day and every contact picker spread into their query.
import { contactVisibilityConstraints } from '../lib/contactQueries';
import {
  contactReadConstraints,
  subscribeTouches,
  updateContact,
  updateContactTags,
} from '../../packages/core/src/data/contacts';
import { subscribeAllThreads } from '../../packages/core/src/data/threads';
import { subscribeAsks, subscribeStaffAsks } from '../../packages/core/src/data/asks';
import { subscribeFullTimers, subscribeUsers, type FullTimerSummary } from '../../packages/core/src/data/users';
import { saveSeasonSettings } from '../../packages/core/src/data/seasons';
import { submitSignUp } from '../../packages/core/src/data/signup';
import { buildQueue } from '../../packages/core/src/queue';
import { traineeWaitingItems } from '../../packages/core/src/inbox';
import { applyRoster } from '../../packages/core/src/walking';
import type { Contact, AppUser } from '../../packages/core/src/types';
import type { Touch } from '../../packages/core/src/myday';
import type { AskMessage } from '../../packages/core/src/asks';
import type { ThreadMessageWithContact } from '../../packages/core/src/threads';
import { nullEmailContact, noOwnerContact } from './fixtures/contacts';

const ADMIN = 'admin1';
const TRAINEE = 'manager1';
const OTHER_TRAINEE = 'manager2';
const STUDENT = 'operator1';
const VIEWER = 'viewer1';
const PENDING = 'pending1';

const ISO = '2026-10-01T00:00:00.000Z';

const describeRules = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

/** First value or error from a subscription, then unsubscribe. */
function awaitSnapshot<T>(
  subscribe: (cb: (v: T) => void, onError: (e: unknown) => void) => () => void,
  accept: (v: T) => boolean = () => true,
  timeout = 5000,
): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  return new Promise((resolve) => {
    let settled = false;
    let unsub: () => void = () => {};
    const done = (r: { ok: true; value: T } | { ok: false; error: unknown }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsub();
      resolve(r);
    };
    const timer = setTimeout(() => done({ ok: false, error: new Error('timeout') }), timeout);
    unsub = subscribe(
      (v) => {
        // A fan-out reader (e.g. the scoped touches read) publishes an empty
        // list once before its per-contact docs land; wait for the real one.
        if (accept(v)) done({ ok: true, value: v });
      },
      (e) => done({ ok: false, error: e }),
    );
  });
}

const contact = (id: string, over: Record<string, unknown>): Contact =>
  ({ id, name: id, email: `${id}@example.com`, stage: 'Lead', ...over }) as Contact;

const thread = (over: Partial<ThreadMessageWithContact>): ThreadMessageWithContact => ({
  id: 't',
  contactId: 'c-mine',
  interactionId: null,
  from: ADMIN,
  fromName: 'Admin',
  kind: 'nudge',
  body: 'hello',
  at: ISO,
  ...over,
});

function seedUser(db: Firestore, uid: string, over: Record<string, unknown>): Promise<void> {
  return setDoc(doc(db, 'users', uid), {
    email: `${uid}@example.com`,
    displayName: uid,
    photoURL: null,
    role: 'viewer',
    approved: true,
    createdAt: ISO,
    updatedAt: ISO,
    ...over,
  });
}

function seedDoc(db: Firestore, path: string, data: object): Promise<void> {
  return setDoc(doc(db, path), data);
}

describeRules('query contracts against the rules emulator (#1474)', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: 'demo-campus-hub',
      firestore: {
        rules: fs.readFileSync('firestore.rules', 'utf8'),
        host: 'localhost',
        port: 8080,
      },
    });

    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore() as unknown as Firestore;
      // Approved roster. manager = trainee (scoped); admin/operator/viewer see
      // every person; pending is approved:false.
      await seedUser(db, ADMIN, { role: 'admin', approved: true });
      await seedUser(db, TRAINEE, { role: 'manager', approved: true });
      await seedUser(db, OTHER_TRAINEE, { role: 'manager', approved: true });
      await seedUser(db, STUDENT, { role: 'operator', approved: true });
      await seedUser(db, VIEWER, { role: 'viewer', approved: true });
      await seedUser(db, PENDING, { role: 'viewer', approved: false });

      // Contacts: one the trainee is tied to, one they are not.
      await seedDoc(db, 'contacts/c-mine', contact('c-mine', {
        createdBy: TRAINEE, visibleTo: [TRAINEE],
      }));
      await seedDoc(db, 'contacts/c-theirs', contact('c-theirs', {
        createdBy: OTHER_TRAINEE, visibleTo: [OTHER_TRAINEE],
      }));
      // Legacy-shape docs from the shared fixtures: no `owner` key (row 17),
      // null email (row 20).
      const { id: noOwnerId, ...noOwner } = noOwnerContact;
      await seedDoc(db, `contacts/${noOwnerId}`, { ...noOwner, visibleTo: [ADMIN] });
      const { id: nullEmailId, ...nullEmail } = nullEmailContact;
      await seedDoc(db, `contacts/${nullEmailId}`, { ...nullEmail, visibleTo: [ADMIN] });

      // Subcollections behind c-mine / c-theirs for the touches + threads reads.
      await seedDoc(db, 'contacts/c-mine/interactions/i-mine', {
        userId: TRAINEE, userName: 'Trainee', content: 'called', dateTime: ISO, createdAt: ISO,
      });
      await seedDoc(db, 'contacts/c-theirs/interactions/i-theirs', {
        userId: OTHER_TRAINEE, userName: 'Other', content: 'secret', dateTime: ISO, createdAt: ISO,
      });
      await seedDoc(db, 'contacts/c-mine/comments/cm-mine', { text: 'a comment', createdAt: ISO });
      // A trainee's own thread message and a Full-timers-only (`scope: team`)
      // one on the same person — the row-5 leak.
      await seedDoc(db, 'contacts/c-mine/threads/t-nudge', {
        from: ADMIN, fromName: 'Admin', kind: 'nudge', body: 'a nudge', at: ISO, interactionId: null,
      });
      await seedDoc(db, 'contacts/c-mine/threads/t-team', {
        from: ADMIN, fromName: 'Admin', kind: 'comment', body: 'team only', at: ISO, scope: 'team',
      });
      await seedDoc(db, 'contacts/c-theirs/threads/t-secret', {
        from: OTHER_TRAINEE, fromName: 'Other', kind: 'comment', body: 'secret', at: ISO,
      });

      // Ask-the-team rows: two owners. Staff read the whole collection.
      await seedDoc(db, 'asks/q-mine', {
        parentId: null, owner: TRAINEE, from: TRAINEE, fromName: 'Trainee',
        kind: 'question', body: 'mine', at: ISO,
      });
      await seedDoc(db, 'asks/q-other', {
        parentId: null, owner: OTHER_TRAINEE, from: OTHER_TRAINEE, fromName: 'Other',
        kind: 'question', body: 'theirs', at: ISO,
      });
    });

    // buildQueue / traineeWaitingItems read the roster from the walking module.
    applyRoster([
      { uid: ADMIN, role: 'admin' },
      { uid: TRAINEE, role: 'manager' },
      { uid: OTHER_TRAINEE, role: 'manager' },
    ]);
  });

  afterAll(async () => {
    await env.cleanup();
  });

  // rules-unit-testing types its Firestore from its own bundled `firebase`
  // namespace; the app's builders use the root `firebase/firestore` type. They
  // are the same instance at runtime, so normalize the type at this boundary.
  const dbFor = (uid: string) =>
    env.authenticatedContext(uid).firestore() as unknown as Firestore;

  // ── Row 1: phone People touches (#1411 / #1412) ───────────────────────────
  // The phone People screen calls the real `subscribeTouches` with a scope. If
  // it omits the scope, the reader falls through to the collection-group feed
  // the rules deny a Trainee, and People loads nothing ("Couldn't get touches").
  it('row 1 — a Trainee’s scoped touches read succeeds and only carries their person', async () => {
    const db = dbFor(TRAINEE);
    const res = await awaitSnapshot<Touch[]>(
      (cb, onError) => subscribeTouches(db, cb, onError, { role: 'manager', staffId: TRAINEE }),
      (v) => v.length > 0,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.length).toBeGreaterThan(0);
    expect(res.value.every((t) => t.contactId === 'c-mine')).toBe(true); // negative: no c-theirs
  });

  it('row 1 — the unscoped touches feed (the pre-#1412 phone call) is denied to a Trainee', async () => {
    const res = await awaitSnapshot<Touch[]>((cb, onError) => subscribeTouches(dbFor(TRAINEE), cb, onError));
    expect(res.ok).toBe(false);
  });

  // ── Row 2: the Journey board does not load for trainees (#1218) ───────────
  // #1036 tightened the rules; the board's contacts query had to carry the
  // scope, or the whole board is permission-denied. The real web builder is
  // `contactVisibilityConstraints`, which `OutreachBoard` spreads into its query.
  it('row 2 — the board’s scoped contacts query returns the tied person and excludes the untied one', async () => {
    const db = dbFor(TRAINEE);
    const q = query(collection(db, 'contacts'), ...contactVisibilityConstraints('manager', TRAINEE));
    const snap = await getDocs(q);
    const ids = snap.docs.map((d) => d.id);
    expect(ids).toContain('c-mine');
    expect(ids).not.toContain('c-theirs'); // negative
  });

  it('row 2 — the same query without the scope (the pre-#1224 board) is denied', async () => {
    await assertFails(getDocs(query(collection(dbFor(TRAINEE), 'contacts'))));
  });

  // ── Row 3: Messages & Questions for the team broke for staff (#564) ───────
  // The asks feed read the whole collection; the rules allow that only to
  // `isManager()` (staff), not to viewers.
  it('row 3 — the staff asks subscription reads the whole team feed', async () => {
    const res = await awaitSnapshot<AskMessage[]>((cb, onError) =>
      subscribeAsks(dbFor(ADMIN), cb, onError, { uid: ADMIN, isStaff: true }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.map((a) => a.id).sort()).toEqual(['q-mine', 'q-other']);
  });

  it('row 3 — a non-staff viewer’s own-owner query is allowed but empty for others', async () => {
    const res = await awaitSnapshot<AskMessage[]>((cb, onError) =>
      subscribeAsks(dbFor(VIEWER), cb, onError, { uid: VIEWER, isStaff: false }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value).toEqual([]);
  });

  // ── Row 4: Questions channel denied under "See as their view" (#603) ──────
  // A Full-timer impersonating a trainee must still read the team feed. The
  // query is unscoped for staff; scoping it by the persona's uid would both
  // hide the team's questions and be denied (the persona did not author them).
  it('row 4 — the staff asks feed is not scoped to the impersonated uid', async () => {
    const res = await awaitSnapshot<AskMessage[]>((cb, onError) => subscribeStaffAsks(dbFor(ADMIN), TRAINEE, cb, onError));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.map((a) => a.id).sort()).toEqual(['q-mine', 'q-other']);
  });

  // ── Row 5: Full-timers-only posts leaked onto the trainee phone home (#951)
  // `buildQueue` and `traineeWaitingItems` must drop `scope: "team"` messages.
  it('row 5 — buildQueue never turns a team-scope message into a card', () => {
    const mine = contact('c-mine', { createdBy: TRAINEE, visibleTo: [TRAINEE], lastSeen: ISO });
    const queue = buildQueue({
      uid: TRAINEE,
      fullTimers: [ADMIN],
      contacts: [mine],
      tasks: [],
      threads: [
        thread({ id: 't-team', contactId: 'c-mine', scope: 'team', kind: 'comment' }),
        thread({ id: 't-nudge', contactId: 'c-mine', kind: 'nudge' }),
      ],
      interactions: [],
      prayers: [],
      isRead: () => false,
      handled: {},
      later: {},
    });
    expect(queue.some((c) => c.msg?.id === 't-team')).toBe(false); // negative
    expect(queue.some((c) => c.msg?.id === 't-nudge')).toBe(true);
  });

  it('row 5 — traineeWaitingItems drops team-scope nudges', () => {
    const items = traineeWaitingItems(TRAINEE, [
      thread({ id: 'w-team', contactId: 'c-mine', scope: 'team', kind: 'nudge' }),
      thread({ id: 'w-nudge', contactId: 'c-mine', kind: 'nudge' }),
    ]);
    expect(items.map((i) => i.id)).not.toContain('thread:w-team'); // negative
    expect(items.map((i) => i.id)).toContain('thread:w-nudge');
  });

  // ── Row 6: phone home showed people not in the trainee's care (#1087) ─────
  // `traineeWaitingItems` takes the caller's allowed contact ids (the trainee's
  // own people) and must drop a message about anyone else.
  it('row 6 — traineeWaitingItems stays inside the trainee’s own people', () => {
    const items = traineeWaitingItems(
      TRAINEE,
      [
        thread({ id: 'w-in', contactId: 'c-mine', kind: 'nudge' }),
        thread({ id: 'w-out', contactId: 'c-theirs', kind: 'nudge' }),
      ],
      new Set(['c-mine']),
    );
    expect(items.map((i) => i.id)).toContain('thread:w-in');
    expect(items.map((i) => i.id)).not.toContain('thread:w-out'); // negative
  });

  // ── Row 7: "See as their view" scoping (#559 / #679) ─────────────────────
  // The Directory / attention feed must scope by the EFFECTIVE uid (the
  // persona), not the owner's own uid, or it shows people the trainee can't see.
  it('row 7 — the scoped Directory query applies to the impersonated trainee’s uid', async () => {
    const db = dbFor(ADMIN);
    const q = query(collection(db, 'contacts'), ...contactVisibilityConstraints('manager', TRAINEE));
    const snap = await getDocs(q);
    const ids = snap.docs.map((d) => d.id);
    expect(ids).toContain('c-mine');
    expect(ids).not.toContain('c-theirs'); // negative
  });

  // ── Row 11: public sign-ups invisible to Full-timers (#1071) ─────────────
  // The real public writer stamps no ties; a Full-timer's unscoped read still
  // returns the lead, a Trainee's scoped read does not.
  it('row 11 — a public sign-up is readable by a Full-timer and not by a Trainee', async () => {
    const form = {
      name: 'Public Lead', gender: 'F', year: 'Freshman', major: 'Biology',
      phone: '555', email: 'lead@example.com', spiritualBackground: '',
      interests: [], prayerRequest: '', notes: '',
    };
    const newId = await submitSignUp(env.unauthenticatedContext().firestore() as unknown as Firestore, form, []);

    const adminSnap = await getDocs(query(collection(dbFor(ADMIN), 'contacts')));
    expect(adminSnap.docs.map((d) => d.id)).toContain(newId);

    const traineeSnap = await getDocs(query(
      collection(dbFor(TRAINEE), 'contacts'),
      ...contactReadConstraints({ role: 'manager', staffId: TRAINEE }),
    ));
    expect(traineeSnap.docs.map((d) => d.id)).not.toContain(newId); // negative
  });

  // ── Row 12: the roster listener emptied on one denial (#1163) ────────────
  // The roster's queries must be allowed for the roles that run them, so the
  // listener never has to swallow a permission-denied.
  it('row 12 — the Full-timer roster query is allowed for a Trainee and an Admin', async () => {
    const asTrainee = await awaitSnapshot<FullTimerSummary[]>((cb, onError) => subscribeFullTimers(dbFor(TRAINEE), cb, onError));
    expect(asTrainee.ok).toBe(true);
    if (asTrainee.ok) expect(asTrainee.value.map((u) => u.uid)).toContain(ADMIN);

    const asAdmin = await awaitSnapshot<AppUser[]>((cb, onError) => subscribeUsers(dbFor(ADMIN), cb, onError));
    expect(asAdmin.ok).toBe(true);
  });

  it('row 12 — an unapproved user is denied the roster', async () => {
    const res = await awaitSnapshot<AppUser[]>((cb, onError) => subscribeUsers(dbFor(PENDING), cb, onError));
    expect(res.ok).toBe(false);
  });

  // ── Row 17: owner transfer threw on legacy no-owner docs (#802) ──────────
  // The real edit builder must still save a doc that predates the retired
  // `owner` field. A revert that makes the rules require `owner` goes red here.
  it('row 17 — updateContact saves a legacy no-owner contact', async () => {
    await expect(updateContact(dbFor(ADMIN), noOwnerContact.id, {
      name: noOwnerContact.name, initials: noOwnerContact.initials, email: noOwnerContact.email ?? '',
      phone: noOwnerContact.phone, stage: noOwnerContact.stage, tags: [],
      notes: 'followed up', spiritualBackground: '',
    }, { uid: ADMIN, name: 'Admin' })).resolves.toBeUndefined();
  });

  // ── Row 18: turning on the BFA intake flag was denied (#1111) ────────────
  it('row 18 — a manager can write the BFA season flag (real saveSeasonSettings)', async () => {
    await expect(saveSeasonSettings(dbFor(TRAINEE), { bfa: true })).resolves.toBeUndefined();
    await expect(saveSeasonSettings(dbFor(TRAINEE), { bfa: false })).resolves.toBeUndefined();
  });

  it('row 18 — a non-manager may not write the season flag', async () => {
    await assertFails(saveSeasonSettings(dbFor(VIEWER), { bfa: true }));
  });

  // ── Row 19: Add to story refused for everyone (#1328) ────────────────────
  // The client writes `storyMessageIds` as arrayUnion/arrayRemove
  // (ContactDetailsModal.toggleStoryMessage). Pin that exact shape: a tied
  // Trainee may add and remove, an untied one may not.
  it('row 19 — a tied Trainee can add a message to the story and take it back', async () => {
    const ref = doc(dbFor(TRAINEE), 'contacts', 'c-mine');
    await expect(updateDoc(ref, { storyMessageIds: arrayUnion('m1') })).resolves.toBeUndefined();
    await expect(updateDoc(ref, { storyMessageIds: arrayRemove('m1') })).resolves.toBeUndefined();
  });

  it('row 19 — a Trainee who cannot see the person is refused', async () => {
    await assertFails(updateDoc(doc(dbFor(TRAINEE), 'contacts', 'c-theirs'), { storyMessageIds: arrayUnion('m1') }));
  });

  // ── Row 20: updating a contact with no email was denied (#1251) ──────────
  // A tags-only edit leaves the stored `email: null` unchanged, which the old
  // rule rejected because it required a string email.
  it('row 20 — updateContactTags saves a legacy null-email contact', async () => {
    await expect(updateContactTags(dbFor(ADMIN), nullEmailContact.id, ['Fall 2026'], {
      uid: ADMIN, name: 'Admin',
    })).resolves.toBeUndefined();
  });

  // ── Rows 3/5 (db side): the collection-group thread feed ─────────────────
  // `subscribeAllThreads` is the Full-timer inbox read. The rules deny it to a
  // Trainee (their read is the nested per-contact one) and allow it to a
  // Full-timer.
  it('rows 3/5 — subscribeAllThreads is denied to a Trainee and allowed to a Full-timer', async () => {
    const trainee = await awaitSnapshot<ThreadMessageWithContact[]>((cb, onError) => subscribeAllThreads(dbFor(TRAINEE), cb, onError));
    expect(trainee.ok).toBe(false); // negative

    const admin = await awaitSnapshot<ThreadMessageWithContact[]>((cb, onError) => subscribeAllThreads(dbFor(ADMIN), cb, onError));
    expect(admin.ok).toBe(true);
    if (admin.ok) expect(admin.value.length).toBeGreaterThan(0);
  });
});
