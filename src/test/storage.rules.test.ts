import { Blob as NodeBlob } from 'node:buffer';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { getMetadata, ref, uploadBytes } from 'firebase/storage';
import { describe, it, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';

// Vitest runs this suite under jsdom, whose Blob the Storage JS SDK wraps for
// the multipart upload. undici's fetch (Node's global fetch) can't read that
// Blob, so the request body arrives at the emulator truncated and every upload
// 400s with "Unexpected number of parts in request body". Swapping in Node's
// Blob is the minimal fix; the SDK reads the global at request time.
(globalThis as { Blob?: unknown }).Blob = NodeBlob;

let testEnv: RulesTestEnvironment;
const PROJECT_ID = 'campus-hub-storage-security-test';

// These tests need the Storage emulator on port 9199. They run only when
// FIREBASE_STORAGE_EMULATOR_HOST is set — which `firebase emulators:exec` does
// for its child process (see .github/workflows/deploy-storage-rules.yml).
// Without an emulator (plain `npm test`, coverage, local runs) they stay
// skipped, mirroring firestore.rules.test.ts and database.rules.test.ts.
const describeRules = process.env.FIREBASE_STORAGE_EMULATOR_HOST
  ? describe
  : describe.skip;

// The rules cap writes at `size < 8 MB`, so exactly 8 MB is rejected.
const MAX_BYTES = 8 * 1024 * 1024;

describeRules('Cloud Storage Security Rules (#1403)', () => {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
      storage: {
        rules: fs.readFileSync('storage.rules', 'utf8'),
        host: '127.0.0.1',
        port: 9199,
      },
    });
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  const getStorage = (uid?: string) => {
    const context = uid
      ? testEnv.authenticatedContext(uid)
      : testEnv.unauthenticatedContext();
    return context.storage();
  };

  // Prayer answer photos (#267). The operator-and-up writer gate lives on the
  // prayer doc in firestore.rules — Storage only checks auth, size and type.
  describe('prayer answer photos', () => {
    const PRAYER_PHOTO = 'prayers/prayer-123/1700000000000-0.jpg';

    it('allows an authenticated image/jpeg upload under 8 MB', async () => {
      await assertSucceeds(
        uploadBytes(ref(getStorage('operator-1'), PRAYER_PHOTO), new Uint8Array([1, 2, 3]), {
          contentType: 'image/jpeg',
        }),
      );
    });

    it('denies an unauthenticated upload', async () => {
      await assertFails(
        uploadBytes(ref(getStorage(), PRAYER_PHOTO), new Uint8Array([1, 2, 3]), {
          contentType: 'image/jpeg',
        }),
      );
    });

    it('denies a non-image content type', async () => {
      await assertFails(
        uploadBytes(ref(getStorage('operator-1'), PRAYER_PHOTO), new Uint8Array([1, 2, 3]), {
          contentType: 'text/plain',
        }),
      );
    });

    it('denies an upload of 8 MB or more', async () => {
      await assertFails(
        uploadBytes(ref(getStorage('operator-1'), PRAYER_PHOTO), new Uint8Array(MAX_BYTES), {
          contentType: 'image/jpeg',
        }),
      );
    });
  });

  // Visit photos are cut with the Visits page (cut-or-keep §5): nothing reads or
  // writes `visits/` any more. The objects already stored stay in the bucket,
  // unread; with no match the default rule closes the path to everyone.
  describe('visit photos (closed — the Visits page is cut)', () => {
    const VISIT_PHOTO = 'visits/visit-123/1700000000000-0.jpg';

    it('denies a member upload and read', async () => {
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await uploadBytes(ref(ctx.storage(), VISIT_PHOTO), new Uint8Array([1, 2, 3]), {
          contentType: 'image/jpeg',
        });
      });
      await assertFails(
        uploadBytes(ref(getStorage('fulltimer-1'), 'visits/visit-123/new.jpg'), new Uint8Array([1, 2, 3]), {
          contentType: 'image/jpeg',
        }),
      );
      await assertFails(getMetadata(ref(getStorage('fulltimer-1'), VISIT_PHOTO)));
    });
  });

  // Guest sign-ins carry `guest: true` in their token. They are signed in to
  // Auth but are not members, so the photo path is not theirs (Nov 2026).
  describe('guest sign-ins', () => {
    const guestStorage = () =>
      testEnv.authenticatedContext('guest-1', { guest: true }).storage();

    it('denies a guest upload to prayer photos', async () => {
      await assertFails(
        uploadBytes(ref(guestStorage(), 'prayers/prayer-123/g.jpg'), new Uint8Array([1, 2, 3]), {
          contentType: 'image/jpeg',
        }),
      );
    });

    it('denies a guest read of a stored photo, while a member can read it', async () => {
      const path = 'prayers/prayer-123/seeded.jpg';
      await testEnv.withSecurityRulesDisabled(async (ctx) => {
        await uploadBytes(ref(ctx.storage(), path), new Uint8Array([1, 2, 3]), {
          contentType: 'image/jpeg',
        });
      });
      await assertFails(getMetadata(ref(guestStorage(), path)));
      await assertSucceeds(getMetadata(ref(getStorage('fulltimer-1'), path)));
    });
  });

  it('denies writes everywhere outside the documented photo paths', async () => {
    await assertFails(
      uploadBytes(ref(getStorage('operator-1'), 'other/path.jpg'), new Uint8Array([1, 2, 3]), {
        contentType: 'image/jpeg',
      }),
    );
  });
});
