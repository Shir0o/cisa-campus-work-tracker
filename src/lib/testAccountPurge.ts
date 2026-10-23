import { NON_PERSON_RE } from './permissions';

/**
 * Checks whether an account is a non-person test/reviewer account
 * based on email prefix (reviewer*, cisa-*) or display name match against NON_PERSON_RE.
 */
export function isTestAccount(target: {
  email?: string | null;
  displayName?: string | null;
  name?: string | null;
  uid?: string | null;
}): boolean {
  if (!target) return false;
  const email = (target.email || '').trim().toLowerCase();
  // `cisa` needs a separator after it, as in NON_PERSON_RE, so a real
  // address like cisacampus@… is not swept up.
  if (/^(reviewer|cisa[-_.])/.test(email)) {
    return true;
  }
  const name = String(target.displayName || target.name || '').trim();
  if (name) {
    if (NON_PERSON_RE.test(name)) return true;
    if (/\b(reviewer|app ?store|service account|test account)\b/i.test(name)) return true;
  }
  return false;
}

/**
 * What a purge removes, as Firestore document paths per group. Each path is
 * deleted with everything nested under it. `logins` are Firebase Auth uids.
 */
export interface PurgePlan {
  accounts: string[];
  logins: string[];
  invitations: string[];
  personal: string[];
  interactions: string[];
  notes: string[];
  chats: string[];
  activity: string[];
  asks: string[];
  feedback: string[];
  contacts: string[];
  /** Test accounts left alone because they are the one running the purge. */
  keptSelf: string[];
}

export type PurgePathGroup = Exclude<keyof PurgePlan, 'logins' | 'keptSelf'>;

/** Delete order: traces first, then the account docs that own them. */
export const PURGE_PATH_GROUPS: PurgePathGroup[] = [
  'personal',
  'interactions',
  'notes',
  'chats',
  'activity',
  'asks',
  'feedback',
  'invitations',
  'contacts',
  'accounts',
];

/**
 * The document paths a purge deletes. Contacts are opt-in; once chosen, any
 * other target already nested under one of them is dropped, since deleting
 * the contact removes it too.
 */
export function selectedPurgePaths(plan: PurgePlan, deleteTestContacts: boolean): string[] {
  const contactPrefixes = deleteTestContacts ? plan.contacts.map((p) => `${p}/`) : [];
  const paths: string[] = [];
  for (const group of PURGE_PATH_GROUPS) {
    if (group === 'contacts' && !deleteTestContacts) continue;
    for (const path of plan[group]) {
      if (group !== 'contacts' && contactPrefixes.some((prefix) => path.startsWith(prefix))) continue;
      paths.push(path);
    }
  }
  return paths;
}

/** How many items a purge with these options removes (docs plus logins). */
export function purgeTotal(plan: PurgePlan, deleteTestContacts: boolean): number {
  return selectedPurgePaths(plan, deleteTestContacts).length + plan.logins.length;
}
