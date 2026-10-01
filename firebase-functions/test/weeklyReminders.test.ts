import { describe, it, expect, vi } from "vitest";
import { runWeeklyReminders, type WeeklyReminderDeps } from "../src/reminders";
import {
  weeklyRemindersDue,
  DEFAULT_REMINDER_SCHEDULE,
  type WeeklyReminderStaff,
} from "../../packages/core/src/reminders";

// 2026-06-02 is a Tuesday; LA is on PDT (UTC-7) in June.
const TUESDAY_5PM = new Date("2026-06-03T00:00:00.000Z").getTime();

const staff: WeeklyReminderStaff[] = [
  { uid: "ft1", role: "admin", toWorkThrough: 3 },
  { uid: "tr1", role: "manager", team: "campus", notReachedYet: 3, openAsks: 1 },
];

function makeDeps(people: WeeklyReminderStaff[] = staff): WeeklyReminderDeps {
  return {
    staff: vi.fn(async () => people),
    schedule: vi.fn(async () => DEFAULT_REMINDER_SCHEDULE),
    writeBell: vi.fn(async () => {}),
    markReminded: vi.fn(async () => {}),
    now: () => TUESDAY_5PM,
  };
}

describe("runWeeklyReminders", () => {
  it("writes exactly the bell entries the rule returns", async () => {
    const deps = makeDeps();
    const result = await runWeeklyReminders(deps);

    const expected = weeklyRemindersDue(staff, DEFAULT_REMINDER_SCHEDULE, TUESDAY_5PM);
    expect(result).toEqual({ written: expected.length });
    expected.forEach((d, i) => {
      expect(deps.writeBell).toHaveBeenNthCalledWith(i + 1, d.notification);
    });
  });

  it("marks each reminded person so a retry never repeats", async () => {
    const deps = makeDeps();
    await runWeeklyReminders(deps);
    const expected = weeklyRemindersDue(staff, DEFAULT_REMINDER_SCHEDULE, TUESDAY_5PM);
    expected.forEach((d, i) => {
      expect(deps.markReminded).toHaveBeenNthCalledWith(i + 1, d.uid);
    });
  });

  it("writes nothing when nothing is waiting", async () => {
    const deps = makeDeps([{ uid: "ft1", role: "admin", toWorkThrough: 0 }]);
    expect(await runWeeklyReminders(deps)).toEqual({ written: 0 });
    expect(deps.writeBell).not.toHaveBeenCalled();
    expect(deps.markReminded).not.toHaveBeenCalled();
  });
});
