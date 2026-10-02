// Weekly reminders (#1301) — the team-wide schedule document and each person's
// own on/off switch. The behaviour oracle is the shared core rule
// (`packages/core/src/reminders.ts`); this web copy is only the shapes and the
// Firestore reads/writes the Settings screen needs. The web app deliberately
// has no @cisa/core dependency, so the defaults are mirrored here and the rule's
// own tests are the contract.
import { doc, onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import { db, handleFirestoreError, OperationType } from "./firebase";

/** A campus weekday, `0` = Sunday … `6` = Saturday (JS `getDay` order). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface ReminderTime {
  /** The campus weekdays this reminder goes out. Empty means never. */
  days: Weekday[];
  /** The campus hour (0–23) it goes out. */
  hour: number;
}

export interface ReminderSchedule {
  fullTimers: ReminderTime;
  /** One schedule per team id; the ids match `lib/teams`. */
  teams: Record<string, ReminderTime>;
}

export const DEFAULT_REMINDER_SCHEDULE: ReminderSchedule = {
  fullTimers: { days: [2, 3], hour: 17 },
  teams: { yp: { days: [2], hour: 18 }, campus: { days: [2, 3], hour: 18 } },
};

/** The day toggles, Sunday first, matching the weekday numbers the rule reads. */
export const REMINDER_WEEKDAYS: { value: Weekday; key: string; label: string }[] = [
  { value: 0, key: "reminders.weekday_sun", label: "Sun" },
  { value: 1, key: "reminders.weekday_mon", label: "Mon" },
  { value: 2, key: "reminders.weekday_tue", label: "Tue" },
  { value: 3, key: "reminders.weekday_wed", label: "Wed" },
  { value: 4, key: "reminders.weekday_thu", label: "Thu" },
  { value: 5, key: "reminders.weekday_fri", label: "Fri" },
  { value: 6, key: "reminders.weekday_sat", label: "Sat" },
];

export const REMINDER_HOURS = Array.from({ length: 24 }, (_, hour) => hour);

function isWeekday(value: unknown): value is Weekday {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= 6;
}

function normalizeTime(raw: unknown, fallback: ReminderTime): ReminderTime {
  const t = raw as Partial<ReminderTime> | null | undefined;
  if (!t || typeof t !== "object" || !Array.isArray(t.days) || typeof t.hour !== "number") return fallback;
  const days = t.days.filter(isWeekday);
  const hour = Math.max(0, Math.min(23, Math.floor(t.hour)));
  return { days, hour };
}

/** Whatever came out of Firestore, made safe for the editor: unknown teams and
 *  bad values fall back to the defaults rather than rendering as blanks. */
export function normalizeReminderSchedule(raw: unknown): ReminderSchedule {
  const r = (raw ?? {}) as Partial<ReminderSchedule>;
  const teams: Record<string, ReminderTime> = { ...DEFAULT_REMINDER_SCHEDULE.teams };
  if (r.teams && typeof r.teams === "object") {
    for (const [id, time] of Object.entries(r.teams)) {
      teams[id] = normalizeTime(time, teams[id] ?? { days: [], hour: 18 });
    }
  }
  return {
    fullTimers: normalizeTime(r.fullTimers, DEFAULT_REMINDER_SCHEDULE.fullTimers),
    teams,
  };
}

/** A readable "Tue, Wed · 5 pm" for the schedule's summary line. */
export function reminderTimeSummary(time: ReminderTime): string {
  const days = REMINDER_WEEKDAYS.filter((d) => time.days.includes(d.value)).map((d) => d.label);
  const hour = time.hour % 12 === 0 ? 12 : time.hour % 12;
  const suffix = time.hour < 12 ? "am" : "pm";
  const dayText = days.length ? days.join(", ") : "No days";
  return `${dayText} · ${hour} ${suffix}`;
}

const scheduleDoc = () => doc(db, "settings", "reminder_schedule");

/** Live subscription to the team-wide reminder schedule. */
export function subscribeReminderSchedule(
  cb: (schedule: ReminderSchedule) => void,
  onError?: (e: unknown) => void,
): () => void {
  return onSnapshot(
    scheduleDoc(),
    (snap) => {
      const data = typeof (snap as { data?: unknown })?.data === "function" ? (snap as { data: () => unknown }).data() : undefined;
      cb(normalizeReminderSchedule(data));
    },
    (e) => (onError ? onError(e) : console.error("reminder schedule subscription error", e)),
  );
}

/** Whole-document write; only a Full-timer may do it (Firestore rules). */
export async function saveReminderSchedule(schedule: ReminderSchedule): Promise<void> {
  try {
    await setDoc(scheduleDoc(), schedule);
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, "settings/reminder_schedule");
  }
}

/** Turn one person's own weekly reminders on or off. Only they may write it. */
export async function saveWeeklyReminderOff(uid: string, off: boolean): Promise<void> {
  try {
    await updateDoc(doc(db, "users", uid), { weeklyRemindersOff: off });
  } catch (e) {
    handleFirestoreError(e, OperationType.WRITE, `users/${uid} weeklyRemindersOff`);
  }
}
