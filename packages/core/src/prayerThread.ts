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
 *
 * §21 moved surfacing to the person — "On our hearts" now reads
 * `isOnTeamPrayer(contact)`. This predicate still describes the stored flag on
 * a prayer, which the migration and the data-repair scripts read.
 */
export function isTeamPrayer(p: Pick<PrayerRecord, "teamPrayer">): boolean {
  return p.teamPrayer !== false;
}

/**
 * A contact as the team-prayer question needs it. `prayerListRemoved` is typed
 * loosely on purpose: it is a stamped object on stored contacts, and either
 * shape only matters as "present means the team took them off".
 */
export interface TeamPrayerContact {
  teamPrayer?: boolean;
  prayerListRemoved?: unknown;
}

/**
 * Whether the team carries this person on "On our hearts" (§21). Per person,
 * not per prayer: once true, every prayer of theirs shows on that page.
 *
 * TRANSITIONAL (fix round 1) — remove the fallback once
 * `scripts/migrate-team-prayer-per-person.ts` has run. Rules and web deploy
 * with this change, but the migration runs later by hand, and installed phone
 * builds still write only the per-prayer flag. So a contact with NO per-person
 * flag (`undefined` — not `false`) counts while any of its prayers carries the
 * legacy team flag (`isTeamPrayer`, the same reading the migration's decision
 * uses). `false` always means off, and the team's own removal always wins.
 */
export function isOnTeamPrayer(
  c: TeamPrayerContact,
  prayers: Pick<PrayerRecord, "teamPrayer">[] = [],
): boolean {
  if (c.prayerListRemoved) return false;
  if (c.teamPrayer !== undefined) return c.teamPrayer === true;
  return prayers.some(isTeamPrayer);
}

export interface PrayerCarryLineOptions {
  me: string;
  now?: number;
  /** Whether the person is on team prayer (§21). An absent answer is off. */
  onTeam?: boolean;
}

/**
 * The pray queue card's third block: when the burden was written, who wrote
 * it (unless that's you), and whether the team is carrying it too. Stands in
 * for the design's `p.body` + "Ana is carrying this too." line — this
 * schema's `PrayerRecord` has neither an elaboration field nor a `prayedBy`
 * list, so the line is built from what it does have instead.
 */
export function prayerCarryLine(p: PrayerRecord, { me, now = Date.now(), onTeam = false }: PrayerCarryLineOptions): string {
  const author = p.updatedByName && p.updatedBy !== me ? firstName(p.updatedByName) : null;
  const ago = daysAgoWords(p.date, now);
  const added = ago
    ? `Added ${ago}${author ? ` by ${author}` : ""}.`
    : author
      ? `${author} added this one.`
      : "This one was added.";
  const carry = onTeam ? "The team is carrying this one too." : "This one stays off On our hearts.";
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
