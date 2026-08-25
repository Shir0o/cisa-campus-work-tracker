// THE DAY'S GOAL (#544, Aug 2026).
//
// A counted daily target is the closest this app has come to a KPI, so it
// survives only as a *nudge for today*: a full-timer turns on one shared number
// for the whole team, and on an on-campus day a trainee sees a small ring in
// the queue's chrome that fills as they add new people — and goes quiet the
// moment it's met. Nothing is persisted but the number itself: the count is
// derived from the record (`createdBy` doubles as "added by", `createdAt` is
// the day they went in), so deleting a person un-counts them.
//
// The one store holds exactly two things — on/off and a number — in the
// team-wide singleton `settings/goal`. Everything else is derived.
import type { Contact } from './types';

export interface DayGoal {
  /** Whether the day has a goal at all. */
  on: boolean;
  /** The shared number of new people an on-campus day holds. */
  count: number;
}

export const GOAL_MIN = 1;
export const GOAL_MAX = 20;
export const GOAL_DEFAULT_COUNT = 5;

/** Clamp/round a possibly-hostile read into the 1..20 band, default 5, on. */
export function normalizeDayGoal(raw: unknown): DayGoal {
  const src = (raw ?? {}) as Partial<Record<keyof DayGoal, unknown>>;
  const n = typeof src.count === 'number' && Number.isFinite(src.count) ? Math.round(src.count) : GOAL_DEFAULT_COUNT;
  return {
    on: typeof src.on === 'boolean' ? src.on : true,
    count: Math.min(GOAL_MAX, Math.max(GOAL_MIN, n)),
  };
}

const startOfLocalDay = (t: number) => new Date(t).setHours(0, 0, 0, 0);

type AddableContact = Pick<Contact, 'createdBy' | 'addedBy' | 'createdAt'>;

/** Today's new people added by one uid (the trainee's own count). */
export function goalCountFor(
  contacts: AddableContact[],
  uid: string | null | undefined,
  now: number = Date.now(),
): number {
  if (!uid) return 0;
  const today = startOfLocalDay(now);
  return contacts.filter((c) => {
    const added = c.createdBy || c.addedBy;
    if (added !== uid) return false;
    const at = new Date(c.createdAt ?? '').getTime();
    if (!Number.isFinite(at)) return false;
    return startOfLocalDay(at) === today;
  }).length;
}

/** Everyone's new people today — the day in aggregate a full-timer sees. */
export function goalNewToday(contacts: AddableContact[], now: number = Date.now()): number {
  const today = startOfLocalDay(now);
  return contacts.filter((c) => {
    const at = new Date(c.createdAt ?? '').getTime();
    return Number.isFinite(at) && startOfLocalDay(at) === today;
  }).length;
}

/** Reached the number — the ring goes back to being the plain dot. */
export function goalMet(count: number, goal: DayGoal): boolean {
  return goal.on && count >= goal.count;
}

/** How full the ring is, 0..1. */
export function goalFill(count: number, goal: DayGoal): number {
  if (goal.count <= 0) return 0;
  return Math.min(1, count / goal.count);
}

/** THE gate every surface calls: on, inside the window, and not there yet. */
export function goalShow(goal: DayGoal, count: number, inWindow: boolean): boolean {
  return goal.on && inWindow && !goalMet(count, goal);
}