import { 
  assertFails, 
  assertSucceeds, 
  initializeTestEnvironment, 
  RulesTestEnvironment 
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'fs';

let testEnv: RulesTestEnvironment;
const PROJECT_ID = 'campus-hub-security-test';

// These tests need the Firestore emulator on port 8080. They run only when
// FIRESTORE_EMULATOR_HOST is set — which `firebase emulators:exec` does for its
// child process (see .github/workflows/deploy-firestore-rules.yml). Without an
// emulator (plain `npm test`, coverage, local runs) they stay skipped.
const describeRules = process.env.FIRESTORE_EMULATOR_HOST ? describe : describe.skip;

describeRules('Firestore Security Rules', () => {
  beforeAll(async () => {
    try {
      testEnv = await initializeTestEnvironment({
        projectId: PROJECT_ID,
        firestore: {
          rules: fs.readFileSync('firestore.rules', 'utf8'),
          host: 'localhost',
          port: 8080,
        },
      });
    } catch (e: any) {
      console.error('INIT ERR:', e.message, e.response?.body, e);
      throw e;
    }
  });

  afterAll(async () => {
    await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });

  const getFirestore = (auth?: { uid: string; email?: string; email_verified?: boolean }) => {
    return auth ? testEnv.authenticatedContext(auth.uid, { email: auth.email, email_verified: auth.email_verified ?? true }).firestore() : testEnv.unauthenticatedContext().firestore();
  };

  describe('User Profiles', () => {
    it('DD1: Prevents self-escalation of role', async () => {
      const db = getFirestore({ uid: 'user1', email: 'user@example.com' });
      const userRef = doc(db, 'users', 'user1');
      
      // Setup: Create initial user
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'users', 'user1'), {
          email: 'user@example.com',
          displayName: 'User One',
          photoURL: null,
          role: 'viewer',
          approved: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      });

      await assertFails(updateDoc(userRef, { role: 'admin' }));
    });

    it('DD2: Prevents spoofing approval status on creation', async () => {
      const db = getFirestore({ uid: 'user2', email: 'spoofed@example.com' });
      const userRef = doc(db, 'users', 'user2');
      
      await assertFails(setDoc(userRef, {
        email: 'spoofed@example.com',
        displayName: 'Spoofer',
        photoURL: null,
        role: 'manager',
        approved: true, // Should fail because no invitation exists
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }));
    });
  });

  describe('Contacts', () => {
    it('DD3: Prevents Ghost Field Injection', async () => {
      const db = getFirestore({ uid: 'operator1' });
      
      // Setup: Operator role
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'operator1'), { role: 'operator', approved: true });
        await setDoc(doc(context.firestore(), 'contacts', 'contact1'), { name: 'Test', email: 'test@example.com' });
      });

      const contactRef = doc(db, 'contacts', 'contact1');
      await assertFails(updateDoc(contactRef, { pwned: true }));
    });

    it('DD4: Prevents ID Poisoning (Long Strings)', async () => {
      const db = getFirestore({ uid: 'operator1' });
      const longId = 'a'.repeat(200);
      const contactRef = doc(db, 'contacts', longId);
      
      await assertFails(setDoc(contactRef, { name: 'Test', email: 'test@example.com' }));
    });
  });

  describe('Interactions', () => {
    it('DD5: Prevents Timestamp Fraud', async () => {
      const db = getFirestore({ uid: 'operator1' });
      const interactionRef = doc(db, 'contacts/contact1/interactions/int1');
      
      await assertFails(setDoc(interactionRef, {
        userId: 'operator1',
        userName: 'Operator One',
        content: 'Interaction',
        dateTime: new Date().toISOString(),
        createdAt: '2020-01-01' // Fraudulent timestamp
      }));
    });

    it('DD6: Prevents Resource Exhaustion (Field Size)', async () => {
      const db = getFirestore({ uid: 'operator1' });
      const interactionRef = doc(db, 'contacts/contact1/interactions/int1');
      const largeContent = 'a'.repeat(6000); // Exceeds 5000 limit
      
      await assertFails(setDoc(interactionRef, {
        userId: 'operator1',
        userName: 'Operator One',
        content: largeContent,
        dateTime: new Date().toISOString(),
        createdAt: serverTimestamp()
      }));
    });
  });

  describe('Access Control', () => {
    it('DD7: Prevents Unauthorized Deletion by Operator', async () => {
      const db = getFirestore({ uid: 'operator1' });
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'operator1'), { role: 'operator', approved: true });
        await setDoc(doc(context.firestore(), 'contacts', 'contact1'), { name: 'Test', email: 'test@example.com' });
      });

      await assertFails(deleteDoc(doc(db, 'contacts', 'contact1')));
    });

    it('DD9: Prevents Spoofed Admin Email (Not Verified)', async () => {
      const db = getFirestore({ uid: 'evil', email: 'yilongwang05@gmail.com', email_verified: false });
      await assertFails(deleteDoc(doc(db, 'contacts', 'any')));
    });

    it('DD11: Prevents PII Scraping by Viewer', async () => {
      const db = getFirestore({ uid: 'viewer1' });
      // Setup: Viewer role
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'viewer1'), { role: 'viewer', approved: true });
      });

      const usersRef = doc(db, 'users', 'other-user');
      await assertFails(getDoc(usersRef));
    });
  });

  describe('The Board (board_sessions + board_notes)', () => {
    const validSession = {
      event: 'Friday Night Gathering',
      date: '2026-05-15',
      time: '7:00 PM',
      place: 'Lower Common Room',
      facilitatorId: 'admin1',
      agenda: [],
      assigned: [],
    };
    const validNote = {
      type: 'record',
      series: 'Friday Gathering',
      title: 'Run of show',
      body: 'Doors 6:40, worship 7:00…',
      date: '2026-05-15',
      contributorIds: ['admin1'],
      tags: ['welcome'],
    };

    const seedRoles = async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'admin1'), { role: 'admin', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'viewer1'), { role: 'viewer', approved: true });
      });
    };

    it('BD1: Admin can create and read a coordination session', async () => {
      await seedRoles();
      const db = getFirestore({ uid: 'admin1' });
      const ref = doc(db, 'board_sessions', 'bs1');
      await assertSucceeds(setDoc(ref, validSession));
      await assertSucceeds(getDoc(ref));
    });

    it('BD2: Admin can create then delete a board note', async () => {
      await seedRoles();
      const db = getFirestore({ uid: 'admin1' });
      const ref = doc(db, 'board_notes', 'bn1');
      await assertSucceeds(setDoc(ref, validNote));
      await assertSucceeds(deleteDoc(ref));
    });

    it('BD3: Viewer cannot read or write the board', async () => {
      await seedRoles();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'board_sessions', 'bs1'), validSession);
      });
      const db = getFirestore({ uid: 'viewer1' });
      await assertFails(getDoc(doc(db, 'board_sessions', 'bs1')));
      await assertFails(setDoc(doc(db, 'board_sessions', 'bs2'), validSession));
      await assertFails(setDoc(doc(db, 'board_notes', 'bn2'), validNote));
    });

    it('BD4: Rejects a malformed session (missing required fields)', async () => {
      await seedRoles();
      const db = getFirestore({ uid: 'admin1' });
      await assertFails(setDoc(doc(db, 'board_sessions', 'bsX'), { event: 'Missing the rest' }));
    });

    const validDoc = {
      date: '2026-05-15',
      title: 'Friday Night — run of show',
      md: '# Friday Night\n\n- [ ] Greeters before flyers\n',
      facilitatorId: 'admin1',
      place: 'Lower Common Room',
      time: '7:00 PM',
    };

    it('BD5: Admin can create, read, update and delete a board page', async () => {
      await seedRoles();
      const db = getFirestore({ uid: 'admin1' });
      const ref = doc(db, 'board_docs', 'bd1');
      await assertSucceeds(setDoc(ref, validDoc));
      await assertSucceeds(getDoc(ref));
      await assertSucceeds(setDoc(ref, { ...validDoc, md: '# Friday Night\n\nUpdated.\n' }));
      await assertSucceeds(deleteDoc(ref));
    });

    it('BD6: Admin can create a minimal board page (only required fields)', async () => {
      await seedRoles();
      const db = getFirestore({ uid: 'admin1' });
      await assertSucceeds(setDoc(doc(db, 'board_docs', 'bd2'), { date: '2026-05-16', title: 'Quick page', md: 'notes' }));
    });

    it('BD7: Viewer cannot read or write board pages', async () => {
      await seedRoles();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'board_docs', 'bd1'), validDoc);
      });
      const db = getFirestore({ uid: 'viewer1' });
      await assertFails(getDoc(doc(db, 'board_docs', 'bd1')));
      await assertFails(setDoc(doc(db, 'board_docs', 'bd3'), validDoc));
    });

    it('BD8: Rejects a malformed page (missing required fields)', async () => {
      await seedRoles();
      const db = getFirestore({ uid: 'admin1' });
      await assertFails(setDoc(doc(db, 'board_docs', 'bdX'), { title: 'No date or md' }));
    });
  });
});
