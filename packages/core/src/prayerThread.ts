// Pure "weekly walk" grouping for one contact's prayers — this week / last
// week / earlier — shared by web (src/views/PrayerList.tsx) and mobile (the
// Prayer tab). Ported from PrayerList.tsx's PrayerThread component.
import type { PrayerRecord } from "./types";
import { daysAgoWords } from "./queue";
import { firstName } from "./history";

const DAY_MS = 86_400_000;

function weekStartOf(date: Date): Date {
  const x = new Date(date);
  const off = (x.getDay() + 6) % 7; // Monday = 0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - off);
  return x;
}

const prayerMs = (p: PrayerRecord) => new Date(p.date).getTime();

/**
 * Whether a burden belongs on the team prayer page. The log sheet's "Bring it
 * to team prayer" toggle is off by default, so it writes `teamPrayer: false`
 * when the trainee keeps a burden to themselves.
 *
 * An ABSENT flag means team: every prayer written before the toggle existed
 * stays exactly where it was, so the page needs no backfill. That is why this
 * is a function and not `p.teamPrayer` at the call site.
 */
export function isTeamPrayer(p: Pick<PrayerRecord, "teamPrayer">): boolean {
  return p.teamPrayer !== false;
}

export interface PrayerCarryLineOptions {
  me: string;
  now?: number;
}

/**
 * The pray queue card's third block: when the burden was written, who wrote
 * it (unless that's you), and whether the team is carrying it too. Stands in
 * for the design's `p.body` + "Ana is carrying this too." line — this
 * schema's `PrayerRecord` has neither an elaboration field nor a `prayedBy`
 * list, so the line is built from what it does have instead.
 */
export function prayerCarryLine(p: PrayerRecord, { me, now = Date.now() }: PrayerCarryLineOptions): string {
  const author = p.updatedByName && p.updatedBy !== me ? firstName(p.updatedByName) : null;
  const ago = daysAgoWords(p.date, now);
  const added = ago
    ? `Added ${ago}${author ? ` by ${author}` : ""}.`
    : author
      ? `${author} added this one.`
      : "This one was added.";
  const carry = isTeamPrayer(p) ? "The team is carrying this one too." : "This one is just yours to carry.";
  return `${added} ${carry}`;
}

export interface PrayerThreadGroups {
  weekItem: PrayerRecord | null;
  lastItem: PrayerRecord | null;
  earlier: PrayerRecord[];
  /** The last-week prayer (if any) is still unmarked and needs attention. */
  needsMark: boolean;
}

/**
 * Groups one contact's prayers, newest first, into: the burden written this
 * week (or none), the most recent prayer before this week (always surfaced
 * for context), and everything earlier.
 */
export function groupPrayerThread(prayers: PrayerRecord[], now: number = Date.now()): PrayerThreadGroups {
  const weekStart = weekStartOf(new Date(now)).getTime();
  const weekEnd = weekStart + 7 * DAY_MS;
  const sorted = [...prayers].sort((a, b) => prayerMs(b) - prayerMs(a));
  const weekItem = sorted.find((p) => prayerMs(p) >= weekStart && prayerMs(p) < weekEnd) ?? null;
  const rest = sorted.filter((p) => p !== weekItem);
  const lastItem = rest[0] ?? null;
  const earlier = rest.slice(1);
  const needsMark = !!lastItem && lastItem.status === "pending";
  return { weekItem, lastItem, earlier, needsMark };
}
