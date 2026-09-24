// Homes and "Who we haven't seen" (ADR 0031) — the second reading of the
// Visits page. The pure derivation mirrors packages/core/src/homes.ts (this
// app deliberately has no @cisa/core dependency; see the note at the top of
// src/lib/goal.ts) and is kept in step by src/test/homesParity.test.ts. The
// Firestore writes live here too — homes is a new collection, so it gets its
// own rules block rather than spending the contacts ruleset's budget.
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  updateDoc,
} from 'firebase/firestore';
import { db } from './firebase';
import type { Contact, Home, Visit } from '../types';

// ── pure derivation (mirror of @cisa/core) ───────────────────────────────────

/** One person's row in the reading. */
export interface HomeMemberReading {
  contactId: string;
  name: string;
  /** Twelve rolling months, oldest first; index 11 is the month we're in. */
  months: boolean[];
  /** Whole days since we last sat with them; null when never visited. */
  daysSinceSeen: number | null;
  /** The last visit's date ('YYYY-MM-DD'); null when never visited. */
  lastSeenDate: string | null;
  everSeen: boolean;
}

/** One home's block of the reading. */
export interface HomeReading {
  home: Home;
  /** Whether we have ever been round at all — a never-visited home is obvious. */
  everVisited: boolean;
  members: HomeMemberReading[];
}

const DAY_MS = 86_400_000;

const noonOf = (day: string): Date => new Date(`${day}T12:00:00`);

const noon = (d: Date): Date => {
  const n = new Date(d);
  n.setHours(12, 0, 0, 0);
  return n;
};

/** Whole days between a 'YYYY-MM-DD' day and now; negative for a future day. */
function daysAgo(day: string, now: Date): number {
  return Math.round((noon(now).getTime() - noonOf(day).getTime()) / DAY_MS);
}

/** The month a day falls in, as months-from-now: 0 = the month we're in.
 *  Returns 0..11 for the rolling window, and -1 outside it. */
function monthsAgo(day: string, now: Date): number {
  const d = noonOf(day);
  const diff = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  return diff >= 0 && diff <= 11 ? diff : -1;
}

const homeSortKey = (label: string): string => label.toLowerCase().replace(/^the\s+/, '').trim();

const memberSortKey = (name: string): string => {
  const first = name.split(' ')[0].toLowerCase();
  return `${first} ${name.toLowerCase()}`;
};

const memberReading = (contact: Contact, visits: Visit[], now: Date): HomeMemberReading => {
  const theirs = visits.filter((v) => (v.contactIds || []).includes(contact.id));
  const months = Array(12).fill(false) as boolean[];
  theirs.forEach((v) => {
    const m = monthsAgo(v.date, now);
    if (m >= 0) months[11 - m] = true;
  });
  const newest = theirs.slice().sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  return {
    contactId: contact.id,
    name: contact.name,
    months,
    daysSinceSeen: newest ? daysAgo(newest.date, now) : null,
    lastSeenDate: newest?.date ?? null,
    everSeen: !!newest,
  };
};

/** The "Who we haven't seen" reading. Active homes, ordered by label ignoring a
 *  leading "the"; members by first name. Per-person time-since-seen. */
export function whoWeHaventSeen(
  homes: Home[],
  contacts: Contact[],
  visits: Visit[],
  now: Date = new Date(),
): HomeReading[] {
  const byId = new Map(contacts.map((c) => [c.id, c]));
  return homes
    .filter((h) => h.active)
    .map((home) => {
      const members = home.members
        .map((id) => byId.get(id))
        .filter((c): c is Contact => !!c)
        .map((c) => memberReading(c, visits, now))
        .sort((a, b) => (memberSortKey(a.name) < memberSortKey(b.name) ? -1 : 1));
      return {
        home,
        everVisited: members.some((m) => m.everSeen),
        members,
      };
    })
    .sort((a, b) => {
      const ka = homeSortKey(a.home.label);
      const kb = homeSortKey(b.home.label);
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
}

// ── suggestions (mirror of @cisa/core) ───────────────────────────────────────

/** A proposed home, always to be confirmed before anything is created. */
export interface HomeProposal {
  label: string;
  memberIds: string[];
  source: 'co-visit' | 'surname';
}

const surnameOf = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  return parts.length > 1 ? parts[parts.length - 1] : '';
};

const sharedSurname = (names: string[]): string => {
  const surnames = new Set(names.map(surnameOf).filter(Boolean));
  return surnames.size === 1 ? [...surnames][0] : '';
};

const pluralisedLabel = (surname: string): string =>
  surname.endsWith('s') ? `the ${surname}` : `the ${surname}s`;

const proposalLabel = (memberNames: string[]): string => {
  const surname = sharedSurname(memberNames);
  return surname ? pluralisedLabel(surname) : '';
};

/** Co-visit clustering: a visit is to one house, so every logged visit naming
 *  two or more people is direct evidence of a household. Union the people-sets
 *  across visits — two visits sharing one person merge into one proposal —
 *  and a person seen only alone proposes nothing. */
export function suggestHomesByCoVisit(
  visits: Visit[],
  contacts: Contact[],
  excludedIds: string[] = [],
): HomeProposal[] {
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const excluded = new Set(excludedIds);
  const eligible = new Set(contacts.filter((c) => !excluded.has(c.id)).map((c) => c.id));

  const parent = new Map<string, string>();
  const find = (x: string): string => {
    const root = parent.get(x) ?? x;
    if (root !== x) {
      const found = find(root);
      parent.set(x, found);
      return found;
    }
    return x;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  visits.forEach((v) => {
    const ids = (v.contactIds || []).filter((id) => eligible.has(id));
    if (ids.length < 2) return;
    for (let i = 1; i < ids.length; i++) union(ids[0], ids[i]);
  });

  const clusters = new Map<string, string[]>();
  eligible.forEach((id) => {
    const root = find(id);
    const list = clusters.get(root) ?? [];
    list.push(id);
    clusters.set(root, list);
  });

  return [...clusters.values()]
    .filter((ids) => ids.length >= 2)
    .map((ids) => {
      const sorted = ids.slice().sort();
      return {
        label: proposalLabel(sorted.map((id) => byId.get(id)?.name ?? '')),
        memberIds: sorted,
        source: 'co-visit' as const,
      };
    })
    .sort((a, b) => (a.memberIds[0] < b.memberIds[0] ? -1 : 1));
}

/** Surname clustering: people sharing a surname are proposed as one home,
 *  covering what the visit log cannot — households never visited, and people
 *  seen only alone. A mixed-surname house is left for the co-visit signal. */
export function suggestHomesBySurname(
  contacts: Contact[],
  excludedIds: string[] = [],
): HomeProposal[] {
  const excluded = new Set(excludedIds);
  const bySurname = new Map<string, Contact[]>();
  contacts.forEach((c) => {
    if (excluded.has(c.id)) return;
    const surname = surnameOf(c.name);
    if (!surname) return;
    const group = bySurname.get(surname.toLowerCase()) ?? [];
    group.push(c);
    bySurname.set(surname.toLowerCase(), group);
  });

  return [...bySurname.values()]
    .filter((group) => group.length >= 2)
    .map((group) => {
      const sorted = group.slice().sort((a, b) => (a.name < b.name ? -1 : 1));
      return {
        label: pluralisedLabel(surnameOf(sorted[0].name)),
        memberIds: sorted.map((c) => c.id),
        source: 'surname' as const,
      };
    })
    .sort((a, b) => (a.label < b.label ? -1 : 1));
}

// ── writing ──────────────────────────────────────────────────────────────────

/** Everything a home needs, minus the audit fields the writer stamps. */
export interface HomeInput {
  label: string;
  members: string[];
  place?: string;
  notes?: string;
  active: boolean;
}

const cleanInput = (input: HomeInput) => ({
  label: input.label.trim(),
  members: input.members,
  place: input.place?.trim() || '',
  notes: input.notes?.trim() || '',
  active: input.active,
});

/** Create a home. */
export async function addHome(input: HomeInput, by: { uid: string; name: string }): Promise<string> {
  const now = new Date().toISOString();
  const ref = await addDoc(collection(db, 'homes'), {
    ...cleanInput(input),
    createdAt: now,
    createdById: by.uid,
    createdByName: by.name,
    updatedAt: now,
    updatedBy: by.uid,
    updatedByName: by.name,
  });
  return ref.id;
}

/** Patch a home. */
export async function updateHome(
  homeId: string,
  input: HomeInput,
  by: { uid: string; name: string },
): Promise<void> {
  await updateDoc(doc(db, 'homes', homeId), {
    ...cleanInput(input),
    updatedAt: new Date().toISOString(),
    updatedBy: by.uid,
    updatedByName: by.name,
  });
}

/** Live subscription to every home. */
export function subscribeHomes(cb: (homes: Home[]) => void, onError?: (e: unknown) => void): () => void {
  return onSnapshot(
    collection(db, 'homes'),
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Home)),
    (e) => (onError ? onError(e) : console.error('homes subscription error', e)),
  );
}

/** The set of ids already in a home, for excluding them from suggestions.
 *  A person in any home — active or inactive — is already accepted, so they
 *  are never re-proposed as the start of a new one. */
export function homedMemberIds(homes: Home[]): string[] {
  return homes.flatMap((h) => h.members);
}