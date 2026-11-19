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
  arrayRemove,
  arrayUnion,
  deleteField,
  collectionGroup,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
} from 'firebase/firestore';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import * as fs from 'fs';
import { nullEmailContact, noOwnerContact } from './fixtures/contacts';
import { buildContactActivityPatch } from '../lib/contactActivity';

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
          role: 'manager',
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
          role: 'manager',
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
          role: 'manager',
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

      // Unapproved, so only the owner branch applies: there is no non-staff
      // approved role left to stand in for a plain owner.
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'users', 'user5'), {
          email: 'user5@example.com',
          displayName: 'User Five',
          photoURL: null,
          role: 'manager',
          approved: false,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
      });

      await assertFails(updateDoc(userRef, { pushToken: 'x'.repeat(201) }));
      await assertFails(updateDoc(userRef, { pushToken: 12345 }));
    });

    // ── Which team they're on (#727) ──
    // A team is a field on the trainee, arranged by a full-timer in Settings
    // the same way the gospel-partner pairs are. Nobody puts themselves on one.

    const seedUser = async (uid: string, extra: Record<string, unknown> = {}) => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', uid), {
          email: `${uid}@example.com`,
          displayName: uid,
          photoURL: null,
          role: 'manager',
          approved: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          ...extra,
        });
      });
    };

    it('An admin can put a trainee on a team, and take them off again', async () => {
      await seedUser('admin1', { role: 'admin' });
      await seedUser('trainee1');
      const db = getFirestore({ uid: 'admin1', email: 'admin1@example.com' });

      await assertSucceeds(updateDoc(doc(db, 'users', 'trainee1'), { team: 'yp' }));
      await assertSucceeds(updateDoc(doc(db, 'users', 'trainee1'), { team: null }));
    });

    // Security audit (Nov 2026): a Trainee could promote anyone, themselves
    // included, to Full-timer.
    it('A trainee cannot make themselves a Full-timer or change their own approval', async () => {
      await seedUser('traineeA');
      const db = getFirestore({ uid: 'traineeA', email: 'traineeA@example.com' });
      await assertFails(updateDoc(doc(db, 'users', 'traineeA'), { role: 'admin' }));
      await assertFails(updateDoc(doc(db, 'users', 'traineeA'), { approved: false }));
    });

    it('A trainee cannot promote someone to, or demote someone from, Full-timer', async () => {
      await seedUser('traineeB');
      await seedUser('traineeB2');
      await seedUser('adminB', { role: 'admin' });
      const db = getFirestore({ uid: 'traineeB', email: 'traineeB@example.com' });
      await assertFails(updateDoc(doc(db, 'users', 'traineeB2'), { role: 'admin' }));
      await assertFails(updateDoc(doc(db, 'users', 'adminB'), { role: 'manager' }));
      // Managing another Trainee's approval still works.
      await assertSucceeds(updateDoc(doc(db, 'users', 'traineeB2'), { approved: false }));
    });

    it('A trainee cannot invite a Full-timer; a Full-timer can', async () => {
      await seedUser('traineeC');
      await seedUser('adminC', { role: 'admin' });
      const trainee = getFirestore({ uid: 'traineeC', email: 'traineeC@example.com' });
      const admin = getFirestore({ uid: 'adminC', email: 'adminC@example.com' });
      await assertFails(setDoc(doc(trainee, 'invitations', 'new@example.com'), { email: 'new@example.com', role: 'admin', approved: true }));
      await assertSucceeds(setDoc(doc(trainee, 'invitations', 'trainee@example.com'), { email: 'trainee@example.com', role: 'manager', approved: true }));
      await assertSucceeds(setDoc(doc(admin, 'invitations', 'new@example.com'), { email: 'new@example.com', role: 'admin', approved: true }));
    });

    it("Nobody can claim an invitation sent to someone else's address", async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'invitations', 'invitee@example.com'), {
          email: 'invitee@example.com', role: 'admin', approved: true,
        });
      });
      const profile = {
        email: 'invitee@example.com', displayName: 'Invitee', photoURL: null,
        role: 'admin', approved: true,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };
      const attacker = getFirestore({ uid: 'attacker1', email: 'attacker@example.com' });
      await assertFails(setDoc(doc(attacker, 'users', 'attacker1'), profile));
      const unverified = getFirestore({ uid: 'unverified1', email: 'invitee@example.com', email_verified: false });
      await assertFails(setDoc(doc(unverified, 'users', 'unverified1'), profile));
      const invitee = getFirestore({ uid: 'invitee1', email: 'invitee@example.com' });
      await assertSucceeds(setDoc(doc(invitee, 'users', 'invitee1'), profile));
    });

    it('A trainee cannot put themselves — or anyone else — on a team', async () => {
      await seedUser('trainee2');
      await seedUser('trainee3');
      const db = getFirestore({ uid: 'trainee2', email: 'trainee2@example.com' });

      await assertFails(updateDoc(doc(db, 'users', 'trainee2'), { team: 'yp' }));
      await assertFails(updateDoc(doc(db, 'users', 'trainee3'), { team: 'campus' }));
    });

    it('A trainee can still make their ordinary edits while a team is set on them', async () => {
      await seedUser('trainee4', { team: 'yp' });
      const db = getFirestore({ uid: 'trainee4', email: 'trainee4@example.com' });

      await assertSucceeds(updateDoc(doc(db, 'users', 'trainee4'), { displayName: 'Renamed' }));
    });

    it('Nobody signs themselves onto a team on the way in', async () => {
      const db = getFirestore({ uid: 'newbie', email: 'newbie@example.com' });

      await assertFails(setDoc(doc(db, 'users', 'newbie'), {
        email: 'newbie@example.com',
        displayName: 'Newbie',
        photoURL: null,
        role: 'manager',
        approved: false,
        team: 'yp',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
    });

    it('A team must be a short string, not a document', async () => {
      await seedUser('admin2', { role: 'admin' });
      await seedUser('trainee5');
      const db = getFirestore({ uid: 'admin2', email: 'admin2@example.com' });

      await assertFails(updateDoc(doc(db, 'users', 'trainee5'), { team: 12345 }));
      await assertFails(updateDoc(doc(db, 'users', 'trainee5'), { team: 'x'.repeat(65) }));
    });
  });

  // Cut-or-keep §1: Student (`operator`) and Community (`viewer`) are no
  // longer roles. A stored legacy role is denied everything the role used to
  // be granted; only Full-timer and Trainee can be signed up, invited or set.
  describe('Student and Community roles are cut', () => {
    const seedRoles = async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const fs = context.firestore();
        await setDoc(doc(fs, 'users', 'admin1'), { email: 'admin1@example.com', displayName: 'admin1', role: 'admin', approved: true });
        await setDoc(doc(fs, 'users', 'student1'), { email: 'student1@example.com', displayName: 'student1', role: 'operator', approved: true });
        await setDoc(doc(fs, 'users', 'community1'), { email: 'community1@example.com', displayName: 'community1', role: 'viewer', approved: true });
        await setDoc(doc(fs, 'users', 'legacy1'), { email: 'legacy1@example.com', displayName: 'legacy1', photoURL: null, role: 'operator', approved: true });
        await setDoc(doc(fs, 'contacts', 'c-untied'), { name: 'Untied Person', email: 'untied@example.com', visibleTo: ['admin1'] });
        await setDoc(doc(fs, 'outreach', 'o1'), { date: '2026-10-01', where: 'Park', went: [], others: 0, handed: {}, how: '', photoCount: 0, names: [] });
      });
    };

    it('self-registration lands as an unapproved Trainee, never as Community', async () => {
      const user = (uid: string, role: string) => ({
        email: `${uid}@example.com`, displayName: uid, photoURL: null, role, approved: false,
      });
      await assertFails(setDoc(doc(getFirestore({ uid: 'newA', email: 'newA@example.com' }), 'users', 'newA'), user('newA', 'viewer')));
      await assertSucceeds(setDoc(doc(getFirestore({ uid: 'newB', email: 'newB@example.com' }), 'users', 'newB'), user('newB', 'manager')));
    });

    // Self-registration and the downgrade script both leave an unapproved
    // Trainee. Until a Full-timer approves them, the role must open nothing:
    // no approving someone else, no invitations, no deletes.
    it('an unapproved Trainee passes no Trainee gate', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const fs = context.firestore();
        const pending = (uid: string) => ({ email: `${uid}@example.com`, displayName: uid, photoURL: null, role: 'manager', approved: false });
        await setDoc(doc(fs, 'users', 'pendingA'), pending('pendingA'));
        await setDoc(doc(fs, 'users', 'pendingB'), pending('pendingB'));
        await setDoc(doc(fs, 'tasks', 't1'), { title: 'Call', status: 'pending', priority: 'low' });
      });
      const db = getFirestore({ uid: 'pendingA', email: 'pendingA@example.com' });
      await assertFails(updateDoc(doc(db, 'users', 'pendingB'), { approved: true }));
      await assertFails(setDoc(doc(db, 'invitations', 'friend@example.com'), { email: 'friend@example.com', role: 'manager', approved: true }));
      await assertFails(deleteDoc(doc(db, 'tasks', 't1')));
    });

    it('nobody can invite or set a Student or Community role, a Full-timer included', async () => {
      await seedRoles();
      const admin = getFirestore({ uid: 'admin1', email: 'admin1@example.com' });
      await assertFails(setDoc(doc(admin, 'invitations', 'a@example.com'), { email: 'a@example.com', role: 'operator', approved: true }));
      await assertFails(setDoc(doc(admin, 'invitations', 'b@example.com'), { email: 'b@example.com', role: 'viewer', approved: true }));
      await assertFails(updateDoc(doc(admin, 'users', 'legacy1'), { role: 'viewer' }));
      // Moving the one legacy account onto a real role still works.
      await assertSucceeds(updateDoc(doc(admin, 'users', 'legacy1'), { role: 'manager', approved: false }));
    });

    it('a Student account no longer reads the whole roster', async () => {
      await seedRoles();
      await assertFails(getDoc(doc(getFirestore({ uid: 'student1' }), 'contacts', 'c-untied')));
      await assertFails(getDoc(doc(getFirestore({ uid: 'community1' }), 'contacts', 'c-untied')));
    });

    it('a Student account no longer writes to-dos, prayers or a contact\'s stream', async () => {
      await seedRoles();
      const db = getFirestore({ uid: 'student1' });
      await assertFails(setDoc(doc(db, 'tasks', 't1'), { title: 'Call', status: 'pending', priority: 'low' }));
      await assertFails(updateDoc(doc(db, 'contacts', 'c-untied'), {
        lastSeen: '2026-08-08',
        lastContactedBy: 'Student One',
        lastContactedById: 'student1',
        lastContactedDate: '2026-08-08',
        updatedAt: serverTimestamp(),
      }));
    });

    // Cut-or-keep §2: the outing log is gone, so nothing reads or writes the
    // `outreach` collection. The documents stay in Firestore, unread.
    it('nobody reads or writes the outreach collection, a Full-timer included', async () => {
      await seedRoles();
      for (const uid of ['admin1', 'community1']) {
        const db = getFirestore({ uid });
        await assertFails(getDoc(doc(db, 'outreach', 'o1')));
        await assertFails(getDocs(collection(db, 'outreach')));
        await assertFails(setDoc(doc(db, 'outreach', 'o2'), { date: '2026-10-02', where: 'Park', went: [], others: 0, handed: {}, how: '', photoCount: 0, names: [] }));
      }
    });

    it('nobody RSVPs to an event any more', async () => {
      await seedRoles();
      const rsvp = (uid: string) => ({ uid, name: uid, status: 'going', createdAt: serverTimestamp() });
      await assertFails(setDoc(doc(getFirestore({ uid: 'community1' }), 'events/ev1/rsvps/community1'), rsvp('community1')));
      await assertFails(setDoc(doc(getFirestore({ uid: 'admin1' }), 'events/ev1/rsvps/admin1'), rsvp('admin1')));
      await assertFails(getDocs(query(collectionGroup(getFirestore({ uid: 'admin1' }), 'rsvps'), where('uid', '==', 'admin1'))));
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

    it('allows contact creation and update with null or absent email', async () => {
      const db = getFirestore({ uid: 'admin1', email: 'yilongwang05@gmail.com', email_verified: true });

      // Unauthenticated create with null email (e.g. from public /signup form)
      const unauthDb = getFirestore();
      await assertSucceeds(setDoc(doc(unauthDb, 'contacts', 'contact_no_email'), {
        name: 'Brandon Labra',
        email: null,
        phone: '1234567890',
        inChurchLife: false,
      }));

      // Approved user can update tags on a contact that has null or absent email (e.g. Combine tags)
      await assertSucceeds(updateDoc(doc(db, 'contacts', 'contact_no_email'), {
        tags: ['Fall 2026'],
        updatedAt: new Date().toISOString(),
        updatedBy: 'admin1',
        updatedByName: 'Admin',
      }));
    });

    // #1472, escape rows 17 and 20: a real sign-up or quick-add document has a
    // null email and no owner key, and the rules must keep letting its holders
    // edit it. The fixtures are the stored shapes the escapes came from.
    it('updates a legacy contact seeded from the null-email fixture', async () => {
      const db = getFirestore({ uid: 'admin1', email: 'admin1@example.com' });

      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'users', 'admin1'), { role: 'admin', approved: true });
        const { id, ...contactData } = nullEmailContact;
        await setDoc(doc(adminDb, 'contacts', id), contactData);
      });

      await assertSucceeds(updateDoc(doc(db, 'contacts', 'legacy-null-email'), {
        notes: 'Called them back.',
        updatedAt: serverTimestamp(),
        updatedBy: 'admin1',
        updatedByName: 'Admin',
      }));
    });

    it('updates a legacy contact seeded from the no-owner fixture', async () => {
      const db = getFirestore({ uid: 'admin1', email: 'admin1@example.com' });

      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'users', 'admin1'), { role: 'admin', approved: true });
        const { id, ...contactData } = noOwnerContact;
        await setDoc(doc(adminDb, 'contacts', id), contactData);
      });

      await assertSucceeds(updateDoc(doc(db, 'contacts', 'legacy-no-owner'), {
        notes: 'Followed up.',
        updatedAt: serverTimestamp(),
      }));
    });

    it('lets a Full-timer stamp the last-contacted trio when logging an interaction', async () => {
      // Mirrors the contact update inside LogInteractionModal's writeBatch and
      // ContactDetailsModal.handleAddInteraction: both stamp lastContactedBy /
      // lastContactedById / lastContactedDate alongside lastSeen.
      const db = getFirestore({ uid: 'teammate1' });

      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'teammate1'), { role: 'admin', approved: true });
        await setDoc(doc(context.firestore(), 'contacts', 'contact1'), { name: 'Test', email: 'test@example.com' });
      });

      await assertSucceeds(updateDoc(doc(db, 'contacts', 'contact1'), {
        lastSeen: '2026-08-08',
        lastContactedBy: 'Teammate One',
        lastContactedById: 'teammate1',
        lastContactedDate: '2026-08-08',
        updatedAt: serverTimestamp(),
      }));
    });

    it('lets a Full-timer stamp the reach with the trio when logging an interaction (#1335)', async () => {
      const db = getFirestore({ uid: 'teammate1' });

      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'teammate1'), { role: 'admin', approved: true });
        await setDoc(doc(context.firestore(), 'contacts', 'contact1'), { name: 'Test', email: 'test@example.com' });
      });

      await assertSucceeds(updateDoc(doc(db, 'contacts', 'contact1'), {
        lastSeen: '2026-08-08',
        lastContactedBy: 'Teammate One',
        lastContactedById: 'teammate1',
        lastContactedDate: '2026-08-08',
        reachedAt: '2026-08-08',
        hasNewActivity: true,
        updatedAt: serverTimestamp(),
      }));
    });

    it('lets a signed-in teammate create a walk-in already reached, but not a stranger (#1335)', async () => {
      // A walk-in is marked present as they are added, so they are reached. The
      // public sign-up form is filled in by a stranger, and signing up is not
      // reach — an unauthenticated create may not claim it.
      await assertSucceeds(setDoc(doc(getFirestore({ uid: 'operator1' }), 'contacts', 'walk_in'), {
        name: 'Walk In', reachedAt: '2026-08-08', attendance: { e1: true },
      }));
      await assertFails(setDoc(doc(getFirestore(), 'contacts', 'stranger'), {
        name: 'Stranger', reachedAt: '2026-08-08',
      }));
    });

  it("the caregiver field is gone — updating owner is rejected for everyone, admin included (#1053)", async () => {
    const db = getFirestore({ uid: "admin1" });

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", "admin1"), { role: "admin", approved: true });
      await setDoc(doc(context.firestore(), "contacts", "contact1"), {
        name: "Test", email: "test@example.com", coCreators: [],
      });
    });

    // Writing the removed field matches no allowed affectedKeys branch, so it
    // is denied even to an admin.
    await assertFails(updateDoc(doc(db, "contacts", "contact1"), {
      owner: "operator2",
      coCreators: [],
      updatedAt: serverTimestamp(),
    }));
  });

  it("rejects a co-creator who tries to write the removed owner field (#1053)", async () => {
    const db = getFirestore({ uid: "operator2" });

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", "operator1"), { role: "operator", approved: true });
      await setDoc(doc(context.firestore(), "users", "operator2"), { role: "operator", approved: true });
      await setDoc(doc(context.firestore(), "contacts", "contact_shared"), {
        name: "Shared Contact", email: "shared@example.com", createdBy: "operator1", coCreators: ["operator2"],
      });
    });

    await assertFails(updateDoc(doc(db, "contacts", "contact_shared"), {
      owner: "operator2",
      coCreators: ["operator2"],
      updatedAt: serverTimestamp(),
    }));
  });

  // #1363: the creator alone used to pass mayShare via createdBy. The client
  // never offers them the share branch, so the rules refuse it now.
  it("refuses a creator who is neither founder nor co-creator via coCreators", async () => {
    const db = getFirestore({ uid: "operator1" });

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", "operator1"), { role: "operator", approved: true });
      await setDoc(doc(context.firestore(), "contacts", "contact1"), {
        name: "Test", email: "test@example.com", createdBy: "operator1", coCreators: [],
      });
    });

    await assertFails(updateDoc(doc(db, "contacts", "contact1"), {
      coCreators: ["operator2"],
      updatedAt: serverTimestamp(),
      updatedBy: "operator1",
      updatedByName: "Operator One",
    }));
  });

  it("lets an existing co-creator update coCreators to add or remove collaborators", async () => {
    const db = getFirestore({ uid: "teammate2" });

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", "teammate1"), { role: "manager", approved: true });
      await setDoc(doc(context.firestore(), "users", "teammate2"), { role: "manager", approved: true });
      await setDoc(doc(context.firestore(), "users", "teammate3"), { role: "manager", approved: true });
      await setDoc(doc(context.firestore(), "contacts", "contact_shared"), {
        name: "Shared Contact",
        email: "shared@example.com",
        createdBy: "teammate1",
        coCreators: ["teammate2"],
        visibleTo: ["teammate1", "teammate2"],
      });
    });

    // teammate2 is in coCreators: should be able to add teammate3 to coCreators
    await assertSucceeds(updateDoc(doc(db, "contacts", "contact_shared"), {
      coCreators: ["teammate2", "teammate3"],
      updatedAt: serverTimestamp(),
      updatedBy: "teammate2",
      updatedByName: "Teammate Two",
    }));
  });

  it("rejects an outside teammate who is not creator or in coCreators from updating coCreators", async () => {
    const db = getFirestore({ uid: "operator3" });

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "users", "operator1"), { role: "operator", approved: true });
      await setDoc(doc(context.firestore(), "users", "operator2"), { role: "operator", approved: true });
      await setDoc(doc(context.firestore(), "users", "operator3"), { role: "operator", approved: true });
      await setDoc(doc(context.firestore(), "contacts", "contact_shared_3"), {
        name: "Shared Contact 3",
        email: "shared3@example.com",
        createdBy: "operator1",
        coCreators: ["operator2"],
      });
    });

    // operator3 is neither creator nor in coCreators: updating coCreators must fail
    await assertFails(updateDoc(doc(db, "contacts", "contact_shared_3"), {
      coCreators: ["operator2", "operator3"],
      updatedAt: serverTimestamp(),
      updatedBy: "operator3",
      updatedByName: "Operator Three",
    }));
  });

    // #1692: "On our hearts" is the team's list, so the removal lives on the
    // contact. Any approved operator who can see the person may set it with
    // their own uid or clear it; nobody may pin it on someone else.
    describe('team prayer list removal (#1692)', () => {
      const seed = async (contact: Record<string, unknown> = {}) => {
        await testEnv.withSecurityRulesDisabled(async (context) => {
          const adminDb = context.firestore();
          await setDoc(doc(adminDb, 'users', 'teammate1'), { role: 'manager', approved: true });
          await setDoc(doc(adminDb, 'users', 'teammate2'), { role: 'manager', approved: true });
          await setDoc(doc(adminDb, 'users', 'admin1'), { role: 'admin', approved: true });
          await setDoc(doc(adminDb, 'contacts', 'contact1'), {
            name: 'Test',
            email: 'test@example.com',
            visibleTo: ['teammate1'],
            ...contact,
          });
        });
      };

      const removal = (by: string) => ({
        prayerListRemoved: {
          at: '2026-10-22T00:00:00.000Z',
          by,
          byName: 'Teammate One',
        },
        updatedAt: serverTimestamp(),
        updatedBy: by,
        updatedByName: 'Teammate One',
      });

      it('lets a teammate set the removal naming themselves', async () => {
        await seed();
        const db = getFirestore({ uid: 'teammate1' });
        await assertSucceeds(updateDoc(doc(db, 'contacts', 'contact1'), removal('teammate1')));
      });

      it('lets a Full-timer who is not in visibleTo set it, because Full-timers see everyone', async () => {
        await seed();
        const db = getFirestore({ uid: 'admin1' });
        await assertSucceeds(updateDoc(doc(db, 'contacts', 'contact1'), removal('admin1')));
      });

      it('denies a removal that names someone else', async () => {
        await seed();
        const db = getFirestore({ uid: 'teammate1' });
        await assertFails(updateDoc(doc(db, 'contacts', 'contact1'), removal('teammate2')));
      });

      it('denies a removal carrying a fifth key', async () => {
        await seed();
        const db = getFirestore({ uid: 'teammate1' });
        await assertFails(updateDoc(doc(db, 'contacts', 'contact1'), {
          prayerListRemoved: {
            at: '2026-10-22T00:00:00.000Z',
            by: 'teammate1',
            byName: 'Teammate One',
            extra: 'nope',
          },
          updatedAt: serverTimestamp(),
          updatedBy: 'teammate1',
          updatedByName: 'Teammate One',
        }));
      });

      it('denies a teammate who cannot see the person, even naming themselves', async () => {
        await seed();
        const db = getFirestore({ uid: 'teammate2' });
        await assertFails(updateDoc(doc(db, 'contacts', 'contact1'), removal('teammate2')));
      });

      it('lets a teammate who can see the person clear it', async () => {
        await seed({
          prayerListRemoved: { at: '2026-10-01T00:00:00.000Z', by: 'teammate2', byName: 'Teammate Two' },
        });
        const db = getFirestore({ uid: 'teammate1' });
        await assertSucceeds(updateDoc(doc(db, 'contacts', 'contact1'), {
          prayerListRemoved: deleteField(),
          updatedAt: serverTimestamp(),
          updatedBy: 'teammate1',
          updatedByName: 'Teammate One',
        }));
      });

      it('denies an unauthenticated create that arrives already removed', async () => {
        const db = getFirestore();
        await assertFails(setDoc(doc(db, 'contacts', 'stranger'), {
          name: 'Stranger',
          email: 'stranger@example.com',
          prayerListRemoved: { at: '2026-10-22T00:00:00.000Z', by: 'someone' },
        }));
      });
    });
  });

  describe('Your sheep carers (#1051)', () => {
    const seed = async (contactId: string, contact: Record<string, unknown>) => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const fs = context.firestore();
        await setDoc(doc(fs, 'users', 'teammate1'), { role: 'manager', approved: true });
        await setDoc(doc(fs, 'users', 'teammate2'), { role: 'manager', approved: true });
        await setDoc(doc(fs, 'users', 'teammate3'), { role: 'manager', approved: true });
        await setDoc(doc(fs, 'contacts', contactId), {
          name: 'Test', email: 'test@example.com', ...contact,
        });
      });
    };

    it('lets a reader who already sees the person take them into their sheep', async () => {
      await seed('c_take_on', { createdBy: 'teammate1', visibleTo: ['teammate1', 'teammate2'] });
      const db = getFirestore({ uid: 'teammate2' });
      await assertSucceeds(updateDoc(doc(db, 'contacts', 'c_take_on'), {
        carers: ['teammate2'],
        visibleTo: ['teammate1', 'teammate2'],
        updatedAt: serverTimestamp(),
      }));
    });

    it('refuses taking on a person the reader cannot already see', async () => {
      await seed('c_no_reach', { createdBy: 'teammate1', visibleTo: ['teammate1'] });
      const db = getFirestore({ uid: 'teammate2' });
      await assertFails(updateDoc(doc(db, 'contacts', 'c_no_reach'), {
        carers: ['teammate2'],
        visibleTo: ['teammate1', 'teammate2'],
        updatedAt: serverTimestamp(),
      }));
    });

    it('refuses adding someone else as a carer', async () => {
      await seed('c_other', { createdBy: 'teammate1', visibleTo: ['teammate1', 'teammate2'] });
      const db = getFirestore({ uid: 'teammate2' });
      await assertFails(updateDoc(doc(db, 'contacts', 'c_other'), {
        carers: ['teammate2', 'teammate3'],
        visibleTo: ['teammate1', 'teammate2', 'teammate3'],
        updatedAt: serverTimestamp(),
      }));
    });

    it('refuses removing someone else from the carers', async () => {
      await seed('c_drop_other', {
        createdBy: 'teammate1',
        carers: ['teammate2', 'teammate3'],
        visibleTo: ['teammate1', 'teammate2', 'teammate3'],
      });
      const db = getFirestore({ uid: 'teammate2' });
      await assertFails(updateDoc(doc(db, 'contacts', 'c_drop_other'), {
        carers: [],
        visibleTo: ['teammate1'],
        updatedAt: serverTimestamp(),
      }));
    });

    it('lets a carer give the person up', async () => {
      await seed('c_give_up', {
        createdBy: 'teammate1',
        carers: ['teammate2'],
        visibleTo: ['teammate1', 'teammate2'],
      });
      const db = getFirestore({ uid: 'teammate2' });
      await assertSucceeds(updateDoc(doc(db, 'contacts', 'c_give_up'), {
        carers: [],
        visibleTo: ['teammate1'],
        updatedAt: serverTimestamp(),
      }));
    });
  });

  // #1526: Release from my queue. handleReleaseContact appends the caller's
  // own uid to `unfollowedBy`, drops only their own tie from
  // carers/coCreators/founders, and rewrites `visibleTo` to match. These pin
  // the exact write shape the client sends, positive and negative.
  describe('Release from my queue (#1526)', () => {
    const seed = async (contactId: string, contact: Record<string, unknown>) => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const fs = context.firestore();
        await setDoc(doc(fs, 'users', 'manager1'), { role: 'manager', approved: true });
        await setDoc(doc(fs, 'users', 'manager2'), { role: 'manager', approved: true });
        await setDoc(doc(fs, 'users', 'manager3'), { role: 'manager', approved: true });
        await setDoc(doc(fs, 'contacts', contactId), {
          name: 'Test', email: 'test@example.com', ...contact,
        });
      });
    };

    it('lets a tied carer release themselves from their own queue', async () => {
      await seed('c_release', {
        createdBy: 'manager2',
        carers: ['manager1'],
        visibleTo: ['manager2', 'manager1'],
      });
      const db = getFirestore({ uid: 'manager1' });
      await assertSucceeds(updateDoc(doc(db, 'contacts', 'c_release'), {
        unfollowedBy: arrayUnion('manager1'),
        carers: arrayRemove('manager1'),
        visibleTo: ['manager2'],
        updatedAt: serverTimestamp(),
        updatedBy: 'manager1',
        updatedByName: 'Manager One',
      }));
    });

    it('lets a founder release themselves while keeping creation history', async () => {
      await seed('c_release_founder', {
        createdBy: 'manager1',
        founders: ['manager1'],
        visibleTo: ['manager1'],
      });
      const db = getFirestore({ uid: 'manager1' });
      await assertSucceeds(updateDoc(doc(db, 'contacts', 'c_release_founder'), {
        unfollowedBy: arrayUnion('manager1'),
        founders: arrayRemove('manager1'),
        visibleTo: ['manager1'],
        updatedAt: serverTimestamp(),
        updatedBy: 'manager1',
        updatedByName: 'Manager One',
      }));
    });

    it('refuses adding a uid other than the caller to unfollowedBy', async () => {
      await seed('c_release_other', {
        createdBy: 'manager2',
        carers: ['manager1'],
        visibleTo: ['manager2', 'manager1'],
      });
      const db = getFirestore({ uid: 'manager1' });
      await assertFails(updateDoc(doc(db, 'contacts', 'c_release_other'), {
        unfollowedBy: arrayUnion('manager2'),
        carers: arrayRemove('manager1'),
        visibleTo: ['manager2'],
        updatedAt: serverTimestamp(),
        updatedBy: 'manager1',
        updatedByName: 'Manager One',
      }));
    });

    it('refuses a release that widens visibleTo to another user', async () => {
      await seed('c_release_widen', {
        createdBy: 'manager2',
        carers: ['manager1'],
        visibleTo: ['manager2', 'manager1'],
      });
      const db = getFirestore({ uid: 'manager1' });
      await assertFails(updateDoc(doc(db, 'contacts', 'c_release_widen'), {
        unfollowedBy: arrayUnion('manager1'),
        carers: arrayRemove('manager1'),
        visibleTo: ['manager2', 'manager1', 'manager3'],
        updatedAt: serverTimestamp(),
        updatedBy: 'manager1',
        updatedByName: 'Manager One',
      }));
    });

    it('refuses a release that adds another user to a tie list', async () => {
      await seed('c_release_grant', {
        createdBy: 'manager2',
        carers: ['manager1'],
        visibleTo: ['manager2', 'manager1'],
      });
      const db = getFirestore({ uid: 'manager1' });
      await assertFails(updateDoc(doc(db, 'contacts', 'c_release_grant'), {
        unfollowedBy: arrayUnion('manager1'),
        coCreators: arrayUnion('manager3'),
        visibleTo: ['manager2', 'manager1'],
        updatedAt: serverTimestamp(),
        updatedBy: 'manager1',
        updatedByName: 'Manager One',
      }));
    });

    it('refuses a release from an untied user', async () => {
      await seed('c_release_untied', {
        createdBy: 'manager2',
        visibleTo: ['manager2'],
      });
      const db = getFirestore({ uid: 'manager1' });
      await assertFails(updateDoc(doc(db, 'contacts', 'c_release_untied'), {
        unfollowedBy: arrayUnion('manager1'),
        updatedAt: serverTimestamp(),
        updatedBy: 'manager1',
        updatedByName: 'Manager One',
      }));
    });

  });

  describe('Sheep carers end with the tie that granted them (#1052)', () => {
    const seed = async (contactId: string, contact: Record<string, unknown>) => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const fs = context.firestore();
        await setDoc(doc(fs, 'users', 'teammate1'), { role: 'manager', approved: true });
        await setDoc(doc(fs, 'users', 'teammate2'), { role: 'manager', approved: true });
        await setDoc(doc(fs, 'users', 'teammate3'), { role: 'manager', approved: true });
        await setDoc(doc(fs, 'contacts', contactId), {
          name: 'Test', email: 'test@example.com', ...contact,
        });
      });
    };

    it('removing a collaborator also drops their carer tie and access in the same write', async () => {
      await seed('c_rm_carer_collab', {
        createdBy: 'teammate1',
        coCreators: ['teammate2', 'teammate3'],
        carers: ['teammate3'],
        visibleTo: ['teammate1', 'teammate2', 'teammate3'],
      });
      const db = getFirestore({ uid: 'teammate2' });
      await assertSucceeds(updateDoc(doc(db, 'contacts', 'c_rm_carer_collab'), {
        coCreators: arrayRemove('teammate3'),
        carers: arrayRemove('teammate3'),
        visibleTo: ['teammate1', 'teammate2'],
        updatedAt: serverTimestamp(),
      }));
    });

    it('lets a collaborator be removed with no carer tie to drop', async () => {
      await seed('c_rm_plain', {
        createdBy: 'teammate1',
        coCreators: ['teammate2', 'teammate3'],
        visibleTo: ['teammate1', 'teammate2', 'teammate3'],
      });
      const db = getFirestore({ uid: 'teammate2' });
      await assertSucceeds(updateDoc(doc(db, 'contacts', 'c_rm_plain'), {
        coCreators: arrayRemove('teammate3'),
        visibleTo: ['teammate1', 'teammate2'],
        updatedAt: serverTimestamp(),
      }));
    });

    it('refuses to grant a carer tie while removing a collaborator', async () => {
      await seed('c_rm_selfgrant', {
        createdBy: 'teammate1',
        coCreators: ['teammate2', 'teammate3'],
        visibleTo: ['teammate1', 'teammate2', 'teammate3'],
      });
      const db = getFirestore({ uid: 'teammate2' });
      await assertFails(updateDoc(doc(db, 'contacts', 'c_rm_selfgrant'), {
        coCreators: arrayRemove('teammate3'),
        carers: arrayUnion('teammate2'),
        visibleTo: ['teammate1', 'teammate2', 'teammate3'],
        updatedAt: serverTimestamp(),
      }));
    });

    it('refuses to drop a carer tie that is not the removed collaborator\'s', async () => {
      await seed('c_rm_wrong_carer', {
        createdBy: 'teammate1',
        coCreators: ['teammate2', 'teammate3'],
        carers: ['teammate2', 'teammate3'],
        visibleTo: ['teammate1', 'teammate2', 'teammate3'],
      });
      const db = getFirestore({ uid: 'teammate2' });
      await assertFails(updateDoc(doc(db, 'contacts', 'c_rm_wrong_carer'), {
        coCreators: arrayRemove('teammate3'),
        carers: arrayRemove('teammate2'),
        visibleTo: ['teammate1'],
        updatedAt: serverTimestamp(),
      }));
    });

    it('refuses to revoke access for anyone but the removed collaborator', async () => {
      await seed('c_rm_extra_revoke', {
        createdBy: 'teammate1',
        coCreators: ['teammate2', 'teammate3'],
        carers: ['teammate3'],
        visibleTo: ['teammate1', 'teammate2', 'teammate3'],
      });
      const db = getFirestore({ uid: 'teammate2' });
      await assertFails(updateDoc(doc(db, 'contacts', 'c_rm_extra_revoke'), {
        coCreators: arrayRemove('teammate3'),
        carers: arrayRemove('teammate3'),
        visibleTo: ['teammate1'],
        updatedAt: serverTimestamp(),
      }));
    });
  });

  // Contact visibility: the tie enforced server-side (#1024 phase 4). The
  // rule reads the denormalised `visibleTo` list; a Trainee must appear in it.
  describe('Contact visibility (visibleTo)', () => {
    const seedVisibleToUsers = async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const fs = context.firestore();
        await setDoc(doc(fs, 'users', 'admin1'), { role: 'admin', approved: true });
        await setDoc(doc(fs, 'users', 'manager1'), { role: 'manager', approved: true });
        await setDoc(doc(fs, 'users', 'manager2'), { role: 'manager', approved: true });
      });
    };

    it('lets a Trainee read each kind of tie, and refuses an untied person', async () => {
      await seedVisibleToUsers();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const fs = context.firestore();
        const base = { name: 'Test', email: 'test@example.com' };
        await setDoc(doc(fs, 'contacts/untied'), { ...base, visibleTo: [] });
        await setDoc(doc(fs, 'contacts/created'), { ...base, createdBy: 'manager1', visibleTo: ['manager1'] });
        await setDoc(doc(fs, 'contacts/added'), { ...base, addedBy: 'manager1', visibleTo: ['manager1'] });
        await setDoc(doc(fs, 'contacts/cared'), { ...base, carers: ['manager1'], visibleTo: ['manager1'] });
        await setDoc(doc(fs, 'contacts/shared'), {
          ...base, coCreators: ['manager1'], visibleTo: ['manager1', 'manager2'],
        });
        // A legacy doc that has not been backfilled must fail closed.
        await setDoc(doc(fs, 'contacts/legacy'), { ...base, createdBy: 'manager1' });
      });

      const trainee = getFirestore({ uid: 'manager1' });
      await assertFails(getDoc(doc(trainee, 'contacts/untied')));
      await assertSucceeds(getDoc(doc(trainee, 'contacts/created')));
      await assertSucceeds(getDoc(doc(trainee, 'contacts/added')));
      await assertSucceeds(getDoc(doc(trainee, 'contacts/cared')));
      await assertSucceeds(getDoc(doc(trainee, 'contacts/shared')));
      await assertFails(getDoc(doc(trainee, 'contacts/legacy')));

      // A Full-timer reads anything, backfilled or not.
      const admin = getFirestore({ uid: 'admin1' });
      await assertSucceeds(getDoc(doc(admin, 'contacts/untied')));
      await assertSucceeds(getDoc(doc(admin, 'contacts/legacy')));
    });

    it('refuses a signed-out create that claims a tie (Nov 2026)', async () => {
      await seedVisibleToUsers();
      const anon = getFirestore();
      const base = { name: 'Stranger', email: null, inChurchLife: false };
      // The public form's own shape still goes through.
      await assertSucceeds(setDoc(doc(anon, 'contacts/plain'), { ...base, visibleTo: [] }));
      // Any claimed tie would put the person in a Trainee's list.
      await assertFails(setDoc(doc(anon, 'contacts/t1'), { ...base, visibleTo: ['manager1'] }));
      await assertFails(setDoc(doc(anon, 'contacts/t2'), { ...base, createdBy: 'manager1', visibleTo: [] }));
      await assertFails(setDoc(doc(anon, 'contacts/t3'), { ...base, addedBy: 'manager1' }));
      await assertFails(setDoc(doc(anon, 'contacts/t4'), { ...base, carers: ['manager1'] }));
      await assertFails(setDoc(doc(anon, 'contacts/t5'), { ...base, coCreators: ['manager1'] }));
      await assertFails(setDoc(doc(anon, 'contacts/t6'), { ...base, founders: ['manager1'] }));
    });

    it('lets a signed-in member create only as themselves, unless a Full-timer (Nov 2026)', async () => {
      await seedVisibleToUsers();
      const base = { name: 'Walk-in', email: null, inChurchLife: false };
      const trainee = getFirestore({ uid: 'manager1' });
      await assertSucceeds(
        setDoc(doc(trainee, 'contacts/mine'), { ...base, createdBy: 'manager1', visibleTo: ['manager1'] }),
      );
      await assertFails(
        setDoc(doc(trainee, 'contacts/forged'), { ...base, createdBy: 'manager2', visibleTo: ['manager2'] }),
      );
      await assertSucceeds(
        setDoc(doc(getFirestore({ uid: 'admin1' }), 'contacts/forFriend'), {
          ...base, createdBy: 'manager2', visibleTo: ['manager2'],
        }),
      );
    });

    it('refuses a Trainee list query without the access constraint, allows it with one', async () => {
      await seedVisibleToUsers();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const fs = context.firestore();
        await setDoc(doc(fs, 'contacts/mine'), { name: 'Mine', email: 'm@example.com', visibleTo: ['manager1'] });
        await setDoc(doc(fs, 'contacts/theirs'), { name: 'Theirs', email: 't@example.com', visibleTo: ['manager2'] });
      });

      const trainee = getFirestore({ uid: 'manager1' });
      await assertFails(getDocs(query(collection(trainee, 'contacts'))));

      const scoped = await assertSucceeds(
        getDocs(query(collection(trainee, 'contacts'), where('visibleTo', 'array-contains', 'manager1'))),
      );
      expect(scoped.docs.map((d) => d.id)).toEqual(['mine']);

      const admin = getFirestore({ uid: 'admin1' });
      await assertSucceeds(getDocs(query(collection(admin, 'contacts'))));
    });

    it('rejects visibleTo as a ghost field outside the tie-maintenance branch', async () => {
      await seedVisibleToUsers();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'contacts/c1'), {
          name: 'Test', email: 'test@example.com', createdBy: 'manager2', coCreators: ['manager1'], visibleTo: ['manager1'],
        });
      });

      const coCreator = getFirestore({ uid: 'manager1' });
      // A profile edit may not smuggle a visibleTo change.
      await assertFails(updateDoc(doc(coCreator, 'contacts/c1'), {
        name: 'Renamed',
        visibleTo: ['manager1', 'manager2'],
      }));
      // The tie-maintenance branch may rewrite it in lockstep with the ties.
      await assertSucceeds(updateDoc(doc(coCreator, 'contacts/c1'), {
        coCreators: ['manager1', 'manager2'],
        visibleTo: ['manager1', 'manager2'],
        updatedAt: serverTimestamp(),
      }));
    });

    it('lets an existing co-creator rewrite coCreators and visibleTo together', async () => {
      await seedVisibleToUsers();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'contacts/c2'), {
          name: 'Test', email: 'test@example.com', createdBy: 'manager1', coCreators: ['manager2'],
          visibleTo: ['manager1', 'manager2'],
        });
      });

      const coCreator = getFirestore({ uid: 'manager2' });
      await assertSucceeds(updateDoc(doc(coCreator, 'contacts/c2'), {
        coCreators: ['manager2'],
        visibleTo: ['manager1', 'manager2'],
        updatedAt: serverTimestamp(),
      }));
    });

    it('gates a person\'s Alongside thread on read access to the person', async () => {
      await seedVisibleToUsers();
      const msg = (over: Record<string, unknown> = {}) => ({
        from: 'manager1', fromName: 'Trainee', kind: 'comment', body: 'hello',
        at: new Date().toISOString(), interactionId: null, ...over,
      });
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const fs = context.firestore();
        await setDoc(doc(fs, 'contacts/tied'), { name: 'Tied', email: 't@example.com', visibleTo: ['manager1'] });
        await setDoc(doc(fs, 'contacts/untied'), { name: 'Untied', email: 'u@example.com', visibleTo: [] });
        await setDoc(doc(fs, 'contacts/tied/threads/th1'), msg());
        await setDoc(doc(fs, 'contacts/untied/threads/th2'), msg({ from: 'manager2' }));
        await setDoc(doc(fs, 'contacts/tied/threads/th3'), msg({ from: 'admin1', scope: 'team' }));
      });

      const trainee = getFirestore({ uid: 'manager1' });
      await assertSucceeds(getDoc(doc(trainee, 'contacts/tied/threads/th1')));
      await assertFails(getDoc(doc(trainee, 'contacts/untied/threads/th2')));
      // Team-scope Discussion stays Full-timer-only even on a readable person.
      await assertFails(getDoc(doc(trainee, 'contacts/tied/threads/th3')));
    });
  });

  // #1350: who can see a person is who can change them. The update rule asks
  // the read rule's question of the contact as it stands before the write, so
  // a tie the write itself removes (giving someone up, leaving a share) still
  // counts, and a tie the write would add never does.
  describe('Contact updates follow the contact\'s visibility (#1350)', () => {
    const seed = async (contactId: string, contact: Record<string, unknown>) => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const fs = context.firestore();
        await setDoc(doc(fs, 'users', 'admin1'), { role: 'admin', approved: true });
        await setDoc(doc(fs, 'users', 'manager1'), { role: 'manager', approved: true });
        await setDoc(doc(fs, 'users', 'manager2'), { role: 'manager', approved: true });
        await setDoc(doc(fs, 'users', 'manager3'), { role: 'manager', approved: true });
        await setDoc(doc(fs, 'contacts', contactId), {
          name: 'Test', email: 'test@example.com', ...contact,
        });
      });
    };
    const updated = (uid: string) => ({ updatedAt: serverTimestamp(), updatedBy: uid, updatedByName: uid });
    const logged = (uid: string) => ({
      lastSeen: '2026-10-04', lastContactedBy: uid, lastContactedById: uid,
      lastContactedDate: '2026-10-04', reachedAt: '2026-10-04', ...updated(uid),
    });

    it('refuses a Trainee editing the profile of someone they are not tied to', async () => {
      await seed('c_untied', { createdBy: 'manager2', coCreators: [], visibleTo: ['manager2'] });
      const trainee = getFirestore({ uid: 'manager1' });
      await assertFails(updateDoc(doc(trainee, 'contacts/c_untied'), {
        year: 'Senior', major: 'Physics', ...updated('manager1'),
      }));
    });

    it('refuses a Trainee stamping the reach on someone they are not tied to', async () => {
      await seed('c_untied_reach', { createdBy: 'manager2', visibleTo: ['manager2'] });
      const trainee = getFirestore({ uid: 'manager1' });
      await assertFails(updateDoc(doc(trainee, 'contacts/c_untied_reach'), logged('manager1')));
    });

    it('refuses a Trainee whose tie is not on the access list — the list decides, as for reading', async () => {
      // An un-backfilled contact the Trainee created: they cannot read it, so
      // they cannot share it either.
      await seed('c_legacy', { createdBy: 'manager1', coCreators: [] });
      const trainee = getFirestore({ uid: 'manager1' });
      await assertFails(updateDoc(doc(trainee, 'contacts/c_legacy'), {
        coCreators: ['manager2'], visibleTo: ['manager1', 'manager2'], ...updated('manager1'),
      }));
    });

    it('refuses a Trainee taking on someone they are not tied to', async () => {
      await seed('c_untied_take', { createdBy: 'manager2', visibleTo: ['manager2'] });
      const trainee = getFirestore({ uid: 'manager1' });
      await assertFails(updateDoc(doc(trainee, 'contacts/c_untied_take'), {
        carers: ['manager1'], visibleTo: ['manager2', 'manager1'],
      }));
    });

    it('lets a tied Trainee edit the profile', async () => {
      await seed('c_tied', { createdBy: 'manager1', coCreators: [], visibleTo: ['manager1'] });
      const trainee = getFirestore({ uid: 'manager1' });
      await assertSucceeds(updateDoc(doc(trainee, 'contacts/c_tied'), {
        year: 'Senior', major: 'Physics', ...updated('manager1'),
      }));
    });

    it('lets a tied Trainee log an interaction: the last-contacted trio and the reach', async () => {
      await seed('c_tied_reach', { carers: ['manager1'], visibleTo: ['manager1'] });
      const trainee = getFirestore({ uid: 'manager1' });
      await assertSucceeds(updateDoc(doc(trainee, 'contacts/c_tied_reach'), logged('manager1')));
    });

    // #1363: the client's canManageCollaborators never consults the creator,
    // so the rules must not either. A creator who is neither a founder nor a
    // co-creator keeps read access but gets no share branch.
    it('refuses a creator who is neither founder nor co-creator the share branch', async () => {
      await seed('c_creator', { createdBy: 'manager1', coCreators: [], visibleTo: ['manager1'] });
      const creator = getFirestore({ uid: 'manager1' });
      await assertFails(updateDoc(doc(creator, 'contacts/c_creator'), {
        coCreators: arrayUnion('manager2'), visibleTo: ['manager1', 'manager2'],
      }));
    });

    it('refuses the same creator the collaborator-removal branch (#1052)', async () => {
      await seed('c_creator_rm', {
        createdBy: 'manager1', coCreators: ['manager3'], carers: ['manager3'],
        visibleTo: ['manager1', 'manager3'],
      });
      const creator = getFirestore({ uid: 'manager1' });
      await assertFails(updateDoc(doc(creator, 'contacts/c_creator_rm'), {
        coCreators: arrayRemove('manager3'), carers: arrayRemove('manager3'),
        visibleTo: ['manager1'], ...updated('manager1'),
      }));
    });

    it('refuses a legacy addedBy-only creator the share branch too', async () => {
      await seed('c_added', { addedBy: 'manager1', visibleTo: ['manager1'] });
      const adder = getFirestore({ uid: 'manager1' });
      await assertFails(updateDoc(doc(adder, 'contacts/c_added'), {
        coCreators: arrayUnion('manager2'), visibleTo: ['manager1', 'manager2'],
      }));
    });

    // ADR 0022 amendment: a founder manages collaborators exactly as a
    // co-creator does, though they neither created the person nor were added.
    it('lets a founder who is not the creator share, delegate and remove a collaborator', async () => {
      await seed('c_founder', {
        createdBy: 'manager2', founders: ['manager2', 'manager1'], coCreators: ['manager3'], carers: ['manager3'],
        visibleTo: ['manager2', 'manager1', 'manager3'],
      });
      const founder = getFirestore({ uid: 'manager1' });
      await assertSucceeds(updateDoc(doc(founder, 'contacts/c_founder'), {
        coCreators: arrayRemove('manager3'), carers: arrayRemove('manager3'),
        visibleTo: ['manager2', 'manager1'], ...updated('manager1'),
      }));
      await assertSucceeds(updateDoc(doc(founder, 'contacts/c_founder'), {
        coCreators: arrayUnion('manager3'), visibleTo: ['manager2', 'manager1', 'manager3'], ...updated('manager1'),
      }));
    });

    it('lets a co-creator remove another collaborator, and their carer tie with them', async () => {
      await seed('c_rm', {
        createdBy: 'manager1', coCreators: ['manager2', 'manager3'], carers: ['manager3'],
        visibleTo: ['manager1', 'manager2', 'manager3'],
      });
      const coCreator = getFirestore({ uid: 'manager2' });
      await assertSucceeds(updateDoc(doc(coCreator, 'contacts/c_rm'), {
        coCreators: arrayRemove('manager3'), carers: arrayRemove('manager3'),
        visibleTo: ['manager1', 'manager2'], ...updated('manager2'),
      }));
    });

    it('lets a co-creator leave the share, though the write takes them off the access list', async () => {
      await seed('c_leave', {
        createdBy: 'manager1', coCreators: ['manager2'], visibleTo: ['manager1', 'manager2'],
      });
      const coCreator = getFirestore({ uid: 'manager2' });
      await assertSucceeds(updateDoc(doc(coCreator, 'contacts/c_leave'), {
        coCreators: arrayRemove('manager2'), visibleTo: ['manager1'], ...updated('manager2'),
      }));
    });

    it('lets a tied Trainee take someone on, and give up a person held only as a carer', async () => {
      await seed('c_take', { createdBy: 'manager2', coCreators: ['manager1'], visibleTo: ['manager2', 'manager1'] });
      await seed('c_give', { createdBy: 'manager2', carers: ['manager1'], visibleTo: ['manager2', 'manager1'] });
      const trainee = getFirestore({ uid: 'manager1' });
      await assertSucceeds(updateDoc(doc(trainee, 'contacts/c_take'), {
        carers: arrayUnion('manager1'), visibleTo: ['manager2', 'manager1'],
      }));
      await assertSucceeds(updateDoc(doc(trainee, 'contacts/c_give'), {
        carers: arrayRemove('manager1'), visibleTo: ['manager2'],
      }));
    });

    it('lets a Full-timer edit anyone, on the access list or not', async () => {
      await seed('c_ft_listed', { createdBy: 'manager2', visibleTo: ['manager2'] });
      await seed('c_ft_legacy', { createdBy: 'manager2' });
      const admin = getFirestore({ uid: 'admin1' });
      await assertSucceeds(updateDoc(doc(admin, 'contacts/c_ft_listed'), { notes: 'oversight', ...updated('admin1') }));
      await assertSucceeds(updateDoc(doc(admin, 'contacts/c_ft_legacy'), logged('admin1')));
    });

    it('lets a Full-timer share, correct founders, set the kind and confirm a year on someone not on their list', async () => {
      await seed('c_ft', {
        createdBy: 'manager2', founders: ['manager2'], coCreators: [], visibleTo: ['manager2'],
        isStudent: true, year: 'Junior',
      });
      const admin = getFirestore({ uid: 'admin1' });
      await assertSucceeds(updateDoc(doc(admin, 'contacts/c_ft'), {
        coCreators: ['manager1'], visibleTo: ['manager2', 'manager1'], ...updated('admin1'),
      }));
      await assertSucceeds(updateDoc(doc(admin, 'contacts/c_ft'), {
        founders: ['manager2', 'manager3'], visibleTo: ['manager2', 'manager1', 'manager3'], ...updated('admin1'),
      }));
      await assertSucceeds(updateDoc(doc(admin, 'contacts/c_ft'), {
        inChurchLife: true, isStudent: true, kindSetBy: 'admin1', kindSetAt: '2026-10-04T00:00:00.000Z',
        ...updated('admin1'),
      }));
      await assertSucceeds(updateDoc(doc(admin, 'contacts/c_ft'), {
        year: 'Senior', yearConfirmedFor: '2026-27', yearConfirmedBy: 'admin1',
        yearConfirmedAt: '2026-10-04T00:00:00.000Z', ...updated('admin1'),
      }));
    });

    // The costliest legitimate writes: the writer is not on the list, so the
    // gate pays for the role lookup, and the write takes the heaviest branch.
    it('lets a Full-timer remove a collaborator and their carer tie on someone not on their list (expression budget)', async () => {
      await seed('c_ft_rm', {
        createdBy: 'manager1', coCreators: ['manager2', 'manager3'], carers: ['manager3'],
        visibleTo: ['manager1', 'manager2', 'manager3'],
      });
      const admin = getFirestore({ uid: 'admin1' });
      await assertSucceeds(updateDoc(doc(admin, 'contacts/c_ft_rm'), {
        coCreators: arrayRemove('manager3'), carers: arrayRemove('manager3'),
        visibleTo: ['manager1', 'manager2'], ...updated('admin1'),
      }));
    });
  });

  // #1298: Add to story. Anyone who can see the person may take a message into
  // their story, or take it back out; the visibility gate (#1350) still refuses
  // anyone who cannot see them.
  describe('Add to story (#1298)', () => {
    const seed = async (contactId: string, contact: Record<string, unknown>) => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const fs = context.firestore();
        await setDoc(doc(fs, 'users', 'admin1'), { role: 'admin', approved: true });
        await setDoc(doc(fs, 'users', 'manager1'), { role: 'manager', approved: true });
        await setDoc(doc(fs, 'contacts', contactId), { name: 'Test', ...contact });
      });
    };
    const addThenRemove = async (uid: string, contactId: string) => {
      const ref = doc(getFirestore({ uid }), 'contacts', contactId);
      await assertSucceeds(updateDoc(ref, { storyMessageIds: arrayUnion('m1') }));
      await assertSucceeds(updateDoc(ref, { storyMessageIds: arrayRemove('m1') }));
    };

    it('lets a tied Trainee add a message to the story and take it back out', async () => {
      await seed('c_story', { createdBy: 'manager2', visibleTo: ['manager2', 'manager1'] });
      await addThenRemove('manager1', 'c_story');
    });

    it('lets a Full-timer do it for someone not on their list', async () => {
      await seed('c_story_all', { createdBy: 'manager2', visibleTo: ['manager2'] });
      await addThenRemove('admin1', 'c_story_all');
    });

    it('refuses a Trainee who cannot see the person', async () => {
      await seed('c_story_untied', { createdBy: 'manager2', visibleTo: ['manager2'] });
      const trainee = getFirestore({ uid: 'manager1' });
      await assertFails(updateDoc(doc(trainee, 'contacts/c_story_untied'), { storyMessageIds: arrayUnion('m1') }));
    });
  });

  // A History entry is data about its target contact (targetName, a stage
  // change in description), so it is visible exactly when the contact is: a
  // Trainee reads only entries about people in their `visibleTo`.
  describe('Activities follow their target contact\'s visibility', () => {
    const seedActivities = async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const fs = context.firestore();
        await setDoc(doc(fs, 'users', 'admin1'), { role: 'admin', approved: true });
        await setDoc(doc(fs, 'users', 'manager1'), { role: 'manager', approved: true });
        await setDoc(doc(fs, 'contacts/tied'), { name: 'Tied', email: 't@example.com', visibleTo: ['manager1'] });
        await setDoc(doc(fs, 'contacts/untied'), { name: 'Untied', email: 'u@example.com', visibleTo: [] });
        const entry = (targetId: string, targetType: string, createdAt: string) => ({
          userId: 'admin1', userName: 'Admin', action: 'updated', type: 'edit',
          targetId, targetType, targetName: targetId, description: 'stage: "First Contact" → "Regular"', createdAt,
        });
        await setDoc(doc(fs, 'activities/a_tied'), entry('tied', 'contact', '2026-01-01'));
        await setDoc(doc(fs, 'activities/a_untied'), entry('untied', 'contact', '2026-01-02'));
        await setDoc(doc(fs, 'activities/a_event'), entry('event1', 'event', '2026-01-03'));
      });
    };
    // The client query shapes: History / GlobalSearch, and Contact Detail.
    const feed = (db: ReturnType<typeof getFirestore>) =>
      query(collection(db, 'activities'), orderBy('createdAt', 'desc'), limit(100));
    const forContact = (db: ReturnType<typeof getFirestore>, contactId: string) =>
      query(collection(db, 'activities'), where('targetId', '==', contactId), orderBy('createdAt', 'desc'), limit(50));

    it('lets a Trainee get an entry only about a person they can see', async () => {
      await seedActivities();
      const trainee = getFirestore({ uid: 'manager1' });
      await assertSucceeds(getDoc(doc(trainee, 'activities/a_tied')));
      await assertFails(getDoc(doc(trainee, 'activities/a_untied')));
      await assertFails(getDoc(doc(trainee, 'activities/a_event')));
    });

    it('lets a Trainee list one visible person\'s history, never an unseen person\'s or the whole feed', async () => {
      await seedActivities();
      const trainee = getFirestore({ uid: 'manager1' });
      const scoped = await assertSucceeds(getDocs(forContact(trainee, 'tied')));
      expect(scoped.docs.map((d) => d.id)).toEqual(['a_tied']);
      await assertFails(getDocs(forContact(trainee, 'untied')));
      await assertFails(getDocs(feed(trainee)));
    });

    it('keeps the whole feed readable for a Full-timer, who sees every person', async () => {
      await seedActivities();
      for (const uid of ['admin1']) {
        const db = getFirestore({ uid });
        const all = await assertSucceeds(getDocs(feed(db)));
        expect(all.docs.map((d) => d.id)).toEqual(['a_event', 'a_untied', 'a_tied']);
        await assertSucceeds(getDocs(forContact(db, 'untied')));
      }
    });
  });

  // A combine record is a permanent snapshot of a contact combine (ADR 0038,
  // #1427). Full-timers read it; only the server writes it (Admin SDK bypasses
  // rules), so a browser write is always denied.
  describe('Combine records (ADR 0038, #1427)', () => {
    const seed = async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const fs = context.firestore();
        await setDoc(doc(fs, 'users', 'admin1'), { role: 'admin', approved: true });
        await setDoc(doc(fs, 'users', 'manager1'), { role: 'manager', approved: true });
        await setDoc(doc(fs, 'combineRecords/r1'), { kind: 'contacts', status: 'done', keptId: 'a', combinedInId: 'b' });
      });
    };

    it('lets a Full-timer read a combine record', async () => {
      await seed();
      const admin = getFirestore({ uid: 'admin1' });
      const snap = await assertSucceeds(getDoc(doc(admin, 'combineRecords/r1')));
      expect(snap.data()?.keptId).toBe('a');
      await assertSucceeds(getDocs(collection(admin, 'combineRecords')));
    });

    it('denies a Trainee reading a combine record', async () => {
      await seed();
      const trainee = getFirestore({ uid: 'manager1' });
      await assertFails(getDoc(doc(trainee, 'combineRecords/r1')));
      await assertFails(getDocs(collection(trainee, 'combineRecords')));
    });

    it('is never writable from a browser, even by a Full-timer', async () => {
      await seed();
      const admin = getFirestore({ uid: 'admin1' });
      await assertFails(setDoc(doc(admin, 'combineRecords/r2'), { kind: 'contacts' }));
      await assertFails(updateDoc(doc(admin, 'combineRecords/r1'), { status: 'undone' }));
      await assertFails(deleteDoc(doc(admin, 'combineRecords/r1')));
    });

    it('applies the same gate to a tags combine record (#1435)', async () => {
      await seed();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'combineRecords/t1'), {
          kind: 'tags',
          status: 'done',
          combines: [],
        });
      });
      const admin = getFirestore({ uid: 'admin1' });
      await assertSucceeds(getDoc(doc(admin, 'combineRecords/t1')));
      await assertFails(setDoc(doc(admin, 'combineRecords/t2'), { kind: 'tags' }));
      await assertFails(updateDoc(doc(admin, 'combineRecords/t1'), { status: 'undone' }));
    });
  });

  // A Not the same person mark (ADR 0038, #1432) is a Full-timer's remembered
  // judgement that a detected pair is two different people. Full-timers create
  // and delete marks from the browser; Trainees can neither read nor write them.
  describe('Not the same person marks (ADR 0038, #1432)', () => {
    const mark = { contactIds: ['a', 'b'], markedBy: 'admin1', markedByName: 'Faith' };

    const seed = async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const fs = context.firestore();
        await setDoc(doc(fs, 'users', 'admin1'), { role: 'admin', approved: true });
        await setDoc(doc(fs, 'users', 'manager1'), { role: 'manager', approved: true });
        await setDoc(doc(fs, 'notSamePersonMarks/a|b'), mark);
      });
    };

    it('lets a Full-timer read, create and delete a mark', async () => {
      await seed();
      const admin = getFirestore({ uid: 'admin1' });
      const snap = await assertSucceeds(getDoc(doc(admin, 'notSamePersonMarks/a|b')));
      expect(snap.data()?.markedByName).toBe('Faith');
      await assertSucceeds(getDocs(collection(admin, 'notSamePersonMarks')));
      await assertSucceeds(setDoc(doc(admin, 'notSamePersonMarks/c|d'), mark));
      await assertSucceeds(deleteDoc(doc(admin, 'notSamePersonMarks/a|b')));
    });

    it('denies a Trainee reading, creating or deleting a mark', async () => {
      await seed();
      const trainee = getFirestore({ uid: 'manager1' });
      await assertFails(getDoc(doc(trainee, 'notSamePersonMarks/a|b')));
      await assertFails(getDocs(collection(trainee, 'notSamePersonMarks')));
      await assertFails(setDoc(doc(trainee, 'notSamePersonMarks/c|d'), mark));
      await assertFails(deleteDoc(doc(trainee, 'notSamePersonMarks/a|b')));
    });
  });

  // A contact's interactions and comments are part of its detail page, so they
  // are visible exactly when the contact is: a Trainee reads them only for
  // people in their `visibleTo`. A collection-group list cannot pin a parent,
  // so it stays with the roles that see every person.
  describe('Interactions and comments follow their contact\'s visibility', () => {
    const seedSubcollections = async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const fs = context.firestore();
        await setDoc(doc(fs, 'users', 'admin1'), { role: 'admin', approved: true });
        await setDoc(doc(fs, 'users', 'manager1'), { role: 'manager', approved: true });
        await setDoc(doc(fs, 'contacts/tied'), { name: 'Tied', email: 't@example.com', visibleTo: ['manager1'] });
        await setDoc(doc(fs, 'contacts/untied'), { name: 'Untied', email: 'u@example.com', visibleTo: [] });
        for (const contactId of ['tied', 'untied']) {
          await setDoc(doc(fs, `contacts/${contactId}/interactions/i1`), {
            userId: 'admin1', userName: 'Admin', content: 'Coffee', dateTime: '2026-01-01', createdAt: '2026-01-01',
          });
          await setDoc(doc(fs, `contacts/${contactId}/comments/c1`), {
            userId: 'admin1', userName: 'Admin', text: 'Note', createdAt: '2026-01-01', parentId: null,
          });
        }
      });
    };
    // The client query shapes: the last-touch feeds, and one person's list.
    const feed = (db: ReturnType<typeof getFirestore>, sub: string) =>
      query(collectionGroup(db, sub), orderBy('createdAt', 'desc'), limit(500));
    const forContact = (db: ReturnType<typeof getFirestore>, contactId: string, sub: string) =>
      query(collection(db, 'contacts', contactId, sub), orderBy('createdAt', 'desc'), limit(50));

    for (const sub of ['interactions', 'comments']) {
      const one = sub === 'interactions' ? 'i1' : 'c1';

      it(`lets a Trainee read ${sub} only of a person they can see`, async () => {
        await seedSubcollections();
        const trainee = getFirestore({ uid: 'manager1' });
        await assertSucceeds(getDoc(doc(trainee, `contacts/tied/${sub}/${one}`)));
        await assertSucceeds(getDocs(forContact(trainee, 'tied', sub)));
        await assertFails(getDoc(doc(trainee, `contacts/untied/${sub}/${one}`)));
        await assertFails(getDocs(forContact(trainee, 'untied', sub)));
      });

      it(`denies a Trainee the ${sub} collection-group feed`, async () => {
        await seedSubcollections();
        await assertFails(getDocs(feed(getFirestore({ uid: 'manager1' }), sub)));
      });

      it(`keeps every person's ${sub} readable for a Full-timer, who sees every person`, async () => {
        await seedSubcollections();
        for (const uid of ['admin1']) {
          const db = getFirestore({ uid });
          const all = await assertSucceeds(getDocs(feed(db, sub)));
          expect(all.docs.map((d) => d.ref.path).sort()).toEqual([`contacts/tied/${sub}/${one}`, `contacts/untied/${sub}/${one}`]);
          await assertSucceeds(getDoc(doc(db, `contacts/untied/${sub}/${one}`)));
          await assertSucceeds(getDocs(forContact(db, 'untied', sub)));
        }
      });
    }

    // #1411: the phone People page's last-touch feed is this exact fan-out for
    // a Trainee — their visible contacts, then each person's newest
    // interactions and comments. It must never issue the collection-group feed.
    it('lets a Trainee\'s tied touches fan-out through, and refuses the untied person (#1411)', async () => {
      await seedSubcollections();
      const trainee = getFirestore({ uid: 'manager1' });

      // The fan-out's first hop: only the contacts the Trainee can see.
      const visible = await assertSucceeds(
        getDocs(query(collection(trainee, 'contacts'), where('visibleTo', 'array-contains', 'manager1'))),
      );
      expect(visible.docs.map((d) => d.id)).toEqual(['tied']);

      // The per-person reads the fan-out fans into, for both touch kinds.
      const readPaths: string[] = [];
      for (const sub of ['interactions', 'comments']) {
        const one = sub === 'interactions' ? 'i1' : 'c1';
        const mine = await assertSucceeds(getDocs(forContact(trainee, 'tied', sub)));
        expect(mine.docs.map((d) => d.ref.path)).toEqual([`contacts/tied/${sub}/${one}`]);
        readPaths.push(`contacts/tied/${sub}/${one}`);
        // Negative check: the untied person's touches never reach the feed.
        await assertFails(getDocs(forContact(trainee, 'untied', sub)));
      }
      expect(readPaths).toEqual(['contacts/tied/interactions/i1', 'contacts/tied/comments/c1']);

      // The unscoped collection-group feeds stay denied for a Trainee.
      for (const sub of ['interactions', 'comments']) {
        await assertFails(getDocs(feed(trainee, sub)));
      }
    });
  });

  // Threads are part of a contact's detail page too. The nested rule already
  // checks the parent contact; the collection-group list could not, so it let
  // a Trainee list every person's thread messages.
  describe('Threads follow their contact\'s visibility', () => {
    const seedThreads = async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const fs = context.firestore();
        await setDoc(doc(fs, 'users', 'admin1'), { role: 'admin', approved: true });
        await setDoc(doc(fs, 'users', 'manager1'), { role: 'manager', approved: true });
        await setDoc(doc(fs, 'contacts/tied'), { name: 'Tied', email: 't@example.com', visibleTo: ['manager1'] });
        await setDoc(doc(fs, 'contacts/untied'), { name: 'Untied', email: 'u@example.com', visibleTo: [] });
        for (const contactId of ['tied', 'untied']) {
          await setDoc(doc(fs, `contacts/${contactId}/threads/t1`), {
            from: 'admin1', fromName: 'Admin', kind: 'comment', body: 'Walking with you',
            at: '2026-01-01T00:00:00.000Z', interactionId: null, scope: null,
          });
        }
      });
    };
    const feed = (db: ReturnType<typeof getFirestore>) =>
      query(collectionGroup(db, 'threads'), where('scope', '==', null));
    const forContact = (db: ReturnType<typeof getFirestore>, contactId: string) =>
      query(collection(db, 'contacts', contactId, 'threads'), where('scope', '==', null));

    it('lets a Trainee read threads only of a person they can see', async () => {
      await seedThreads();
      const trainee = getFirestore({ uid: 'manager1' });
      await assertSucceeds(getDoc(doc(trainee, 'contacts/tied/threads/t1')));
      await assertSucceeds(getDocs(forContact(trainee, 'tied')));
      await assertFails(getDoc(doc(trainee, 'contacts/untied/threads/t1')));
      await assertFails(getDocs(forContact(trainee, 'untied')));
    });

    it('denies a Trainee the threads collection-group feed', async () => {
      await seedThreads();
      await assertFails(getDocs(feed(getFirestore({ uid: 'manager1' }))));
    });

    it('keeps every person\'s threads listable for a Full-timer, who sees every person', async () => {
      await seedThreads();
      for (const uid of ['admin1']) {
        const all = await assertSucceeds(getDocs(feed(getFirestore({ uid }))));
        expect(all.docs.map((d) => d.ref.path).sort()).toEqual(['contacts/tied/threads/t1', 'contacts/untied/threads/t1']);
      }
    });
  });

  // #1350 follow-up: writing on a person's page asks the same question as
  // reading it. A Trainee who is not tied to someone cannot log an interaction,
  // comment, or post in their Conversation, nor edit or close what is there.
  describe('Writes under a contact follow the contact\'s visibility (#1350)', () => {
    const seed = async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const fs = context.firestore();
        await setDoc(doc(fs, 'users', 'admin1'), { role: 'admin', approved: true });
        await setDoc(doc(fs, 'users', 'manager1'), { role: 'manager', approved: true });
        await setDoc(doc(fs, 'users', 'manager2'), { role: 'manager', approved: true });
        await setDoc(doc(fs, 'contacts/tied'), { name: 'Tied', email: 't@example.com', visibleTo: ['manager1'] });
        await setDoc(doc(fs, 'contacts/untied'), { name: 'Untied', email: 'u@example.com', visibleTo: ['manager2'] });
        await setDoc(doc(fs, 'contacts/unlisted'), { name: 'Unlisted', email: 'n@example.com' });
        // What manager1 wrote on each person while tied — on `untied` the tie
        // has since gone.
        for (const contactId of ['tied', 'untied']) {
          await setDoc(doc(fs, `contacts/${contactId}/interactions/mine`), {
            userId: 'manager1', userName: 'M1', content: 'Coffee', dateTime: '2026-10-01', createdAt: '2026-10-01',
          });
          await setDoc(doc(fs, `contacts/${contactId}/comments/mine`), {
            userId: 'manager1', userName: 'M1', text: 'Note', createdAt: '2026-10-01', parentId: null,
          });
          await setDoc(doc(fs, `contacts/${contactId}/threads/mine`), message('manager1'));
          await setDoc(doc(fs, `contacts/${contactId}/threads/ask`), message('manager2', { kind: 'nudge' }));
          // What a Full-timer, who sees everyone, wrote on each person.
          await setDoc(doc(fs, `contacts/${contactId}/interactions/theirs`), {
            userId: 'admin1', userName: 'A1', content: 'Coffee', dateTime: '2026-10-01', createdAt: '2026-10-01',
          });
          await setDoc(doc(fs, `contacts/${contactId}/comments/theirs`), {
            userId: 'admin1', userName: 'A1', text: 'Note', createdAt: '2026-10-01', parentId: null,
          });
          await setDoc(doc(fs, `contacts/${contactId}/threads/theirs`), message('admin1'));
        }
        await setDoc(doc(fs, 'contacts/untied/teamThreads/team'), message('admin1', { scope: 'team' }));
        // Left behind under a person who has since been deleted.
        await setDoc(doc(fs, 'contacts/nobody/interactions/orphan'), {
          userId: 'manager1', userName: 'M1', content: 'Coffee', dateTime: '2026-10-01', createdAt: '2026-10-01',
        });
      });
    };
    const message = (from: string, over: Record<string, unknown> = {}) => ({
      from, fromName: from, kind: 'comment', body: 'Walking with you',
      at: '2026-10-01T00:00:00.000Z', interactionId: null, scope: null, ...over,
    });
    const interaction = (uid: string, over: Record<string, unknown> = {}) => ({
      userId: uid, userName: uid, content: 'Coffee', dateTime: '2026-10-05', type: 'meeting',
      createdAt: serverTimestamp(), ...over,
    });
    const comment = (uid: string) => ({ userId: uid, userName: uid, text: 'Note', createdAt: serverTimestamp(), parentId: null });
    const closed = (uid: string) => ({ closedBy: uid, closedByName: uid, closedAt: '2026-10-05T00:00:00.000Z' });

    it('refuses an untied Trainee logging an interaction, commenting or posting a message', async () => {
      await seed();
      const trainee = getFirestore({ uid: 'manager1' });
      await assertFails(setDoc(doc(trainee, 'contacts/untied/interactions/new'), interaction('manager1')));
      await assertFails(setDoc(doc(trainee, 'contacts/untied/comments/new'), comment('manager1')));
      await assertFails(setDoc(doc(trainee, 'contacts/untied/threads/new'), message('manager1')));
    });

    it('refuses a Trainee writing under a person missing from every access list', async () => {
      await seed();
      const trainee = getFirestore({ uid: 'manager1' });
      await assertFails(setDoc(doc(trainee, 'contacts/unlisted/interactions/new'), interaction('manager1')));
      await assertFails(setDoc(doc(trainee, 'contacts/nobody/interactions/new'), interaction('manager1')));
    });

    it('refuses a Trainee editing what they wrote on a person they no longer see', async () => {
      await seed();
      const trainee = getFirestore({ uid: 'manager1' });
      await assertFails(updateDoc(doc(trainee, 'contacts/untied/interactions/mine'), { content: 'Edited' }));
      await assertFails(updateDoc(doc(trainee, 'contacts/untied/comments/mine'), { text: 'Edited' }));
      await assertFails(updateDoc(doc(trainee, 'contacts/untied/threads/mine'), {
        body: 'Edited', editedAt: '2026-10-05T00:00:00.000Z',
      }));
    });

    it('refuses an untied Trainee closing a follow-up ask', async () => {
      await seed();
      await assertFails(updateDoc(doc(getFirestore({ uid: 'manager1' }), 'contacts/untied/threads/ask'), closed('manager1')));
    });

    it('refuses an untied Trainee posting to Full-timers', async () => {
      await seed();
      await assertFails(setDoc(doc(getFirestore({ uid: 'manager1' }), 'contacts/untied/teamThreads/new'),
        message('manager1', { scope: 'team' })));
    });

    it('lets a tied Trainee log, comment, post, edit their own and close an ask', async () => {
      await seed();
      const trainee = getFirestore({ uid: 'manager1' });
      await assertSucceeds(setDoc(doc(trainee, 'contacts/tied/interactions/new'), interaction('manager1')));
      await assertSucceeds(setDoc(doc(trainee, 'contacts/tied/comments/new'), comment('manager1')));
      await assertSucceeds(setDoc(doc(trainee, 'contacts/tied/threads/new'), message('manager1')));
      await assertSucceeds(updateDoc(doc(trainee, 'contacts/tied/interactions/mine'), { content: 'Edited' }));
      await assertSucceeds(updateDoc(doc(trainee, 'contacts/tied/comments/mine'), { text: 'Edited' }));
      await assertSucceeds(updateDoc(doc(trainee, 'contacts/tied/threads/mine'), {
        body: 'Edited', editedAt: '2026-10-05T00:00:00.000Z',
      }));
      await assertSucceeds(updateDoc(doc(trainee, 'contacts/tied/threads/ask'), closed('manager1')));
    });

    it('lets a Full-timer log on behalf of a Trainee on a person they are not listed on', async () => {
      await seed();
      const fullTimer = getFirestore({ uid: 'admin1' });
      await assertSucceeds(setDoc(doc(fullTimer, 'contacts/untied/interactions/onbehalf'),
        interaction('admin1', { reachedById: 'manager2', reachedByName: 'M2' })));
      await assertSucceeds(setDoc(doc(fullTimer, 'contacts/unlisted/interactions/onbehalf'),
        interaction('admin1', { reachedById: 'manager2', reachedByName: 'M2' })));
      await assertSucceeds(updateDoc(doc(fullTimer, 'contacts/untied/interactions/mine'), { content: 'Corrected' }));
      await assertSucceeds(setDoc(doc(fullTimer, 'contacts/untied/teamThreads/new'), message('admin1', { scope: 'team' })));
    });

    it('refuses an untied Trainee removing someone else\'s interaction or comment', async () => {
      await seed();
      const trainee = getFirestore({ uid: 'manager1' });
      await assertFails(deleteDoc(doc(trainee, 'contacts/untied/interactions/theirs')));
      await assertFails(deleteDoc(doc(trainee, 'contacts/untied/comments/theirs')));
    });

    it('refuses a Trainee removing what they wrote on a person they no longer see', async () => {
      await seed();
      const trainee = getFirestore({ uid: 'manager1' });
      await assertFails(deleteDoc(doc(trainee, 'contacts/untied/interactions/mine')));
      await assertFails(deleteDoc(doc(trainee, 'contacts/untied/comments/mine')));
      await assertFails(deleteDoc(doc(trainee, 'contacts/untied/threads/mine')));
      await assertFails(deleteDoc(doc(trainee, 'contacts/nobody/interactions/orphan')));
    });

    it('refuses an untied Trainee removing a Full-timers message', async () => {
      await seed();
      await assertFails(deleteDoc(doc(getFirestore({ uid: 'manager1' }), 'contacts/untied/teamThreads/team')));
    });

    it('lets a tied Trainee remove their own entries and someone else\'s interaction or comment', async () => {
      await seed();
      const trainee = getFirestore({ uid: 'manager1' });
      await assertSucceeds(deleteDoc(doc(trainee, 'contacts/tied/interactions/mine')));
      await assertSucceeds(deleteDoc(doc(trainee, 'contacts/tied/comments/mine')));
      await assertSucceeds(deleteDoc(doc(trainee, 'contacts/tied/threads/mine')));
      await assertSucceeds(deleteDoc(doc(trainee, 'contacts/tied/interactions/theirs')));
      await assertSucceeds(deleteDoc(doc(trainee, 'contacts/tied/comments/theirs')));
    });

    it('lets a Full-timer remove anything on a person they are not listed on', async () => {
      await seed();
      const fullTimer = getFirestore({ uid: 'admin1' });
      await assertSucceeds(deleteDoc(doc(fullTimer, 'contacts/untied/interactions/theirs')));
      await assertSucceeds(deleteDoc(doc(fullTimer, 'contacts/untied/comments/theirs')));
      await assertSucceeds(deleteDoc(doc(fullTimer, 'contacts/untied/threads/theirs')));
      await assertSucceeds(deleteDoc(doc(fullTimer, 'contacts/untied/teamThreads/team')));
      await assertSucceeds(deleteDoc(doc(fullTimer, 'contacts/nobody/interactions/orphan')));
    });
  });

  // #1350 follow-up: deleting a person asks the same question as seeing them.
  // A Trainee may delete only someone they are tied to; a Full-timer anyone.
  describe('Deleting a contact follows the contact\'s visibility (#1350)', () => {
    const seed = async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const fs = context.firestore();
        await setDoc(doc(fs, 'users', 'admin1'), { role: 'admin', approved: true });
        await setDoc(doc(fs, 'users', 'manager1'), { role: 'manager', approved: true });
        await setDoc(doc(fs, 'users', 'manager2'), { role: 'manager', approved: true });
        await setDoc(doc(fs, 'users', 'operator1'), { role: 'operator', approved: true });
        await setDoc(doc(fs, 'contacts/tied'), { name: 'Tied', email: 't@example.com', visibleTo: ['manager1'] });
        await setDoc(doc(fs, 'contacts/untied'), { name: 'Untied', email: 'u@example.com', visibleTo: ['manager2'] });
        await setDoc(doc(fs, 'contacts/unlisted'), { name: 'Unlisted', email: 'n@example.com' });
      });
    };

    it('refuses an untied Trainee deleting a person', async () => {
      await seed();
      await assertFails(deleteDoc(doc(getFirestore({ uid: 'manager1' }), 'contacts/untied')));
    });

    it('refuses a Trainee deleting a person missing from every access list', async () => {
      await seed();
      await assertFails(deleteDoc(doc(getFirestore({ uid: 'manager1' }), 'contacts/unlisted')));
    });

    it('lets a tied Trainee delete a person', async () => {
      await seed();
      await assertSucceeds(deleteDoc(doc(getFirestore({ uid: 'manager1' }), 'contacts/tied')));
    });

    it('lets a Full-timer delete a person they are not listed on', async () => {
      await seed();
      const fullTimer = getFirestore({ uid: 'admin1' });
      await assertSucceeds(deleteDoc(doc(fullTimer, 'contacts/untied')));
      await assertSucceeds(deleteDoc(doc(fullTimer, 'contacts/unlisted')));
    });

    it('still refuses a Student, who sees everyone but is not a manager', async () => {
      await seed();
      await assertFails(deleteDoc(doc(getFirestore({ uid: 'operator1' }), 'contacts/untied')));
    });
  });

  // The founders list is written once at creation (#1049) and backfilled for
  // older contacts (#1050). It is immutable: any update that touches it is a
  // ghost field for everyone except a Full-timer's genuine-mistake correction,
  // which must rewrite `visibleTo` in lockstep so the founding set and the
  // access it grants never drift (#1055).
  describe('Founders are immutable except a Full-timer (#1055)', () => {
    const seed = async (contactId: string, contact: Record<string, unknown>) => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const fs = context.firestore();
        await setDoc(doc(fs, 'users', 'admin1'), { role: 'admin', approved: true });
        await setDoc(doc(fs, 'users', 'manager1'), { role: 'manager', approved: true });
        await setDoc(doc(fs, 'users', 'manager2'), { role: 'manager', approved: true });
        await setDoc(doc(fs, 'contacts', contactId), {
          name: 'Test', email: 'test@example.com', ...contact,
        });
      });
    };

    it('lets a Trainee read a contact they founded, and refuses an untied person', async () => {
      await seed('c_founded', { createdBy: 'admin1', founders: ['manager1'], visibleTo: ['admin1', 'manager1'] });
      await seed('c_untied_founder', { createdBy: 'admin1', founders: ['manager1'], visibleTo: ['admin1'] });
      const trainee = getFirestore({ uid: 'manager1' });
      // A founder is mirrored into `visibleTo`, so the denormalised list lets
      // them read even though a Trainee is otherwise scoped to the list.
      await assertSucceeds(getDoc(doc(trainee, 'contacts/c_founded')));
      // A Trainee who is in `founders` but not in `visibleTo` still fails
      // closed — the list, not the list-writer, is the source of truth.
      await assertFails(getDoc(doc(trainee, 'contacts/c_untied_founder')));
    });

    it('rejects a non-Full-timer who adds, changes or removes a founder', async () => {
      await seed('c_immutable', {
        createdBy: 'admin1', founders: ['admin1'], coCreators: ['manager1'],
        visibleTo: ['admin1', 'manager1'],
      });
      const coCreator = getFirestore({ uid: 'manager1' });
      // A co-creator may not add someone to the founders set.
      await assertFails(updateDoc(doc(coCreator, 'contacts/c_immutable'), {
        founders: arrayUnion('manager2'),
        visibleTo: ['admin1', 'manager1', 'manager2'],
        updatedAt: serverTimestamp(),
      }));
      // A co-creator may not remove someone from the founders set.
      await assertFails(updateDoc(doc(coCreator, 'contacts/c_immutable'), {
        founders: arrayRemove('admin1'),
        visibleTo: ['manager1'],
        updatedAt: serverTimestamp(),
      }));
    });

    it('lets a Full-timer correct the founders list, rewriting visibleTo in lockstep', async () => {
      await seed('c_correct', {
        createdBy: 'admin1', founders: ['admin1', 'manager1'],
        visibleTo: ['admin1', 'manager1'],
      });
      const admin = getFirestore({ uid: 'admin1' });
      await assertSucceeds(updateDoc(doc(admin, 'contacts/c_correct'), {
        founders: arrayRemove('manager1'),
        visibleTo: ['admin1'],
        updatedAt: serverTimestamp(),
        updatedBy: 'admin1',
        updatedByName: 'Admin One',
      }));
    });

    it('lets a Full-timer reassign createdBy and createdByName (#1103), rewriting visibleTo in lockstep', async () => {
      await seed('c_reassign', {
        createdBy: 'groupme-12345', createdByName: 'Sam (GroupMe)',
        visibleTo: ['admin1'],
      });
      const admin = getFirestore({ uid: 'admin1' });
      const trainee = getFirestore({ uid: 'manager1' });

      // Trainee cannot reassign creator
      await assertFails(updateDoc(doc(trainee, 'contacts/c_reassign'), {
        createdBy: 'manager1',
        createdByName: 'Trainee One',
        visibleTo: ['admin1', 'manager1'],
        updatedAt: serverTimestamp(),
        updatedBy: 'manager1',
        updatedByName: 'Trainee One',
      }));

      // Admin can reassign creator and update visibleTo in lockstep
      await assertSucceeds(updateDoc(doc(admin, 'contacts/c_reassign'), {
        createdBy: 'manager1',
        createdByName: 'Trainee One',
        visibleTo: ['manager1'],
        updatedAt: serverTimestamp(),
        updatedBy: 'admin1',
        updatedByName: 'Admin One',
      }));
    });

    it('rejects the removed caregiver field on a contact as a ghost field (#1055)', async () => {
      await seed('c_no_caregiver', {
        createdBy: 'admin1', founders: ['admin1'], visibleTo: ['admin1'],
      });
      const admin = getFirestore({ uid: 'admin1' });
      await assertFails(updateDoc(doc(admin, 'contacts/c_no_caregiver'), {
        caregiver: 'manager1',
        visibleTo: ['admin1'],
        updatedAt: serverTimestamp(),
      }));
    });
  });

  describe('Prayers', () => {
    it('lets a teammate store up to 4 answeredPhotos on an answered prayer', async () => {
      const db = getFirestore({ uid: 'teammate1' });
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'teammate1'), { role: 'manager', approved: true });
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

    it('lets a teammate edit a prayer burden, and denies an unapproved account (#1674)', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'teammate1'), { role: 'manager', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'pending1'), { role: 'manager', approved: false });
        await setDoc(doc(context.firestore(), 'prayers', 'prayer-edit'), {
          contactId: 'contact1',
          burden: 'For her interview',
          status: 'pending',
          updatedAt: '2026-10-16T00:00:00.000Z',
        });
      });
      const edit = {
        burden: 'For her interview on Tuesday\n\nShe is nervous.',
        updatedAt: '2026-10-19T00:00:00.000Z',
        updatedBy: 'teammate1',
        updatedByName: 'Op',
      };
      await assertSucceeds(updateDoc(doc(getFirestore({ uid: 'teammate1' }), 'prayers', 'prayer-edit'), edit));
      await assertFails(updateDoc(doc(getFirestore({ uid: 'pending1' }), 'prayers', 'prayer-edit'), edit));
    });

    it('lets a teammate toggle teamPrayer, rejects a non-boolean, and denies an unapproved account', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'teammate1'), { role: 'manager', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'pending1'), { role: 'manager', approved: false });
        await setDoc(doc(context.firestore(), 'prayers', 'prayer-team'), {
          contactId: 'contact1',
          burden: 'Peace',
          status: 'pending',
          teamPrayer: false,
          updatedAt: '2026-10-16T00:00:00.000Z',
        });
      });
      const flip = (teamPrayer: unknown) => ({ teamPrayer, updatedAt: '2026-10-19T00:00:00.000Z' });
      const ref = (uid: string) => doc(getFirestore({ uid }), 'prayers', 'prayer-team');
      await assertSucceeds(updateDoc(ref('teammate1'), flip(true)));
      await assertSucceeds(updateDoc(ref('teammate1'), flip(false)));
      await assertFails(updateDoc(ref('teammate1'), flip('yes')));
      await assertFails(updateDoc(ref('pending1'), flip(true)));
    });

    // "Bring to team prayer" is one batch: the prayer flag plus clearing the
    // contact's team-wide removal, stamped with ISO strings (setPrayerTeamPrayer).
    it('lets a teammate bring a prayer to the team and clear the contact removal in one batch; denies an unapproved account', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const fs = context.firestore();
        await setDoc(doc(fs, 'users', 'teammate1'), { role: 'manager', approved: true });
        await setDoc(doc(fs, 'users', 'pending1'), { role: 'manager', approved: false });
        await setDoc(doc(fs, 'contacts', 'contact-batch'), {
          name: 'Test',
          email: 'test@example.com',
          visibleTo: ['teammate1'],
          prayerListRemoved: { at: '2026-10-01T00:00:00.000Z', by: 'teammate2', byName: 'Teammate Two' },
        });
        await setDoc(doc(fs, 'prayers', 'prayer-batch'), {
          contactId: 'contact-batch', burden: 'Peace', status: 'pending', teamPrayer: false,
          updatedAt: '2026-10-16T00:00:00.000Z',
        });
      });
      const run = (uid: string) => {
        const fs = getFirestore({ uid });
        const stamp = { updatedAt: '2026-10-19T00:00:00.000Z', updatedBy: uid, updatedByName: 'X' };
        const batch = writeBatch(fs);
        batch.update(doc(fs, 'prayers', 'prayer-batch'), { teamPrayer: true, ...stamp });
        batch.update(doc(fs, 'contacts', 'contact-batch'), { prayerListRemoved: deleteField(), ...stamp });
        return batch.commit();
      };
      await assertFails(run('pending1'));
      await assertSucceeds(run('teammate1'));
    });

    it('rejects a prayer with more than 4 answeredPhotos', async () => {
      const db = getFirestore({ uid: 'teammate1' });
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'teammate1'), { role: 'manager', approved: true });
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

    it('lets a Full-timer create the interaction shape LogInteractionModal writes', async () => {
      const db = getFirestore({ uid: 'teammate1' });

      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'teammate1'), { role: 'admin', approved: true });
        await setDoc(doc(context.firestore(), 'contacts', 'contact1'), { name: 'Test', email: 'test@example.com' });
      });

      await assertSucceeds(setDoc(doc(db, 'contacts/contact1/interactions/int2'), {
        type: 'meeting',
        dateTime: '2026-08-08',
        content: 'Coffee after class',
        createdAt: serverTimestamp(),
        userId: 'teammate1',
        userName: 'Teammate One',
        contactId: 'contact1',
        contactName: 'Test',
      }));
    });

    it('lets a Trainee log an interaction reached by themselves (#1288)', async () => {
      const db = getFirestore({ uid: 'manager1' });

      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'manager1'), { role: 'manager', approved: true });
        await setDoc(doc(context.firestore(), 'contacts', 'contact1'), { name: 'Test', email: 'test@example.com', visibleTo: ['manager1'] });
      });

      await assertSucceeds(setDoc(doc(db, 'contacts/contact1/interactions/int-self'), {
        userId: 'manager1',
        userName: 'Trainee One',
        reachedById: 'manager1',
        reachedByName: 'Trainee One',
        content: 'He messaged him',
        dateTime: '2026-08-08',
        createdAt: serverTimestamp(),
      }));
    });

    it('denies a Trainee naming someone else as reached-by (#1288)', async () => {
      const db = getFirestore({ uid: 'manager1' });

      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adb = context.firestore();
        await setDoc(doc(adb, 'users', 'manager1'), { role: 'manager', approved: true });
        await setDoc(doc(adb, 'users', 'manager2'), { role: 'manager', approved: true });
        await setDoc(doc(adb, 'contacts', 'contact1'), { name: 'Test', email: 'test@example.com', visibleTo: ['manager1'] });
      });

      await assertFails(setDoc(doc(db, 'contacts/contact1/interactions/int-other'), {
        userId: 'manager1',
        userName: 'Trainee One',
        reachedById: 'manager2',
        reachedByName: 'Trainee Two',
        content: 'He messaged him',
        dateTime: '2026-08-08',
        createdAt: serverTimestamp(),
      }));
    });

    it('lets a Full-timer log an interaction on a teammate\u2019s behalf (#1288)', async () => {
      const db = getFirestore({ uid: 'admin1' });

      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adb = context.firestore();
        await setDoc(doc(adb, 'users', 'admin1'), { role: 'admin', approved: true });
        await setDoc(doc(adb, 'users', 'manager2'), { role: 'manager', approved: true });
        await setDoc(doc(adb, 'contacts', 'contact1'), { name: 'Test', email: 'test@example.com' });
      });

      await assertSucceeds(setDoc(doc(db, 'contacts/contact1/interactions/int-onbehalf'), {
        userId: 'admin1',
        userName: 'Anna',
        reachedById: 'manager2',
        reachedByName: 'Jae',
        content: 'He messaged him',
        dateTime: '2026-08-08',
        createdAt: serverTimestamp(),
      }));
    });

    it('lets the person who logged an interaction, or a manager, delete it', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adb = context.firestore();
        await setDoc(doc(adb, 'users', 'owner1'), { role: 'manager', approved: true });
        await setDoc(doc(adb, 'users', 'manager1'), { role: 'manager', approved: true });
        // Both are tied: removing on a person needs seeing them (#1350).
        await setDoc(doc(adb, 'contacts', 'contact1'), { name: 'Test', email: 'test@example.com', visibleTo: ['manager1', 'owner1'] });
        await setDoc(doc(adb, 'contacts/contact1/interactions/int-owner'), {
          userId: 'owner1',
          userName: 'Owner',
          content: 'Hello',
          dateTime: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        });
        await setDoc(doc(adb, 'contacts/contact1/interactions/int-other'), {
          userId: 'owner1',
          userName: 'Owner',
          content: 'Hello again',
          dateTime: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        });
      });

      // The person who logged it may remove it…
      await assertSucceeds(deleteDoc(doc(getFirestore({ uid: 'owner1' }), 'contacts/contact1/interactions/int-owner')));
      // …and so may a Trainee/Full-timer, even for someone else's entry.
      await assertSucceeds(deleteDoc(doc(getFirestore({ uid: 'manager1' }), 'contacts/contact1/interactions/int-other')));
    });

    it('denies deleting someone else\u2019s interaction to operators and viewers', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adb = context.firestore();
        await setDoc(doc(adb, 'users', 'owner1'), { role: 'operator', approved: true });
        await setDoc(doc(adb, 'users', 'operator2'), { role: 'operator', approved: true });
        await setDoc(doc(adb, 'users', 'viewer1'), { role: 'viewer', approved: true });
        await setDoc(doc(adb, 'contacts', 'contact1'), { name: 'Test', email: 'test@example.com' });
        await setDoc(doc(adb, 'contacts/contact1/interactions/int1'), {
          userId: 'owner1',
          userName: 'Owner',
          content: 'Hello',
          dateTime: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        });
      });

      await assertFails(deleteDoc(doc(getFirestore({ uid: 'operator2' }), 'contacts/contact1/interactions/int1')));
      await assertFails(deleteDoc(doc(getFirestore({ uid: 'viewer1' }), 'contacts/contact1/interactions/int1')));
    });

    it('denies unauthenticated deletion of interactions', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adb = context.firestore();
        await setDoc(doc(adb, 'contacts', 'contact1'), { name: 'Test', email: 'test@example.com' });
        await setDoc(doc(adb, 'contacts/contact1/interactions/int1'), {
          userId: 'owner1',
          userName: 'Owner',
          content: 'Hello',
          dateTime: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        });
      });

      await assertFails(deleteDoc(doc(getFirestore(), 'contacts/contact1/interactions/int1')));
    });

    it('rejects an interaction update containing updatedAt, accepts permitted fields', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adb = context.firestore();
        await setDoc(doc(adb, 'users', 'teammate1'), { role: 'admin', approved: true });
        await setDoc(doc(adb, 'contacts', 'contact1'), { name: 'Test', email: 'test@example.com' });
        await setDoc(doc(adb, 'contacts/contact1/interactions/int1'), {
          userId: 'teammate1',
          userName: 'Teammate One',
          content: 'Original content',
          dateTime: '2026-08-08',
          type: 'meeting',
          createdAt: '2026-08-08T00:00:00.000Z',
        });
      });

      const db = getFirestore({ uid: 'teammate1' });
      const ref = doc(db, 'contacts/contact1/interactions/int1');

      // Fails when attempting to update with updatedAt (server timestamp or string)
      await assertFails(updateDoc(ref, {
        content: 'New content',
        updatedAt: serverTimestamp(),
      }));

      // Succeeds when updating only permitted fields (content, dateTime, type)
      await assertSucceeds(updateDoc(ref, {
        content: 'New content',
        dateTime: '2026-08-09',
        type: 'call',
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
      // member pickers query the users collection as a plain approved user. The protections that remain are that
      // unapproved users can't scrape PII, and a Trainee can't escalate another
      // member's profile to Full-timer.
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'trainee1'), { role: 'manager', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'pending1'), { role: 'manager', approved: false });
        await setDoc(doc(context.firestore(), 'users', 'other-user'), {
          email: 'other@example.com',
          displayName: 'Other Member',
          role: 'manager',
          approved: true,
        });
      });

      const trainee = getFirestore({ uid: 'trainee1' });
      // An approved Trainee may look up another member (needed by messaging)…
      await assertSucceeds(getDoc(doc(trainee, 'users', 'other-user')));
      // …but cannot escalate that member's profile.
      await assertFails(updateDoc(doc(trainee, 'users', 'other-user'), { role: 'admin' }));

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
      assigneeId: 'manager1',
      createdById: 'admin1',
      createdByName: 'Tony',
      sourceDocId: 'bd-wed',
      sourceDocTitle: "Wednesday Women's Group",
    };

    const seedRoles = async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'admin1'), { role: 'admin', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'manager1'), { role: 'manager', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'pending1'), { role: 'manager', approved: false });
      });
    };

    it('TD1: A Trainee can create a to-do with creator + source-doc fields', async () => {
      await seedRoles();
      const db = getFirestore({ uid: 'manager1' });
      await assertSucceeds(setDoc(doc(db, 'tasks', 'td1'), validTask));
    });

    it('TD2: Accepts a to-do with no due date (null)', async () => {
      await seedRoles();
      const db = getFirestore({ uid: 'admin1' });
      await assertSucceeds(setDoc(doc(db, 'tasks', 'td2'), { ...validTask, dueDate: null }));
    });

    it('TD3: An unapproved account can neither read nor create a to-do', async () => {
      await seedRoles();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'tasks', 'td1'), validTask);
      });
      const db = getFirestore({ uid: 'pending1' });
      await assertFails(getDoc(doc(db, 'tasks', 'td1')));
      await assertFails(setDoc(doc(db, 'tasks', 'tdX'), validTask));
    });

    it('TD4: A Trainee can mark a to-do done and delete it', async () => {
      await seedRoles();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'tasks', 'td1'), validTask);
      });
      const mgrDb = getFirestore({ uid: 'manager1' });
      await assertSucceeds(updateDoc(doc(mgrDb, 'tasks', 'td1'), { status: 'completed' }));
      await assertSucceeds(deleteDoc(doc(mgrDb, 'tasks', 'td1')));
    });

    it('TD5: Rejects an invalid status', async () => {
      await seedRoles();
      const db = getFirestore({ uid: 'admin1' });
      await assertFails(setDoc(doc(db, 'tasks', 'tdBad'), { ...validTask, status: 'archived' }));
    });
  });

  // ── Visits are an interaction type (cut-or-keep §5) ──
  // The Visits page and the Homes it kept are gone, so nothing reads or writes
  // `visits` or `homes`. The documents stay in Firestore, unread: with no match
  // the default rule closes each path to everyone, a Full-timer included. What a
  // Visit is now is an interaction on each person, one per person, sharing a
  // `groupId` when it was logged for several.
  describe('Visits as an interaction type', () => {
    const seed = async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const fs = context.firestore();
        await setDoc(doc(fs, 'users', 'admin1'), { role: 'admin', approved: true });
        await setDoc(doc(fs, 'users', 'manager1'), { role: 'manager', approved: true });
        for (const id of ['ama', 'bo', 'cai']) {
          await setDoc(doc(fs, `contacts/${id}`), { name: id, email: `${id}@example.com`, visibleTo: ['manager1'] });
        }
        await setDoc(doc(fs, 'contacts/dee'), { name: 'Dee', email: 'dee@example.com', visibleTo: ['manager2'] });
        await setDoc(doc(fs, 'visits', 'v1'), { date: '2026-08-13', contactIds: ['ama'], went: ['admin1'] });
        await setDoc(doc(fs, 'homes', 'home1'), { label: 'the Oseis', members: ['ama'], active: true });
      });
    };
    const visit = (uid: string, over: Record<string, unknown> = {}) => ({
      userId: uid, userName: uid, content: 'Dinner at the Oseis', dateTime: '2026-11-17',
      type: 'visit', contactId: 'ama', contactName: 'Ama', createdAt: serverTimestamp(), ...over,
    });

    it('VS1: nobody reads or writes the old visits and homes, a Full-timer included', async () => {
      await seed();
      for (const uid of ['admin1', 'manager1']) {
        const db = getFirestore({ uid });
        await assertFails(getDoc(doc(db, 'visits', 'v1')));
        await assertFails(setDoc(doc(db, 'visits', 'vNew'), { date: '2026-11-17', contactIds: ['ama'], went: [uid] }));
        await assertFails(deleteDoc(doc(db, 'visits', 'v1')));
        await assertFails(getDoc(doc(db, 'homes', 'home1')));
        await assertFails(setDoc(doc(db, 'homes', 'homeNew'), { label: 'x', members: [], active: true }));
        await assertFails(deleteDoc(doc(db, 'homes', 'home1')));
      }
    });

    it('VS2: a Full-timer logs one Visit per person, all sharing a groupId', async () => {
      await seed();
      const db = getFirestore({ uid: 'admin1' });
      for (const id of ['ama', 'bo', 'cai']) {
        await assertSucceeds(
          setDoc(doc(db, `contacts/${id}/interactions/visit-${id}`), visit('admin1', { contactId: id, groupId: 'grp-1' })),
        );
      }
    });

    it('VS3: a tied Trainee can log a Visit for the people they see, not for one they do not', async () => {
      await seed();
      const db = getFirestore({ uid: 'manager1' });
      await assertSucceeds(
        setDoc(doc(db, 'contacts/ama/interactions/v'), visit('manager1', { groupId: 'grp-1' })),
      );
      await assertFails(
        setDoc(doc(db, 'contacts/dee/interactions/v'), visit('manager1', { contactId: 'dee', groupId: 'grp-1' })),
      );
    });

    it('VS4: a groupId is a short string — anything else is refused', async () => {
      await seed();
      const db = getFirestore({ uid: 'admin1' });
      await assertFails(
        setDoc(doc(db, 'contacts/ama/interactions/long'), visit('admin1', { groupId: 'g'.repeat(129) })),
      );
      await assertFails(
        setDoc(doc(db, 'contacts/ama/interactions/num'), visit('admin1', { groupId: 42 })),
      );
      await assertFails(
        setDoc(doc(db, 'contacts/ama/interactions/empty'), visit('admin1', { groupId: '' })),
      );
    });

    it('VS5: a Visit entry can be edited and removed like any other, a groupId left as it was', async () => {
      await seed();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'contacts/ama/interactions/mine'), {
          userId: 'manager1', userName: 'M1', content: 'Dinner', dateTime: '2026-11-17', type: 'visit',
          groupId: 'grp-1', createdAt: '2026-11-17',
        });
      });
      const db = getFirestore({ uid: 'manager1' });
      await assertSucceeds(updateDoc(doc(db, 'contacts/ama/interactions/mine'), { content: 'Dinner, then dessert' }));
      await assertFails(updateDoc(doc(db, 'contacts/ama/interactions/mine'), { groupId: 'grp-2' }));
      await assertSucceeds(deleteDoc(doc(db, 'contacts/ama/interactions/mine')));
    });
  });


  describe('My Day — user preferences, inbox state & personal prayers', () => {
    const seedUsers = async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'u1'), { role: 'admin', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'u2'), { role: 'admin', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'trainee1'), { role: 'manager', approved: true });
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

    it('MP2: Another Full-timer cannot read or write someone’s preferences; the super admin can (Nov 2026)', async () => {
      await seedUsers();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'userPreferences', 'u1'), { personalContactIds: ['c1'] });
      });
      const dbOtherAdmin = getFirestore({ uid: 'u2' });
      await assertFails(getDoc(doc(dbOtherAdmin, 'userPreferences', 'u1')));
      await assertFails(setDoc(doc(dbOtherAdmin, 'userPreferences', 'u1'), { personalContactIds: ['x'] }));
      await assertFails(getDoc(doc(getFirestore({ uid: 'trainee1' }), 'userPreferences', 'u1')));

      // Impersonation reads as the impersonated person, so the super admin keeps access.
      const dbSuper = getFirestore({ uid: 'owner-sa', email: 'yilongwang05@gmail.com', email_verified: true });
      await assertSucceeds(getDoc(doc(dbSuper, 'userPreferences', 'u1')));
      await assertSucceeds(setDoc(doc(dbSuper, 'userPreferences', 'u1'), { personalContactIds: ['x'] }));

      const dbStudent = getFirestore({ uid: 'student1' });
      await assertFails(getDoc(doc(dbStudent, 'userPreferences', 'u1')));
      await assertFails(setDoc(doc(dbStudent, 'userPreferences', 'u1'), { personalContactIds: ['y'] }));
    });

    it('MP3: An unapproved user cannot touch their own preferences', async () => {
      await seedUsers();
      const db = getFirestore({ uid: 'pending1' });
      await assertFails(setDoc(doc(db, 'userPreferences', 'pending1'), { personalContactIds: [] }));
    });

    // To ask (#1649) — a Full-timer's private notepad. Unlike userPreferences
    // above, a Trainee (manager) is NOT allowed to read another's notepad, and
    // neither is another Full-timer: it is readable and writable only by its
    // owning Full-timer.
    it('TA1: the owning Full-timer can read and write their own notepad', async () => {
      await seedUsers();
      const db = getFirestore({ uid: 'u1' });
      const ref = doc(db, 'toAskNotes', 'u1');
      await assertSucceeds(
        setDoc(ref, { lines: [{ id: 'n1', text: 'Ask Jae about Sam', group: 'jae', createdAt: '2026-10-16T00:00:00.000Z' }] }),
      );
      await assertSucceeds(getDoc(ref));
    });

    it('TA1b: the owner can store dismissals and posted updates on their notepad', async () => {
      await seedUsers();
      const db = getFirestore({ uid: 'u1' });
      const update = { id: 'u1', text: 'Coming Friday', at: '2026-10-16T00:00:00.000Z', dest: 'contact' };
      await assertSucceeds(
        setDoc(doc(db, 'toAskNotes', 'u1'), {
          lines: [
            {
              id: 'n1',
              text: 'Ask Jae about Sam',
              group: 'jae',
              createdAt: '2026-10-16T00:00:00.000Z',
              dismissedAt: '2026-10-16T00:00:00.000Z',
              updates: [update],
            },
          ],
          overrides: { 'question|c1|q1': { dismissedAt: '2026-10-16T00:00:00.000Z', updates: [update] } },
        }),
      );
    });

    it('TA2: another Full-timer and a Trainee are denied', async () => {
      await seedUsers();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'toAskNotes', 'u1'), { lines: [] });
      });
      await assertFails(getDoc(doc(getFirestore({ uid: 'u2' }), 'toAskNotes', 'u1')));
      await assertFails(setDoc(doc(getFirestore({ uid: 'u2' }), 'toAskNotes', 'u1'), { lines: [] }));
      await assertFails(getDoc(doc(getFirestore({ uid: 'trainee1' }), 'toAskNotes', 'u1')));
      await assertFails(setDoc(doc(getFirestore({ uid: 'trainee1' }), 'toAskNotes', 'u1'), { lines: [] }));
    });

    it('TA3: a Full-timer cannot reach a Trainee’s notepad, and a Trainee cannot touch their own', async () => {
      await seedUsers();
      await assertFails(getDoc(doc(getFirestore({ uid: 'u1' }), 'toAskNotes', 'trainee1')));
      await assertFails(setDoc(doc(getFirestore({ uid: 'trainee1' }), 'toAskNotes', 'trainee1'), { lines: [] }));
    });

    // The worklist's two per-person axes (#813). Get this wrong and every write
    // is rejected while the UI looks like it worked — the trap #727 hit.
    it('MP6: Owner can write and read their own inbox state', async () => {
      await seedUsers();
      const db = getFirestore({ uid: 'u1' });
      const ref = doc(db, 'inboxState', 'u1');
      await assertSucceeds(
        setDoc(ref, {
          seen: { 'att:contact:c1': '2026-09-04T12:00:00.000Z' },
          completed: { 'att:contact:c2': '2026-09-04T12:00:00.000Z' },
          migratedAt: '2026-09-04T12:00:00.000Z',
        }),
      );
      await assertSucceeds(getDoc(ref));
      await assertSucceeds(
        updateDoc(ref, { 'seen.att:contact:c3': '2026-09-04T13:00:00.000Z' }),
      );
      await assertSucceeds(deleteDoc(ref));
    });

    it('MP7: Another Full-timer cannot read or write someone\u2019s inbox state; the super admin can (Nov 2026)', async () => {
      await seedUsers();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'inboxState', 'u1'), {
          seen: { 'att:contact:c1': '2026-09-04T12:00:00.000Z' },
        });
      });
      const dbOtherAdmin = getFirestore({ uid: 'u2' });
      await assertFails(getDoc(doc(dbOtherAdmin, 'inboxState', 'u1')));
      await assertFails(
        setDoc(doc(dbOtherAdmin, 'inboxState', 'u1'), { seen: {}, completed: {} }),
      );
      const dbSuper = getFirestore({ uid: 'owner-sa', email: 'yilongwang05@gmail.com', email_verified: true });
      await assertSucceeds(getDoc(doc(dbSuper, 'inboxState', 'u1')));
      await assertSucceeds(
        setDoc(doc(dbSuper, 'inboxState', 'u1'), { seen: {}, completed: {} }),
      );

      // Reviewing is private: a Student learns nothing about a Full-timer's
      // attention, and cannot forge it either.
      const dbStudent = getFirestore({ uid: 'student1' });
      await assertFails(getDoc(doc(dbStudent, 'inboxState', 'u1')));
      await assertFails(setDoc(doc(dbStudent, 'inboxState', 'u1'), { seen: {} }));
    });

    it('MP8: An unapproved user cannot touch their own inbox state', async () => {
      await seedUsers();
      const db = getFirestore({ uid: 'pending1' });
      await assertFails(setDoc(doc(db, 'inboxState', 'pending1'), { seen: {}, completed: {} }));
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

    it('MP5: Personal prayers are private: another Full-timer is denied, the super admin is not (Nov 2026)', async () => {
      await seedUsers();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users/u1/personalPrayers/pp1'), {
          title: 'private', contactId: null, date: '2026-05-15', status: 'open',
        });
      });
      const dbOtherAdmin = getFirestore({ uid: 'u2' });
      await assertFails(getDoc(doc(dbOtherAdmin, 'users/u1/personalPrayers/pp1')));
      await assertFails(setDoc(doc(dbOtherAdmin, 'users/u1/personalPrayers/pp2'), {
        title: 'manager prayer', contactId: null, date: '2026-05-15', status: 'open',
      }));
      const dbSuper = getFirestore({ uid: 'owner-sa', email: 'yilongwang05@gmail.com', email_verified: true });
      await assertSucceeds(getDoc(doc(dbSuper, 'users/u1/personalPrayers/pp1')));

      const dbStudent = getFirestore({ uid: 'student1' });
      await assertFails(getDoc(doc(dbStudent, 'users/u1/personalPrayers/pp1')));
      await assertFails(setDoc(doc(dbStudent, 'users/u1/personalPrayers/pp3'), {
        title: 'intruder', contactId: null, date: '2026-05-15', status: 'open',
      }));
    });
  });

  // The collections mobile v2's member app writes to. See MOBILE-V2.md and
  // firestore.rules sections 9b / 9c; chatRooms is cut and asserted closed.
  describe('Member app — prayer requests, hospitality, chats cut', () => {
    const seedMemberUsers = async () => {
      await testEnv.withSecurityRulesDisabled(async (c) => {
        await setDoc(doc(c.firestore(), 'users', 'student1'), { role: 'operator', approved: true });
        await setDoc(doc(c.firestore(), 'users', 'student2'), { role: 'operator', approved: true });
        await setDoc(doc(c.firestore(), 'users', 'community1'), { role: 'viewer', approved: true });
        await setDoc(doc(c.firestore(), 'users', 'trainee1'), { role: 'manager', approved: true });
        await setDoc(doc(c.firestore(), 'users', 'ft1'), { role: 'admin', approved: true });
        await setDoc(doc(c.firestore(), 'users', 'ft2'), { role: 'admin', approved: true });
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

    // ── chats are cut ────────────────────────────────────────────────────────
    // Cut-or-keep §20: chats, their messages and the Announcements room are
    // gone, so nothing reads or writes chatRooms. The documents stay in
    // Firestore, unread.
    it('CH1: nobody reads or writes chatRooms or their messages, a Full-timer included', async () => {
      await seedMemberUsers();
      await testEnv.withSecurityRulesDisabled(async (c) => {
        await setDoc(doc(c.firestore(), 'chatRooms', 'room1'), {
          type: 'group',
          name: 'Weekly notes',
          memberIds: ['ft1', 'trainee1'],
          createdById: 'ft1',
          createdByName: 'Mei',
          createdAt: serverTimestamp(),
        });
        await setDoc(doc(c.firestore(), 'chatRooms/room1/messages/m1'), {
          roomId: 'room1',
          text: 'Hello everyone',
          senderId: 'ft1',
          senderName: 'Mei',
          timestamp: serverTimestamp(),
          type: 'text',
        });
      });
      for (const uid of ['ft1', 'trainee1']) {
        const db = getFirestore({ uid });
        await assertFails(getDoc(doc(db, 'chatRooms', 'room1')));
        await assertFails(getDoc(doc(db, 'chatRooms/room1/messages/m1')));
        await assertFails(
          setDoc(doc(db, 'chatRooms', 'room2'), {
            type: 'group',
            memberIds: [uid],
            createdById: uid,
            createdByName: 'Someone',
            createdAt: serverTimestamp(),
          }),
        );
        await assertFails(
          setDoc(doc(db, 'chatRooms/room1/messages/m2'), {
            roomId: 'room1',
            text: 'Hi',
            senderId: uid,
            senderName: 'Someone',
            timestamp: serverTimestamp(),
            type: 'text',
          }),
        );
        await assertFails(deleteDoc(doc(db, 'chatRooms', 'room1')));
      }
    });
  });

  // Cut-or-keep §5: Questions for the team is gone, so nothing reads or writes
  // the `asks` collection. The documents stay in Firestore, unread.
  describe('Ask the team — person-less questions', () => {
    it('nobody reads or writes the asks collection, a Full-timer included', async () => {
      await testEnv.withSecurityRulesDisabled(async (c) => {
        await setDoc(doc(c.firestore(), 'users', 'trainee1'), { role: 'manager', approved: true });
        await setDoc(doc(c.firestore(), 'users', 'ft1'), { role: 'admin', approved: true });
        await setDoc(doc(c.firestore(), 'asks', 'ask1'), {
          parentId: null,
          owner: 'trainee1',
          from: 'trainee1',
          fromName: 'Zion Park',
          kind: 'question',
          body: 'How do I start a conversation at the club table?',
          at: new Date().toISOString(),
        });
      });
      for (const uid of ['ft1', 'trainee1']) {
        const db = getFirestore({ uid });
        await assertFails(getDoc(doc(db, 'asks', 'ask1')));
        await assertFails(getDocs(collection(db, 'asks')));
        await assertFails(
          setDoc(doc(db, 'asks', 'ask2'), {
            parentId: null,
            owner: uid,
            from: uid,
            fromName: 'Someone',
            kind: 'question',
            body: 'A new question.',
            at: new Date().toISOString(),
          }),
        );
        await assertFails(updateDoc(doc(db, 'asks', 'ask1'), { body: 'Rephrased.' }));
        await assertFails(deleteDoc(doc(db, 'asks', 'ask1')));
      }
    });
  });

  describe('Walking-together threads', () => {
    const seedThreadUsers = async () => {
      await testEnv.withSecurityRulesDisabled(async (c) => {
        await setDoc(doc(c.firestore(), 'users', 'teammate1'), { role: 'manager', approved: true });
        await setDoc(doc(c.firestore(), 'users', 'teammate2'), { role: 'manager', approved: true });
        await setDoc(doc(c.firestore(), 'users', 'manager1'), { role: 'manager', approved: true });
        await setDoc(doc(c.firestore(), 'users', 'admin1'), { role: 'admin', approved: true });
        await setDoc(doc(c.firestore(), 'contacts', 'contact1'), { name: 'Test', email: 'test@example.com', visibleTo: ['teammate1', 'teammate2'] });
      });
    };
    const newMsg = (over: Record<string, unknown> = {}) => ({
      from: 'teammate1',
      fromName: 'Op One',
      kind: 'comment',
      body: 'walking with you',
      at: new Date().toISOString(),
      interactionId: null,
      ...over,
    });
    const seedMsg = async (id: string, over: Record<string, unknown> = {}) => {
      await testEnv.withSecurityRulesDisabled(async (c) => {
        await setDoc(doc(c.firestore(), `contacts/contact1/threads/${id}`), newMsg(over));
      });
    };

    // ── Closing a follow-up ask (#813) ──────────────────────────────────────
    // An ask is one shared open item, so anyone who can see the contact may
    // record that they followed up; it closes once, for everyone tied, rather
    // than each of them dismissing a copy. Without this allowance every close
    // would be rejected while the button looked like it had worked — the exact
    // trap the `team` field hit in #727.
    describe('closing a follow-up ask', () => {
      it('lets someone other than the asker record that they followed up', async () => {
        await seedThreadUsers();
        await seedMsg('ask1', { kind: 'nudge', from: 'teammate1' });
        const db = getFirestore({ uid: 'teammate2' });
        await assertSucceeds(
          updateDoc(doc(db, 'contacts/contact1/threads/ask1'), {
            closedBy: 'teammate2',
            closedByName: 'Op Two',
            closedAt: new Date().toISOString(),
          }),
        );
      });

      it('lets the asker retract their own ask', async () => {
        await seedThreadUsers();
        await seedMsg('ask2', { kind: 'nudge', from: 'teammate1' });
        const db = getFirestore({ uid: 'teammate1' });
        await assertSucceeds(
          updateDoc(doc(db, 'contacts/contact1/threads/ask2'), {
            closedBy: 'teammate1',
            closedByName: 'Op One',
            closedAt: new Date().toISOString(),
          }),
        );
      });

      it('undoes a close by clearing all three fields together', async () => {
        await seedThreadUsers();
        await seedMsg('ask3', {
          kind: 'nudge',
          closedBy: 'teammate2',
          closedByName: 'Op Two',
          closedAt: new Date().toISOString(),
        });
        const db = getFirestore({ uid: 'teammate2' });
        await assertSucceeds(
          updateDoc(doc(db, 'contacts/contact1/threads/ask3'), {
            closedBy: null,
            closedByName: null,
            closedAt: null,
          }),
        );
      });

      it('refuses to record someone else as having followed up', async () => {
        await seedThreadUsers();
        await seedMsg('ask4', { kind: 'nudge' });
        const db = getFirestore({ uid: 'teammate2' });
        await assertFails(
          updateDoc(doc(db, 'contacts/contact1/threads/ask4'), {
            closedBy: 'teammate1',
            closedByName: 'Op One',
            closedAt: new Date().toISOString(),
          }),
        );
      });

      it('refuses to close anything that is not a follow-up ask', async () => {
        await seedThreadUsers();
        await seedMsg('note1', { kind: 'comment' });
        const db = getFirestore({ uid: 'teammate2' });
        await assertFails(
          updateDoc(doc(db, 'contacts/contact1/threads/note1'), {
            closedBy: 'teammate2',
            closedByName: 'Op Two',
            closedAt: new Date().toISOString(),
          }),
        );
      });

      it('refuses to smuggle a body edit in alongside the close', async () => {
        await seedThreadUsers();
        await seedMsg('ask5', { kind: 'nudge' });
        const db = getFirestore({ uid: 'teammate2' });
        await assertFails(
          updateDoc(doc(db, 'contacts/contact1/threads/ask5'), {
            closedBy: 'teammate2',
            closedByName: 'Op Two',
            closedAt: new Date().toISOString(),
            body: 'rewritten',
          }),
        );
      });
    });

    // ── Closing an @mention ─────────────────────────────────────────────────
    // A message that @mentions someone is open on their list until one of them
    // replies or presses Done, or its sender presses Never mind. It closes with
    // the same three keys as a Follow-up ask — but only those it names and its
    // sender may close it.
    describe('closing an @mention', () => {
      const close = (uid: string, name = uid) => ({ closedBy: uid, closedByName: name, closedAt: new Date().toISOString() });

      it('lets a mentioned person close it (Done, or by replying)', async () => {
        await seedThreadUsers();
        await seedMsg('mn1', { from: 'teammate1', mentionedUserIds: ['manager1', 'teammate2'] });
        await assertSucceeds(updateDoc(doc(getFirestore({ uid: 'teammate2' }), 'contacts/contact1/threads/mn1'), close('teammate2')));
      });

      it('lets the sender withdraw it with Never mind, and undo a close', async () => {
        await seedThreadUsers();
        await seedMsg('mn2', { from: 'teammate1', mentionedUserIds: ['teammate2'] });
        const db = getFirestore({ uid: 'teammate1' });
        await assertSucceeds(updateDoc(doc(db, 'contacts/contact1/threads/mn2'), close('teammate1')));
        await assertSucceeds(updateDoc(doc(db, 'contacts/contact1/threads/mn2'), { closedBy: null, closedByName: null, closedAt: null }));
      });

      it('refuses anyone it does not name, and a comment that names nobody', async () => {
        await seedThreadUsers();
        await seedMsg('mn3', { from: 'teammate1', mentionedUserIds: ['teammate2'] });
        await assertFails(updateDoc(doc(getFirestore({ uid: 'admin1' }), 'contacts/contact1/threads/mn3'), close('admin1')));
        await seedMsg('plain', { from: 'teammate1' });
        await assertFails(updateDoc(doc(getFirestore({ uid: 'teammate1' }), 'contacts/contact1/threads/plain'), close('teammate1')));
      });

      it('refuses recording someone else as the closer', async () => {
        await seedThreadUsers();
        await seedMsg('mn4', { from: 'teammate1', mentionedUserIds: ['teammate2'] });
        await assertFails(updateDoc(doc(getFirestore({ uid: 'teammate2' }), 'contacts/contact1/threads/mn4'), close('manager1')));
      });
    });

    it('lets the author create a message (from == uid)', async () => {
      await seedThreadUsers();
      const db = getFirestore({ uid: 'teammate1' });
      await assertSucceeds(setDoc(doc(db, 'contacts/contact1/threads/th1'), newMsg()));
    });

    it('rejects creating a message attributed to someone else', async () => {
      await seedThreadUsers();
      const db = getFirestore({ uid: 'teammate1' });
      await assertFails(setDoc(doc(db, 'contacts/contact1/threads/th2'), newMsg({ from: 'teammate2' })));
    });

    it('rejects creating with an oversized body', async () => {
      await seedThreadUsers();
      const db = getFirestore({ uid: 'teammate1' });
      await assertFails(setDoc(doc(db, 'contacts/contact1/threads/th4'), newMsg({ body: 'a'.repeat(6000) })));
    });

    it('rejects reaction writes — the reactions field is gone', async () => {
      await seedThreadUsers();
      await seedMsg('th10');
      const db = getFirestore({ uid: 'teammate2' });
      await assertFails(
        updateDoc(doc(db, 'contacts/contact1/threads/th10'), { reactions: [{ by: 'teammate2', emoji: '🙏' }] }),
      );
    });

    it('allows body edits by the author only', async () => {
      await seedThreadUsers();
      await seedMsg('th20');
      const other = getFirestore({ uid: 'teammate2' });
      await assertFails(updateDoc(doc(other, 'contacts/contact1/threads/th20'), { body: 'hijacked' }));
      const author = getFirestore({ uid: 'teammate1' });
      await assertSucceeds(updateDoc(doc(author, 'contacts/contact1/threads/th20'), { body: 'edited' }));
    });

    it('rejects changing immutable fields (from/kind) via update', async () => {
      await seedThreadUsers();
      await seedMsg('th30');
      const author = getFirestore({ uid: 'teammate1' });
      await assertFails(updateDoc(doc(author, 'contacts/contact1/threads/th30'), { kind: 'nudge' }));
      // `remindedAt` is written only by the reminder function (admin SDK); a
      // client may not mark its own ask or question reminded.
      await assertFails(
        updateDoc(doc(author, 'contacts/contact1/threads/th30'), { remindedAt: new Date().toISOString() }),
      );
    });

    it('lets the author rewrite the body and stamp editedAt in one update', async () => {
      await seedThreadUsers();
      await seedMsg('th31');
      const author = getFirestore({ uid: 'teammate1' });
      await assertSucceeds(
        updateDoc(doc(author, 'contacts/contact1/threads/th31'), {
          body: 'edited',
          editedAt: new Date().toISOString(),
        }),
      );
    });

    it('refuses an edit that moves from or at, and an oversized editedAt', async () => {
      await seedThreadUsers();
      await seedMsg('th32');
      const author = getFirestore({ uid: 'teammate1' });
      await assertFails(updateDoc(doc(author, 'contacts/contact1/threads/th32'), { from: 'teammate2' }));
      await assertFails(updateDoc(doc(author, 'contacts/contact1/threads/th32'), { at: new Date().toISOString() }));
      await assertFails(
        updateDoc(doc(author, 'contacts/contact1/threads/th32'), { body: 'x', editedAt: 'y'.repeat(41) }),
      );
      await assertFails(
        updateDoc(doc(author, 'contacts/contact1/threads/th32'), { body: 'x', editedAt: 12345 }),
      );
    });

    it('refuses a non-author rewrite that also stamps editedAt', async () => {
      await seedThreadUsers();
      await seedMsg('th33');
      const other = getFirestore({ uid: 'teammate2' });
      await assertFails(
        updateDoc(doc(other, 'contacts/contact1/threads/th33'), {
          body: 'hijacked',
          editedAt: new Date().toISOString(),
        }),
      );
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

    it('keeps Full-timer-only Discussion scope away from non-admins', async () => {
      await seedThreadUsers();
      await seedMsg('team1', { scope: 'team' });

      const adminDb = getFirestore({ uid: 'admin1' });
      await assertSucceeds(getDoc(doc(adminDb, 'contacts/contact1/threads/team1')));

      const operatorDb = getFirestore({ uid: 'teammate1' });
      await assertFails(getDoc(doc(operatorDb, 'contacts/contact1/threads/team1')));
    });

    // A list rule cannot drop single documents from a result: an unfiltered
    // `threads` list is allowed or refused whole, and the approved roles need
    // it allowed (shipped mobile builds query it that way). So Full-timers
    // Discussion may not be written into `threads` at all, even by a
    // Full-timer; it has its own `teamThreads` subcollection.
    it('refuses team-scope Discussion in the open threads collection, even from a Full-timer', async () => {
      await seedThreadUsers();

      const operatorDb = getFirestore({ uid: 'teammate1' });
      await assertFails(setDoc(doc(operatorDb, 'contacts/contact1/threads/team2'), newMsg({ scope: 'team' })));

      const adminDb = getFirestore({ uid: 'admin1' });
      await assertFails(setDoc(doc(adminDb, 'contacts/contact1/threads/team3'), newMsg({ from: 'admin1', scope: 'team' })));
    });

    it('never lets Full-timers Discussion reach a non-admin\'s unfiltered thread list', async () => {
      await seedThreadUsers();
      await testEnv.withSecurityRulesDisabled(async (c) => {
        const fs = c.firestore();
        await setDoc(doc(fs, 'contacts', 'tied'), { name: 'Tied', email: 't@example.com', visibleTo: ['manager1'] });
        await setDoc(doc(fs, 'contacts/tied/threads/open1'), newMsg());
      });

      // A Full-timer posts to the Full-timers tab through whichever path the
      // rules allow. Being refused in `threads` is the fix, so a refusal there
      // is expected rather than a test failure.
      const adminDb = getFirestore({ uid: 'admin1' });
      const teamMsg = newMsg({ from: 'admin1', scope: 'team' });
      await setDoc(doc(adminDb, 'contacts/tied/threads/team1'), teamMsg).catch(() => undefined);
      await setDoc(doc(adminDb, 'contacts/tied/teamThreads/team1'), teamMsg).catch(() => undefined);

      const unfiltered = [
        ['manager1', (db: ReturnType<typeof getFirestore>) => query(collection(db, 'contacts', 'tied', 'threads'), orderBy('at', 'desc'))],
      ] as const;
      for (const [uid, q] of unfiltered) {
        const snap = await assertSucceeds(getDocs(q(getFirestore({ uid }))));
        const ids = snap.docs.map((d) => d.id);
        expect(ids, uid).toContain('open1');
        expect(ids, uid).not.toContain('team1');
      }
    });

    describe('Full-timers Discussion (teamThreads)', () => {
      const teamMsg = (over: Record<string, unknown> = {}) => newMsg({ from: 'admin1', scope: 'team', ...over });
      const seedTeam = async (id: string) => {
        await testEnv.withSecurityRulesDisabled(async (c) => {
          const fs = c.firestore();
          await setDoc(doc(fs, 'users', 'viewer1'), { role: 'viewer', approved: true });
          await setDoc(doc(fs, 'contacts', 'tied'), { name: 'Tied', email: 't@example.com', visibleTo: ['manager1'] });
          await setDoc(doc(fs, `contacts/tied/teamThreads/${id}`), teamMsg());
        });
      };

      it('lets a Full-timer post, read, list and delete it', async () => {
        await seedThreadUsers();
        await seedTeam('seeded');
        const adminDb = getFirestore({ uid: 'admin1' });
        await assertSucceeds(setDoc(doc(adminDb, 'contacts/tied/teamThreads/t1'), teamMsg()));
        await assertSucceeds(getDoc(doc(adminDb, 'contacts/tied/teamThreads/seeded')));
        await assertSucceeds(getDocs(query(collection(adminDb, 'contacts', 'tied', 'teamThreads'), orderBy('at', 'desc'))));
        await assertSucceeds(getDocs(query(collectionGroup(adminDb, 'teamThreads'), orderBy('at', 'desc'))));
        await assertSucceeds(deleteDoc(doc(adminDb, 'contacts/tied/teamThreads/seeded')));
      });

      it('refuses a Full-timer posting as someone else, or without the team scope', async () => {
        await seedThreadUsers();
        await seedTeam('seeded');
        const adminDb = getFirestore({ uid: 'admin1' });
        await assertFails(setDoc(doc(adminDb, 'contacts/tied/teamThreads/t2'), teamMsg({ from: 'teammate1' })));
        await assertFails(setDoc(doc(adminDb, 'contacts/tied/teamThreads/t3'), teamMsg({ scope: null })));
        await assertFails(updateDoc(doc(adminDb, 'contacts/tied/teamThreads/seeded'), { body: 'edited' }));
      });

      it('lets a Full-timer it @mentions close a mention there, and nothing else move', async () => {
        await seedThreadUsers();
        await testEnv.withSecurityRulesDisabled(async (c) => {
          const fs = c.firestore();
          await setDoc(doc(fs, 'users', 'admin2'), { role: 'admin', approved: true });
          await setDoc(doc(fs, 'contacts', 'tied'), { name: 'Tied', email: 't@example.com' });
          await setDoc(doc(fs, 'contacts/tied/teamThreads/mn'), teamMsg({ mentionedUserIds: ['admin2'] }));
          await setDoc(doc(fs, 'contacts/tied/teamThreads/plain'), teamMsg());
        });
        const closing = (uid: string) => ({ closedBy: uid, closedByName: uid, closedAt: new Date().toISOString() });
        await assertFails(updateDoc(doc(getFirestore({ uid: 'admin2' }), 'contacts/tied/teamThreads/mn'), { ...closing('admin2'), body: 'x' }));
        await assertFails(updateDoc(doc(getFirestore({ uid: 'admin2' }), 'contacts/tied/teamThreads/plain'), closing('admin2')));
        await assertSucceeds(updateDoc(doc(getFirestore({ uid: 'admin2' }), 'contacts/tied/teamThreads/mn'), closing('admin2')));
      });

      it('keeps every other role out, even a Trainee tied to the person', async () => {
        await seedThreadUsers();
        await seedTeam('seeded');
        for (const uid of ['manager1']) {
          const db = getFirestore({ uid });
          await assertFails(getDoc(doc(db, 'contacts/tied/teamThreads/seeded')));
          await assertFails(getDocs(query(collection(db, 'contacts', 'tied', 'teamThreads'))));
          await assertFails(getDocs(query(collectionGroup(db, 'teamThreads'))));
          await assertFails(setDoc(doc(db, 'contacts/tied/teamThreads/x'), teamMsg({ from: uid })));
          await assertFails(deleteDoc(doc(db, 'contacts/tied/teamThreads/seeded')));
        }
      });
    });

    it('collection-group thread lists hide team-scope from non-admins', async () => {
      await seedThreadUsers();
      await seedMsg('open4', { scope: null }); // regular thread
      await seedMsg('team4', { scope: 'team' }); // full-timer team-scope thread

      const adminDb = getFirestore({ uid: 'admin1' });
      const adminSnap = await getDocs(query(collectionGroup(adminDb, 'threads')));
      const adminIds = adminSnap.docs.map((d) => d.id);
      expect(adminIds).toContain('open4');
      expect(adminIds).toContain('team4');

      // A Trainee may not list the collection group at all, team scope or not;
      // see 'Threads follow their contact's visibility'.
      const traineeDb = getFirestore({ uid: 'manager1' });
      await assertFails(getDocs(query(collectionGroup(traineeDb, 'threads'), where('scope', '==', 'team'))));
      await assertFails(getDocs(query(collectionGroup(traineeDb, 'threads'), where('scope', '==', null))));
    });

    // #1126 — a viewer may delete their own message; an admin may delete any.
    // Managers (Trainees) may not delete someone else's message.
    describe('deleting a message', () => {
      it('lets the author delete their own message', async () => {
        await seedThreadUsers();
        await seedMsg('del1', { from: 'teammate1' });
        const db = getFirestore({ uid: 'teammate1' });
        await assertSucceeds(deleteDoc(doc(db, 'contacts/contact1/threads/del1')));
      });

      it('lets an admin delete anyone else\'s message', async () => {
        await seedThreadUsers();
        await seedMsg('del2', { from: 'teammate1' });
        const db = getFirestore({ uid: 'admin1' });
        await assertSucceeds(deleteDoc(doc(db, 'contacts/contact1/threads/del2')));
      });

      it('lets an admin delete a team-scope Full-timers message', async () => {
        await seedThreadUsers();
        await seedMsg('del3', { from: 'teammate1', scope: 'team' });
        const db = getFirestore({ uid: 'admin1' });
        await assertSucceeds(deleteDoc(doc(db, 'contacts/contact1/threads/del3')));
      });

      it('refuses another teammate deleting a colleague\'s message', async () => {
        await seedThreadUsers();
        await seedMsg('del4', { from: 'teammate1' });
        const db = getFirestore({ uid: 'teammate2' });
        await assertFails(deleteDoc(doc(db, 'contacts/contact1/threads/del4')));
      });

      it('refuses a manager (Trainee) deleting a colleague\'s message', async () => {
        await seedThreadUsers();
        await seedMsg('del5', { from: 'teammate1' });
        const db = getFirestore({ uid: 'manager1' });
        await assertFails(deleteDoc(doc(db, 'contacts/contact1/threads/del5')));
      });

      it('lets a manager (Trainee) delete their own message', async () => {
        await seedThreadUsers();
        await seedMsg('del6', { from: 'manager1' });
        // Tied, since removing on a person needs seeing them (#1350).
        await testEnv.withSecurityRulesDisabled(async (c) => {
          await updateDoc(doc(c.firestore(), 'contacts', 'contact1'), { visibleTo: ['manager1'] });
        });
        const db = getFirestore({ uid: 'manager1' });
        await assertSucceeds(deleteDoc(doc(db, 'contacts/contact1/threads/del6')));
      });
    });

    // `reviewed` was deleted in #813 — four readers, no writer outside the seed
    // scripts — so nothing may write it any more.
    it('no longer lets anyone write the retired `reviewed` flag', async () => {
      await seedThreadUsers();
      const db = getFirestore({ uid: 'admin1' });
      await assertFails(updateDoc(doc(db, 'contacts', 'contact1'), { reviewed: true }));
    });
  });

  // Rhythms — a recurring gathering's own record (issue #957 / ADR 0016),
  // replacing the deleted `gatheringTypes` kind taxonomy.
  describe('Rhythms', () => {
    const validRhythm = {
      name: 'Wednesday Bible Study',
      cadence: { type: 'weekly', days: [3] },
      location: 'Lower Common Room',
      roster: ['c1', 'c2'],
      termStart: '2026-09-09',
      termEnd: '2026-12-23',
    };

    const seedRoles = async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'admin1'), { role: 'admin', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'manager1'), { role: 'manager', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'pending1'), { role: 'manager', approved: false });
      });
    };

    it('R1: A Trainee can create a valid Rhythm', async () => {
      await seedRoles();
      const db = getFirestore({ uid: 'manager1' });
      await assertSucceeds(setDoc(doc(db, 'rhythms', 'r1'), validRhythm));
    });

    it('R2: An unapproved account can neither read nor create', async () => {
      await seedRoles();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'rhythms', 'r1'), validRhythm);
      });
      const db = getFirestore({ uid: 'pending1' });
      await assertFails(getDoc(doc(db, 'rhythms', 'r1')));
      await assertFails(setDoc(doc(db, 'rhythms', 'rX'), validRhythm));
    });

    it('R3: A Trainee can update and delete a Rhythm', async () => {
      await seedRoles();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'rhythms', 'r1'), validRhythm);
      });
      const mgrDb = getFirestore({ uid: 'manager1' });
      await assertSucceeds(updateDoc(doc(mgrDb, 'rhythms', 'r1'), { roster: ['c1'] }));
      await assertSucceeds(deleteDoc(doc(mgrDb, 'rhythms', 'r1')));
    });

    it('R4: Rejects an invalid Rhythm (bad cadence / missing roster or term)', async () => {
      await seedRoles();
      const db = getFirestore({ uid: 'manager1' });
      await assertFails(setDoc(doc(db, 'rhythms', 'rBad'), { ...validRhythm, cadence: { type: 'daily', days: [] } }));
      await assertFails(setDoc(doc(db, 'rhythms', 'rBad2'), { name: 'No roster', cadence: { type: 'weekly', days: [3] }, termStart: '2026-09-09', termEnd: '2026-12-23' }));
      await assertFails(setDoc(doc(db, 'rhythms', 'rBad3'), { name: '', cadence: { type: 'weekly', days: [3] }, roster: [], termStart: '2026-09-09', termEnd: '2026-12-23' }));
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

    it('SS6: Manager can set the bfa intake flag (mirrors toggleBfa write)', async () => {
      await seedRoles();
      const db = getFirestore({ uid: 'manager1' });
      await assertSucceeds(setDoc(doc(db, 'settings', 'season'), { bfa: true }));
    });

    it('SW1: Admin can write settings/walking pairs', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'admin1'), { role: 'admin', approved: true });
      });
      const db = getFirestore({ uid: 'admin1' });
      await assertSucceeds(
        setDoc(doc(db, 'settings', 'walking'), { pairs: { admin1: ['trainee1', 'trainee2'] } }),
      );
    });

    it('SW2: Manager cannot write settings/walking pairs', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'manager1'), { role: 'manager', approved: true });
      });
      const db = getFirestore({ uid: 'manager1' });
      await assertFails(
        setDoc(doc(db, 'settings', 'walking'), { pairs: { admin1: ['trainee1'] } }),
      );
    });

    it('SG1: settings/goal needs an approved member to read (Nov 2026)', async () => {
      await seedRoles();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'settings', 'goal'), { on: true, count: 5 });
      });
      await assertFails(getDoc(doc(getFirestore(), 'settings', 'goal'))); // unauthenticated
      await assertSucceeds(getDoc(doc(getFirestore({ uid: 'operator1' }), 'settings', 'goal')));
    });

    it('SG2: Admin can write the day goal', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'admin1'), { role: 'admin', approved: true });
      });
      const db = getFirestore({ uid: 'admin1' });
      await assertSucceeds(setDoc(doc(db, 'settings', 'goal'), { on: false, count: 7 }));
    });

    it('SG3: Manager cannot write the day goal', async () => {
      await seedRoles();
      const db = getFirestore({ uid: 'manager1' });
      await assertFails(setDoc(doc(db, 'settings', 'goal'), { on: true, count: 5 }));
    });

    it('SG4: Rejects a count outside the 1..20 band or stray keys', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'admin1'), { role: 'admin', approved: true });
      });
      const db = getFirestore({ uid: 'admin1' });
      await assertFails(setDoc(doc(db, 'settings', 'goal'), { on: true, count: 0 }));
      await assertFails(setDoc(doc(db, 'settings', 'goal'), { on: true, count: 21 }));
      await assertFails(setDoc(doc(db, 'settings', 'goal'), { on: true, count: 5, evil: true }));
    });

    it('SP1: settings/partners needs an approved member to read (Nov 2026)', async () => {
      await seedRoles();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'settings', 'partners'), { pairings: [] });
      });
      await assertFails(getDoc(doc(getFirestore(), 'settings', 'partners'))); // unauthenticated
      await assertSucceeds(getDoc(doc(getFirestore({ uid: 'operator1' }), 'settings', 'partners')));
    });

    it('SP2: Admin can write settings/partners', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'admin1'), { role: 'admin', approved: true });
      });
      const db = getFirestore({ uid: 'admin1' });
      await assertSucceeds(
        setDoc(doc(db, 'settings', 'partners'), { pairings: [{ id: 'p1', members: ['trainee1', 'trainee2'], startDate: '2026-09-01' }] }),
      );
    });

    it('SP3: Manager cannot write settings/partners', async () => {
      await seedRoles();
      const db = getFirestore({ uid: 'manager1' });
      await assertFails(setDoc(doc(db, 'settings', 'partners'), { pairings: [{ id: 'p1', members: ['trainee1', 'trainee2'], startDate: '2026-09-01' }] }));
    });

    it('SP4: Rejects stray keys on settings/partners', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'admin1'), { role: 'admin', approved: true });
      });
      const db = getFirestore({ uid: 'admin1' });
      await assertFails(setDoc(doc(db, 'settings', 'partners'), { pairings: [], evil: true }));
    });

    it('SP5: Rejects the legacy byTerm shape and stray keys; accepts a pairings list', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'admin1'), { role: 'admin', approved: true });
      });
      const db = getFirestore({ uid: 'admin1' });
      // The legacy byTerm shape without pairings is rejected by isValidPartnerSettings.
      await assertFails(setDoc(doc(db, 'settings', 'partners'), { byTerm: { 'Fall 2026': ['trainee1', 'trainee2'] } }));
      // Stray keys alongside pairings are rejected.
      await assertFails(setDoc(doc(db, 'settings', 'partners'), { pairings: [], byTerm: {} }));
      // The documented canonical shape is accepted.
      await assertSucceeds(setDoc(doc(db, 'settings', 'partners'), { pairings: [{ id: 'p1', members: ['trainee1', 'trainee2'], startDate: '2026-09-01' }] }));
    });

    it('SP6: Admin can save pairings onto a doc that still holds legacy byTerm, but cannot change byTerm', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'admin1'), { role: 'admin', approved: true });
        await setDoc(doc(context.firestore(), 'settings', 'partners'), {
          byTerm: { 'Fall 2026': [{ members: ['trainee1', 'trainee2'] }] },
        });
      });
      const db = getFirestore({ uid: 'admin1' });
      const ref = doc(db, 'settings', 'partners');
      // savePartners' exact write: pairings merged in, byTerm left untouched.
      await assertSucceeds(
        setDoc(ref, { pairings: [{ id: 'p1', members: ['trainee1', 'trainee2'], startDate: '2026-09-01' }] }, { merge: true }),
      );
      // byTerm itself stays read-only, and no other key may join it.
      await assertFails(setDoc(ref, { byTerm: {} }, { merge: true }));
      await assertFails(setDoc(ref, { pairings: [], evil: true }, { merge: true }));
      await assertFails(setDoc(ref, { pairings: 'not-a-list' }, { merge: true }));
    });

    it('SP7: Manager cannot save pairings onto a legacy byTerm doc', async () => {
      await seedRoles();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'settings', 'partners'), { byTerm: {} });
      });
      const db = getFirestore({ uid: 'manager1' });
      await assertFails(setDoc(doc(db, 'settings', 'partners'), { pairings: [] }, { merge: true }));
    });

    // What's New is cut (cut-or-keep §16): its settings record may stay on
    // disk, but nothing writes it from a client and it is no longer public.
    it('SWN1: settings/whats_new is no longer public or client-writable', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'settings', 'whats_new'), {
          videoUrl: 'https://example.com/whats-new.mp4',
        });
        await setDoc(doc(context.firestore(), 'users', 'admin1'), { role: 'admin', approved: true });
      });

      const unauthDb = getFirestore();
      await assertFails(getDoc(doc(unauthDb, 'settings', 'whats_new')));

      const adminDb = getFirestore({ uid: 'admin1' });
      await assertFails(
        setDoc(doc(adminDb, 'settings', 'whats_new'), {
          videoUrl: 'https://example.com/other.mp4',
        }),
      );
      await assertFails(
        updateDoc(doc(adminDb, 'settings', 'whats_new'), {
          videoUrl: 'https://example.com/edited.mp4',
        }),
      );
    });
  });

  describe('Settings (standard tags)', () => {
    const seedRoles = async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'admin1'), { role: 'admin', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'manager1'), { role: 'manager', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'viewer1'), { role: 'viewer', approved: true });
      });
    };

    it('STD1: An approved user can read settings/standard_tags', async () => {
      await seedRoles();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'settings', 'standard_tags'), { tags: ['Saved', 'BFA'] });
      });
      const db = getFirestore({ uid: 'viewer1' });
      await assertSucceeds(getDoc(doc(db, 'settings', 'standard_tags')));
    });

    it('STD2: An unauthenticated reader cannot read settings/standard_tags', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'settings', 'standard_tags'), { tags: ['Saved'] });
      });
      const db = getFirestore();
      await assertFails(getDoc(doc(db, 'settings', 'standard_tags')));
    });

    it('STD3: A Full-timer can write settings/standard_tags', async () => {
      await seedRoles();
      const db = getFirestore({ uid: 'admin1' });
      await assertSucceeds(setDoc(doc(db, 'settings', 'standard_tags'), { tags: ['Saved', 'Welcome'] }));
    });

    it('STD4: A manager cannot write settings/standard_tags', async () => {
      await seedRoles();
      const db = getFirestore({ uid: 'manager1' });
      await assertFails(setDoc(doc(db, 'settings', 'standard_tags'), { tags: ['Saved'] }));
    });

    it('STD5: Rejects stray keys and a non-list tags field', async () => {
      await seedRoles();
      const db = getFirestore({ uid: 'admin1' });
      await assertFails(setDoc(doc(db, 'settings', 'standard_tags'), { tags: ['Saved'], evil: true }));
      await assertFails(setDoc(doc(db, 'settings', 'standard_tags'), { tags: 'Saved' }));
    });
  });

  describe('Settings (weekly reminder schedule)', () => {
    const seedRoles = async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'admin1'), { role: 'admin', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'manager1'), { role: 'manager', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'operator1'), { role: 'operator', approved: true });
      });
    };

    const validSchedule = {
      fullTimers: { days: [2, 3], hour: 17 },
      teams: { yp: { days: [2], hour: 18 }, campus: { days: [2, 3], hour: 18 } },
    };

    it('RS1: The reminder schedule needs an approved member to read (Nov 2026)', async () => {
      await seedRoles();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'settings', 'reminder_schedule'), validSchedule);
      });
      await assertFails(getDoc(doc(getFirestore(), 'settings', 'reminder_schedule'))); // unauthenticated
      await assertSucceeds(getDoc(doc(getFirestore({ uid: 'operator1' }), 'settings', 'reminder_schedule')));
    });

    it('RS2: Admin can write a valid schedule', async () => {
      await seedRoles();
      const db = getFirestore({ uid: 'admin1' });
      await assertSucceeds(setDoc(doc(db, 'settings', 'reminder_schedule'), validSchedule));
    });

    it('RS3: Manager cannot write the schedule', async () => {
      await seedRoles();
      const db = getFirestore({ uid: 'manager1' });
      await assertFails(setDoc(doc(db, 'settings', 'reminder_schedule'), validSchedule));
    });

    it('RS4: Operator cannot write the schedule', async () => {
      await seedRoles();
      const db = getFirestore({ uid: 'operator1' });
      await assertFails(setDoc(doc(db, 'settings', 'reminder_schedule'), validSchedule));
    });

    it('RS5: Rejects stray top-level keys', async () => {
      await seedRoles();
      const db = getFirestore({ uid: 'admin1' });
      await assertFails(setDoc(doc(db, 'settings', 'reminder_schedule'), { ...validSchedule, evil: true }));
    });

    it('RS6: Rejects an invalid hour or weekday', async () => {
      await seedRoles();
      const db = getFirestore({ uid: 'admin1' });
      await assertFails(
        setDoc(doc(db, 'settings', 'reminder_schedule'), {
          ...validSchedule,
          fullTimers: { days: [2], hour: 24 },
        }),
      );
      await assertFails(
        setDoc(doc(db, 'settings', 'reminder_schedule'), {
          ...validSchedule,
          fullTimers: { days: [7], hour: 17 },
        }),
      );
    });

    it('RS7: Rejects an unknown team key or stray time keys', async () => {
      await seedRoles();
      const db = getFirestore({ uid: 'admin1' });
      await assertFails(
        setDoc(doc(db, 'settings', 'reminder_schedule'), {
          ...validSchedule,
          teams: { ...validSchedule.teams, east: { days: [1], hour: 9 } },
        }),
      );
      await assertFails(
        setDoc(doc(db, 'settings', 'reminder_schedule'), {
          ...validSchedule,
          fullTimers: { days: [2], hour: 17, evil: true },
        }),
      );
    });
  });

  describe('Users (weekly reminder switch)', () => {
    const validUser = (over: Record<string, unknown> = {}) => ({
      email: 'person@example.com',
      displayName: 'Person Name',
      photoURL: null,
      role: 'manager',
      approved: true,
      ...over,
    });

    const seedUser = async (uid: string, over: Record<string, unknown> = {}) => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', uid), validUser({ displayName: uid, ...over }));
      });
    };

    it('UW1: A person can turn their own weekly reminders off', async () => {
      await seedUser('manager1');
      const db = getFirestore({ uid: 'manager1' });
      await assertSucceeds(updateDoc(doc(db, 'users', 'manager1'), { weeklyRemindersOff: true }));
    });

    it('UW2: A person can turn them back on', async () => {
      await seedUser('manager1', { weeklyRemindersOff: true });
      const db = getFirestore({ uid: 'manager1' });
      await assertSucceeds(updateDoc(doc(db, 'users', 'manager1'), { weeklyRemindersOff: false }));
    });

    it('UW3: An admin cannot change someone else’s switch', async () => {
      await seedUser('manager1');
      await seedUser('admin1', { role: 'admin' });
      const db = getFirestore({ uid: 'admin1' });
      await assertFails(updateDoc(doc(db, 'users', 'manager1'), { weeklyRemindersOff: true }));
    });

    it('UW4: A manager cannot change someone else’s switch', async () => {
      await seedUser('manager1');
      await seedUser('manager2');
      const db = getFirestore({ uid: 'manager1' });
      await assertFails(updateDoc(doc(db, 'users', 'manager2'), { weeklyRemindersOff: true }));
    });

    it('UW5: Rejects a non-boolean switch value', async () => {
      await seedUser('manager1');
      const db = getFirestore({ uid: 'manager1' });
      await assertFails(updateDoc(doc(db, 'users', 'manager1'), { weeklyRemindersOff: 'yes' }));
    });
  });

  describe('Notifications', () => {
    const seedUsers = async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'admin1'), { role: 'admin', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'viewer1'), { role: 'viewer', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'viewer2'), { role: 'viewer', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'trainee1'), { role: 'manager', approved: true });
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

    it('N0a: a signed-out visitor cannot push an ALL_ADMINS alert (the server writes the sign-up one)', async () => {
      await seedUsers();
      const db = getFirestore();
      await assertFails(setDoc(doc(db, 'notifications', 'spam1'), {
        userId: 'ALL_ADMINS', title: 'Urgent', message: 'Open this link', type: 'event', read: false,
        createdAt: serverTimestamp(),
      }));
    });

    it('N0b: an approved teammate can still write a notification', async () => {
      await seedUsers();
      const db = getFirestore({ uid: 'admin1' });
      await assertSucceeds(setDoc(doc(db, 'notifications', 'ok1'), {
        userId: 'ALL_ADMINS', title: 'New event', message: 'Dinner Friday', type: 'event', read: false,
        createdAt: serverTimestamp(),
      }));
    });

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

    it('N4: a Full-timer can mark a broadcast notification read', async () => {
      await seedUsers();
      await seedBroadcastNotif();
      const db = getFirestore({ uid: 'admin1' });
      await assertSucceeds(updateDoc(doc(db, 'notifications', 'n2'), { read: true, readBy: ['admin1'] }));
    });

    it('N5: a Full-timer can dismiss (set aside) a broadcast notification for themselves', async () => {
      await seedUsers();
      await seedBroadcastNotif();
      const db = getFirestore({ uid: 'admin1' });
      await assertSucceeds(updateDoc(doc(db, 'notifications', 'n2'), { dismissedBy: ['admin1'] }));
    });

    it('N6: a Full-timer can update a notification regardless of which fields change', async () => {
      await seedUsers();
      await seedPersonalNotif('viewer1');
      const db = getFirestore({ uid: 'admin1' });
      await assertSucceeds(updateDoc(doc(db, 'notifications', 'n1'), { title: 'Edited by staff' }));
    });

    const bell = (extra: Record<string, unknown>) => ({
      userId: 'viewer1', title: 'Hi', message: 'msg', type: 'info', read: false, createdAt: serverTimestamp(), ...extra,
    });

    it('N7: a bell entry may carry a push coalesce key', async () => {
      await seedUsers();
      const db = getFirestore({ uid: 'admin1' });
      await assertSucceeds(setDoc(doc(db, 'notifications', 'n3'), bell({ coalesceKey: 'contact:c1' })));
    });

    it('N8: a coalesce key must be a short string', async () => {
      await seedUsers();
      const db = getFirestore({ uid: 'admin1' });
      await assertFails(setDoc(doc(db, 'notifications', 'n4'), bell({ coalesceKey: 42 })));
      await assertFails(setDoc(doc(db, 'notifications', 'n5'), bell({ coalesceKey: 'x'.repeat(201) })));
    });

    it('N9: the recipient can get and list their own personal notifications', async () => {
      await seedUsers();
      await seedPersonalNotif('trainee1');
      const db = getFirestore({ uid: 'trainee1' });
      await assertSucceeds(getDoc(doc(db, 'notifications', 'n1')));
      await assertSucceeds(getDocs(query(collection(db, 'notifications'), where('userId', '==', 'trainee1'))));
    });

    it("N10: a Trainee cannot get or list someone else's personal notifications", async () => {
      await seedUsers();
      await seedPersonalNotif('viewer1');
      const db = getFirestore({ uid: 'trainee1' });
      await assertFails(getDoc(doc(db, 'notifications', 'n1')));
      await assertFails(getDocs(query(collection(db, 'notifications'), where('userId', '==', 'viewer1'))));
      await assertFails(getDocs(collection(db, 'notifications')));
    });

    it('N11: a Trainee or community member cannot get or list Full-timer broadcasts', async () => {
      await seedUsers();
      await seedBroadcastNotif();
      for (const uid of ['trainee1', 'viewer1']) {
        const db = getFirestore({ uid });
        await assertFails(getDoc(doc(db, 'notifications', 'n2')));
        await assertFails(getDocs(query(collection(db, 'notifications'), where('userId', '==', 'ALL_ADMINS'))));
      }
    });

    it("N12: a Full-timer can get and list broadcasts and others' personal notifications", async () => {
      await seedUsers();
      await seedPersonalNotif('viewer1');
      await seedBroadcastNotif();
      const db = getFirestore({ uid: 'admin1' });
      await assertSucceeds(getDoc(doc(db, 'notifications', 'n1')));
      await assertSucceeds(getDoc(doc(db, 'notifications', 'n2')));
      await assertSucceeds(getDocs(query(collection(db, 'notifications'), where('userId', '==', 'ALL_ADMINS'))));
      await assertSucceeds(getDocs(query(collection(db, 'notifications'), where('userId', '==', 'viewer1'))));
    });

    it("N13: a Trainee cannot update someone else's notification or any broadcast", async () => {
      await seedUsers();
      await seedPersonalNotif('viewer1');
      await seedBroadcastNotif();
      const db = getFirestore({ uid: 'trainee1' });
      await assertFails(updateDoc(doc(db, 'notifications', 'n1'), { title: 'Edited by trainee' }));
      await assertFails(updateDoc(doc(db, 'notifications', 'n2'), { read: true, readBy: ['trainee1'] }));
      await assertFails(updateDoc(doc(db, 'notifications', 'n2'), { dismissedBy: ['trainee1'] }));
    });

    it('N14: a community member cannot mark read or dismiss a broadcast', async () => {
      await seedUsers();
      await seedBroadcastNotif();
      const db = getFirestore({ uid: 'viewer1' });
      await assertFails(updateDoc(doc(db, 'notifications', 'n2'), { read: true, readBy: ['viewer1'] }));
      await assertFails(updateDoc(doc(db, 'notifications', 'n2'), { dismissedBy: ['viewer1'] }));
    });

    it('N15: the recipient can delete their own personal notification', async () => {
      await seedUsers();
      await seedPersonalNotif('trainee1');
      const db = getFirestore({ uid: 'trainee1' });
      await assertSucceeds(deleteDoc(doc(db, 'notifications', 'n1')));
    });

    it("N16: a Trainee cannot delete someone else's notification or a broadcast", async () => {
      await seedUsers();
      await seedPersonalNotif('viewer1');
      await seedBroadcastNotif();
      const db = getFirestore({ uid: 'trainee1' });
      await assertFails(deleteDoc(doc(db, 'notifications', 'n1')));
      await assertFails(deleteDoc(doc(db, 'notifications', 'n2')));
    });

    it('N17: an unauthenticated caller cannot delete a broadcast', async () => {
      await seedUsers();
      await seedBroadcastNotif();
      await assertFails(deleteDoc(doc(getFirestore(), 'notifications', 'n2')));
    });

    it("N18: a Full-timer can delete someone else's notification and a broadcast", async () => {
      await seedUsers();
      await seedPersonalNotif('viewer1');
      await seedBroadcastNotif();
      const db = getFirestore({ uid: 'admin1' });
      await assertSucceeds(deleteDoc(doc(db, 'notifications', 'n1')));
      await assertSucceeds(deleteDoc(doc(db, 'notifications', 'n2')));
    });
  });

  describe('Push devices (users/{uid}/pushDevices)', () => {
    const expo = { kind: 'expo', token: 'ExponentPushToken[abc]', platform: 'ios', updatedAt: serverTimestamp() };
    const web = {
      kind: 'web',
      endpoint: 'https://fcm.googleapis.com/fcm/send/abc',
      keys: { p256dh: 'BPk', auth: 'xyz' },
      updatedAt: serverTimestamp(),
    };

    it('PD1: a user registers their own native and browser devices', async () => {
      const db = getFirestore({ uid: 'u1' });
      await assertSucceeds(setDoc(doc(db, 'users', 'u1', 'pushDevices', 'd-expo'), expo));
      await assertSucceeds(setDoc(doc(db, 'users', 'u1', 'pushDevices', 'd-web'), web));
    });

    it('PD2: a user re-registers and removes their own device', async () => {
      const db = getFirestore({ uid: 'u1' });
      await assertSucceeds(setDoc(doc(db, 'users', 'u1', 'pushDevices', 'd-expo'), expo));
      await assertSucceeds(setDoc(doc(db, 'users', 'u1', 'pushDevices', 'd-expo'), expo));
      await assertSucceeds(deleteDoc(doc(db, 'users', 'u1', 'pushDevices', 'd-expo')));
    });

    it('PD3: nobody else can register, read or remove a device on your account', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'admin1'), { role: 'admin', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'u1', 'pushDevices', 'd-expo'), expo);
      });
      const other = getFirestore({ uid: 'admin1' });
      await assertFails(setDoc(doc(other, 'users', 'u1', 'pushDevices', 'd-new'), expo));
      await assertFails(getDoc(doc(other, 'users', 'u1', 'pushDevices', 'd-expo')));
      await assertFails(deleteDoc(doc(other, 'users', 'u1', 'pushDevices', 'd-expo')));
      await assertFails(setDoc(doc(getFirestore(), 'users', 'u1', 'pushDevices', 'd-anon'), expo));
    });

    it('PD4: a device must be a well-formed Expo token or Web Push subscription', async () => {
      const db = getFirestore({ uid: 'u1' });
      const put = (data: Record<string, unknown>) => setDoc(doc(db, 'users', 'u1', 'pushDevices', 'd1'), data);
      await assertFails(put({ ...expo, kind: 'sms' }));
      await assertFails(put({ ...expo, token: 'x'.repeat(201) }));
      await assertFails(put({ ...web, endpoint: 'http://insecure.example/push' }));
      await assertFails(put({ ...web, keys: { p256dh: 'BPk' } }));
      await assertFails(put({ ...expo, extra: true }));
    });

    it('PD5: the dispatcher bookkeeping collections are closed to clients', async () => {
      const db = getFirestore({ uid: 'u1' });
      await assertFails(getDoc(doc(db, 'pushThrottle', 'u1')));
      await assertFails(setDoc(doc(db, 'pushSink', 's1'), { uid: 'u1' }));
    });
  });

  describe('Translations Cache Collection (cut with Spanish)', () => {
    it('TR1: the translations collection is closed to clients', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'admin1'), { role: 'admin', approved: true });
        await setDoc(doc(context.firestore(), 'translations', 'hash123'), { hash: 'hash123' });
      });

      const db = getFirestore({ uid: 'admin1' });
      await assertFails(getDoc(doc(db, 'translations', 'hash123')));
      await assertFails(setDoc(doc(db, 'translations', 'hash123'), { hash: 'hash123' }));
    });
  });

  describe('Bible Study Meetings Collection (Issue #774)', () => {
    const seedMeetingUsers = async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'admin1'), { role: 'admin', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'trainee1'), { role: 'manager', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'student1'), { role: 'operator', approved: true });
        await setDoc(doc(context.firestore(), 'users', 'viewer1'), { role: 'viewer', approved: true });
      });
    };

    it('BS1: unauthenticated read of a published Meeting succeeds', async () => {
      await seedMeetingUsers();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'bible_study_meetings', 'romans-wk1'), {
          studyId: 'romans',
          date: '2026-09-10',
          title: 'Where peace starts',
          published: true,
          md: '## Where peace starts',
        });
      });

      const unauthDb = getFirestore();
      await assertSucceeds(getDoc(doc(unauthDb, 'bible_study_meetings', 'romans-wk1')));
    });

    it('BS2: unauthenticated read of a draft Meeting is denied', async () => {
      await seedMeetingUsers();
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'bible_study_meetings', 'romans-wk2-draft'), {
          studyId: 'romans',
          date: '2026-09-17',
          title: 'Draft Week',
          published: false,
          md: '## Draft',
        });
      });

      const unauthDb = getFirestore();
      await assertFails(getDoc(doc(unauthDb, 'bible_study_meetings', 'romans-wk2-draft')));

      // Staff (admin) CAN read the draft
      const adminDb = getFirestore({ uid: 'admin1' });
      await assertSucceeds(getDoc(doc(adminDb, 'bible_study_meetings', 'romans-wk2-draft')));
    });

    it('BS3: unauthenticated write of any kind to any path in the collection is denied', async () => {
      const unauthDb = getFirestore();
      await assertFails(setDoc(doc(unauthDb, 'bible_study_meetings', 'romans-wk1'), {
        studyId: 'romans',
        date: '2026-09-10',
        title: 'Hacked',
        published: true,
      }));
    });

    it('BS4: non-Full-timer (Trainee/Student/Viewer) cannot publish or write', async () => {
      await seedMeetingUsers();
      const traineeDb = getFirestore({ uid: 'trainee1' });
      const studentDb = getFirestore({ uid: 'student1' });
      const viewerDb = getFirestore({ uid: 'viewer1' });

      await assertFails(setDoc(doc(traineeDb, 'bible_study_meetings', 'romans-wk1'), {
        studyId: 'romans',
        date: '2026-09-10',
        title: 'Trainee Write',
        published: true,
      }));
      await assertFails(setDoc(doc(studentDb, 'bible_study_meetings', 'romans-wk1'), {
        studyId: 'romans',
        date: '2026-09-10',
        title: 'Student Write',
        published: true,
      }));
      await assertFails(setDoc(doc(viewerDb, 'bible_study_meetings', 'romans-wk1'), {
        studyId: 'romans',
        date: '2026-09-10',
        title: 'Viewer Write',
        published: true,
      }));
    });

    it('BS5: Full-timer (admin) can create, update, and publish Meetings', async () => {
      await seedMeetingUsers();
      const adminDb = getFirestore({ uid: 'admin1' });
      await assertSucceeds(setDoc(doc(adminDb, 'bible_study_meetings', 'romans-wk1'), {
        studyId: 'romans',
        date: '2026-09-10',
        title: 'Where peace starts',
        published: true,
        md: '## Where peace starts',
      }));

      await assertSucceeds(updateDoc(doc(adminDb, 'bible_study_meetings', 'romans-wk1'), {
        title: 'Where peace starts (revised)',
      }));
    });

    it('BS6: standing guard — unauthenticated read of Board documents is still denied', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'board_docs', 'doc-team-pastoral'), {
          date: '2026-09-10',
          title: 'Pastoral Coordination Notes',
          md: 'Confidential pastoral notes',
          audience: 'team',
        });
      });

      const unauthDb = getFirestore();
      await assertFails(getDoc(doc(unauthDb, 'board_docs', 'doc-team-pastoral')));
    });

    it('BS7: a Meeting document carrying the removed siblingId field is still valid (issue #858)', async () => {
      await seedMeetingUsers();
      const adminDb = getFirestore({ uid: 'admin1' });
      // siblingId was removed from validation; legacy documents that carry it
      // must remain readable and writable.
      await assertSucceeds(setDoc(doc(adminDb, 'bible_study_meetings', 'romans-legacy'), {
        studyId: 'romans',
        date: '2026-09-10',
        title: 'Legacy field document',
        published: true,
        siblingId: 'romans-wk2',
      }));
      await assertSucceeds(getDoc(doc(adminDb, 'bible_study_meetings', 'romans-legacy')));
    });

    it('BS8: a published Meeting cannot be hard-deleted; an unpublished one can (issue #859)', async () => {
      await seedMeetingUsers();
      const adminDb = getFirestore({ uid: 'admin1' });
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'bible_study_meetings', 'romans-pub'), {
          studyId: 'romans', date: '2026-09-10', title: 'Published', published: true,
        });
        await setDoc(doc(db, 'bible_study_meetings', 'romans-draft'), {
          studyId: 'romans', date: '2026-09-17', title: 'Draft', published: false,
        });
      });

      // Published: unpublish first — two deliberate acts, enforced here.
      await assertFails(deleteDoc(doc(adminDb, 'bible_study_meetings', 'romans-pub')));
      await assertSucceeds(deleteDoc(doc(adminDb, 'bible_study_meetings', 'romans-draft')));
    });

    it('EP1: a Study and an Entry point are publicly readable (issue #859)', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await setDoc(doc(db, 'bible_study_studies', 'romans-fall26'), {
          title: 'Romans', term: 'Fall 2026',
        });
        await setDoc(doc(db, 'bible_study_entry_points', 'cisa-wednesday'), {
          slug: 'cisa-wednesday', name: 'Wednesday Bible Study', activeStudyId: 'romans-fall26',
        });
      });

      const unauthDb = getFirestore();
      await assertSucceeds(getDoc(doc(unauthDb, 'bible_study_studies', 'romans-fall26')));
      await assertSucceeds(getDoc(doc(unauthDb, 'bible_study_entry_points', 'cisa-wednesday')));
    });

    it('EP2: anonymous and non-Full-timer writes to Studies and Entry points are denied (issue #859)', async () => {
      const unauthDb = getFirestore();
      await assertFails(setDoc(doc(unauthDb, 'bible_study_studies', 'evil-study'), {
        title: 'Evil', term: 'Now',
      }));
      await assertFails(setDoc(doc(unauthDb, 'bible_study_entry_points', 'evil'), {
        slug: 'evil', name: 'Evil', activeStudyId: null,
      }));

      await seedMeetingUsers();
      const traineeDb = getFirestore({ uid: 'trainee1' });
      await assertFails(setDoc(doc(traineeDb, 'bible_study_entry_points', 'evil'), {
        slug: 'evil', name: 'Evil', activeStudyId: null,
      }));
    });

    it('EP3: a Full-timer can create and update Studies and Entry points (issue #859)', async () => {
      await seedMeetingUsers();
      const adminDb = getFirestore({ uid: 'admin1' });
      await assertSucceeds(setDoc(doc(adminDb, 'bible_study_studies', 'romans-fall26'), {
        title: 'Romans', term: 'Fall 2026',
      }));
      await assertSucceeds(setDoc(doc(adminDb, 'bible_study_entry_points', 'cisa-wednesday'), {
        slug: 'cisa-wednesday', name: 'Wednesday Bible Study', activeStudyId: 'romans-fall26',
      }));
      // Starting the next term is a change of which Study is active — the
      // slug never changes.
      await assertSucceeds(updateDoc(doc(adminDb, 'bible_study_entry_points', 'cisa-wednesday'), {
        activeStudyId: 'john-spring27',
      }));
      // An Entry point with no active Study (between terms) is valid too.
      await assertSucceeds(updateDoc(doc(adminDb, 'bible_study_entry_points', 'cisa-wednesday'), {
        activeStudyId: null,
      }));
    });

    it('EP4: the Entry point slug must match its document id (issue #859)', async () => {
      await seedMeetingUsers();
      const adminDb = getFirestore({ uid: 'admin1' });
      await assertFails(setDoc(doc(adminDb, 'bible_study_entry_points', 'not-the-slug'), {
        slug: 'different', name: 'Mismatched', activeStudyId: null,
      }));
    });

    it('EP5: a Full-timer can delete an Entry point; trainees and unauth are denied', async () => {
      await seedMeetingUsers();
      const unauthDb = getFirestore(null);
      const traineeDb = getFirestore({ uid: 'trainee1' });
      const adminDb = getFirestore({ uid: 'admin1' });

      await testEnv.withSecurityRulesDisabled(async (c) => {
        await setDoc(doc(c.firestore(), 'bible_study_entry_points', 'to-delete'), {
          slug: 'to-delete', name: 'To Delete', activeStudyId: null,
        });
      });

      await assertFails(deleteDoc(doc(unauthDb, 'bible_study_entry_points', 'to-delete')));
      await assertFails(deleteDoc(doc(traineeDb, 'bible_study_entry_points', 'to-delete')));
      await assertSucceeds(deleteDoc(doc(adminDb, 'bible_study_entry_points', 'to-delete')));
    });
  });

  describe('Feedback Notes — the submitter reads their own (ADR 0019)', () => {
    const seedFeedbackUsers = async () => {
      await testEnv.withSecurityRulesDisabled(async (c) => {
        await setDoc(doc(c.firestore(), 'users', 'ft1'), { role: 'admin', approved: true });
        await setDoc(doc(c.firestore(), 'users', 'student1'), { role: 'viewer', approved: true });
        await setDoc(doc(c.firestore(), 'users', 'student2'), { role: 'viewer', approved: true });
      });
    };

    const seedNote = async (id: string, userId: string, over: Record<string, unknown> = {}) => {
      await testEnv.withSecurityRulesDisabled(async (c) => {
        await setDoc(doc(c.firestore(), 'feedback', id), {
          userId,
          userName: 'A Student',
          type: 'enhancement',
          kind: 'idea',
          message: 'It would help if the roster remembered walk-ins.',
          status: 'new',
          archived: false,
          createdAt: new Date(),
          ...over,
        });
      });
    };

    const seedFollowUp = async (noteId: string, replyId: string, over: Record<string, unknown> = {}) => {
      await testEnv.withSecurityRulesDisabled(async (c) => {
        await setDoc(doc(c.firestore(), 'feedback', noteId, 'replies', replyId), {
          authorRole: 'team',
          body: 'We are looking at this.',
          createdAt: new Date(),
          ...over,
        });
      });
    };
    it('FB1: a submitter can read their own Note', async () => {
      await seedFeedbackUsers();
      await seedNote('note1', 'student1');
      const db = getFirestore({ uid: 'student1', email: 'student1@test.com' });
      await assertSucceeds(getDoc(doc(db, 'feedback', 'note1')));
    });

    it("FB2: a submitter cannot read someone else's Note", async () => {
      await seedFeedbackUsers();
      await seedNote('note1', 'student1');
      const db = getFirestore({ uid: 'student2', email: 'student2@test.com' });
      await assertFails(getDoc(doc(db, 'feedback', 'note1')));
    });

    it('FB3: a submitter can list their own Notes when the query is filtered to them', async () => {
      await seedFeedbackUsers();
      await seedNote('note1', 'student1');
      await seedNote('note2', 'student2');
      const db = getFirestore({ uid: 'student1', email: 'student1@test.com' });
      await assertSucceeds(getDocs(query(collection(db, 'feedback'), where('userId', '==', 'student1'))));
    });

    it('FB4: an unfiltered list stays refused — the owner read is not a collection read', async () => {
      await seedFeedbackUsers();
      await seedNote('note1', 'student1');
      const db = getFirestore({ uid: 'student1', email: 'student1@test.com' });
      await assertFails(getDocs(collection(db, 'feedback')));
    });

    it("FB5: a submitter cannot query another person's Notes by filtering to them", async () => {
      await seedFeedbackUsers();
      await seedNote('note2', 'student2');
      const db = getFirestore({ uid: 'student1', email: 'student1@test.com' });
      await assertFails(getDocs(query(collection(db, 'feedback'), where('userId', '==', 'student2'))));
    });

    it('FB6: a submitter can neither retriage nor delete their own Note', async () => {
      await seedFeedbackUsers();
      await seedNote('note1', 'student1');
      const db = getFirestore({ uid: 'student1', email: 'student1@test.com' });
      await assertFails(updateDoc(doc(db, 'feedback', 'note1'), { status: 'resolved' }));
      await assertFails(deleteDoc(doc(db, 'feedback', 'note1')));
    });

    it('FB7: a Full-timer still reads the whole queue', async () => {
      await seedFeedbackUsers();
      await seedNote('note1', 'student1');
      await seedNote('note2', 'student2');
      const db = getFirestore({ uid: 'ft1', email: 'ft1@test.com' });
      await assertSucceeds(getDocs(collection(db, 'feedback')));
    });

    // Follow-ups are cut (cut-or-keep §15): the rules match is gone, so the
    // thread is unreadable and unwritable from every client. Stored replies
    // stay where they are.
    it('FB8: Follow-ups are unreadable and unwritable now that mirroring is cut', async () => {
      await seedFeedbackUsers();
      await seedNote('note1', 'student1');
      await seedFollowUp('note1', 'reply1');
      const authorDb = getFirestore({ uid: 'student1', email: 'student1@test.com' });
      const ftDb = getFirestore({ uid: 'ft1', email: 'ft1@test.com' });
      const reply = { authorRole: 'submitter', body: 'Any news?', createdAt: new Date() };

      await assertFails(getDocs(collection(authorDb, 'feedback', 'note1', 'replies')));
      await assertFails(getDoc(doc(ftDb, 'feedback', 'note1', 'replies', 'reply1')));
      await assertFails(setDoc(doc(authorDb, 'feedback', 'note1', 'replies', 'r1'), reply));
      await assertFails(setDoc(doc(ftDb, 'feedback', 'note1', 'replies', 'r2'), reply));
      await assertFails(updateDoc(doc(ftDb, 'feedback', 'note1', 'replies', 'reply1'), { body: 'edited' }));
      await assertFails(deleteDoc(doc(ftDb, 'feedback', 'note1', 'replies', 'reply1')));
    });
  });

  describe('Attendance Sync Intake', () => {
    const seedSyncUsers = async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'users', 'sync-ft'), { role: 'admin', approved: true });
        await setDoc(doc(adminDb, 'users', 'sync-trainee'), { role: 'manager', approved: true });
        await setDoc(doc(adminDb, 'pending_attendance_imports', 'p1'), { status: 'pending', attdEventId: 'e1' });
        await setDoc(doc(adminDb, 'attendee_aliases', 'a1'), { contactId: 'c1', attdMemberId: 'm1' });
        await setDoc(doc(adminDb, 'integrations_attd_event_mappings', 'e1'), { rhythmId: 'r1' });
        await setDoc(doc(adminDb, 'settings', 'integrations'), {
          attdSyncToken: 'secret',
          attdSyncTokenHash: 'a'.repeat(64),
        });
      });
    };

    it('lets a Full-timer read staged imports, aliases, and mappings but not a Trainee', async () => {
      await seedSyncUsers();
      const adminDb = getFirestore({ uid: 'sync-ft', email: 'sync-ft@test.com' });
      const traineeDb = getFirestore({ uid: 'sync-trainee', email: 'sync-trainee@test.com' });
      await assertSucceeds(getDoc(doc(adminDb, 'pending_attendance_imports', 'p1')));
      await assertSucceeds(getDoc(doc(adminDb, 'attendee_aliases', 'a1')));
      await assertSucceeds(getDoc(doc(adminDb, 'integrations_attd_event_mappings', 'e1')));
      await assertFails(getDoc(doc(traineeDb, 'pending_attendance_imports', 'p1')));
      await assertFails(getDoc(doc(traineeDb, 'attendee_aliases', 'a1')));
      await assertFails(getDoc(doc(traineeDb, 'integrations_attd_event_mappings', 'e1')));
    });

    // The GroupMe channel is cut (cut-or-keep §26): no rules match, so neither
    // role may read or write the alias collection. Existing documents stay.
    it('denies groupme_aliases to every role now that the channel is cut', async () => {
      await seedSyncUsers();
      const adminDb = getFirestore({ uid: 'sync-ft', email: 'sync-ft@test.com' });
      const traineeDb = getFirestore({ uid: 'sync-trainee', email: 'sync-trainee@test.com' });

      await assertFails(setDoc(doc(adminDb, 'groupme_aliases', 'gm-sender-1'), {
        senderId: 'gm-sender-1',
        userId: 'sync-trainee',
        name: 'Trainee Sam',
      }));
      await assertFails(getDoc(doc(adminDb, 'groupme_aliases', 'gm-sender-1')));
      await assertFails(setDoc(doc(traineeDb, 'groupme_aliases', 'gm-sender-2'), {
        senderId: 'gm-sender-2',
        userId: 'sync-trainee',
        name: 'Trainee Sam',
      }));
      await assertFails(getDoc(doc(traineeDb, 'groupme_aliases', 'gm-sender-1')));
    });

    // The webhook console is cut (cut-or-keep §26): its log collection has no
    // rules match, so not even a Full-timer may read it back from a client.
    it('denies webhook_logs to every role now that the console is cut', async () => {
      await seedSyncUsers();
      const adminDb = getFirestore({ uid: 'sync-ft', email: 'sync-ft@test.com' });
      const traineeDb = getFirestore({ uid: 'sync-trainee', email: 'sync-trainee@test.com' });

      await assertFails(getDocs(collection(adminDb, 'webhook_logs')));
      await assertFails(setDoc(doc(adminDb, 'webhook_logs', 'l1'), { source: 'SMS' }));
      await assertFails(getDoc(doc(traineeDb, 'webhook_logs', 'l1')));
    });

    it('keeps the sync token private to Full-timers', async () => {
      await seedSyncUsers();
      const adminDb = getFirestore({ uid: 'sync-ft', email: 'sync-ft@test.com' });
      const traineeDb = getFirestore({ uid: 'sync-trainee', email: 'sync-trainee@test.com' });
      await assertSucceeds(getDoc(doc(adminDb, 'settings', 'integrations')));
      await assertFails(getDoc(doc(traineeDb, 'settings', 'integrations')));
    });

    it('stores the attendance sync credential as a hash and refuses a malformed one (#1966)', async () => {
      await seedSyncUsers();
      const adminDb = getFirestore({ uid: 'sync-ft', email: 'sync-ft@test.com' });
      const traineeDb = getFirestore({ uid: 'sync-trainee', email: 'sync-trainee@test.com' });
      const ref = doc(adminDb, 'settings', 'integrations');

      // The hash branch of ADR 0052: 64 lowercase hex characters, rotated by a
      // Full-timer, with the legacy plaintext field still present for now.
      await assertSucceeds(updateDoc(ref, { attdSyncTokenHash: 'b'.repeat(64) }));
      // Not a digest: too short, mixed case, or not hex at all.
      await assertFails(updateDoc(ref, { attdSyncTokenHash: 'b'.repeat(63) }));
      await assertFails(updateDoc(ref, { attdSyncTokenHash: 'B'.repeat(64) }));
      await assertFails(updateDoc(ref, { attdSyncTokenHash: 'z'.repeat(64) }));
      // Nor does the hash open the document to an arbitrary credential key.
      await assertFails(updateDoc(ref, { attdSyncTokenHash: 'b'.repeat(64), evil: true }));
      // A Trainee cannot rotate the credential either.
      await assertFails(updateDoc(doc(traineeDb, 'settings', 'integrations'), {
        attdSyncTokenHash: 'c'.repeat(64),
      }));
    });

    it('lets a Full-timer resolve an import in a client batch', async () => {
      await seedSyncUsers();
      const adminDb = getFirestore({ uid: 'sync-ft', email: 'sync-ft@test.com' });
      await assertSucceeds(updateDoc(doc(adminDb, 'pending_attendance_imports', 'p1'), { status: 'confirmed' }));
      await assertSucceeds(setDoc(doc(adminDb, 'attendee_aliases', 'a2'), { contactId: 'c2', attdMemberId: 'm2' }));
      await assertSucceeds(setDoc(doc(adminDb, 'integrations_attd_event_mappings', 'e2'), { rhythmId: 'r2' }));
    });
  });

  // The credential vault (ADR 0051, #1966): ciphertext for Full-timers, the
  // meta singleton the key is derived from, and an append-only audit log. The
  // denials are the assertions — they are the whole boundary.
  describe('Credential vault and audit log (#1966)', () => {
    const seedVaultUsers = async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await setDoc(doc(adminDb, 'users', 'vault-ft'), { role: 'admin', approved: true });
        await setDoc(doc(adminDb, 'users', 'vault-trainee'), { role: 'manager', approved: true });
        await setDoc(doc(adminDb, 'users', 'vault-student'), { role: 'operator', approved: true });
        await setDoc(doc(adminDb, 'users', 'vault-community'), { role: 'viewer', approved: true });
      });
    };

    const fullTimer = () => getFirestore({ uid: 'vault-ft', email: 'vault-ft@test.com' });

    const outsiderDbs = () => [
      getFirestore({ uid: 'vault-trainee', email: 'vault-trainee@test.com' }),
      getFirestore({ uid: 'vault-student', email: 'vault-student@test.com' }),
      getFirestore({ uid: 'vault-community', email: 'vault-community@test.com' }),
    ];

    // What the browser writes: a random salt, the PBKDF2 cost, the check value
    // and a schema version, stamped by the request.
    const meta = () => ({
      salt: 'c2FsdA==',
      iterations: 600000,
      check: 'Y2hlY2s=',
      schemaVersion: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // One encrypted JSON blob per entry — never a plaintext field.
    const credential = (over: Record<string, unknown> = {}) => ({
      iv: 'aXY=',
      ciphertext: 'Y2lwaGVydGV4dA==',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...over,
    });

    const auditEntry = (over: Record<string, unknown> = {}) => ({
      actorUid: 'vault-ft',
      credentialId: 'cred-1',
      action: 'reveal',
      field: null,
      createdAt: serverTimestamp(),
      ...over,
    });

    it('a Full-timer writes and rekeys the credential metadata singleton', async () => {
      await seedVaultUsers();
      const db = fullTimer();
      const ref = doc(db, 'credentialsMeta', 'current');
      await assertSucceeds(setDoc(ref, meta()));
      await assertSucceeds(getDoc(ref));
      // A rekey: new salt and check, both stamps from the request.
      await assertSucceeds(updateDoc(ref, {
        salt: 'bmV3c2FsdA==',
        check: 'bmV3Y2hlY2s=',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }));
    });

    it('keeps credential metadata to Full-timers and to the one current document', async () => {
      await seedVaultUsers();
      const db = fullTimer();
      await assertSucceeds(setDoc(doc(db, 'credentialsMeta', 'current'), meta()));
      for (const other of outsiderDbs()) {
        await assertFails(getDoc(doc(other, 'credentialsMeta', 'current')));
        await assertFails(setDoc(doc(other, 'credentialsMeta', 'current'), meta()));
      }
      await assertFails(setDoc(doc(db, 'credentialsMeta', 'other'), meta()));
      // A write that omits the stamps keeps the stored ones and is refused.
      await assertFails(updateDoc(doc(db, 'credentialsMeta', 'current'), { salt: 'bmV3' }));
      await assertFails(setDoc(doc(db, 'credentialsMeta', 'current'), {
        ...meta(),
        createdAt: new Date('2020-01-01'),
      }));
      await assertFails(deleteDoc(doc(db, 'credentialsMeta', 'current')));
    });

    it('a Full-timer stores and edits a credential entry as ciphertext only', async () => {
      await seedVaultUsers();
      const db = fullTimer();
      const ref = doc(db, 'credentials', 'cred-1');
      await assertSucceeds(setDoc(ref, credential()));
      await assertSucceeds(getDoc(ref));
      await assertSucceeds(getDocs(collection(db, 'credentials')));
      await assertSucceeds(updateDoc(ref, {
        iv: 'bmV3aXY=',
        ciphertext: 'bmV3',
        updatedAt: serverTimestamp(),
      }));
    });

    it('refuses a credential entry that carries a plaintext field', async () => {
      await seedVaultUsers();
      const db = fullTimer();
      for (const plaintext of [
        { label: 'Ministry account' },
        { username: 'team@example.com' },
        { password: 'hunter2' },
      ]) {
        await assertFails(setDoc(doc(db, 'credentials', 'cred-plain'), credential(plaintext)));
      }
      // Neither can a later edit add one back.
      const ref = doc(db, 'credentials', 'cred-1');
      await assertSucceeds(setDoc(ref, credential()));
      await assertFails(updateDoc(ref, { label: 'Ministry account', updatedAt: serverTimestamp() }));
    });

    it('refuses a credential edit whose updatedAt does not advance', async () => {
      await seedVaultUsers();
      const ref = doc(fullTimer(), 'credentials', 'cred-1');
      await assertSucceeds(setDoc(ref, credential()));
      // Dirty Dozen #12: the edit lands without its stamp.
      await assertFails(updateDoc(ref, { ciphertext: 'bmV3' }));
      await assertFails(updateDoc(ref, { ciphertext: 'bmV3', updatedAt: new Date('2020-01-01') }));
      // createdAt is frozen at creation.
      await assertFails(updateDoc(ref, {
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }));
    });

    it('refuses an oversized credential iv or ciphertext', async () => {
      await seedVaultUsers();
      const db = fullTimer();
      await assertFails(setDoc(doc(db, 'credentials', 'cred-big-iv'), credential({ iv: 'a'.repeat(65) })));
      await assertFails(setDoc(doc(db, 'credentials', 'cred-big-ct'), credential({ ciphertext: 'a'.repeat(700001) })));
    });

    it('denies a Trainee, Student and Community the credential entries', async () => {
      await seedVaultUsers();
      await assertSucceeds(setDoc(doc(fullTimer(), 'credentials', 'cred-1'), credential()));
      for (const db of outsiderDbs()) {
        await assertFails(getDoc(doc(db, 'credentials', 'cred-1')));
        await assertFails(getDocs(collection(db, 'credentials')));
        await assertFails(setDoc(doc(db, 'credentials', 'cred-2'), credential()));
      }
    });

    it('a Full-timer appends to the credential audit log and reads it back', async () => {
      await seedVaultUsers();
      const db = fullTimer();
      await assertSucceeds(setDoc(doc(db, 'credentialAudit', 'aud-1'), auditEntry()));
      await assertSucceeds(setDoc(doc(db, 'credentialAudit', 'aud-2'), auditEntry({
        credentialId: 'attd-sync-token',
        action: 'rotate',
        field: 'attdSyncTokenHash',
      })));
      await assertSucceeds(getDoc(doc(db, 'credentialAudit', 'aud-1')));
      const all = await assertSucceeds(getDocs(collection(db, 'credentialAudit')));
      expect(all.size).toBe(2);
    });

    it('keeps the credential audit log append-only, even for a Full-timer', async () => {
      await seedVaultUsers();
      const db = fullTimer();
      await assertSucceeds(setDoc(doc(db, 'credentialAudit', 'aud-1'), auditEntry()));
      await assertFails(updateDoc(doc(db, 'credentialAudit', 'aud-1'), { action: 'copy' }));
      await assertFails(deleteDoc(doc(db, 'credentialAudit', 'aud-1')));
      // A setDoc onto an existing id is an update, so it is refused too.
      await assertFails(setDoc(doc(db, 'credentialAudit', 'aud-1'), auditEntry({ action: 'copy' })));
    });

    it('refuses a credential audit entry that spoofs the actor, the action or the time', async () => {
      await seedVaultUsers();
      const db = fullTimer();
      const write = (id: string, over: Record<string, unknown>) =>
        setDoc(doc(db, 'credentialAudit', id), auditEntry(over));
      await assertFails(write('aud-uid', { actorUid: 'vault-trainee' }));
      await assertFails(write('aud-action', { action: 'read' }));
      await assertFails(write('aud-time', { createdAt: new Date('2020-01-01') }));
      await assertFails(write('aud-field', { field: 42 }));
      await assertFails(write('aud-ghost', { userId: 'vault-ft' }));
      // The allowed shape still lands, including the optional field.
      await assertSucceeds(write('aud-ok', { action: 'copy', field: 'password' }));
    });

    it('denies a Trainee, Student and Community the credential audit log', async () => {
      await seedVaultUsers();
      await assertSucceeds(setDoc(doc(fullTimer(), 'credentialAudit', 'aud-1'), auditEntry()));
      for (const db of outsiderDbs()) {
        await assertFails(getDoc(doc(db, 'credentialAudit', 'aud-1')));
        await assertFails(getDocs(collection(db, 'credentialAudit')));
        await assertFails(setDoc(doc(db, 'credentialAudit', 'aud-2'), auditEntry()));
      }
    });
  });

  // The kind of person (#1152, ADR 0030). Its own branch, Full-timers only —
  // and the branch must not be mixable with the ordinary profile edit, or a
  // Trainee could smuggle the kind through the operator branch.
  describe('Contact kind (inChurchLife / isStudent)', () => {
    const seedKind = async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const fs = context.firestore();
        await setDoc(doc(fs, 'users', 'ft1'), { role: 'admin', approved: true });
        await setDoc(doc(fs, 'users', 'tr1'), { role: 'manager', approved: true });
        await setDoc(doc(fs, 'contacts', 'k1'), {
          name: 'Kind Test', email: 'kind@example.com',
          createdBy: 'tr1', coCreators: [], carers: [], visibleTo: ['ft1', 'tr1'],
        });
      });
    };
    const stamp = (uid: string) => ({
      kindSetBy: uid, kindSetAt: '2026-09-23T00:00:00.000Z',
      updatedAt: serverTimestamp(), updatedBy: uid, updatedByName: uid,
    });

    it('lets a Full-timer set the kind', async () => {
      await seedKind();
      const db = getFirestore({ uid: 'ft1', email: 'ft1@test.com' });
      await assertSucceeds(updateDoc(doc(db, 'contacts', 'k1'), {
        inChurchLife: true, isStudent: false, ...stamp('ft1'),
      }));
    });

    it('lets a Full-timer re-set a kind they already stamped (bulk-set case)', async () => {
      // A bulk-set often includes people the Full-timer already sorted, so
      // `kindSetBy` is written with the same value and is absent from
      // `affectedKeys()`. The branch must accept presence, not change.
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const fs = context.firestore();
        await setDoc(doc(fs, 'users', 'ft1'), { role: 'admin', approved: true });
        await setDoc(doc(fs, 'contacts', 'k9'), {
          name: 'Already Ours', email: 'ours@example.com',
          inChurchLife: true, isStudent: true,
          kindSetBy: 'ft1', kindSetAt: '2026-09-01T00:00:00.000Z',
          createdBy: 'ft1', coCreators: [], carers: [], visibleTo: ['ft1'],
        });
      });
      const db = getFirestore({ uid: 'ft1', email: 'ft1@test.com' });
      await assertSucceeds(updateDoc(doc(db, 'contacts', 'k9'), {
        inChurchLife: false, ...stamp('ft1'),
      }));
    });

    it('refuses a kind attributed to somebody other than the caller', async () => {
      await seedKind();
      const db = getFirestore({ uid: 'ft1', email: 'ft1@test.com' });
      await assertFails(updateDoc(doc(db, 'contacts', 'k1'), {
        inChurchLife: true, isStudent: false,
        kindSetBy: 'tr1', kindSetAt: '2026-09-23T00:00:00.000Z',
        updatedAt: serverTimestamp(), updatedBy: 'ft1', updatedByName: 'ft1',
      }));
    });

    it('refuses a Trainee', async () => {
      await seedKind();
      const db = getFirestore({ uid: 'tr1', email: 'tr1@test.com' });
      await assertFails(updateDoc(doc(db, 'contacts', 'k1'), {
        inChurchLife: true, isStudent: false, ...stamp('tr1'),
      }));
    });

    it('refuses the kind mixed into an ordinary profile edit', async () => {
      await seedKind();
      const db = getFirestore({ uid: 'ft1', email: 'ft1@test.com' });
      await assertFails(updateDoc(doc(db, 'contacts', 'k1'), {
        notes: 'changed', inChurchLife: true, ...stamp('ft1'),
      }));
    });

    it('refuses a non-boolean kind', async () => {
      await seedKind();
      const db = getFirestore({ uid: 'ft1', email: 'ft1@test.com' });
      await assertFails(updateDoc(doc(db, 'contacts', 'k1'), {
        inChurchLife: 'yes', isStudent: false, ...stamp('ft1'),
      }));
    });

    it('still lets a Trainee make an ordinary profile edit (expression budget)', async () => {
      await seedKind();
      const db = getFirestore({ uid: 'tr1', email: 'tr1@test.com' });
      await assertSucceeds(updateDoc(doc(db, 'contacts', 'k1'), {
        notes: 'an ordinary edit', updatedAt: serverTimestamp(),
        updatedBy: 'tr1', updatedByName: 'Tr One',
      }));
    });

    it('refuses an unstamped kind — a kind is never set without saying who decided it', async () => {
      await seedKind();
      const db = getFirestore({ uid: 'ft1', email: 'ft1@test.com' });
      await assertFails(updateDoc(doc(db, 'contacts', 'k1'), {
        inChurchLife: true,
        updatedAt: serverTimestamp(), updatedBy: 'ft1', updatedByName: 'ft1',
      }));
    });

    it('refuses a Trainee asserting membership on create', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'tr1'), { role: 'manager', approved: true });
      });
      const db = getFirestore({ uid: 'tr1', email: 'tr1@test.com' });
      await assertFails(setDoc(doc(db, 'contacts', 'k3'), {
        name: 'Smuggled', email: 's@example.com', inChurchLife: true,
      }));
    });

    it('refuses a self-attributed stamp on create', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'tr1'), { role: 'manager', approved: true });
      });
      const db = getFirestore({ uid: 'tr1', email: 'tr1@test.com' });
      await assertFails(setDoc(doc(db, 'contacts', 'k4'), {
        name: 'Stamped', email: 'st@example.com',
        kindSetBy: 'tr1', kindSetAt: '2026-09-24T00:00:00.000Z',
      }));
    });

    it('still lets the public sign-up form create a student who is not in the church life', async () => {
      const db = getFirestore();
      await assertSucceeds(setDoc(doc(db, 'contacts', 'k5'), {
        name: 'Sign Up', email: 'su@example.com', isStudent: true, inChurchLife: false,
      }));
    });

    it('accepts the kind fields on create', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'users', 'ft1'), { role: 'admin', approved: true });
      });
      const db = getFirestore({ uid: 'ft1', email: 'ft1@test.com' });
      await assertSucceeds(setDoc(doc(db, 'contacts', 'k2'), {
        name: 'New Person', email: 'new@example.com', inChurchLife: false, isStudent: true,
      }));
    });
  });

  // Moving up a year (#1351). Confirming a year carries a marker of who
  // confirmed it and for which school year; graduating is a kind decision. Both
  // are a Full-timer's alone.
  describe('Moving up a year', () => {
    const seedStudent = async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const fs = context.firestore();
        await setDoc(doc(fs, 'users', 'ft1'), { role: 'admin', approved: true });
        await setDoc(doc(fs, 'users', 'tr1'), { role: 'manager', approved: true });
        await setDoc(doc(fs, 'contacts', 'y1'), {
          name: 'Year Test', email: 'year@example.com',
          inChurchLife: true, isStudent: true, year: 'Senior',
          kindSetBy: 'ft0', kindSetAt: '2025-09-01T00:00:00.000Z',
          yearConfirmedFor: '2025-26', yearConfirmedBy: 'ft0', yearConfirmedAt: '2025-08-02T00:00:00.000Z',
          createdBy: 'tr1', coCreators: [], carers: [], visibleTo: ['ft1', 'tr1'],
        });
      });
    };
    const updated = (uid: string) => ({ updatedAt: serverTimestamp(), updatedBy: uid, updatedByName: uid });
    const confirmed = (uid: string) => ({
      yearConfirmedFor: '2026-27', yearConfirmedBy: uid, yearConfirmedAt: '2026-08-03T00:00:00.000Z', ...updated(uid),
    });
    const graduated = (uid: string) => ({
      isStudent: false, year: '', kindSetBy: uid, kindSetAt: '2026-08-03T00:00:00.000Z', ...updated(uid),
    });

    it('lets a Full-timer confirm a new year', async () => {
      await seedStudent();
      const db = getFirestore({ uid: 'ft1', email: 'ft1@test.com' });
      await assertSucceeds(updateDoc(doc(db, 'contacts', 'y1'), { year: 'Graduate', ...confirmed('ft1') }));
    });

    it('lets a Full-timer confirm the same year', async () => {
      await seedStudent();
      const db = getFirestore({ uid: 'ft1', email: 'ft1@test.com' });
      await assertSucceeds(updateDoc(doc(db, 'contacts', 'y1'), confirmed('ft1')));
    });

    it('lets a Full-timer graduate someone in one write: no longer a student, stamped, no year', async () => {
      await seedStudent();
      const db = getFirestore({ uid: 'ft1', email: 'ft1@test.com' });
      await assertSucceeds(updateDoc(doc(db, 'contacts', 'y1'), graduated('ft1')));
    });

    it('refuses a Trainee confirming a year', async () => {
      await seedStudent();
      const db = getFirestore({ uid: 'tr1', email: 'tr1@test.com' });
      await assertFails(updateDoc(doc(db, 'contacts', 'y1'), { year: 'Graduate', ...confirmed('tr1') }));
    });

    it('refuses a Trainee graduating someone', async () => {
      await seedStudent();
      const db = getFirestore({ uid: 'tr1', email: 'tr1@test.com' });
      await assertFails(updateDoc(doc(db, 'contacts', 'y1'), graduated('tr1')));
    });

    it('refuses a confirmation attributed to somebody other than the caller', async () => {
      await seedStudent();
      const db = getFirestore({ uid: 'ft1', email: 'ft1@test.com' });
      await assertFails(updateDoc(doc(db, 'contacts', 'y1'), { ...confirmed('ft1'), yearConfirmedBy: 'tr1' }));
    });

    it('refuses the marker mixed into an ordinary profile edit', async () => {
      await seedStudent();
      const db = getFirestore({ uid: 'ft1', email: 'ft1@test.com' });
      await assertFails(updateDoc(doc(db, 'contacts', 'y1'), { notes: 'changed', ...confirmed('ft1') }));
    });

    it('refuses a Trainee creating someone already confirmed', async () => {
      await seedStudent();
      const db = getFirestore({ uid: 'tr1', email: 'tr1@test.com' });
      await assertFails(setDoc(doc(db, 'contacts', 'y2'), {
        name: 'Pre-confirmed', email: 'pc@example.com', isStudent: true, year: 'Junior',
        yearConfirmedFor: '2026-27', yearConfirmedBy: 'tr1', yearConfirmedAt: '2026-08-03T00:00:00.000Z',
      }));
    });
  });

  // ── BNPB interaction suggestions are cut (cut-or-keep §4) ──
  // Their code and rules are gone; the documents are left in Firestore, unread.
  // With no match the default rule closes each path to everyone, the app owner
  // included — the one account the old rules used to let in.
  describe('removed BNPB collections', () => {
    const OWNER_UID = 'owner-1';
    const OWNER_EMAIL = 'yilongwang05@gmail.com';

    const removedPaths: Array<[string, string[]]> = [
      ['interactionSuggestions', ['users', OWNER_UID, 'interactionSuggestions', 'sug-1']],
      ['suggestionLinks', ['users', OWNER_UID, 'suggestionLinks', 'link-1']],
      ['notACisaPeople', ['users', OWNER_UID, 'notACisaPeople', 'choice-1']],
      ['bnpb_sync_tokens', ['bnpb_sync_tokens', OWNER_UID]],
    ];

    it.each(removedPaths)('closes %s to the app owner', async (_name, segments) => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), segments[0], ...segments.slice(1)), { bnpbContactId: 'p-1' });
      });
      const owner = getFirestore({ uid: OWNER_UID, email: OWNER_EMAIL });
      const ref = () => doc(owner, segments[0], ...segments.slice(1));
      await assertFails(getDoc(ref()));
      await assertFails(setDoc(ref(), { bnpbContactId: 'p-2' }));
      await assertFails(deleteDoc(ref()));
    });
  });

  // ── Announcements (cut-or-keep §20) ──
  // A Full-timer posts; every approved Full-timer and Trainee reads and may say
  // Got it for themselves — and only that. Chats are gone (see CH1 above).
  describe('Announcements', () => {
    const seedAnnouncementUsers = async () => {
      await testEnv.withSecurityRulesDisabled(async (c) => {
        await setDoc(doc(c.firestore(), 'users', 'ft1'), { role: 'admin', approved: true });
        await setDoc(doc(c.firestore(), 'users', 'ft2'), { role: 'admin', approved: true });
        await setDoc(doc(c.firestore(), 'users', 'trainee1'), { role: 'manager', approved: true });
        await setDoc(doc(c.firestore(), 'users', 'trainee2'), { role: 'manager', approved: true });
        await setDoc(doc(c.firestore(), 'users', 'pending1'), { role: 'manager', approved: false });
        await setDoc(doc(c.firestore(), 'users', 'pendingft'), { role: 'admin', approved: false });
      });
    };
    const newAnnouncement = (over: Record<string, unknown> = {}) => ({
      body: 'Retreat moves to Saturday.',
      authorId: 'ft1',
      authorName: 'Mei Lin',
      createdAt: serverTimestamp(),
      gotIt: {},
      ...over,
    });
    const seedAnnouncement = async (gotIt: Record<string, unknown> = {}) => {
      await seedAnnouncementUsers();
      await testEnv.withSecurityRulesDisabled(async (c) => {
        await setDoc(doc(c.firestore(), 'announcements', 'an1'), {
          body: 'Retreat moves to Saturday.',
          authorId: 'ft1',
          authorName: 'Mei Lin',
          createdAt: new Date('2026-11-18T10:00:00Z'),
          gotIt,
        });
      });
    };
    const ref = (uid: string, id = 'an1') => doc(getFirestore({ uid }), 'announcements', id);

    it('ANN1: a Full-timer posts an announcement', async () => {
      await seedAnnouncementUsers();
      await assertSucceeds(setDoc(ref('ft1', 'new1'), newAnnouncement()));
    });

    it('ANN2: a Trainee, an unapproved Full-timer and a signed-out visitor cannot post', async () => {
      await seedAnnouncementUsers();
      await assertFails(setDoc(ref('trainee1', 'x1'), newAnnouncement({ authorId: 'trainee1' })));
      await assertFails(setDoc(ref('pendingft', 'x2'), newAnnouncement({ authorId: 'pendingft' })));
      await assertFails(setDoc(doc(getFirestore(), 'announcements', 'x3'), newAnnouncement()));
    });

    it('ANN3: a post must name its poster, keep a body of 1 to 2000 characters and start with nobody Got it', async () => {
      await seedAnnouncementUsers();
      // Written as someone else.
      await assertFails(setDoc(ref('ft1', 'b1'), newAnnouncement({ authorId: 'ft2' })));
      // Empty, and one past the limit; the limit itself is fine.
      await assertFails(setDoc(ref('ft1', 'b2'), newAnnouncement({ body: '' })));
      await assertFails(setDoc(ref('ft1', 'b3'), newAnnouncement({ body: 'x'.repeat(2001) })));
      await assertSucceeds(setDoc(ref('ft1', 'b4'), newAnnouncement({ body: 'x'.repeat(2000) })));
      // Pre-filled Got it, a client-chosen time, a stray field, a missing gotIt map.
      await assertFails(setDoc(ref('ft1', 'b5'), newAnnouncement({ gotIt: { trainee1: serverTimestamp() } })));
      await assertFails(setDoc(ref('ft1', 'b6'), newAnnouncement({ createdAt: new Date('2020-01-01T00:00:00Z') })));
      await assertFails(setDoc(ref('ft1', 'b7'), newAnnouncement({ pinned: true })));
      const { gotIt: _gotIt, ...noGotIt } = newAnnouncement();
      await assertFails(setDoc(ref('ft1', 'b8'), noGotIt));
    });

    it('ANN4: every approved Full-timer and Trainee reads announcements; an unapproved user and a visitor cannot', async () => {
      await seedAnnouncement();
      for (const uid of ['ft1', 'ft2', 'trainee1', 'trainee2']) {
        await assertSucceeds(getDoc(ref(uid)));
        await assertSucceeds(
          getDocs(query(collection(getFirestore({ uid }), 'announcements'), orderBy('createdAt', 'desc'), limit(50))),
        );
      }
      await assertFails(getDoc(ref('pending1')));
      await assertFails(getDocs(collection(getFirestore({ uid: 'pending1' }), 'announcements')));
      await assertFails(getDoc(doc(getFirestore(), 'announcements', 'an1')));
    });

    it('ANN5: any approved user may say Got it for themselves, and only for themselves', async () => {
      await seedAnnouncement();
      await assertSucceeds(updateDoc(ref('trainee1'), { 'gotIt.trainee1': serverTimestamp() }));
      await assertSucceeds(updateDoc(ref('ft2'), { 'gotIt.ft2': serverTimestamp() }));
      // Not for someone else, not for two people at once.
      await assertFails(updateDoc(ref('trainee2'), { 'gotIt.trainee1': serverTimestamp() }));
      await assertFails(
        updateDoc(ref('trainee2'), { 'gotIt.trainee2': serverTimestamp(), 'gotIt.ft1': serverTimestamp() }),
      );
      // An unapproved user cannot.
      await assertFails(updateDoc(ref('pending1'), { 'gotIt.pending1': serverTimestamp() }));
    });

    it('ANN6: Got it is a server timestamp that, once set, stays', async () => {
      await seedAnnouncement({ trainee1: new Date('2026-11-18T10:05:00Z') });
      // A client-chosen time, a second Got it, and taking it back.
      await assertFails(updateDoc(ref('trainee2'), { 'gotIt.trainee2': new Date('2020-01-01T00:00:00Z') }));
      await assertFails(updateDoc(ref('trainee1'), { 'gotIt.trainee1': serverTimestamp() }));
      await assertFails(updateDoc(ref('trainee1'), { 'gotIt.trainee1': deleteField() }));
      // Someone else's Got it cannot be wiped by a Full-timer either.
      await assertFails(updateDoc(ref('ft2'), { 'gotIt.trainee1': deleteField() }));
    });

    it('ANN7: nobody edits the body, the poster or the time — not even the poster or another Full-timer', async () => {
      await seedAnnouncement();
      for (const uid of ['ft1', 'ft2', 'trainee1']) {
        await assertFails(updateDoc(ref(uid), { body: 'Changed' }));
        await assertFails(updateDoc(ref(uid), { authorId: uid }));
        await assertFails(updateDoc(ref(uid), { createdAt: serverTimestamp() }));
        // Their own Got it together with another field is still refused.
        await assertFails(updateDoc(ref(uid), { [`gotIt.${uid}`]: serverTimestamp(), body: 'Changed' }));
      }
    });

    it('ANN8: only a Full-timer deletes an announcement', async () => {
      await seedAnnouncement();
      await assertFails(deleteDoc(ref('trainee1')));
      await assertFails(deleteDoc(ref('pendingft')));
      await assertSucceeds(deleteDoc(ref('ft2')));
    });
  });


});
