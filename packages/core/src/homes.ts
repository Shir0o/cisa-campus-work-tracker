// Homes and "Who we haven't seen" (ADR 0031) — the shared derivation behind
// the second reading of the Visits page. Pure: homes, members and visits in,
// per-person state out, so web and a later mobile view cannot disagree about
// who has been missed.
//
// A Home is a household, not an address: it keeps its identity (and its
// visits) when it moves, and goes inactive rather than being deleted when the
// last member leaves. Being in a Home is what puts a person in this reading at
// all — someone with no home simply does not appear.
import type { Contact, Visit } from './types';

export interface Home {
  id: string;
  /** Free-text label, usually the family's last name ("the Peinados"). */
  label: string;
  /** The contact ids living there. */
  members: string[];
  /** Where the household lives — a visit's place comes from here. */
  place?: string;
  notes?: string;
  /** False once the last person leaves; the home's visits keep their meaning. */
  active: boolean;
}

/** One person's row in the reading. */
export interface HomeMemberReading {
  contactId: string;
  name: string;
  /** Twelve rolling months, oldest first; index 11 is the month we're in.
   *  True means we sat with them at least once that month. */
  months: boolean[];
  /** Whole days since we last sat with them; null when never visited. */
  daysSinceSeen: number | null;
  /** The last visit's date ('YYYY-MM-DD'); null when never visited. */
  lastSeenDate: string | null;
  everSeen: boolean;
}

/** One home's block of the reading: its members, each with their own state. */
export interface HomeReading {
  home: Home;
  /** Whether we have ever been round at all — a never-visited home is obvious. */
  everVisited: boolean;
  members: HomeMemberReading[];
}

// ── date helpers (local noon, like the visits reading) ───────────────────────

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
 *  Returns 0..11 for the rolling window, and -1 outside it (older than 11
 *  months, or in the future). */
function monthsAgo(day: string, now: Date): number {
  const d = noonOf(day);
  const diff = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  return diff >= 0 && diff <= 11 ? diff : -1;
}

// ── ordering (fixed, no controls — a row must stay where it was) ─────────────

/** A home's sort key: its label, ignoring a leading "the" so "the Peinados"
 *  sits with the P's rather than under T. */
const homeSortKey = (label: string): string => label.toLowerCase().replace(/^the\s+/, '').trim();

const firstNameOf = (name: string): string => name.split(' ')[0].toLowerCase();

const memberSortKey = (name: string): string => {
  const first = firstNameOf(name);
  return `${first} ${name.toLowerCase()}`;
};

// ── the reading ──────────────────────────────────────────────────────────────

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

/** The "Who we haven't seen" reading. Active homes, ordered by label ignoring
 *  a leading "the"; members by first name. Each member carries their own
 *  time-since-seen, computed from the visits naming them rather than from
 *  visits to their home — someone out of town reads honestly. */
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

// ── suggestions ──────────────────────────────────────────────────────────────

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

  // Union-find over the people who appear together in a visit.
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