import {
  collection,
  getDocs,
  deleteDoc,
  doc,
  type Firestore,
  type DocumentReference,
} from 'firebase/firestore';
import { NON_PERSON_RE } from './permissions';

export interface TargetRef {
  id: string;
  path: string;
  ref?: DocumentReference;
}

export interface PurgePlan {
  testUsers: TargetRef[];
  invitations: TargetRef[];
  personalPrayers: TargetRef[];
  interactions: TargetRef[];
  contactsCreatedByTestAccounts: TargetRef[];
  totalDeletionsCount: number;
}

/**
 * Checks whether an account is a non-person test/reviewer account
 * based on email prefix (reviewer*, cisa*) or display name match against NON_PERSON_RE.
 */
export function isTestAccount(target: {
  email?: string | null;
  displayName?: string | null;
  name?: string | null;
  uid?: string | null;
}): boolean {
  if (!target) return false;
  const email = (target.email || '').trim().toLowerCase();
  if (email.startsWith('reviewer') || email.startsWith('cisa')) {
    return true;
  }
  const name = String(target.displayName || target.name || '').trim();
  if (name) {
    if (NON_PERSON_RE.test(name)) return true;
    if (/\b(reviewer|app ?store|service account|test account)\b/i.test(name)) return true;
  }
  return false;
}

interface ScanDependencies {
  getDocs?: typeof getDocs;
  collection?: typeof collection;
}

/**
 * Discovers test account traces across Firestore:
 * - users matching isTestAccount
 * - invitations matching isTestAccount
 * - personalPrayers under each test user
 * - interactions logged by test users
 * - contacts whose createdBy matches a test user
 */
export async function scanTestAccountTraces(
  db: Firestore,
  deps?: ScanDependencies,
): Promise<PurgePlan> {
  const fetchDocs = deps?.getDocs || getDocs;
  const col = deps?.collection || collection;

  // 1. Scan users
  const usersSnap = await fetchDocs(col(db, 'users'));
  const testUsers: TargetRef[] = [];
  const testUserIds = new Set<string>();

  usersSnap.docs.forEach((d) => {
    const data = d.data();
    if (isTestAccount({ uid: d.id, ...data })) {
      testUsers.push({ id: d.id, path: d.ref?.path || `users/${d.id}`, ref: d.ref });
      testUserIds.add(d.id);
    }
  });

  // 2. Scan invitations
  const invitesSnap = await fetchDocs(col(db, 'invitations'));
  const invitations: TargetRef[] = [];
  invitesSnap.docs.forEach((d) => {
    const data = d.data();
    if (isTestAccount({ email: data.email || d.id })) {
      invitations.push({ id: d.id, path: d.ref?.path || `invitations/${d.id}`, ref: d.ref });
    }
  });

  // 3. Scan personalPrayers for test users
  const personalPrayers: TargetRef[] = [];
  for (const uid of testUserIds) {
    try {
      const prayersSnap = await fetchDocs(col(db, `users/${uid}/personalPrayers`));
      prayersSnap.docs.forEach((p) => {
        personalPrayers.push({ id: p.id, path: p.ref?.path || `users/${uid}/personalPrayers/${p.id}`, ref: p.ref });
      });
    } catch {
      // Ignore missing or forbidden subcollection reads in test environments
    }
  }

  // 4. Scan contacts and interactions
  const contactsSnap = await fetchDocs(col(db, 'contacts'));
  const contactsCreatedByTestAccounts: TargetRef[] = [];
  const interactions: TargetRef[] = [];

  for (const c of contactsSnap.docs) {
    const cData = c.data();
    if (cData.createdBy && testUserIds.has(cData.createdBy)) {
      contactsCreatedByTestAccounts.push({ id: c.id, path: c.ref?.path || `contacts/${c.id}`, ref: c.ref });
    }

    // Check interactions subcollection
    try {
      const intSnap = await fetchDocs(col(db, `contacts/${c.id}/interactions`));
      intSnap.docs.forEach((iDoc) => {
        const iData = iDoc.data();
        if (iData.userId && testUserIds.has(iData.userId)) {
          interactions.push({
            id: iDoc.id,
            path: iDoc.ref?.path || `contacts/${c.id}/interactions/${iDoc.id}`,
            ref: iDoc.ref,
          });
        }
      });
    } catch {
      // Ignore subcollection access errors
    }
  }

  const totalDeletionsCount =
    testUsers.length +
    invitations.length +
    personalPrayers.length +
    interactions.length +
    contactsCreatedByTestAccounts.length;

  return {
    testUsers,
    invitations,
    personalPrayers,
    interactions,
    contactsCreatedByTestAccounts,
    totalDeletionsCount,
  };
}

interface PurgeDependencies {
  deleteDoc?: typeof deleteDoc;
  doc?: typeof doc;
}

/**
 * Permanently deletes the discovered test account traces.
 */
export async function purgeTestAccountTraces(
  db: Firestore,
  plan: PurgePlan,
  options: {
    deleteTestContacts: boolean;
    deleteDoc?: typeof deleteDoc;
    doc?: typeof doc;
  },
): Promise<{ deletedCount: number }> {
  const executeDelete = options.deleteDoc || deleteDoc;
  const getDocRef = options.doc || doc;
  let deletedCount = 0;

  const targets: TargetRef[] = [
    ...plan.personalPrayers,
    ...plan.interactions,
    ...plan.invitations,
    ...plan.testUsers,
  ];

  if (options.deleteTestContacts) {
    targets.push(...plan.contactsCreatedByTestAccounts);
  }

  for (const target of targets) {
    const targetRef = target.ref || getDocRef(db, target.path);
    await executeDelete(targetRef);
    deletedCount++;
  }

  return { deletedCount };
}
