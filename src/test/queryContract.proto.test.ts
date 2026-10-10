// ⚠️ THROWAWAY PROTOTYPE — wayfinder ticket #1466. NOT production. Delete once
// the decision is captured on the ticket.
//
// Question: how do query-contract tests run the app's REAL query builders
// (`src/` and `packages/core/`) against the Firestore rules emulator, so a
// client query the rules deny fails on the PR?
//
// Assumed branch: backend/harness spike (not a UI/state-model artifact), so
// this is a throwaway vitest file rather than an HTML state machine.
//
// Run (needs the emulator + FIRESTORE_EMULATOR_HOST, like the rules suite):
//   firebase emulators:exec --config firebase.rules-tests.json --only firestore \
//     --project demo-campus-hub "npx vitest run src/test/queryContract.proto.test.ts"
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import * as fs from 'fs';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { collection, doc, getDocs, query, setDoc } from 'firebase/firestore';

// The REAL src/ query builder. Already pure over (role, staffId) — no change.
import { contactVisibilityConstraints } from '../lib/contactQueries';
// The REAL packages/core query builder for escape #951. Already parameterised
// over a Firestore instance — no change.
import { subscribeAllThreads } from '../../packages/core/src/data/threads';

const TRAINEE = 'uid-trainee';
const OTHER = 'uid-other';
const ADMIN = 'uid-admin';

const describeRules = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

describeRules('PROTOTYPE #1466 — query contracts against the rules emulator', () => {
  let env: RulesTestEnvironment;

  beforeAll(async () => {
    env = await initializeTestEnvironment({
      projectId: 'proto-query-contracts',
      firestore: { rules: fs.readFileSync('firestore.rules', 'utf8'), host: 'localhost', port: 8080 },
    });
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore();
      // isApprovedUser() reads /users/{uid}: seed approved users with roles.
      await setDoc(doc(db, 'users', TRAINEE), { role: 'manager', approved: true });
      await setDoc(doc(db, 'users', ADMIN), { role: 'admin', approved: true });
      await setDoc(doc(db, 'users', OTHER), { role: 'manager', approved: true });
      await setDoc(doc(db, 'contacts', 'c-mine'), { name: 'Mine', visibleTo: [TRAINEE] });
      await setDoc(doc(db, 'contacts', 'c-theirs'), { name: 'Theirs', visibleTo: [OTHER] });
      await setDoc(doc(db, 'contacts', 'c-mine', 'threads', 't1'), { body: 'mine', scope: 'team' });
      await setDoc(doc(db, 'contacts', 'c-theirs', 'threads', 't2'), { body: 'secret', scope: 'team' });
    });
  });

  afterAll(async () => {
    await env.cleanup();
  });

  it('A1 — src/ real constraints: trainee list succeeds, negative check excludes the untied person', async () => {
    const db = env.authenticatedContext(TRAINEE).firestore();
    const q = query(collection(db, 'contacts'), ...contactVisibilityConstraints('manager', TRAINEE));
    const ids = (await getDocs(q)).docs.map((d) => d.id);
    expect(ids).toContain('c-mine');
    expect(ids).not.toContain('c-theirs'); // negative check
  });

  it('A2 — src/ real constraints: admin runs unconstrained and sees both', async () => {
    const db = env.authenticatedContext(ADMIN).firestore();
    const q = query(collection(db, 'contacts'), ...contactVisibilityConstraints('admin', ADMIN));
    const ids = (await getDocs(q)).docs.map((d) => d.id);
    expect(ids.sort()).toEqual(['c-mine', 'c-theirs']);
  });

  it('B1 — packages/core real subscribeAllThreads: trainee is DENIED (escape #951 as a contract)', async () => {
    const db = env.authenticatedContext(TRAINEE).firestore();
    const outcome = await new Promise<string>((resolve) => {
      const unsub = subscribeAllThreads(
        db,
        () => resolve('ok'),
        (e: { code?: string }) => resolve('denied:' + (e?.code ?? '?')),
      );
      setTimeout(() => {
        unsub();
        resolve('timeout');
      }, 3000);
    });
    expect(outcome).toMatch(/denied/);
  });

  it('B2 — packages/core real subscribeAllThreads: admin sees the threads', async () => {
    const db = env.authenticatedContext(ADMIN).firestore();
    const msgs = await new Promise<unknown[]>((resolve) => {
      const unsub = subscribeAllThreads(
        db,
        (m) => {
          unsub();
          resolve(m);
        },
        () => resolve([]),
      );
      setTimeout(() => resolve([]), 3000);
    });
    expect(msgs.length).toBeGreaterThan(0);
  });
});
