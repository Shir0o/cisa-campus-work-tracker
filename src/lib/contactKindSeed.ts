/**
 * Pure planner for the one-time contact kind seed (#1152, ADR 0030).
 *
 * The kind of person — Local saint, Our own, Contact — is derived from two
 * booleans a Full-timer sets by hand. Rolling that out from nothing would mean
 * hundreds of manual edits, so two signals already in the record seed it:
 *
 *   - the **Church Mtg** step says someone meets with the church, so it sets
 *     `inChurchLife`. This is the ONLY use of the stage in this feature. It is
 *     never a live derivation: a stage is a position people are moved through,
 *     so a category derived from it would flicker as a side effect of board
 *     housekeeping, and `contact.stage` stores the stage's *label*, which an
 *     admin can rename out from under it.
 *   - the retired free-text `role` ("Status" in the form) names a student
 *     often enough to set `isStudent`.
 *
 * The seed deliberately does NOT infer `isStudent` from the Church Mtg step: a
 * Local saint sitting at that step would be wrongly marked a student.
 *
 * It writes no stamp. A stamp records that a *person* decided, and the seed is
 * the app guessing — so everything it touches still counts as Not sorted yet,
 * and the Directory's unsorted group stays an honest measure of work remaining.
 *
 * Pure (no Firestore) and idempotent, like ./contactVisibleToBackfill.ts: a
 * re-run after a partial run finishes the job rather than restarting it.
 */

/** The stage label that says someone meets with the church. */
export const CHURCH_MTG_STAGE = 'Church Mtg';

const NAMES_A_STUDENT = /student/i;

export interface SeedableContact {
  id: string;
  stage?: string;
  role?: string;
  inChurchLife?: boolean;
  isStudent?: boolean;
  kindSetBy?: string;
  kindSetAt?: string;
}

export interface KindSeedRow {
  id: string;
  /** Only the fields that need writing — never a stamp. */
  set: { inChurchLife?: true; isStudent?: true };
}

export function planContactKindSeed(contacts: SeedableContact[]): KindSeedRow[] {
  const rows: KindSeedRow[] = [];
  for (const c of contacts) {
    // Somebody already decided about this person; the seed does not second-guess them.
    if (c.kindSetBy && c.kindSetAt) continue;

    const set: KindSeedRow['set'] = {};
    if (c.stage === CHURCH_MTG_STAGE && !c.inChurchLife) set.inChurchLife = true;
    if (c.role && NAMES_A_STUDENT.test(c.role) && !c.isStudent) set.isStudent = true;

    if (set.inChurchLife || set.isStudent) rows.push({ id: c.id, set });
  }
  return rows;
}
