// MOVING UP A YEAR (#1351). Every student's year goes stale when the school
// year turns over on 1 August, so each August the app proposes their next
// year and a Full-timer confirms it. The people still unconfirmed for the
// current school year are Years to confirm — counted from a marker on the
// contact, the way the kind stamp drives Not sorted yet, so the count falls
// only as someone works through it.
//
// Pure (no Firestore), like ./contactKindSeed.ts.
import { contactKind, type ContactKind } from './contactKind';

export interface YearConfirmable {
  isStudent?: boolean;
  year?: string;
  createdAt?: string;
  yearConfirmedFor?: string;
  yearConfirmedBy?: string;
}

/** What a Full-timer decides for one person: a year (moving up, the same
 *  year, or another from the list), or that they graduated or left school. */
export type YearChoice = { type: 'year'; year: string } | { type: 'graduated' };

/** The one step up from each year that has one; a Senior's is graduating. */
const NEXT: Record<string, YearChoice> = {
  Freshman: { type: 'year', year: 'Sophomore' },
  Sophomore: { type: 'year', year: 'Junior' },
  Junior: { type: 'year', year: 'Senior' },
  Senior: { type: 'graduated' },
};

/** The calendar year a school year starts in: 1 August, local time. */
function startYearOf(now: Date): number {
  return now.getMonth() >= 7 ? now.getFullYear() : now.getFullYear() - 1;
}

/** The school year a date falls in, e.g. "2026-27" from 1 August 2026 to
 *  31 July 2027, in local time. */
export function schoolYearOf(now: Date): string {
  const start = startYearOf(now);
  return `${start}-${String((start + 1) % 100).padStart(2, '0')}`;
}

/** The default for one person, or null where there is no next step (Graduate,
 *  Other or off-list text, no year) and a Full-timer must choose by hand.
 *  Someone added since 1 August gave their year this school year, so theirs
 *  stays as it is rather than being pushed ahead. */
export function proposeYear(c: Pick<YearConfirmable, 'year' | 'createdAt'>, now: Date): YearChoice | null {
  const year = (c.year ?? '').trim();
  if (!year) return null;
  const addedMs = c.createdAt ? Date.parse(c.createdAt) : NaN;
  if (addedMs >= new Date(startYearOf(now), 7, 1).getTime()) return { type: 'year', year };
  return NEXT[year] ?? null;
}

/** Whether someone's year was confirmed for this school year. Both the school
 *  year and who confirmed it are required, as with the kind stamp. */
function isConfirmed(c: YearConfirmable, schoolYear: string): boolean {
  return c.yearConfirmedFor === schoolYear && !!c.yearConfirmedBy;
}

/** Years to confirm: every student whose year nobody has confirmed for the
 *  current school year. */
export function yearsToConfirm<T extends YearConfirmable>(contacts: T[], now: Date): T[] {
  const schoolYear = schoolYearOf(now);
  return contacts.filter((c) => c.isStudent === true && !isConfirmed(c, schoolYear));
}

interface Confirming {
  /** The Full-timer confirming. */
  by: string;
  /** When, as an ISO string. */
  at: string;
  now: Date;
}

/** The fields one confirmation writes. A year is confirmed with the marker of
 *  who confirmed it and for which school year. Graduating or leaving school is
 *  a kind decision (ADR 0030, #1349): the person stops being a student, with
 *  the kind stamp, and keeps no year — an Our own becomes a Local saint, and a
 *  Contact stays a Contact. Once they are not a student they are off Years to
 *  confirm, so graduating needs no year marker. */
export function planYearConfirmation(
  c: Pick<YearConfirmable, 'year'>,
  choice: YearChoice,
  { by, at, now }: Confirming,
): Record<string, string | boolean> {
  if (choice.type === 'graduated') return { isStudent: false, year: '', kindSetBy: by, kindSetAt: at };
  return {
    ...(choice.year !== (c.year ?? '') && { year: choice.year }),
    yearConfirmedFor: schoolYearOf(now),
    yearConfirmedBy: by,
    yearConfirmedAt: at,
  };
}

/** The History lines one confirmation records, in the form the story reads
 *  back as change entries. Confirming the same year changes nothing. */
export function yearConfirmationStory(
  c: { year?: string; inChurchLife?: boolean; isStudent?: boolean },
  choice: YearChoice,
  kindLabel: (kind: ContactKind) => string,
): string {
  if (choice.type === 'year') {
    const before = c.year ?? '';
    return choice.year === before ? '' : `year: "${before}" → "${choice.year}"`;
  }
  const before = contactKind(c);
  const after = contactKind({ ...c, isStudent: false });
  return [
    'graduated or left school',
    ...(before !== after ? [`kind: "${kindLabel(before)}" → "${kindLabel(after)}"`] : []),
  ].join('\n');
}
