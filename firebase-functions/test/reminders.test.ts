import { describe, it, expect, vi } from "vitest";
import { runAskReminders, firestoreReminderDeps, type ReminderDeps } from "../src/reminders";
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
    const deps = makeDeps([openAsk]);
    const result = await runAskReminders(deps);

    const expected = remindersDue([openAsk], NOW);
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
    const deps = makeDeps([{ ...openAsk, closedAt: "2026-06-02T18:00:00.000Z" }]);
    expect(await runAskReminders(deps)).toEqual({ written: 0 });
    expect(deps.writeBell).not.toHaveBeenCalled();
    expect(deps.markReminded).not.toHaveBeenCalled();
  });
});

// Questions for the team is cut (cut-or-keep §5): the schedule no longer reads
// Thread questions, so an old one is never reminded. A tiny fake of the one
// collection-group query the schedule makes.
describe("firestoreReminderDeps", () => {
  const threadDoc = (id: string, data: Record<string, unknown>) => ({
    id,
    data: () => data,
    ref: { parent: { parent: { id: "c1" }, where: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }) } },
  });
  const fakeDb = (docs: ReturnType<typeof threadDoc>[]) => {
    const asked: unknown[][] = [];
    const db = {
      collectionGroup: () => ({
        where: (_field: string, _op: string, kinds: string[]) => {
          asked.push(kinds);
          return { get: async () => ({ docs: docs.filter((d) => kinds.includes(d.data().kind as string)) }) };
        },
      }),
    };
    return { db: db as never, asked };
  };

  it("leaves an unanswered Thread question out of the candidates", async () => {
    const { db, asked } = fakeDb([
      threadDoc("q1", { kind: "question", from: "asker", body: "Did he come?", at: "2026-06-01T18:00:00.000Z" }),
      threadDoc("n1", { kind: "nudge", from: "asker", body: "Ask Ana", at: "2026-06-01T18:00:00.000Z" }),
    ]);
    const candidates = await firestoreReminderDeps(db).candidates();
    expect(candidates.map((c) => c.messageId)).toEqual(["n1"]);
    expect(asked.flat()).not.toContain("question");
  });
});
