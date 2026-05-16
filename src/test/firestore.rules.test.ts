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

describe.skip('Firestore Security Rules', () => {
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
});
