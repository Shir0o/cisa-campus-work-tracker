// Gospel partners — the two trainees (rarely three) who go out as one, this
// term. A person either of them brings in is shared with the other from the
// moment they're added (`coCreators`), so neither has to remember to share.
// A full-timer arranges the pairs in Settings; the trainees live inside them.
// Tied to the TERM, because partners change each semester.
//
// Standalone mirror of packages/core/src/data/partners.ts for the web app
// (which doesn't consume @cisa/core). Storage is one team-wide doc
// `settings/partners` holding `{ byTerm: { "Fall 2026": [[uid, uid]] } }`.
//
// `applyPartners` keeps a module-level view of the CURRENT term's groups so the
// web creation paths can stamp `coCreators` synchronously without a Firestore
// read at creation time.
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "./firebase";
import { seasonForDate, SEASONS } from "./seasons";
import type { PartnersSettings } from "../types";

/** term → groups of trainee uids (a group is two or more real people). */
export type PartnersByTerm = Record<string, string[][]>;

/** The term key ("Fall 2026") a given date falls in. */
export function partnersTermKey(d: Date = new Date()): string {
  return `${SEASONS[seasonForDate(d)].label} ${d.getFullYear()}`;
}

/** A partnership is two or more real people, no dups, no empties. */
export function cleanPartnerGroups(groups: string[][] | undefined | null): string[][] {
  return (groups || [])
    .map((g) => (g || []).filter((id, i, a) => !!id && a.indexOf(id) === i))
    .filter((g) => g.length > 1);
}

/** The groups recorded for one term, cleaned. */
export function groupsForTerm(byTerm: PartnersByTerm | undefined | null, term: string): string[][] {
  return cleanPartnerGroups(byTerm?.[term]);
}

/** The group `uid` sits in, if any. */
export function groupOf(groups: string[][], uid: string): string[] | null {
  return groups.find((g) => g.includes(uid)) ?? null;
}

/** Everyone else in `uid`'s group (the pair/partners). */
export function partnerUidsOf(groups: string[][], uid: string): string[] {
  const g = groupOf(groups, uid);
  return g ? g.filter((x) => x !== uid) : [];
}

// ── module-level view of the current term ─────────────────────────────────
// Fed by applyPartners from a live subscription (App.tsx's RosterSync) — the
// creation paths read it synchronously without an extra Firestore read.
let CURRENT_GROUPS: string[][] = [];

/** Replace the module-level view from a settings/partners read. */
export function applyPartners(byTerm: PartnersByTerm | undefined | null, now: Date = new Date()): void {
  CURRENT_GROUPS = groupsForTerm(byTerm, partnersTermKey(now));
}

/** The trainees currently going out with `uid`, if any (current term). */
export function partnersOf(uid?: string | null): string[] {
  return uid ? partnerUidsOf(CURRENT_GROUPS, uid) : [];
}

/** Stamp a brand-new contact with the adder's partners as `coCreators`, so the
 *  other side of the pair sees it from the moment it's added. No-op when the
 *  adder has no partner this term. */
export function stampPartners<T extends object>(data: T, byUid?: string | null): T {
  const withMe = partnersOf(byUid);
  if (!withMe.length) return data;
  const record = data as T & { coCreators?: string[] };
  record.coCreators = [...new Set([...(record.coCreators || []), ...withMe])];
  return data;
}

// ── Firestore ───────────────────────────────────────────────────────────────

const partnersDoc = () => doc(db, "settings", "partners");

/** Helper to serialize byTerm avoiding Firestore's nested array rejection */
export function serializeByTerm(byTerm: PartnersByTerm): Record<string, { members: string[] }[]> {
  const result: Record<string, { members: string[] }[]> = {};
  for (const [term, groups] of Object.entries(byTerm || {})) {
    result[term] = (groups || []).map((members) => ({ members }));
  }
  return result;
}

/** Helper to deserialize byTerm from Firestore snapshot */
export function deserializeByTerm(raw: PartnersSettings["byTerm"] | undefined | null): PartnersByTerm {
  if (!raw) return {};
  const result: PartnersByTerm = {};
  for (const [term, val] of Object.entries(raw)) {
    if (Array.isArray(val)) {
      result[term] = cleanPartnerGroups(
        val.map((item) => {
          if (Array.isArray(item)) return item;
          if (item && Array.isArray(item.members)) return item.members;
          return [];
        })
      );
    }
  }
  return result;
}

/** Live subscription to the team-wide gospel-partners arrangement. */
export function subscribePartners(
  cb: (byTerm: PartnersByTerm) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    partnersDoc(),
    (snap) => {
      const data = typeof snap?.data === "function" ? (snap.data() as PartnersSettings | undefined) : undefined;
      cb(deserializeByTerm(data?.byTerm));
    },
    (e) => (onError ? onError(e) : console.error("partners subscription error", e)),
  );
}

/** Replace the whole arrangement in settings/partners. */
export async function savePartners(byTerm: PartnersByTerm): Promise<void> {
  try {
    await setDoc(partnersDoc(), { byTerm: serializeByTerm(byTerm) }, { merge: true });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, "settings/partners");
  }
}

// ── pure arrangement mutations (return a fresh byTerm) ─────────────────────

/** `uid` joins `anchor`'s group (a person works in one partnership — leaving
 *  any group they were in first). */
export function addToGroup(
  byTerm: PartnersByTerm | undefined | null,
  term: string,
  uid: string,
  anchor: string,
): PartnersByTerm {
  if (!uid || !anchor || uid === anchor) return byTerm ?? {};
  const groups = groupsForTerm(byTerm, term).map((g) => g.filter((x) => x !== uid));
  const ai = groups.findIndex((g) => g.includes(anchor));
  if (ai >= 0) groups[ai] = [...groups[ai], uid];
  else groups.push([anchor, uid]);
  return { ...(byTerm || {}), [term]: cleanPartnerGroups(groups) };
}

/** Take `uid` out of every group for the term. */
export function removeFromGroups(
  byTerm: PartnersByTerm | undefined | null,
  term: string,
  uid: string,
): PartnersByTerm {
  return { ...(byTerm || {}), [term]: cleanPartnerGroups(groupsForTerm(byTerm, term).map((g) => g.filter((x) => x !== uid))) };
}

/** Drop a whole group by index. */
export function dropGroup(
  byTerm: PartnersByTerm | undefined | null,
  term: string,
  index: number,
): PartnersByTerm {
  return { ...(byTerm || {}), [term]: cleanPartnerGroups(groupsForTerm(byTerm, term).filter((_, i) => i !== index)) };
}

/** Bring a previous term's arrangement over unchanged. */
export function carryOverPartners(
  byTerm: PartnersByTerm | undefined | null,
  fromTerm: string,
  toTerm: string,
): PartnersByTerm {
  return { ...(byTerm || {}), [toTerm]: groupsForTerm(byTerm, fromTerm).map((g) => g.slice()) };
}

/** A new term starts empty. */
export function clearTerm(
  byTerm: PartnersByTerm | undefined | null,
  term: string,
): PartnersByTerm {
  return { ...(byTerm || {}), [term]: [] };
}