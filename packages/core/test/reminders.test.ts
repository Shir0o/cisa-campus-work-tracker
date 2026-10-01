import { describe, it, expect } from "vitest";
import {
  remindersDue,
  campusCalendarDaysSince,
  REMIND_AFTER_CALENDAR_DAYS,
  type ReminderCandidate,
} from "../src/reminders";

const ask = (over: Partial<ReminderCandidate> = {}): ReminderCandidate => ({
  contactId: "c1",
  messageId: "m1",
  kind: "ask",
  from: "asker",
  body: "Ask Ana to follow up with Rio",
  at: "2026-06-01T18:00:00.000Z",
  closedAt: null,
  remindedAt: null,
  replies: [],
  ...over,
});

const question = (over: Partial<ReminderCandidate> = {}): ReminderCandidate => ({
  contactId: "c1",
  messageId: "q1",
  kind: "question",
  from: "asker",
  body: "Did he come to the appointment?",
  at: "2026-06-01T18:00:00.000Z",
  closedAt: null,
  remindedAt: null,
  replies: [],
  ...over,
});

describe("campusCalendarDaysSince", () => {
  it("counts whole calendar days in campus time", () => {
    expect(campusCalendarDaysSince("2026-06-01T18:00:00.000Z", new Date("2026-06-04T18:00:00.000Z"))).toBe(3);
    expect(campusCalendarDaysSince("2026-06-01T18:00:00.000Z", new Date("2026-06-03T18:00:00.000Z"))).toBe(2);
  });
});

describe("remindersDue", () => {
  it("reminds an open ask exactly three calendar days after it was raised", () => {
    const due = remindersDue([ask()], new Date("2026-06-04T18:00:00.000Z"));
    expect(due).toHaveLength(1);
    expect(due[0].notification.userId).toBe("asker");
    expect(due[0].source).toEqual({ contactId: "c1", messageId: "m1" });
  });

  it("does not remind an ask two calendar days old", () => {
    expect(remindersDue([ask()], new Date("2026-06-03T18:00:00.000Z"))).toEqual([]);
  });

  it("never reminds a closed ask", () => {
    const closed = ask({ closedAt: "2026-06-02T18:00:00.000Z" });
    expect(remindersDue([closed], new Date("2026-06-04T18:00:00.000Z"))).toEqual([]);
  });

  it("reminds only once — an ask already marked reminded is skipped", () => {
    const reminded = ask({ remindedAt: "2026-06-04T18:00:00.000Z" });
    expect(remindersDue([reminded], new Date("2026-06-05T18:00:00.000Z"))).toEqual([]);
  });

  it("reminds a question with no Thread reply after three days", () => {
    const due = remindersDue([question()], new Date("2026-06-04T18:00:00.000Z"));
    expect(due).toHaveLength(1);
    expect(due[0].notification.userId).toBe("asker");
  });

  it("does not remind a question that someone has replied to", () => {
    const answered = question({ replies: [{ from: "teammate", at: "2026-06-02T18:00:00.000Z" }] });
    expect(remindersDue([answered], new Date("2026-06-04T18:00:00.000Z"))).toEqual([]);
  });

  it("does not count the asker's own reply as an answer", () => {
    const selfReply = question({ replies: [{ from: "asker", at: "2026-06-02T18:00:00.000Z" }] });
    expect(remindersDue([selfReply], new Date("2026-06-04T18:00:00.000Z"))).toHaveLength(1);
  });

  it("does not remind a question before three days", () => {
    expect(remindersDue([question()], new Date("2026-06-03T18:00:00.000Z"))).toEqual([]);
  });

  it("addresses the bell entry to the asker alone", () => {
    const [due] = remindersDue(
      [ask({ from: "asker" }), question({ messageId: "q2", from: "other" })],
      new Date("2026-06-04T18:00:00.000Z"),
    );
    expect(due.notification.userId).toBe("asker");
    expect(remindersDue([ask()], new Date("2026-06-04T18:00:00.000Z"))[0].notification.userId).not.toBe("other");
  });

  it("deep-links the ask back to the contact's conversation", () => {
    const [due] = remindersDue([ask()], new Date("2026-06-04T18:00:00.000Z"));
    expect(due.notification.targetId).toBe("c1");
    expect(due.notification.link).toBe("/people/c1?tab=thread");
  });

  it("says nobody followed up on an ask, and no reply yet on a question", () => {
    const [askDue] = remindersDue([ask()], new Date("2026-06-04T18:00:00.000Z"));
    const [qDue] = remindersDue([question()], new Date("2026-06-04T18:00:00.000Z"));
    expect(askDue.notification.title).toMatch(/nobody followed up/i);
    expect(qDue.notification.title).toMatch(/no reply/i);
    expect(askDue.notification.message).toContain("Rio");
    expect(qDue.notification.message).toContain("appointment");
  });

  it("still counts three calendar days across a daylight-saving boundary", () => {
    // Raised 23:30 on 7 Mar 2026 (PST); campus clocks spring forward that night.
    // Three campus calendar days later it is due even though only ~70.5h elapsed.
    const raised = ask({ at: "2026-03-08T07:30:00.000Z" });
    expect(remindersDue([raised], new Date("2026-03-11T06:00:00.000Z"))).toHaveLength(1);
    // Two calendar days in, it is not.
    expect(remindersDue([raised], new Date("2026-03-10T06:00:00.000Z"))).toEqual([]);
  });

  it("waits three calendar days, not three 24-hour periods", () => {
    expect(REMIND_AFTER_CALENDAR_DAYS).toBe(3);
  });
});
