import { 
  assertFails, 
  assertSucceeds, 
  initializeTestEnvironment, 
  RulesTestEnvironment 
} from '@firebase/rules-unit-testing';
import {
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

  describe('My Day — user preferences & personal prayers', () => {
    const seedUsers = async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'u1'), { role: 'admin', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'u2'), { role: 'admin', approved: true });
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

    it('MP2: A user cannot read or write another user’s preferences', async () => {
      await seedUsers();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'userPreferences', 'u1'), { personalContactIds: ['c1'] });
      });
      const db = getFirestore({ uid: 'u2' });
      await assertFails(getDoc(doc(db, 'userPreferences', 'u1')));
      await assertFails(setDoc(doc(db, 'userPreferences', 'u1'), { personalContactIds: ['x'] }));
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

    it('MP5: A user cannot read or write another user’s personal prayers', async () => {
      await seedUsers();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users/u1/personalPrayers/pp1'), {
          title: 'private', contactId: null, date: '2026-05-15', status: 'open',
        });
      });
      const db = getFirestore({ uid: 'u2' });
      await assertFails(getDoc(doc(db, 'users/u1/personalPrayers/pp1')));
      await assertFails(setDoc(doc(db, 'users/u1/personalPrayers/pp2'), {
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
});
