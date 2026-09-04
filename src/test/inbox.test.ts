import { describe, it, expect, vi } from "vitest";
import { traineeWaitingItems, type ThreadMessageWithContact } from "../lib/inbox";

// Control the roster so the test is independent of the real seed.
vi.mock("../lib/walking", () => ({
  isFullTimer: (uid?: string | null) => uid === "ft1",
  isTrainee: (uid?: string | null) => uid === "t1",
  fullTimerIds: () => ["ft1"],
  traineeIds: () => ["t1"],
}));

const thread = (over: Partial<ThreadMessageWithContact>): ThreadMessageWithContact =>
  ({
    id: "m",
    contactId: "c1",
    interactionId: null,
    from: "t1",
    fromName: "Zion",
    kind: "question",
    body: "",
    at: "2026-01-01T00:00:00.000Z",
    reactions: [],
    ...over,
  }) as ThreadMessageWithContact;

describe("traineeWaitingItems", () => {
  it("returns nothing for a uid with no full-timer", () => {
    expect(traineeWaitingItems("ft1", [])).toEqual([]);
  });

  it("surfaces the full-timer's nudges and questions, newest-first, carrying the kind", () => {
    const items = traineeWaitingItems("t1", [
      thread({ id: "n1", contactId: "c1", from: "ft1", kind: "nudge", at: "2026-02-01T00:00:00Z" }),
      thread({ id: "q1", contactId: "c2", from: "ft1", kind: "question", at: "2026-02-03T00:00:00Z" }),
      // a comment/encouragement from the FT is not a "waiting" item
      thread({ id: "c1m", contactId: "c3", from: "ft1", kind: "comment", at: "2026-02-04T00:00:00Z" }),
      // a trainee's own message is never waiting on them
      thread({ id: "self", contactId: "c4", from: "t1", kind: "question", at: "2026-02-05T00:00:00Z" }),
    ]);
    expect(items.map((x) => x.id)).toEqual(["thread:q1", "thread:n1"]);
    expect(items[0]).toMatchObject({ kind: "question", by: "ft1" });
    expect(items[1]).toMatchObject({ kind: "nudge" });
  });

  it("drops items the trainee has already replied to at the same level", () => {
    const items = traineeWaitingItems("t1", [
      thread({ id: "q1", contactId: "c1", from: "ft1", kind: "question", at: "2026-02-01T00:00:00Z" }),
      // a later trainee reply on the same contact-level thread → handled
      thread({ id: "r1", contactId: "c1", from: "t1", kind: "comment", at: "2026-02-02T00:00:00Z" }),
      // a still-open question on a different contact
      thread({ id: "q2", contactId: "c2", from: "ft1", kind: "question", at: "2026-02-01T00:00:00Z" }),
    ]);
    expect(items.map((x) => x.id)).toEqual(["thread:q2"]);
  });

  it("hides Full-timer-only Discussion from the trainee waiting feed", () => {
    const items = traineeWaitingItems("t1", [
      thread({
        id: "team_nudge",
        contactId: "c1",
        from: "ft1",
        kind: "nudge",
        at: "2026-02-01T00:00:00Z",
        scope: "team",
      }),
      thread({ id: "normal_q", contactId: "c2", from: "ft1", kind: "question", at: "2026-02-02T00:00:00Z" }),
    ]);
    expect(items.map((x) => x.id)).toEqual(["thread:normal_q"]);
  });

  it("excludes nudges and questions for contacts not in the trainee's circle when allowedContactIds is provided", () => {
    const items = traineeWaitingItems(
      "t1",
      [
        thread({ id: "q_mine", contactId: "c_mine", from: "ft1", kind: "question", at: "2026-02-02T00:00:00Z" }),
        thread({ id: "q_other", contactId: "c_other", from: "ft1", kind: "question", at: "2026-02-03T00:00:00Z" }),
      ],
      new Set(["c_mine"]),
    );
    expect(items.map((x) => x.id)).toEqual(["thread:q_mine"]);
  });
});

