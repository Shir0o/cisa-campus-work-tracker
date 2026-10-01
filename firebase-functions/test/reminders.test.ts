import { describe, it, expect, vi } from "vitest";
import { runAskReminders, type ReminderDeps } from "../src/reminders";
import { remindersDue, type ReminderCandidate } from "../../packages/core/src/reminders";

const NOW = new Date("2026-06-04T18:00:00.000Z").getTime();

const openAsk: ReminderCandidate = {
  contactId: "c1",
  messageId: "m1",
  kind: "ask",
  from: "asker",
  body: "Ask Ana to follow up with Rio",
  at: "2026-06-01T18:00:00.000Z",
  closedAt: null,
  remindedAt: null,
  replies: [],
};

const answeredQuestion: ReminderCandidate = {
  contactId: "c2",
  messageId: "q1",
  kind: "question",
  from: "asker",
  body: "Did he come?",
  at: "2026-06-01T18:00:00.000Z",
  replies: [{ from: "teammate", at: "2026-06-02T18:00:00.000Z" }],
};

function makeDeps(candidates: ReminderCandidate[]): ReminderDeps {
  return {
    candidates: vi.fn(async () => candidates),
    writeBell: vi.fn(async () => {}),
    markReminded: vi.fn(async () => {}),
    now: () => NOW,
  };
}

describe("runAskReminders", () => {
  it("writes exactly the bell entries the rule returns", async () => {
    const deps = makeDeps([openAsk, answeredQuestion]);
    const result = await runAskReminders(deps);

    const expected = remindersDue([openAsk, answeredQuestion], NOW);
    expect(result).toEqual({ written: expected.length });
    expect(deps.writeBell).toHaveBeenCalledTimes(expected.length);
    expected.forEach((d, i) => {
      expect(deps.writeBell).toHaveBeenNthCalledWith(i + 1, d.notification);
    });
  });

  it("records each reminded ask or question", async () => {
    const deps = makeDeps([openAsk]);
    await runAskReminders(deps);
    expect(deps.markReminded).toHaveBeenCalledTimes(1);
    expect(deps.markReminded).toHaveBeenCalledWith({ contactId: "c1", messageId: "m1" });
  });

  it("writes nothing, and marks nothing, when no reminder is due", async () => {
    const deps = makeDeps([answeredQuestion]);
    expect(await runAskReminders(deps)).toEqual({ written: 0 });
    expect(deps.writeBell).not.toHaveBeenCalled();
    expect(deps.markReminded).not.toHaveBeenCalled();
  });
});
