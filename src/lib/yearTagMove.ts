/**
 * Pure planner for the one-off move of year tags into `year` (#1348).
 *
 * "Freshman", "Sophomore", "Junior", "Senior" and "Graduate" used to be
 * suggested tags, so a person's year lived in two places. `year` is now the
 * only place. For every contact with a tag naming one of those years
 * (case-insensitive):
 *
 *   - `year` empty   → set `year` to the canonical-cased word and drop the tag;
 *   - `year` already set → leave `year` alone and just drop the tag.
 *
 * Other tags are never touched. A contact with no `year` whose tags name more
 * than one year is skipped and reported: the app cannot know which is right,
 * and silently picking one would lose the other.
 *
 * Pure (no Firestore) and idempotent: once a row is applied the year tags are
 * gone, so planning again yields nothing.
 */

export const YEAR_TAGS = ['Freshman', 'Sophomore', 'Junior', 'Senior', 'Graduate'];

export interface YearTagContact {
  id: string;
  year?: string | null;
  tags?: string[] | null;
}

export interface YearTagMoveRow {
  id: string;
  /** Only present when `year` was empty and is being filled. */
  year?: string;
  /** The tags to leave on the contact. */
  tags: string[];
  /** The tags being taken off, as stored. */
  removed: string[];
}

export interface YearTagMovePlan {
  rows: YearTagMoveRow[];
  /** No `year`, and tags naming different years: left for a person to settle. */
  ambiguous: { id: string; tags: string[] }[];
}

const canonicalYear = (tag: string): string | undefined =>
  YEAR_TAGS.find((year) => year.toLowerCase() === tag.trim().toLowerCase());

export function planYearTagMove(contacts: YearTagContact[]): YearTagMovePlan {
  const plan: YearTagMovePlan = { rows: [], ambiguous: [] };

  for (const c of contacts) {
    const tags = c.tags ?? [];
    const removed = tags.filter((tag) => canonicalYear(tag));
    if (removed.length === 0) continue;

    const kept = tags.filter((tag) => !canonicalYear(tag));
    if (c.year?.trim()) {
      plan.rows.push({ id: c.id, tags: kept, removed });
      continue;
    }

    const years = [...new Set(removed.map((tag) => canonicalYear(tag)!))];
    if (years.length > 1) {
      plan.ambiguous.push({ id: c.id, tags });
      continue;
    }
    plan.rows.push({ id: c.id, year: years[0], tags: kept, removed });
  }

  return plan;
}
