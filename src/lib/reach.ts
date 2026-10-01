// The reach model (#1293, ADR 0034) — the web copy. Whether anyone has reached
// a person: an Interaction logged with them, or their name marked present at a
// Gathering. Tapping Call or Text writes nothing, so it never counts on its
// own.
//
// The web app has no @cisa/core dependency (see the note at the top of
// src/lib/goal.ts), so this is a standalone copy of the shared logic in
// packages/core/src/reach.ts. src/test/reachParity.test.ts is the contract
// between the two mirrors.

import type { ContactKind } from './contactKind';

/** One logged Interaction, reduced to the person and its date. */
export interface ReachInteraction {
  contactId: string;
  ms: number;
}

/** The fields of a Gathering the reach model reads: its date, and who was
 *  present. An undefined `attendance` means it was never taken. */
export interface ReachGathering {
  date: string;
  attendance?: { present: string[]; absent?: string[] };
}

export interface ReachSources {
  interactions: readonly ReachInteraction[];
  gatherings: readonly ReachGathering[];
}

/** Whether anyone has reached a person, and when they last did. */
export interface ReachReading {
  /** True once an Interaction has been logged with the person, or they have
   *  been marked present at a Gathering. */
  reached: boolean;
  /** Epoch ms of the newest reach — an Interaction or a Gathering they were
   *  present at; null when nobody has reached them. */
  ms: number | null;
}

const parseMs = (s?: string | null): number | null => {
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? null : t;
};

/** Every reached person, keyed by contact id. */
export function reachByContact(sources: ReachSources): Map<string, ReachReading> {
  const map = new Map<string, ReachReading>();
  const note = (contactId: string, ms: number | null) => {
    const cur = map.get(contactId);
    if (!cur) {
      map.set(contactId, { reached: true, ms });
      return;
    }
    if (ms != null && (cur.ms == null || ms > cur.ms)) cur.ms = ms;
  };

  for (const interaction of sources.interactions) {
    if (!interaction.contactId) continue;
    note(interaction.contactId, Number.isFinite(interaction.ms) ? interaction.ms : null);
  }

  for (const gathering of sources.gatherings) {
    const at = parseMs(gathering.date);
    for (const contactId of gathering.attendance?.present ?? []) note(contactId, at);
  }

  return map;
}

/** Whether anyone has reached this person. Built on `reachByContact`; callers
 *  rendering many rows should build the map once instead. */
export function isReached(contactId: string, sources: ReachSources): boolean {
  return reachByContact(sources).get(contactId)?.reached ?? false;
}

/** The tag chips and the My Day Not-reached-yet card show only people added
 *  within this many days, so the list stays one the team can still act on. The
 *  Directory's Not-reached filter reads the reach map directly and has no such
 *  limit. */
export const UNREACHED_TAG_WINDOW_DAYS = 30;

/** One person the tag-count rule reads. `kind` is the derived kind of person,
 *  `createdAtMs` their added date, and `tags` their effective tags (the
 *  caller normalizes and injects the dynamic `new` tag first). */
export interface TagCountPerson {
  id: string;
  kind: ContactKind;
  createdAtMs: number | null;
  tags: readonly string[];
}

/** Each tag's count of people nobody has reached — only Contacts added in the
 *  last 30 days, per the glossary. */
export function unreachedTagCounts(
  people: readonly TagCountPerson[],
  reach: ReadonlyMap<string, ReachReading>,
  nowMs: number,
): Map<string, number> {
  const counts = new Map<string, number>();
  const floor = nowMs - UNREACHED_TAG_WINDOW_DAYS * 86_400_000;
  for (const person of people) {
    if (person.kind !== 'contact') continue;
    if (person.createdAtMs == null || person.createdAtMs < floor) continue;
    if (reach.get(person.id)?.reached) continue;
    for (const tag of person.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return counts;
}

/** The tie fields the Not-reached-yet card reads: the persisted relationships
 *  that make a teammate a recipient (glossary, "Tied to a contact"). */
export interface ReachTies {
  createdBy?: string | null;
  addedBy?: string | null;
  coCreators?: string[] | null;
  founders?: string[] | null;
  carers?: string[] | null;
}

/** One person the Not-reached-yet card reads: their kind, when they were added,
 *  and every tie that makes a teammate a recipient. */
export interface ReachPerson extends ReachTies {
  id: string;
  kind: ContactKind;
  createdAtMs: number | null;
}

/** Which people the card shows: the reader's own ties, or the whole team. */
export type ReachScope = 'yours' | 'team';

/** Whether `viewerUid` is tied to a person — they added them, founded them,
 *  co-created them, or carry them. */
export function isTiedTo(person: ReachTies | null | undefined, viewerUid: string): boolean {
  if (!person || !viewerUid) return false;
  return (
    person.createdBy === viewerUid ||
    person.addedBy === viewerUid ||
    (person.founders || []).includes(viewerUid) ||
    (person.coCreators || []).includes(viewerUid) ||
    (person.carers || []).includes(viewerUid)
  );
}

/** The names of the teammates tied to a person, de-duplicated and in tie order
 *  (creator/adder, founders, co-creators, carers). A tie whose uid carries no
 *  name in the map is dropped, as in `carerNamesOf`. */
export function tiedTeammateNames(
  person: ReachTies | null | undefined,
  nameByUid: Record<string, string | undefined> | null | undefined,
): string[] {
  if (!person) return [];
  const ids = [
    person.createdBy,
    person.addedBy,
    ...(person.founders || []),
    ...(person.coCreators || []),
    ...(person.carers || []),
  ];
  const names: string[] = [];
  for (const id of ids) {
    if (!id) continue;
    const name = nameByUid?.[id]?.trim();
    if (name) names.push(name);
  }
  return [...new Set(names)];
}

/** The My Day card's list: people nobody has reached, as Contacts added in the
 *  last 30 days, narrowed to the reader's ties (`yours`) or the whole roster
 *  (`team`), newest added first. */
export function unreachedContacts(
  people: readonly ReachPerson[],
  reach: ReadonlyMap<string, ReachReading>,
  opts: { scope: ReachScope; viewerUid: string; nowMs: number },
): ReachPerson[] {
  const floor = opts.nowMs - UNREACHED_TAG_WINDOW_DAYS * 86_400_000;
  return people
    .filter(
      (person) =>
        person.kind === 'contact' &&
        person.createdAtMs != null &&
        person.createdAtMs >= floor &&
        !(reach.get(person.id)?.reached ?? false) &&
        (opts.scope === 'team' || isTiedTo(person, opts.viewerUid)),
    )
    .sort((a, b) => (b.createdAtMs ?? 0) - (a.createdAtMs ?? 0));
}
