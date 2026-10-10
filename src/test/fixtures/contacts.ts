/**
 * Legacy-shape contact fixtures (#1472).
 *
 * Real contact documents carry shapes `Contact` does not admit: a sign-up
 * stores `createdAt` as a Firestore Timestamp (the Admin SDK `{ seconds }`, or
 * the REST wire `{ _seconds }`) rather than an ISO string, a quick-add and a
 * sign-up leave `email` null, and a document written before #1053 still has
 * the retired `owner` field — while one written after it has no `owner` key at
 * all. Three escapes (rows 10, 17 and 20 of the e2e coverage audit, #1457) came
 * from code that assumed the tidy shape.
 *
 * These fixtures are the single source for those shapes. Unit tests import
 * them directly, and `scripts/seed-emulator.ts` writes them so the e2e
 * journeys meet the same documents. Keep this module free of both vitest and
 * the Firebase SDK — the admin seed imports it.
 */
import type { Contact } from '../../types';

/** 2026-01-01T00:00:00.000Z, the date every timestamp fixture denotes. */
export const LEGACY_CREATED_AT_SECONDS = Date.UTC(2026, 0, 1) / 1000;

/** A Firestore timestamp as it reaches a reader: the Admin SDK shape
 *  (`seconds`) or the REST wire shape (`_seconds`). */
export interface LegacyTimestamp {
  seconds?: number;
  nanoseconds?: number;
  _seconds?: number;
}

/** The `createdAt` shapes a stored contact can carry. `Contact` types it as a
 *  string; the defensive readers must also accept these. */
export type LegacyCreatedAt = string | number | LegacyTimestamp;

/** A contact as stored, where fields the interface requires may be absent or
 *  carry a legacy shape. `owner` is the field retired by #1053. */
export interface LegacyContactShape extends Omit<Partial<Contact>, 'createdAt' | 'email'> {
  id: string;
  createdAt?: LegacyCreatedAt;
  email?: string | null;
  owner?: string | null;
}

const BASE = {
  name: 'Legacy Contact',
  location: '',
  email: '',
  phone: '',
  stage: 'Lead',
  lastSeen: '',
  initials: 'LC',
} as const;

/**
 * Build a legacy-shape contact. The result is cast to `Contact` because the
 * whole point of the fixtures is the fields `Contact` cannot express; callers
 * keep the cast in one place instead of at every assertion.
 */
export function legacyContact(over: LegacyContactShape): Contact & { owner?: string | null } {
  return { ...BASE, ...over } as unknown as Contact & { owner?: string | null };
}

/** Added as an ISO string — the ordinary shape. */
export const isoCreatedContact = legacyContact({
  id: 'legacy-iso',
  name: 'Iso Added',
  createdAt: '2026-01-01T00:00:00.000Z',
});

/** Added by a sign-up: `createdAt` is an Admin SDK Firestore Timestamp. */
export const timestampCreatedContact = legacyContact({
  id: 'legacy-timestamp',
  name: 'Timestamp Added',
  createdAt: { seconds: LEGACY_CREATED_AT_SECONDS, nanoseconds: 0 },
});

/** The same instant as it arrives over REST: `createdAt._seconds`. */
export const restTimestampCreatedContact = legacyContact({
  id: 'legacy-rest-timestamp',
  name: 'Rest Timestamp Added',
  createdAt: { _seconds: LEGACY_CREATED_AT_SECONDS, nanoseconds: 0 },
});

/** A quick-add or sign-up that left the email blank as null, not "". */
export const nullEmailContact = legacyContact({
  id: 'legacy-null-email',
  name: 'No Email',
  email: null,
});

/** An older document with no `owner` key at all. */
export const noOwnerContact = legacyContact({
  id: 'legacy-no-owner',
  name: 'No Owner',
  createdBy: 'u-founder',
  visibleTo: ['u-founder'],
});

/** A document from before #1053, still carrying the retired `owner` field and
 *  the access grant it derived. */
export const legacyOwnerContact = legacyContact({
  id: 'legacy-owner',
  name: 'Old Caregiver',
  createdBy: 'u-founder',
  owner: 'u-old-caregiver',
  visibleTo: ['u-founder', 'u-old-caregiver'],
});

/** Every fixture, keyed by the escape shape it stands for. The seed reuses
 *  these; the tests import the named ones they need. */
export const LEGACY_CONTACT_FIXTURES = {
  isoCreated: isoCreatedContact,
  timestampCreated: timestampCreatedContact,
  restTimestampCreated: restTimestampCreatedContact,
  nullEmail: nullEmailContact,
  noOwner: noOwnerContact,
  legacyOwner: legacyOwnerContact,
} as const;
