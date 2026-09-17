import type { Contact } from '../types';

export interface DuplicatePair {
  survivor: Contact;
  duplicate: Contact;
  reason: string;
}

/**
 * Normalizes email for matching.
 */
export function normalizeEmail(email?: string | null): string {
  return email ? email.trim().toLowerCase() : '';
}

/**
 * Normalizes phone digits for matching.
 */
export function normalizePhone(phone?: string | null): string {
  return phone ? phone.replace(/\D/g, '') : '';
}

/**
 * Normalizes full name for matching.
 */
export function normalizeName(name?: string | null): string {
  return name ? name.trim().toLowerCase() : '';
}

/**
 * Detects whether two contacts are potential duplicates.
 * Returns match reason or null.
 */
export function checkDuplicateMatch(a: Contact, b: Contact): string | null {
  const emailA = normalizeEmail(a.email);
  const emailB = normalizeEmail(b.email);
  if (emailA && emailB && emailA === emailB) {
    return 'Matching email';
  }

  const phoneA = normalizePhone(a.phone);
  const phoneB = normalizePhone(b.phone);
  if (phoneA && phoneB && phoneA === phoneB) {
    return 'Matching phone';
  }

  const nameA = normalizeName(a.name);
  const nameB = normalizeName(b.name);
  if (nameA && nameB && nameA === nameB) {
    return 'Matching name';
  }

  return null;
}

/**
 * Scans a list of contacts and finds duplicate candidate pairs.
 * Each contact is paired at most once per pass.
 * Defaults the older contact (by createdAt) as the survivor.
 */
export function findCandidateDuplicates(contacts: Contact[]): DuplicatePair[] {
  const pairs: DuplicatePair[] = [];
  const claimedIds = new Set<string>();

  for (let i = 0; i < contacts.length; i++) {
    const a = contacts[i];
    if (!a?.id || claimedIds.has(a.id)) continue;

    for (let j = i + 1; j < contacts.length; j++) {
      const b = contacts[j];
      if (!b?.id || claimedIds.has(b.id)) continue;

      const reason = checkDuplicateMatch(a, b);
      if (reason) {
        // Determine older record
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;

        let survivor = a;
        let duplicate = b;

        // If b is strictly older, b is survivor
        if (timeB > 0 && (timeA === 0 || timeB < timeA)) {
          survivor = b;
          duplicate = a;
        }

        pairs.push({ survivor, duplicate, reason });
        claimedIds.add(a.id);
        claimedIds.add(b.id);
        break;
      }
    }
  }

  return pairs;
}

/**
 * Combines profile attributes of duplicate into survivor.
 * - Union sets for relationship ties (founders, carers, coCreators, visibleTo, tags)
 * - Retains survivor values, backfilling missing scalar fields from duplicate
 * - Concatenates non-empty notes
 */
export function combineContactProfiles(survivor: Contact, duplicate: Contact): Contact {
  const unionArray = (arrA?: string[] | null, arrB?: string[] | null): string[] => {
    const set = new Set<string>();
    (arrA ?? []).forEach((item) => item && set.add(item));
    (arrB ?? []).forEach((item) => item && set.add(item));
    return Array.from(set);
  };

  // Combine notes
  let combinedNotes = survivor.notes?.trim() ?? '';
  const duplicateNotes = duplicate.notes?.trim() ?? '';
  if (duplicateNotes) {
    if (combinedNotes && !combinedNotes.includes(duplicateNotes)) {
      combinedNotes = `${combinedNotes}\n\n--- Combined Notes ---\n\n${duplicateNotes}`;
    } else if (!combinedNotes) {
      combinedNotes = duplicateNotes;
    }
  }

  const combined: Contact = {
    ...survivor,
    role: survivor.role || duplicate.role || 'Student',
    location: survivor.location || duplicate.location || '',
    email: survivor.email || duplicate.email || '',
    phone: survivor.phone || duplicate.phone || '',
    stage: survivor.stage || duplicate.stage || 'Lead',
    notes: combinedNotes,
    spiritualBackground: survivor.spiritualBackground || duplicate.spiritualBackground || '',
    pronouns: survivor.pronouns || duplicate.pronouns || '',
    gender: survivor.gender || duplicate.gender || '',
    year: survivor.year || duplicate.year || '',
    major: survivor.major || duplicate.major || '',
    instagram: survivor.instagram || duplicate.instagram || '',
    howHeard: survivor.howHeard || duplicate.howHeard || '',
    metVia: survivor.metVia || duplicate.metVia || '',
    prayerRequest: survivor.prayerRequest || duplicate.prayerRequest || '',
    tags: unionArray(survivor.tags, duplicate.tags),
    founders: unionArray(survivor.founders, duplicate.founders),
    carers: unionArray(survivor.carers, duplicate.carers),
    coCreators: unionArray(survivor.coCreators, duplicate.coCreators),
    visibleTo: unionArray(survivor.visibleTo, duplicate.visibleTo),
  };

  return combined;
}
