import { describe, it, expect } from "vitest";
import {
  weeklyRemindersDue,
  campusWeekdayHour,
  aroundTeamReminderMessage,
  traineeReminderMessage,
  DEFAULT_REMINDER_SCHEDULE,
  type ReminderSchedule,
  type WeeklyReminderStaff,
} from "../src/reminders";

// 2026-06-02 is a Tuesday; LA is on PDT (UTC-7) in June.
const TUESDAY_5PM = "2026-06-03T00:00:00.000Z";
const TUESDAY_6PM = "2026-06-03T01:00:00.000Z";
const WEDNESDAY_5PM = "2026-06-04T00:00:00.000Z";
const WEDNESDAY_6PM = "2026-06-04T01:00:00.000Z";
const MONDAY_9AM = "2026-06-01T16:00:00.000Z";

const fullTimer = (over: Partial<WeeklyReminderStaff> = {}): WeeklyReminderStaff => ({
  uid: "ft1",
  role: "admin",
  toWorkThrough: 3,
  ...over,
});

const trainee = (over: Partial<WeeklyReminderStaff> = {}): WeeklyReminderStaff => ({
  uid: "tr1",
  role: "manager",
  team: "campus",
  notReachedYet: 3,
  openAsks: 1,
  ...over,
});

describe("campusWeekdayHour", () => {
  it("reads the weekday and hour on the campus clock", () => {
    expect(campusWeekdayHour(TUESDAY_5PM)).toEqual({ weekday: 2, hour: 17 });
    expect(campusWeekdayHour(TUESDAY_6PM)).toEqual({ weekday: 2, hour: 18 });
    expect(campusWeekdayHour(WEDNESDAY_6PM)).toEqual({ weekday: 3, hour: 18 });
  });
});

describe("weeklyRemindersDue", () => {
  it("sends a Full-timer their Around the team count on Tuesday and Wednesday at 5pm", () => {
    const tuesday = weeklyRemindersDue([fullTimer()], DEFAULT_REMINDER_SCHEDULE, TUESDAY_5PM);
    const wednesday = weeklyRemindersDue([fullTimer()], DEFAULT_REMINDER_SCHEDULE, WEDNESDAY_5PM);
    expect(tuesday).toHaveLength(1);
    expect(wednesday).toHaveLength(1);
    expect(tuesday[0].notification.userId).toBe("ft1");
    expect(tuesday[0].notification.message).toBe("3 new people to work through on Around the team");
    expect(tuesday[0].notification.link).toBe("/around");
  });

  it("sends nothing to a Full-timer when nothing is waiting", () => {
    expect(
      weeklyRemindersDue([fullTimer({ toWorkThrough: 0 })], DEFAULT_REMINDER_SCHEDULE, TUESDAY_5PM),
    ).toEqual([]);
  });

  it("sends nothing at the wrong hour", () => {
    expect(weeklyRemindersDue([fullTimer()], DEFAULT_REMINDER_SCHEDULE, TUESDAY_6PM)).toEqual([]);
  });

  it("sends a YP Trainee on Tuesday at 6pm only", () => {
    const yp = trainee({ team: "yp", notReachedYet: 3, openAsks: 1 });
    expect(weeklyRemindersDue([yp], DEFAULT_REMINDER_SCHEDULE, TUESDAY_6PM)).toHaveLength(1);
    expect(weeklyRemindersDue([yp], DEFAULT_REMINDER_SCHEDULE, WEDNESDAY_6PM)).toEqual([]);
    expect(
      weeklyRemindersDue([yp], DEFAULT_REMINDER_SCHEDULE, TUESDAY_6PM)[0].notification.message,
    ).toBe("3 not reached yet · 1 open ask");
  });

  it("sends a Campus Trainee on Tuesday and Wednesday at 6pm", () => {
    expect(weeklyRemindersDue([trainee()], DEFAULT_REMINDER_SCHEDULE, TUESDAY_6PM)).toHaveLength(1);
    expect(weeklyRemindersDue([trainee()], DEFAULT_REMINDER_SCHEDULE, WEDNESDAY_6PM)).toHaveLength(1);
  });

  it("sends nothing to a Trainee with no team", () => {
    expect(
      weeklyRemindersDue([trainee({ team: null })], DEFAULT_REMINDER_SCHEDULE, TUESDAY_6PM),
    ).toEqual([]);
    expect(
      weeklyRemindersDue([trainee({ team: "unknown" })], DEFAULT_REMINDER_SCHEDULE, TUESDAY_6PM),
    ).toEqual([]);
  });

  it("sends nothing to someone who turned their weekly reminders off", () => {
    expect(
      weeklyRemindersDue(
        [fullTimer({ weeklyRemindersOff: true }), trainee({ weeklyRemindersOff: true })],
        DEFAULT_REMINDER_SCHEDULE,
        TUESDAY_6PM,
      ),
    ).toEqual([]);
  });

  it("honours an edited schedule", () => {
    const edited: ReminderSchedule = {
      fullTimers: { days: [1], hour: 9 },
      teams: { yp: { days: [1], hour: 9 }, campus: { days: [1], hour: 9 } },
    };
    expect(weeklyRemindersDue([fullTimer()], edited, MONDAY_9AM)).toHaveLength(1);
    expect(weeklyRemindersDue([fullTimer()], edited, TUESDAY_5PM)).toEqual([]);
  });

  it("never reminds the same person twice on the same campus day", () => {
    const already = fullTimer({ lastWeeklyReminderAt: TUESDAY_5PM });
    expect(weeklyRemindersDue([already], DEFAULT_REMINDER_SCHEDULE, TUESDAY_5PM)).toEqual([]);
    // A new day is a new reminder.
    expect(weeklyRemindersDue([already], DEFAULT_REMINDER_SCHEDULE, WEDNESDAY_5PM)).toHaveLength(1);
  });

  it("falls back to the default schedule when none is stored", () => {
    expect(weeklyRemindersDue([fullTimer()], null, TUESDAY_5PM)).toHaveLength(1);
  });
});

describe("weekly reminder copy", () => {
  it("counts people, not peoples, for one", () => {
    expect(aroundTeamReminderMessage(1)).toBe("1 new person to work through on Around the team");
    expect(aroundTeamReminderMessage(4)).toBe("4 new people to work through on Around the team");
  });

  it("joins only the clauses that are waiting", () => {
    expect(traineeReminderMessage(3, 1)).toBe("3 not reached yet · 1 open ask");
    expect(traineeReminderMessage(3, 0)).toBe("3 not reached yet");
    expect(traineeReminderMessage(0, 2)).toBe("2 open asks");
  });
});
