// Gospel partners — the trainees who go out as one, kept as dated stretches of
// time rather than a term's current state. A person either partner brings in is
// shared with the other from the moment they're added (`coCreators`), and "who
// was paired with whom on this date" is read back from the dated history rather
// than reconstructed from whichever term happens to be on screen.
//
// Storage: one team-wide doc `settings/partners`. The canonical shape is
//   { pairings: [{ id, members: [uid, uid], startDate: "YYYY-MM-DD",
//                  endDate?: "YYYY-MM-DD" }] }
// `endDate` absent means the pairing is still open. Admin-only writes; readable
// by the app so both sides of a pair and the creation paths can resolve
// "who goes out with me".
//
// Standalone mirror of packages/core/src/data/partners.ts for the web app
// (which does not consume @cisa/core), wired to the module Firestore handle.
//
// Legacy docs held `{ byTerm: { "Fall 2026": [[uid, uid]] } }`. Reading one
// migrates it in memory into dated records using each term's known boundaries
// (migrateByTermToPairings), so history is readable before the first write of
// the new shape and nothing is lost.
import { useEffect, useState } from "react";
import { doc, onSnapshot, runTransaction, setDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "./firebase";
import { cleanPairings, cleanPartnerGroups, migrateByTermToPairings, type PartnerPairing, type PartnersByTerm } from "./partnersModel";
import type { PartnersSettings } from "../types";

export * from "./partnersModel";

// ---- Firestore (injected `db`) ----

const partnersDoc = () => doc(db, "settings", "partners");

/** Firestore-safe serialization: an array of maps with flat member arrays
 *  (nested arrays are rejected by Firestore). */
export function serializePairings(
  pairings: readonly PartnerPairing[] | undefined | null,
): PartnersSettings["pairings"] {
  return cleanPairings(pairings).map((p) => ({
    id: p.id,
    members: p.members,
    startDate: p.startDate,
    ...(p.endDate ? { endDate: p.endDate } : {}),
  }));
}

/** Legacy serializer, kept so the migration off `byTerm` is covered. */
export function serializeByTerm(byTerm: PartnersByTerm): Record<string, { members: string[] }[]> {
  const result: Record<string, { members: string[] }[]> = {};
  for (const [term, groups] of Object.entries(byTerm || {})) {
    result[term] = (groups || []).map((members) => ({ members }));
  }
  return result;
}

/** Legacy deserializer used by the migration. */
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
        }),
      );
    }
  }
  return result;
}

/** Read the stored arrangement: dated records when present, otherwise the
 *  legacy byTerm shape migrated in memory. */
export function deserializePartners(raw: PartnersSettings | undefined | null): PartnerPairing[] {
  if (!raw) return [];
  if (Array.isArray(raw.pairings)) return cleanPairings(raw.pairings as PartnerPairing[]);
  return migrateByTermToPairings(deserializeByTerm(raw.byTerm));
}

/** Live subscription to the team-wide gospel-partners arrangement. */
export function subscribePartners(
  cb: (pairings: PartnerPairing[]) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    partnersDoc(),
    (snap) => {
      const data = typeof snap?.data === "function" ? (snap.data() as PartnersSettings | undefined) : undefined;
      cb(deserializePartners(data));
    },
    (e) => (onError ? onError(e) : console.error("partners subscription error", e)),
  );
}

/** React hook for live gospel-partners pairings. */
export function usePartners(): PartnerPairing[] {
  const [pairings, setPairings] = useState<PartnerPairing[]>([]);
  useEffect(() => subscribePartners(setPairings), []);
  return pairings;
}

/**
 * Change the arrangement from what is stored now, not from what this screen
 * last saw (Nov 2026). Two Full-timers editing pairs at once used to overwrite
 * each other's change, since each saved its own whole list. `change` gets the
 * current pairings inside a transaction and returns the new list, or null to
 * write nothing. Resolves to what was written (or null).
 */
export async function updatePartners(
  change: (current: PartnerPairing[]) => PartnerPairing[] | null,
): Promise<PartnerPairing[] | null> {
  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(partnersDoc());
      const current = deserializePartners(snap.exists() ? (snap.data() as PartnersSettings) : undefined);
      const next = change(current);
      if (!next) return null;
      tx.set(partnersDoc(), { pairings: serializePairings(next) }, { merge: true });
      return cleanPairings(next);
    });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, "settings/partners");
    return null;
  }
}

/** Replace the whole dated arrangement in settings/partners. Legacy `byTerm` is
 *  left in place as the migration path; readers prefer `pairings`. Prefer
 *  updatePartners for edits, so a concurrent change is not overwritten. */
export async function savePartners(pairings: readonly PartnerPairing[]): Promise<void> {
  try {
    await setDoc(partnersDoc(), { pairings: serializePairings(pairings) }, { merge: true });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, "settings/partners");
  }
}
