import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { ref, get, set, update, remove } from 'firebase/database';
import { describe, it, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';

let testEnv: RulesTestEnvironment;
const PROJECT_ID = 'campus-hub-rtdb-security-test';

// These tests need the Realtime Database emulator on port 9000. They run only
// when FIREBASE_DATABASE_EMULATOR_HOST is set — which `firebase emulators:exec`
// does for its child process (see .github/workflows/deploy-database-rules.yml).
// Without an emulator (plain `npm test`, coverage, local runs) they stay
// skipped, mirroring firestore.rules.test.ts.
const describeRules = process.env.FIREBASE_DATABASE_EMULATOR_HOST
  ? describe
  : describe.skip;

// The meetings realtime path (ADR 0012 §2) and the Board pages path it mirrors.
const MEETING_DOC = 'bible_study_meetings_rtdb/meeting-123';
const BOARD_DOC = 'board_docs_rtdb/board-doc-123';

describeRules('Realtime Database Security Rules', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      database: {
        rules: fs.readFileSync('database.rules.json', 'utf8'),
        host: '127.0.0.1',
        port: 9000,
      },
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  const getRtdb = (uid?: string) => {
    const context = uid
      ? testEnv.authenticatedContext(uid)
      : testEnv.unauthenticatedContext();
    return context.database();
  };

  it('denies unauthenticated reads on the meetings realtime path', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await set(
        ref(context.database(), `${MEETING_DOC}/updates/push1`),
        'base64update',
      );
    });
    await assertFails(get(ref(getRtdb(), MEETING_DOC)));
  });

  it('denies unauthenticated writes on the meetings realtime path', async () => {
    await assertFails(set(ref(getRtdb(), `${MEETING_DOC}/updates/push1`), 'base64update'));
    await assertFails(set(ref(getRtdb(), `${MEETING_DOC}/seeded`), true));
  });

  it('denies unauthenticated updates and deletes on the meetings realtime path', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await set(ref(context.database(), `${MEETING_DOC}/updates/push1`), 'base64update');
    });
    await assertFails(update(ref(getRtdb(), `${MEETING_DOC}/updates/push1`), { v2: 'x' }));
    await assertFails(remove(ref(getRtdb(), MEETING_DOC)));
  });

  it('allows authenticated reads and writes on the meetings realtime path (mirrors the Board pages posture)', async () => {
    const db = getRtdb('fulltimer-1');
    await assertSucceeds(set(ref(db, `${MEETING_DOC}/updates/push1`), 'base64update'));
    await assertSucceeds(set(ref(db, `${MEETING_DOC}/seeded`), true));
    await assertSucceeds(get(ref(db, MEETING_DOC)));
    await assertSucceeds(remove(ref(db, `${MEETING_DOC}/updates/push1`)));
  });

  it('keeps the Board pages path locked to signed-in users (existing posture, unchanged)', async () => {
    await assertFails(get(ref(getRtdb(), BOARD_DOC)));
    await assertFails(set(ref(getRtdb(), `${BOARD_DOC}/updates/push1`), 'base64update'));
    await assertSucceeds(set(ref(getRtdb('leader-1'), `${BOARD_DOC}/updates/push1`), 'base64update'));
    await assertSucceeds(get(ref(getRtdb('leader-1'), BOARD_DOC)));
  });

  it('denies access everywhere outside the documented collab paths', async () => {
    await assertFails(get(ref(getRtdb('someone'), 'other/path')));
    await assertFails(set(ref(getRtdb('someone'), 'other/path'), { x: 1 }));
  });
});