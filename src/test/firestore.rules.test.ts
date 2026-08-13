import { 
  assertFails, 
  assertSucceeds, 
  initializeTestEnvironment, 
  RulesTestEnvironment 
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  collectionGroup,
  query,
  where,
} from 'firebase/firestore';
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

    it('Owner can update pushToken alone', async () => {
      const db = getFirestore({ uid: 'user3', email: 'user3@example.com' });
      const userRef = doc(db, 'users', 'user3');

      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'users', 'user3'), {
          email: 'user3@example.com',
          displayName: 'User Three',
          photoURL: null,
          role: 'viewer',
          approved: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      });

      await assertSucceeds(updateDoc(userRef, { pushToken: 'ExponentPushToken[abc123]', updatedAt: serverTimestamp() }));
    });

    it('Owner cannot smuggle role/approved alongside a pushToken update', async () => {
      const db = getFirestore({ uid: 'user4', email: 'user4@example.com' });
      const userRef = doc(db, 'users', 'user4');

      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'users', 'user4'), {
          email: 'user4@example.com',
          displayName: 'User Four',
          photoURL: null,
          role: 'viewer',
          approved: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      });

      await assertFails(updateDoc(userRef, { pushToken: 'ExponentPushToken[abc123]', role: 'admin' }));
    });

    it('Owner cannot set an oversized or non-string pushToken', async () => {
      const db = getFirestore({ uid: 'user5', email: 'user5@example.com' });
      const userRef = doc(db, 'users', 'user5');

      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'users', 'user5'), {
          email: 'user5@example.com',
          displayName: 'User Five',
          photoURL: null,
          role: 'viewer',
          approved: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      });

      await assertFails(updateDoc(userRef, { pushToken: 'x'.repeat(201) }));
      await assertFails(updateDoc(userRef, { pushToken: 12345 }));
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

    it('lets an operator stamp the last-contacted trio when logging an interaction', async () => {
      // Mirrors the contact update inside LogInteractionModal's writeBatch and
      // ContactDetailsModal.handleAddInteraction: both stamp lastContactedBy /
      // lastContactedById / lastContactedDate alongside lastSeen.
      const db = getFirestore({ uid: 'operator1' });

      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'operator1'), { role: 'operator', approved: true });
        await setDoc(doc(context.firestore(), 'contacts', 'contact1'), { name: 'Test', email: 'test@example.com' });
      });

      await assertSucceeds(updateDoc(doc(db, 'contacts', 'contact1'), {
        lastSeen: '2026-08-08',
        lastContactedBy: 'Operator One',
        lastContactedById: 'operator1',
        lastContactedDate: '2026-08-08',
        updatedAt: serverTimestamp(),
      }));
    });
  });

  describe('Prayers', () => {
    it('lets an operator store up to 4 answeredPhotos on an answered prayer', async () => {
      const db = getFirestore({ uid: 'operator1' });
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'operator1'), { role: 'operator', approved: true });
        await setDoc(doc(context.firestore(), 'contacts', 'contact1'), { name: 'Test', email: 'test@example.com' });
      });

      await assertSucceeds(setDoc(doc(db, 'prayers', 'prayer1'), {
        contactId: 'contact1',
        date: '2026-08-13T00:00:00.000Z',
        burden: 'Peace for finals',
        status: 'answered',
        answer: 'God provided',
        answeredAt: 'Aug 13',
        answeredPhotos: [
          { path: 'prayers/prayer1/1.jpg', url: 'https://example.test/1.jpg', name: 'a.jpg' },
          { path: 'prayers/prayer1/2.jpg', url: 'https://example.test/2.jpg', name: 'b.jpg' },
        ],
        updatedAt: '2026-08-13T00:00:00.000Z',
      }));
    });

    it('rejects a prayer with more than 4 answeredPhotos', async () => {
      const db = getFirestore({ uid: 'operator1' });
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'operator1'), { role: 'operator', approved: true });
        await setDoc(doc(context.firestore(), 'contacts', 'contact1'), { name: 'Test', email: 'test@example.com' });
      });

      await assertFails(setDoc(doc(db, 'prayers', 'prayer2'), {
        contactId: 'contact1',
        updatedAt: '2026-08-13T00:00:00.000Z',
        answeredPhotos: [1, 2, 3, 4, 5].map((i) => ({ path: `p/${i}.jpg`, url: `u${i}`, name: `${i}.jpg` })),
      }));
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

    it('lets an operator create the interaction shape LogInteractionModal writes', async () => {
      const db = getFirestore({ uid: 'operator1' });

      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'operator1'), { role: 'operator', approved: true });
        await setDoc(doc(context.firestore(), 'contacts', 'contact1'), { name: 'Test', email: 'test@example.com' });
      });

      await assertSucceeds(setDoc(doc(db, 'contacts/contact1/interactions/int2'), {
        type: 'meeting',
        dateTime: '2026-08-08',
        content: 'Coffee after class',
        createdAt: serverTimestamp(),
        userId: 'operator1',
        userName: 'Operator One',
        contactId: 'contact1',
        contactName: 'Test',
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

    it('DD11: Approved members may read peers; unapproved users cannot, and no one may tamper', async () => {
      // The directory is intentionally readable by any *approved* member: the
      // messaging member picker (CreateChatModal) and the Community landing page
      // (LandingCommunity lists full-timers) both query the users collection as a
      // plain approved user, including viewers. The protections that remain are
      // that unapproved users can't scrape PII, and a viewer can't tamper with
      // another member's profile (role/approval are manager-only).
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'viewer1'), { role: 'viewer', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'pending1'), { role: 'viewer', approved: false });
        await setDoc(doc(context.firestore(), 'users', 'other-user'), {
          email: 'other@example.com',
          displayName: 'Other Member',
          role: 'operator',
          approved: true,
        });
      });

      const viewer = getFirestore({ uid: 'viewer1' });
      // Approved viewer may look up another member (needed by messaging + community home)…
      await assertSucceeds(getDoc(doc(viewer, 'users', 'other-user')));
      // …but cannot escalate or otherwise tamper with that member's profile.
      await assertFails(updateDoc(doc(viewer, 'users', 'other-user'), { role: 'admin' }));

      // An unapproved user cannot scrape user PII at all.
      const pending = getFirestore({ uid: 'pending1' });
      await assertFails(getDoc(doc(pending, 'users', 'other-user')));
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
        await setDoc(doc(context.firestore(), 'users', 'manager1'), { role: 'manager', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'operator1'), { role: 'operator', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'viewer1'), { role: 'viewer', approved: true });
      });
    };

    // Seed a board page at the given audience, bypassing rules.
    const seedBoardDoc = async (id: string, audience?: string) => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'board_docs', id), {
          date: '2026-05-15',
          title: `Page ${id}`,
          md: '# Page',
          ...(audience ? { audience } : {}),
        });
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

    // ── Audience-scoped reads (Session 3) ───────────────────────────────────
    it('BD9: Trainee (manager) reads trainees + everyone pages, never team', async () => {
      await seedRoles();
      await seedBoardDoc('bd-team', 'team');
      await seedBoardDoc('bd-trainees', 'trainees');
      await seedBoardDoc('bd-everyone', 'everyone');
      await seedBoardDoc('bd-legacy'); // no audience → team-private
      const db = getFirestore({ uid: 'manager1' });
      await assertSucceeds(getDoc(doc(db, 'board_docs', 'bd-trainees')));
      await assertSucceeds(getDoc(doc(db, 'board_docs', 'bd-everyone')));
      await assertFails(getDoc(doc(db, 'board_docs', 'bd-team')));
      await assertFails(getDoc(doc(db, 'board_docs', 'bd-legacy')));
    });

    it('BD10: Student (operator) reads only everyone pages', async () => {
      await seedRoles();
      await seedBoardDoc('bd-team', 'team');
      await seedBoardDoc('bd-trainees', 'trainees');
      await seedBoardDoc('bd-everyone', 'everyone');
      const db = getFirestore({ uid: 'operator1' });
      await assertSucceeds(getDoc(doc(db, 'board_docs', 'bd-everyone')));
      await assertFails(getDoc(doc(db, 'board_docs', 'bd-trainees')));
      await assertFails(getDoc(doc(db, 'board_docs', 'bd-team')));
    });

    it('BD11: Trainee/Student can read but never write board pages', async () => {
      await seedRoles();
      await seedBoardDoc('bd-everyone', 'everyone');
      const trainee = getFirestore({ uid: 'manager1' });
      const student = getFirestore({ uid: 'operator1' });
      await assertFails(setDoc(doc(trainee, 'board_docs', 'bd-new'), { ...validDoc, audience: 'everyone' }));
      await assertFails(setDoc(doc(student, 'board_docs', 'bd-new2'), { ...validDoc, audience: 'everyone' }));
      // Admin write with a valid audience succeeds; an invalid audience is rejected.
      const admin = getFirestore({ uid: 'admin1' });
      await assertSucceeds(setDoc(doc(admin, 'board_docs', 'bd-ok'), { ...validDoc, audience: 'trainees' }));
      await assertFails(setDoc(doc(admin, 'board_docs', 'bd-bad'), { ...validDoc, audience: 'world' }));
    });

    it('BD12: The notes archive is Full-timer + Trainee read; Student denied', async () => {
      await seedRoles();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'board_notes', 'bn1'), validNote);
      });
      await assertSucceeds(getDoc(doc(getFirestore({ uid: 'manager1' }), 'board_notes', 'bn1')));
      await assertFails(getDoc(doc(getFirestore({ uid: 'operator1' }), 'board_notes', 'bn1')));
      // Trainees still cannot write to the archive.
      await assertFails(setDoc(doc(getFirestore({ uid: 'manager1' }), 'board_notes', 'bn2'), validNote));
    });
  });

  describe('Tasks (team to-dos)', () => {
    const validTask = {
      title: 'Confirm the Friday setlist with Beatriz',
      dueDate: '2026-05-15',
      status: 'pending',
      priority: 'medium',
      assigneeId: 'operator1',
      createdById: 'admin1',
      createdByName: 'Tony',
      sourceDocId: 'bd-wed',
      sourceDocTitle: "Wednesday Women's Group",
    };

    const seedRoles = async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'admin1'), { role: 'admin', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'operator1'), { role: 'operator', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'manager1'), { role: 'manager', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'viewer1'), { role: 'viewer', approved: true });
      });
    };

    it('TD1: Operator can create a to-do with creator + source-doc fields', async () => {
      await seedRoles();
      const db = getFirestore({ uid: 'operator1' });
      await assertSucceeds(setDoc(doc(db, 'tasks', 'td1'), validTask));
    });

    it('TD2: Accepts a to-do with no due date (null)', async () => {
      await seedRoles();
      const db = getFirestore({ uid: 'admin1' });
      await assertSucceeds(setDoc(doc(db, 'tasks', 'td2'), { ...validTask, dueDate: null }));
    });

    it('TD3: Approved viewer can read but not create a to-do', async () => {
      await seedRoles();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'tasks', 'td1'), validTask);
      });
      const db = getFirestore({ uid: 'viewer1' });
      await assertSucceeds(getDoc(doc(db, 'tasks', 'td1')));
      await assertFails(setDoc(doc(db, 'tasks', 'tdX'), validTask));
    });

    it('TD4: Operator can mark a to-do done; only manager+ can delete it', async () => {
      await seedRoles();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'tasks', 'td1'), validTask);
      });
      const opDb = getFirestore({ uid: 'operator1' });
      await assertSucceeds(updateDoc(doc(opDb, 'tasks', 'td1'), { status: 'completed' }));
      await assertFails(deleteDoc(doc(opDb, 'tasks', 'td1')));
      const mgrDb = getFirestore({ uid: 'manager1' });
      await assertSucceeds(deleteDoc(doc(mgrDb, 'tasks', 'td1')));
    });

    it('TD5: Rejects an invalid status', async () => {
      await seedRoles();
      const db = getFirestore({ uid: 'admin1' });
      await assertFails(setDoc(doc(db, 'tasks', 'tdBad'), { ...validTask, status: 'archived' }));
    });
  });

  describe('Visits', () => {
    const validVisit = {
      date: '2026-08-13',
      contactIds: ['contact1'],
      contactNames: ['Ama Osei'],
      went: ['admin1'],
      wentNames: ['Tony'],
      where: 'Whitman Hall, room 214',
      purpose: "She's been quiet since her dad's surgery",
      how: 'Sat on the floor and talked for an hour.',
      followUp: '',
      followUpTaskId: null,
      prayerId: null,
      photos: [],
    };

    const seedRoles = async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'admin1'), { role: 'admin', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'manager1'), { role: 'manager', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'operator1'), { role: 'operator', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'viewer1'), { role: 'viewer', approved: true });
      });
    };

    it('VS1: Full-timer can log, edit and remove a visit', async () => {
      await seedRoles();
      const db = getFirestore({ uid: 'admin1' });
      await assertSucceeds(setDoc(doc(db, 'visits', 'v1'), validVisit));
      await assertSucceeds(updateDoc(doc(db, 'visits', 'v1'), { how: 'A longer write-up.' }));
      await assertSucceeds(deleteDoc(doc(db, 'visits', 'v1')));
    });

    it('VS2: Trainee and below can neither read nor write a visit', async () => {
      await seedRoles();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'visits', 'v1'), validVisit);
      });
      for (const uid of ['manager1', 'operator1', 'viewer1']) {
        const db = getFirestore({ uid });
        await assertFails(getDoc(doc(db, 'visits', 'v1')));
        await assertFails(setDoc(doc(db, 'visits', 'vX'), validVisit));
        await assertFails(deleteDoc(doc(db, 'visits', 'v1')));
      }
    });

    it('VS3: Rejects a visit with nobody on it', async () => {
      await seedRoles();
      const db = getFirestore({ uid: 'admin1' });
      await assertFails(setDoc(doc(db, 'visits', 'vBad'), { ...validVisit, contactIds: [] }));
    });

    it('VS4: Rejects an oversized write-up', async () => {
      await seedRoles();
      const db = getFirestore({ uid: 'admin1' });
      await assertFails(setDoc(doc(db, 'visits', 'vBig'), { ...validVisit, how: 'a'.repeat(5001) }));
    });

    it('VS5: Accepts a visit covering several people with no address noted', async () => {
      await seedRoles();
      const db = getFirestore({ uid: 'admin1' });
      await assertSucceeds(
        setDoc(doc(db, 'visits', 'v2'), {
          ...validVisit,
          contactIds: ['contact1', 'contact2'],
          contactNames: ['Ama Osei', 'Bo Chen'],
          went: ['admin1', 'manager1'],
          where: '',
        }),
      );
    });
  });

  describe('My Day — user preferences & personal prayers', () => {
    const seedUsers = async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'u1'), { role: 'admin', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'u2'), { role: 'admin', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'student1'), { role: 'operator', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'pending1'), { role: 'viewer', approved: false });
      });
    };

    it('MP1: Owner can write and read their own preferences', async () => {
      await seedUsers();
      const db = getFirestore({ uid: 'u1' });
      const ref = doc(db, 'userPreferences', 'u1');
      await assertSucceeds(setDoc(ref, { personalContactIds: ['c1', 'c2'], desktopMessagingApp: 'apple' }));
      await assertSucceeds(getDoc(ref));
    });

    it('MP2: A manager can read and write another user’s preferences, but a non-manager cannot', async () => {
      await seedUsers();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'userPreferences', 'u1'), { personalContactIds: ['c1'] });
      });
      const dbManager = getFirestore({ uid: 'u2' });
      await assertSucceeds(getDoc(doc(dbManager, 'userPreferences', 'u1')));
      await assertSucceeds(setDoc(doc(dbManager, 'userPreferences', 'u1'), { personalContactIds: ['x'] }));

      const dbStudent = getFirestore({ uid: 'student1' });
      await assertFails(getDoc(doc(dbStudent, 'userPreferences', 'u1')));
      await assertFails(setDoc(doc(dbStudent, 'userPreferences', 'u1'), { personalContactIds: ['y'] }));
    });

    it('MP3: An unapproved user cannot touch their own preferences', async () => {
      await seedUsers();
      const db = getFirestore({ uid: 'pending1' });
      await assertFails(setDoc(doc(db, 'userPreferences', 'pending1'), { personalContactIds: [] }));
    });

    it('MP4: Owner can create, read, update and delete their personal prayers', async () => {
      await seedUsers();
      const db = getFirestore({ uid: 'u1' });
      const ref = doc(db, 'users/u1/personalPrayers/pp1');
      await assertSucceeds(setDoc(ref, { title: 'pray for finals', contactId: null, date: '2026-05-15', status: 'open' }));
      await assertSucceeds(getDoc(ref));
      await assertSucceeds(updateDoc(ref, { status: 'answered' }));
      await assertSucceeds(deleteDoc(ref));
    });

    it('MP5: A manager can read and write another user’s personal prayers, but a non-manager cannot', async () => {
      await seedUsers();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users/u1/personalPrayers/pp1'), {
          title: 'private', contactId: null, date: '2026-05-15', status: 'open',
        });
      });
      const dbManager = getFirestore({ uid: 'u2' });
      await assertSucceeds(getDoc(doc(dbManager, 'users/u1/personalPrayers/pp1')));
      await assertSucceeds(setDoc(doc(dbManager, 'users/u1/personalPrayers/pp2'), {
        title: 'manager prayer', contactId: null, date: '2026-05-15', status: 'open',
      }));

      const dbStudent = getFirestore({ uid: 'student1' });
      await assertFails(getDoc(doc(dbStudent, 'users/u1/personalPrayers/pp1')));
      await assertFails(setDoc(doc(dbStudent, 'users/u1/personalPrayers/pp3'), {
        title: 'intruder', contactId: null, date: '2026-05-15', status: 'open',
      }));
    });
  });

  describe('Event RSVPs', () => {
    const seedUsers = async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'admin1'), { role: 'admin', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'viewer1'), { role: 'viewer', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'pending1'), { role: 'viewer', approved: false });
      });
    };
    const rsvp = { uid: 'viewer1', name: 'Phil', status: 'going', createdAt: serverTimestamp() };

    it('RSVP1: an approved member can create, read and delete their own RSVP', async () => {
      await seedUsers();
      const db = getFirestore({ uid: 'viewer1' });
      const ref = doc(db, 'events/ev1/rsvps/viewer1');
      await assertSucceeds(setDoc(ref, rsvp));
      await assertSucceeds(getDoc(ref));
      await assertSucceeds(deleteDoc(ref));
    });

    it('RSVP2: a member cannot create an RSVP keyed to someone else', async () => {
      await seedUsers();
      const db = getFirestore({ uid: 'viewer1' });
      await assertFails(
        setDoc(doc(db, 'events/ev1/rsvps/admin1'), { ...rsvp, uid: 'admin1', name: 'Imposter' }),
      );
    });

    it('RSVP3: any approved user can read who is coming', async () => {
      await seedUsers();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'events/ev1/rsvps/viewer1'), {
          uid: 'viewer1', name: 'Phil', status: 'going',
        });
      });
      const db = getFirestore({ uid: 'admin1' });
      await assertSucceeds(getDoc(doc(db, 'events/ev1/rsvps/viewer1')));
    });

    it('RSVP4: an unapproved user cannot RSVP', async () => {
      await seedUsers();
      const db = getFirestore({ uid: 'pending1' });
      await assertFails(setDoc(doc(db, 'events/ev1/rsvps/pending1'), { ...rsvp, uid: 'pending1' }));
    });

    const seedRsvps = async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'events/ev1/rsvps/viewer1'), { uid: 'viewer1', name: 'Phil', status: 'going' });
        await setDoc(doc(context.firestore(), 'events/ev2/rsvps/admin1'), { uid: 'admin1', name: 'Tony', status: 'going' });
      });
    };

    it('RSVP5: a member can collection-group list their own RSVPs (events I am going to)', async () => {
      await seedUsers();
      await seedRsvps();
      const db = getFirestore({ uid: 'viewer1' });
      await assertSucceeds(getDocs(query(collectionGroup(db, 'rsvps'), where('uid', '==', 'viewer1'))));
    });

    it('RSVP6: a collection-group RSVP list not scoped to self is denied', async () => {
      await seedUsers();
      await seedRsvps();
      const db = getFirestore({ uid: 'viewer1' });
      // No uid filter → would expose other people's RSVPs → denied.
      await assertFails(getDocs(query(collectionGroup(db, 'rsvps'))));
      // Filtered to someone else → denied.
      await assertFails(getDocs(query(collectionGroup(db, 'rsvps'), where('uid', '==', 'admin1'))));
    });
  });

  // The three collections mobile v2's member app writes to. See MOBILE-V2.md
  // and firestore.rules sections 9b / 9c / chatRooms.
  describe('Member app — prayer requests, hospitality, announcements', () => {
    const seedMemberUsers = async () => {
      await testEnv.withSecurityRulesDisabled(async (c) => {
        await setDoc(doc(c.firestore(), 'users', 'student1'), { role: 'operator', approved: true });
        await setDoc(doc(c.firestore(), 'users', 'student2'), { role: 'operator', approved: true });
        await setDoc(doc(c.firestore(), 'users', 'community1'), { role: 'viewer', approved: true });
        await setDoc(doc(c.firestore(), 'users', 'trainee1'), { role: 'manager', approved: true });
        await setDoc(doc(c.firestore(), 'users', 'ft1'), { role: 'admin', approved: true });
      });
    };

    // ── prayer requests ──────────────────────────────────────────────────────
    const newRequest = (over: Record<string, unknown> = {}) => ({
      uid: 'student1',
      name: 'Lila Chen',
      body: 'Midterms are wrecking me',
      status: 'open',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      ...over,
    });
    const seedRequest = async (id: string, over: Record<string, unknown> = {}) => {
      await testEnv.withSecurityRulesDisabled(async (c) => {
        await setDoc(doc(c.firestore(), 'prayerRequests', id), newRequest(over));
      });
    };

    it('PR1: a student can ask the team to pray for them', async () => {
      await seedMemberUsers();
      const db = getFirestore({ uid: 'student1' });
      await assertSucceeds(setDoc(doc(db, 'prayerRequests', 'pr1'), newRequest()));
    });

    it('PR2: nobody can file a request in someone else\'s name', async () => {
      await seedMemberUsers();
      const db = getFirestore({ uid: 'student2' });
      await assertFails(setDoc(doc(db, 'prayerRequests', 'pr2'), newRequest({ uid: 'student1' })));
    });

    it('PR3: an empty or oversized body is rejected', async () => {
      await seedMemberUsers();
      const db = getFirestore({ uid: 'student1' });
      await assertFails(setDoc(doc(db, 'prayerRequests', 'pr3'), newRequest({ body: '' })));
      await assertFails(
        setDoc(doc(db, 'prayerRequests', 'pr4'), newRequest({ body: 'a'.repeat(6000) })),
      );
    });

    it('PR4: the asker can mark their own request answered', async () => {
      await seedMemberUsers();
      await seedRequest('pr5');
      const db = getFirestore({ uid: 'student1' });
      await assertSucceeds(
        updateDoc(doc(db, 'prayerRequests', 'pr5'), {
          status: 'answered',
          updatedAt: new Date().toISOString(),
        }),
      );
    });

    it('PR5: staff can close one out, another member cannot', async () => {
      await seedMemberUsers();
      await seedRequest('pr6');
      const staff = getFirestore({ uid: 'ft1' });
      await assertSucceeds(
        updateDoc(doc(staff, 'prayerRequests', 'pr6'), {
          status: 'answered',
          updatedAt: new Date().toISOString(),
        }),
      );
      const other = getFirestore({ uid: 'student2' });
      await assertFails(
        updateDoc(doc(other, 'prayerRequests', 'pr6'), {
          status: 'open',
          updatedAt: new Date().toISOString(),
        }),
      );
    });

    it('PR6: an update cannot reassign a request to someone else', async () => {
      await seedMemberUsers();
      await seedRequest('pr7');
      const db = getFirestore({ uid: 'student1' });
      await assertFails(
        updateDoc(doc(db, 'prayerRequests', 'pr7'), {
          uid: 'student2',
          updatedAt: new Date().toISOString(),
        }),
      );
    });

    it('PR7: a signed-out visitor can neither read nor write one', async () => {
      await seedMemberUsers();
      await seedRequest('pr8');
      const db = getFirestore();
      await assertFails(getDoc(doc(db, 'prayerRequests', 'pr8')));
      await assertFails(setDoc(doc(db, 'prayerRequests', 'pr9'), newRequest()));
    });

    // ── hospitality offers ───────────────────────────────────────────────────
    const newOffer = (over: Record<string, unknown> = {}) => ({
      uid: 'community1',
      name: 'Grace Okafor',
      availability: ['sunday'],
      seats: '3–4 students',
      note: '',
      updatedAt: new Date().toISOString(),
      ...over,
    });
    const seedOffer = async () => {
      await testEnv.withSecurityRulesDisabled(async (c) => {
        await setDoc(doc(c.firestore(), 'hospitalityOffers', 'community1'), newOffer());
      });
    };

    it('HO1: a Community member can open their home, and update the offer', async () => {
      await seedMemberUsers();
      const db = getFirestore({ uid: 'community1' });
      await assertSucceeds(setDoc(doc(db, 'hospitalityOffers', 'community1'), newOffer()));
      await assertSucceeds(
        setDoc(
          doc(db, 'hospitalityOffers', 'community1'),
          newOffer({ availability: ['weeknight', 'sunday'] }),
        ),
      );
    });

    it('HO2: nobody can write an offer under someone else\'s uid', async () => {
      await seedMemberUsers();
      const db = getFirestore({ uid: 'student1' });
      await assertFails(
        setDoc(doc(db, 'hospitalityOffers', 'community1'), newOffer({ uid: 'community1' })),
      );
    });

    it('HO3: the doc id must match the uid inside it', async () => {
      await seedMemberUsers();
      const db = getFirestore({ uid: 'community1' });
      await assertFails(
        setDoc(doc(db, 'hospitalityOffers', 'community1'), newOffer({ uid: 'student1' })),
      );
    });

    it('HO4: staff read every offer; another member reads none but their own', async () => {
      await seedMemberUsers();
      await seedOffer();
      await assertSucceeds(getDoc(doc(getFirestore({ uid: 'ft1' }), 'hospitalityOffers', 'community1')));
      await assertSucceeds(
        getDoc(doc(getFirestore({ uid: 'community1' }), 'hospitalityOffers', 'community1')),
      );
      await assertFails(
        getDoc(doc(getFirestore({ uid: 'student1' }), 'hospitalityOffers', 'community1')),
      );
    });

    it('HO5: only staff can list the open homes', async () => {
      await seedMemberUsers();
      await seedOffer();
      await assertSucceeds(getDocs(query(collection(getFirestore({ uid: 'ft1' }), 'hospitalityOffers'))));
      await assertFails(
        getDocs(query(collection(getFirestore({ uid: 'community1' }), 'hospitalityOffers'))),
      );
    });

    it('HO6: the owner can withdraw their offer', async () => {
      await seedMemberUsers();
      await seedOffer();
      const db = getFirestore({ uid: 'community1' });
      await assertSucceeds(deleteDoc(doc(db, 'hospitalityOffers', 'community1')));
    });

    // ── announcement rooms ───────────────────────────────────────────────────
    const seedRoom = async (id: string, type: string) => {
      await testEnv.withSecurityRulesDisabled(async (c) => {
        await setDoc(doc(c.firestore(), 'chatRooms', id), {
          type,
          name: 'Weekly notes',
          memberIds: ['ft1', 'student1'],
          createdById: 'ft1',
          createdByName: 'Mei',
          createdAt: serverTimestamp(),
        });
      });
    };
    const newChatMsg = (senderId: string) => ({
      roomId: 'room1',
      text: 'Hello everyone',
      senderId,
      senderName: 'Someone',
      timestamp: serverTimestamp(),
      type: 'text',
    });

    it('AN1: only a Full-timer can open an announcement room', async () => {
      await seedMemberUsers();
      const room = {
        type: 'announcement',
        name: 'Weekly notes',
        memberIds: ['student1', 'ft1'],
        createdByName: 'Someone',
        createdAt: serverTimestamp(),
      };
      await assertSucceeds(
        setDoc(doc(getFirestore({ uid: 'ft1' }), 'chatRooms', 'roomA'), {
          ...room,
          createdById: 'ft1',
        }),
      );
      await assertFails(
        setDoc(doc(getFirestore({ uid: 'student1' }), 'chatRooms', 'roomB'), {
          ...room,
          createdById: 'student1',
        }),
      );
    });

    it('AN2: a member can still open a plain group room', async () => {
      await seedMemberUsers();
      await assertSucceeds(
        setDoc(doc(getFirestore({ uid: 'student1' }), 'chatRooms', 'roomC'), {
          type: 'group',
          name: 'Study crew',
          memberIds: ['student1', 'student2'],
          createdById: 'student1',
          createdByName: 'Lila',
          createdAt: serverTimestamp(),
        }),
      );
    });

    it('AN3: in an announcement room only a Full-timer can post', async () => {
      await seedMemberUsers();
      await seedRoom('room1', 'announcement');
      await assertSucceeds(
        setDoc(doc(getFirestore({ uid: 'ft1' }), 'chatRooms/room1/messages/m1'), newChatMsg('ft1')),
      );
      await assertFails(
        setDoc(
          doc(getFirestore({ uid: 'student1' }), 'chatRooms/room1/messages/m2'),
          newChatMsg('student1'),
        ),
      );
    });

    it('AN4: a member of the room can still read every announcement in it', async () => {
      await seedMemberUsers();
      await seedRoom('room1', 'announcement');
      await testEnv.withSecurityRulesDisabled(async (c) => {
        await setDoc(doc(c.firestore(), 'chatRooms/room1/messages/m0'), newChatMsg('ft1'));
      });
      await assertSucceeds(
        getDoc(doc(getFirestore({ uid: 'student1' }), 'chatRooms/room1/messages/m0')),
      );
    });

    it('AN5: a group room is unaffected — a member posts as before', async () => {
      await seedMemberUsers();
      await seedRoom('room2', 'group');
      await assertSucceeds(
        setDoc(doc(getFirestore({ uid: 'student1' }), 'chatRooms/room2/messages/m3'), {
          ...newChatMsg('student1'),
          roomId: 'room2',
        }),
      );
    });

    it('AN6: a member cannot flip an announcement into a group to post in it', async () => {
      await seedMemberUsers();
      await seedRoom('room1', 'announcement');
      await assertFails(
        updateDoc(doc(getFirestore({ uid: 'student1' }), 'chatRooms', 'room1'), { type: 'group' }),
      );
      // A member can still update the room in ways that leave the kind alone.
      await assertSucceeds(
        updateDoc(doc(getFirestore({ uid: 'student1' }), 'chatRooms', 'room1'), {
          memberIds: ['ft1', 'student1', 'student2'],
        }),
      );
    });

    it('AN7: room creator or admin can delete room, non-creator non-admin cannot', async () => {
      await seedMemberUsers();
      await testEnv.withSecurityRulesDisabled(async (c) => {
        await setDoc(doc(c.firestore(), 'chatRooms', 'room1'), {
          type: 'group',
          name: 'Team',
          memberIds: ['student1', 'student2'],
          createdById: 'student1',
          createdByName: 'Student One',
        });
      });

      // Non-creator non-admin cannot delete
      await assertFails(deleteDoc(doc(getFirestore({ uid: 'student2' }), 'chatRooms', 'room1')));

      // Room creator can delete
      await assertSucceeds(deleteDoc(doc(getFirestore({ uid: 'student1' }), 'chatRooms', 'room1')));

      // Re-seed room and test admin delete
      await testEnv.withSecurityRulesDisabled(async (c) => {
        await setDoc(doc(c.firestore(), 'chatRooms', 'room1'), {
          type: 'group',
          name: 'Team',
          memberIds: ['student1', 'student2'],
          createdById: 'student1',
          createdByName: 'Student One',
        });
      });

      // Admin (ft1) can delete
      await assertSucceeds(deleteDoc(doc(getFirestore({ uid: 'ft1' }), 'chatRooms', 'room1')));
    });

    // ── message-level acts: react, pin, take back for everyone ──────────────
    // A sent message is immutable except for `reactions` / `pinned` / `deleted`
    // (the Field Notes design's desktop thread). Anyone in the room can react
    // and pin; only the author or a Full-timer can leave the `deleted`
    // tombstone, and a tombstone stays.
    const seedMsg = async (roomId: string, msgId: string, senderId: string, over: Record<string, unknown> = {}) => {
      await testEnv.withSecurityRulesDisabled(async (c) => {
        await setDoc(doc(c.firestore(), `chatRooms/${roomId}/messages/${msgId}`), {
          ...newChatMsg(senderId),
          roomId,
          ...over,
        });
      });
    };

    it('MSG1: any room member can react to or pin a message', async () => {
      await seedMemberUsers();
      await seedRoom('room1', 'group');
      await seedMsg('room1', 'm1', 'ft1');
      await assertSucceeds(
        updateDoc(doc(getFirestore({ uid: 'student1' }), 'chatRooms/room1/messages/m1'), {
          reactions: [{ by: 'student1', emoji: '🙏' }],
        }),
      );
      await assertSucceeds(
        updateDoc(doc(getFirestore({ uid: 'student1' }), 'chatRooms/room1/messages/m1'), {
          pinned: true,
        }),
      );
    });

    it('MSG2: a member cannot edit the text, attachments or sender of a message', async () => {
      await seedMemberUsers();
      await seedRoom('room1', 'group');
      await seedMsg('room1', 'm1', 'ft1');
      await assertFails(
        updateDoc(doc(getFirestore({ uid: 'student1' }), 'chatRooms/room1/messages/m1'), {
          text: 'Rewritten',
        }),
      );
      await assertFails(
        updateDoc(doc(getFirestore({ uid: 'student1' }), 'chatRooms/room1/messages/m1'), {
          senderId: 'student1',
        }),
      );
    });

    it('MSG3: only the author or a Full-timer can take a message back for everyone', async () => {
      await seedMemberUsers();
      await seedRoom('room1', 'group');
      await seedMsg('room1', 'm1', 'ft1');
      // A non-author member cannot tombstone it.
      await assertFails(
        updateDoc(doc(getFirestore({ uid: 'student1' }), 'chatRooms/room1/messages/m1'), {
          deleted: { by: 'student1', at: new Date().toISOString() },
        }),
      );
      // The author can.
      await assertSucceeds(
        updateDoc(doc(getFirestore({ uid: 'ft1' }), 'chatRooms/room1/messages/m1'), {
          deleted: { by: 'ft1', at: new Date().toISOString() },
        }),
      );
      // A Full-timer can take back anyone's message.
      await seedMsg('room1', 'm2', 'student1');
      await assertSucceeds(
        updateDoc(doc(getFirestore({ uid: 'ft1' }), 'chatRooms/room1/messages/m2'), {
          deleted: { by: 'ft1', at: new Date().toISOString() },
        }),
      );
    });

    it('MSG4: a tombstone stays — no undelete, and no reacting to a gone message', async () => {
      await seedMemberUsers();
      await seedRoom('room1', 'group');
      await seedMsg('room1', 'm1', 'ft1', { deleted: { by: 'ft1', at: new Date().toISOString() } });
      await assertFails(
        updateDoc(doc(getFirestore({ uid: 'ft1' }), 'chatRooms/room1/messages/m1'), {
          deleted: null,
        }),
      );
      await assertFails(
        updateDoc(doc(getFirestore({ uid: 'student1' }), 'chatRooms/room1/messages/m1'), {
          reactions: [{ by: 'student1', emoji: '🙏' }],
        }),
      );
    });

    it('MSG4b: a tombstone write cannot also change reactions or pinned — the acts are separate', async () => {
      await seedMemberUsers();
      await seedRoom('room1', 'group');
      await seedMsg('room1', 'm1', 'ft1');
      // The author may tombstone, but not in the same write as a reaction/pin
      // change — a gone message can't be reacted to or pinned, even mid-write.
      await assertFails(
        updateDoc(doc(getFirestore({ uid: 'ft1' }), 'chatRooms/room1/messages/m1'), {
          deleted: { by: 'ft1', at: new Date().toISOString() },
          reactions: [{ by: 'ft1', emoji: '🙏' }],
        }),
      );
      await assertFails(
        updateDoc(doc(getFirestore({ uid: 'ft1' }), 'chatRooms/room1/messages/m1'), {
          deleted: { by: 'ft1', at: new Date().toISOString() },
          pinned: true,
        }),
      );
    });

    it('MSG5: a non-member cannot react to or pin a message', async () => {
      await seedMemberUsers();
      await seedRoom('room1', 'group');
      await seedMsg('room1', 'm1', 'ft1');
      await assertFails(
        updateDoc(doc(getFirestore({ uid: 'student2' }), 'chatRooms/room1/messages/m1'), {
          reactions: [{ by: 'student2', emoji: '🙏' }],
        }),
      );
    });
  });

  describe('Walking-together threads', () => {
    const seedThreadUsers = async () => {
      await testEnv.withSecurityRulesDisabled(async (c) => {
        await setDoc(doc(c.firestore(), 'users', 'operator1'), { role: 'operator', approved: true });
        await setDoc(doc(c.firestore(), 'users', 'operator2'), { role: 'operator', approved: true });
        await setDoc(doc(c.firestore(), 'users', 'admin1'), { role: 'admin', approved: true });
        await setDoc(doc(c.firestore(), 'contacts', 'contact1'), { name: 'Test', email: 'test@example.com' });
      });
    };
    const newMsg = (over: Record<string, unknown> = {}) => ({
      from: 'operator1',
      fromName: 'Op One',
      kind: 'comment',
      body: 'walking with you',
      at: new Date().toISOString(),
      reactions: [],
      interactionId: null,
      ...over,
    });
    const seedMsg = async (id: string, over: Record<string, unknown> = {}) => {
      await testEnv.withSecurityRulesDisabled(async (c) => {
        await setDoc(doc(c.firestore(), `contacts/contact1/threads/${id}`), newMsg(over));
      });
    };

    it('lets the author create a message (from == uid, empty reactions)', async () => {
      await seedThreadUsers();
      const db = getFirestore({ uid: 'operator1' });
      await assertSucceeds(setDoc(doc(db, 'contacts/contact1/threads/th1'), newMsg()));
    });

    it('rejects creating a message attributed to someone else', async () => {
      await seedThreadUsers();
      const db = getFirestore({ uid: 'operator1' });
      await assertFails(setDoc(doc(db, 'contacts/contact1/threads/th2'), newMsg({ from: 'operator2' })));
    });

    it('rejects creating with pre-seeded reactions or an oversized body', async () => {
      await seedThreadUsers();
      const db = getFirestore({ uid: 'operator1' });
      await assertFails(
        setDoc(doc(db, 'contacts/contact1/threads/th3'), newMsg({ reactions: [{ by: 'operator1', emoji: '🙏' }] })),
      );
      await assertFails(setDoc(doc(db, 'contacts/contact1/threads/th4'), newMsg({ body: 'a'.repeat(6000) })));
    });

    it('lets any approved operator toggle the reactions array', async () => {
      await seedThreadUsers();
      await seedMsg('th10');
      const db = getFirestore({ uid: 'operator2' });
      await assertSucceeds(
        updateDoc(doc(db, 'contacts/contact1/threads/th10'), { reactions: [{ by: 'operator2', emoji: '🙏' }] }),
      );
    });

    it('allows body edits by the author only', async () => {
      await seedThreadUsers();
      await seedMsg('th20');
      const other = getFirestore({ uid: 'operator2' });
      await assertFails(updateDoc(doc(other, 'contacts/contact1/threads/th20'), { body: 'hijacked' }));
      const author = getFirestore({ uid: 'operator1' });
      await assertSucceeds(updateDoc(doc(author, 'contacts/contact1/threads/th20'), { body: 'edited' }));
    });

    it('rejects changing immutable fields (from/kind) via update', async () => {
      await seedThreadUsers();
      await seedMsg('th30');
      const author = getFirestore({ uid: 'operator1' });
      await assertFails(updateDoc(doc(author, 'contacts/contact1/threads/th30'), { kind: 'nudge' }));
    });

    it('lets an approved user collection-group list threads (the inbox/cockpit read)', async () => {
      await seedThreadUsers();
      await seedMsg('th40');
      const db = getFirestore({ uid: 'admin1' });
      await assertSucceeds(getDocs(query(collectionGroup(db, 'threads'))));
    });

    it('denies a collection-group thread list to an unapproved user', async () => {
      await seedThreadUsers();
      await seedMsg('th41');
      const db = getFirestore({ uid: 'stranger' }); // no user doc → not approved
      await assertFails(getDocs(query(collectionGroup(db, 'threads'))));
    });

    it('lets a full-timer mark a contact reviewed (bool only)', async () => {
      await seedThreadUsers();
      const db = getFirestore({ uid: 'admin1' });
      await assertSucceeds(updateDoc(doc(db, 'contacts', 'contact1'), { reviewed: true }));
      await assertFails(updateDoc(doc(db, 'contacts', 'contact1'), { reviewed: 'yes' }));
    });
  });

  describe('Gathering Types', () => {
    const validType = { name: 'Prayer Walk', blurb: 'on campus', order: 3 };

    const seedRoles = async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'admin1'), { role: 'admin', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'operator1'), { role: 'operator', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'manager1'), { role: 'manager', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'viewer1'), { role: 'viewer', approved: true });
      });
    };

    it('GT1: Manager can create a valid gathering type', async () => {
      await seedRoles();
      const db = getFirestore({ uid: 'manager1' });
      await assertSucceeds(setDoc(doc(db, 'gatheringTypes', 'gt1'), validType));
    });

    it('GT2: Operator cannot create a gathering type (needs manager+)', async () => {
      await seedRoles();
      const db = getFirestore({ uid: 'operator1' });
      await assertFails(setDoc(doc(db, 'gatheringTypes', 'gt2'), validType));
    });

    it('GT3: Approved viewer can read but not create', async () => {
      await seedRoles();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'gatheringTypes', 'gt1'), validType);
      });
      const db = getFirestore({ uid: 'viewer1' });
      await assertSucceeds(getDoc(doc(db, 'gatheringTypes', 'gt1')));
      await assertFails(setDoc(doc(db, 'gatheringTypes', 'gtX'), validType));
    });

    it('GT4: Manager can update and delete a type', async () => {
      await seedRoles();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'gatheringTypes', 'gt1'), validType);
      });
      const db = getFirestore({ uid: 'manager1' });
      await assertSucceeds(updateDoc(doc(db, 'gatheringTypes', 'gt1'), { name: 'Walk', blurb: '', order: 3 }));
      await assertSucceeds(deleteDoc(doc(db, 'gatheringTypes', 'gt1')));
    });

    it('GT5: Rejects an invalid type (missing order / empty name)', async () => {
      await seedRoles();
      const db = getFirestore({ uid: 'manager1' });
      await assertFails(setDoc(doc(db, 'gatheringTypes', 'gtBad'), { name: 'No order', blurb: '' }));
      await assertFails(setDoc(doc(db, 'gatheringTypes', 'gtBad2'), { name: '', blurb: '', order: 1 }));
    });
  });

  describe('Settings (season)', () => {
    const seedRoles = async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'manager1'), { role: 'manager', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'operator1'), { role: 'operator', approved: true });
      });
    };

    it('SS1: Anyone (even unauthenticated) can read settings/season', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'settings', 'season'), { override: null, clubRush: false });
      });
      const db = getFirestore(); // unauthenticated
      await assertSucceeds(getDoc(doc(db, 'settings', 'season')));
    });

    it('SS2: Manager can set the override + club-rush flag', async () => {
      await seedRoles();
      const db = getFirestore({ uid: 'manager1' });
      await assertSucceeds(setDoc(doc(db, 'settings', 'season'), { override: 'fall', clubRush: true }));
    });

    it('SS3: Operator cannot write the season settings', async () => {
      await seedRoles();
      const db = getFirestore({ uid: 'operator1' });
      await assertFails(setDoc(doc(db, 'settings', 'season'), { override: 'fall', clubRush: true }));
    });

    it('SS4: Rejects unexpected keys', async () => {
      await seedRoles();
      const db = getFirestore({ uid: 'manager1' });
      await assertFails(setDoc(doc(db, 'settings', 'season'), { override: 'fall', evil: true }));
    });

    it('SS5: Only the season doc id is writable', async () => {
      await seedRoles();
      const db = getFirestore({ uid: 'manager1' });
      await assertFails(setDoc(doc(db, 'settings', 'other'), { clubRush: true }));
    });
  });

  describe('Notifications', () => {
    const seedUsers = async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'admin1'), { role: 'admin', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'viewer1'), { role: 'viewer', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'viewer2'), { role: 'viewer', approved: true });
      });
    };
    const seedPersonalNotif = async (uid: string) => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'notifications', 'n1'), {
          userId: uid, title: 'Hi', message: 'msg', type: 'info', read: false,
        });
      });
    };
    const seedBroadcastNotif = async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'notifications', 'n2'), {
          userId: 'ALL_ADMINS', title: 'Hi all', message: 'msg', type: 'event', read: false,
        });
      });
    };

    it('N1: the recipient can mark their own personal notification read', async () => {
      await seedUsers();
      await seedPersonalNotif('viewer1');
      const db = getFirestore({ uid: 'viewer1' });
      await assertSucceeds(updateDoc(doc(db, 'notifications', 'n1'), { read: true, readBy: ['viewer1'] }));
    });

    it('N2: the recipient cannot change other fields while marking read', async () => {
      await seedUsers();
      await seedPersonalNotif('viewer1');
      const db = getFirestore({ uid: 'viewer1' });
      await assertFails(updateDoc(doc(db, 'notifications', 'n1'), { read: true, title: 'Hacked' }));
    });

    it('N3: a non-recipient, non-manager cannot mark someone else\'s personal notification read', async () => {
      await seedUsers();
      await seedPersonalNotif('viewer1');
      const db = getFirestore({ uid: 'viewer2' });
      await assertFails(updateDoc(doc(db, 'notifications', 'n1'), { read: true, readBy: ['viewer2'] }));
    });

    it('N4: any signed-in user can mark a broadcast notification read', async () => {
      await seedUsers();
      await seedBroadcastNotif();
      const db = getFirestore({ uid: 'viewer1' });
      await assertSucceeds(updateDoc(doc(db, 'notifications', 'n2'), { read: true, readBy: ['viewer1'] }));
    });

    it('N5: any signed-in user can dismiss (set aside) a broadcast notification for themselves', async () => {
      await seedUsers();
      await seedBroadcastNotif();
      const db = getFirestore({ uid: 'viewer1' });
      await assertSucceeds(updateDoc(doc(db, 'notifications', 'n2'), { dismissedBy: ['viewer1'] }));
    });

    it('N6: a manager can update a notification regardless of which fields change', async () => {
      await seedUsers();
      await seedPersonalNotif('viewer1');
      const db = getFirestore({ uid: 'admin1' });
      await assertSucceeds(updateDoc(doc(db, 'notifications', 'n1'), { title: 'Edited by staff' }));
    });
  });
});
