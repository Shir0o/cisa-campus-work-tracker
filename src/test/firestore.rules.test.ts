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
});
