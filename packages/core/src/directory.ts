// People (Directory) — pure filter/sort for the full contact list, shared by
// web and mobile. Ported from src/views/Directory.tsx's search/stage-filter
// logic; reuses the same last-touch/days-since machinery as myday.ts's
// deriveLeaders (this is that same computation applied to ALL contacts,
// not just the ones personally held).
import { daysSince, lastTouchByContact, parseMs, type Leader, type Touch } from "./myday";
import { matchContact, matchTier, type ContactMatch } from "./contactMatch";
import type { Contact } from "./types";

export interface DirectoryFilters {
  search: string;
  /** A stage id, or "all" for no stage filter. */
  stageId: string;
}

/** The fields the mobile People search scans, beside the name — the v2
 *  `M2People` `hit()` looks you up by the hall you live in or the one thing
 *  written about you, not only by name. Matching itself is shared word-boundary
 *  logic (#1192), so "ian" finds a person named Ian rather than every "Christian". */
const personFields = (c: Contact): Array<string | undefined> => [
  c.major,
  c.year,
  c.location,
  (c.tags ?? []).join(" "),
  c.notes,
];

/** Word-boundary match + name-first tiering (#1192): null when nothing matches,
 *  otherwise the match quality and any field-only extras. */
const matchFor = (c: Contact, q: string): ContactMatch | null => matchContact(c, q, personFields(c));

/** All contacts matching the search/stage filters, longest-since-touched
 *  first (folks we haven't seen in a while rise to the top), with name matches
 *  ranked above field-only matches when searching (#1192). */
export function filterAndSortDirectory(
  contacts: Contact[],
  touches: Touch[],
  filters: DirectoryFilters,
  now: number = Date.now(),
): Leader[] {
  const touchMap = lastTouchByContact(touches);
  const needle = filters.search.trim();
  return contacts
    .filter((c) => filters.stageId === "all" || c.stage === filters.stageId)
    .map((c) => {
      const touch = touchMap.get(c.id);
      const ms = touch?.ms ?? parseMs(c.createdAt);
      const days = ms == null ? Infinity : daysSince(ms, now);
      const match = needle ? matchFor(c, needle) : null;
      return { contact: c, days, note: touch?.note || c.notes || "", match };
    })
    .filter((l) => !needle || l.match !== null)
    .sort((a, b) => matchTier(a.match) - matchTier(b.match) || b.days - a.days);
}

export interface DirectorySplit {
  /** The people I'm walking with, longest since we talked first. */
  mine: Leader[];
  /** Everyone else on the team's list, alphabetically. */
  rest: Leader[];
}

/**
 * People, the way the v2 screen reads it: two groups rather than one filtered
 * list (the design's `M2People`). Mine come first and in the order that asks
 * something of me — longest since we talked; everyone else is a directory, so
 * it's alphabetical.
 *
 * `personalIds` is `personalContactIdsOf`'s set: the explicit picker choice, or
 * created-by-me. The design's `c.owner === me` has no equivalent here — a
 * Contact carries no owner.
 */
export function splitDirectory(
  contacts: Contact[],
  touches: Touch[],
  personalIds: Set<string>,
  search: string,
  now: number = Date.now(),
): DirectorySplit {
  const touchMap = lastTouchByContact(touches);
  const needle = search.trim();
  const toLeader = (c: Contact): Leader => {
    const touch = touchMap.get(c.id);
    const ms = touch?.ms ?? parseMs(c.createdAt);
    return {
      contact: c,
      days: ms == null ? Infinity : daysSince(ms, now),
      note: touch?.note || c.notes || "",
    };
  };
  const matched = contacts
    .map((c): { leader: Leader; match: ContactMatch | null } => {
      const match = needle ? matchFor(c, needle) : null;
      return { leader: toLeader(c), match };
    })
    .filter(({ match }) => !needle || match !== null);
  const order = (a: { leader: Leader; match: ContactMatch | null }, b: { leader: Leader; match: ContactMatch | null }, byDays: boolean): number =>
    matchTier(a.match) - matchTier(b.match) || (byDays ? b.leader.days - a.leader.days : a.leader.contact.name.localeCompare(b.leader.contact.name));
  return {
    mine: matched
      .filter(({ leader }) => personalIds.has(leader.contact.id))
      .sort((a, b) => order(a, b, true))
      .map(({ leader }) => leader),
    rest: matched
      .filter(({ leader }) => !personalIds.has(leader.contact.id))
      .sort((a, b) => order(a, b, false))
      .map(({ leader }) => leader),
  };
}

/** The four dots the design paints a stage with (`m2StageTone`), as v2 tone
 * keys — the caller resolves the colour through its own room's palette, so a
 * stage looks the same in green, navy, and at night.
 *
 * Keyed by the stage's position, exactly as the Material `toneForStage` is, so
 * a stage keeps its colour across both languages. */
export type StageToneKey = "ask" | "due" | "note" | "pray";

const STAGE_TONES: StageToneKey[] = ["ask", "due", "note", "pray"];

export function stageToneKey(stages: { label: string }[], label?: string): StageToneKey {
  if (!label) return "note";
  const i = stages.findIndex((s) => s.label === label);
  return i < 0 ? "note" : STAGE_TONES[i % STAGE_TONES.length];
}

/** The person behind a direct chat, if they are also someone we're walking with.
 *
 * The design's `M2Thread` offers "Open {first}'s page →" in a DM. A chat room is
 * user-to-user (`memberIds: uid[]`) and a `Contact` carries no uid, so email is
 * the only join the schema gives us — which means the button appears exactly
 * when the person you're messaging is also on the roster under the same address.
 */
export function contactIdForEmail(
  contacts: Pick<Contact, "id" | "email">[],
  email: string | null | undefined,
): string | null {
  const needle = (email ?? "").trim().toLowerCase();
  if (!needle) return null;
  return contacts.find((c) => (c.email ?? "").trim().toLowerCase() === needle)?.id ?? null;
}

/** The kind of person, derived from `inChurchLife` and `isStudent` and never
 *  stored (#1152, ADR 0030). "Saint" is deliberately not a value: in this
 *  team's usage every believer is a saint, so belief distinguishes nobody —
 *  the church life does. A local who is not in the church life folds into
 *  `contact` alongside a student we just met; `isStudent` still tells them
 *  apart, it just does not change the bucket. */
export type ContactKind = "local-saint" | "our-own" | "contact";

/** What the Directory's kind filter can be set to. */
export type KindFilter = ContactKind | "all" | "unsorted";

type Kinded = Pick<Contact, "inChurchLife" | "isStudent" | "kindSetBy" | "kindSetAt">;

export function contactKind(c: Kinded): ContactKind {
  if (!c.inChurchLife) return "contact";
  return c.isStudent ? "our-own" : "local-saint";
}

/** Whether a person's kind was decided by someone, rather than left at the
 *  default. Both halves of the stamp are required: a document carrying only
 *  one was not written by a decision. */
export function isKindSorted(c: Kinded): boolean {
  return !!c.kindSetBy && !!c.kindSetAt;
}

export function kindMatches(c: Kinded, filter: KindFilter): boolean {
  if (filter === "all") return true;
  if (filter === "unsorted") return !isKindSorted(c);
  return contactKind(c) === filter;
}

/** The i18n key for a kind's label. One map, so the Directory's options, the
 *  chip and the activity log can never drift apart. */
export function kindLabelKey(kind: ContactKind): string {
  return `contactKind.${kind.replace("-", "_")}`;
}
