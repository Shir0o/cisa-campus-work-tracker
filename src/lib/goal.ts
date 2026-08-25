// THE DAY'S GOAL (#544) — a full-timer's one shared number for the team's
// on-campus days, shown to a trainee as a small ring that fills as they add
// new people and goes quiet the moment it's met. The web app has no
// @cisa/core dependency (mirroring src/lib/asks.ts), so this is a standalone
// copy of the shared logic in packages/core/src/{goal,data/goal}.ts.
//
// Stored at settings/goal, the same team-wide singleton shape as settings/season:
// one doc, readable by everyone, writable by a full-timer. Everything beyond
// on/off and the number is derived — the count comes from the contacts record
// (createdBy doubles as "added by", createdAt is the day they went in), so
// deleting a person un-counts them.
import { useEffect, useState } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import type { Contact } from '../types';

export interface DayGoal {
  on: boolean;
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

const goalDoc = () => doc(db, 'settings', 'goal');

/** Live subscription to the team-wide day goal (settings/goal). */
export function subscribeDayGoal(
  cb: (goal: DayGoal) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    goalDoc(),
    (snap) => {
      const data = typeof snap?.data === 'function' ? snap.data() : undefined;
      cb(normalizeDayGoal(data));
    },
    (e) => (onError ? onError(e) : console.error('day goal subscription error', e)),
  );
}

/** Merge-write the day goal (create-or-update). Rules gate it to full-timers. */
export async function saveDayGoal(patch: Partial<DayGoal>): Promise<void> {
  try {
    await setDoc(goalDoc(), patch, { merge: true });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, 'settings/goal');
  }
}

export interface DayGoalView {
  goal: DayGoal;
  setOn: (on: boolean) => void;
  setCount: (count: number) => void;
}

/** Live team-wide goal. Setters write through; rules gate them to full-timers. */
export function useDayGoal(): DayGoalView {
  const [goal, setGoal] = useState<DayGoal>({ on: true, count: GOAL_DEFAULT_COUNT });
  useEffect(() => subscribeDayGoal(setGoal), []);

  return {
    goal,
    setOn: (on) => void saveDayGoal({ on }),
    setCount: (count) => void saveDayGoal({ count }),
  };
}