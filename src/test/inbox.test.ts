import { describe, it, expect, vi } from "vitest";
import type { Contact, Interaction } from "../types";
import { inboxItemsFor, traineeWaitingItems, type ThreadMessageWithContact } from "../lib/inbox";

// Control the roster so the test is independent of the real seed.
vi.mock("../lib/walking", () => ({
  isFullTimer: (uid?: string | null) => uid === "ft1",
  isTrainee: (uid?: string | null) => uid === "t1",
  fullTimerIds: () => ["ft1"],
  traineeIds: () => ["t1"],
}));

const contact = (over: Partial<Contact>): Contact =>
  ({ id: "c", name: "X", initials: "X", role: "", location: "", email: "", phone: "", stage: "", lastSeen: "", ...over }) as Contact;

const interaction = (over: Partial<Interaction>): Interaction =>
  ({ id: "i", content: "", dateTime: "", createdAt: "", ...over }) as Interaction;

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

describe("inboxItemsFor", () => {
  it("returns nothing for a non-full-timer", () => {
    expect(inboxItemsFor("stranger", { contacts: [], interactions: [], threads: [] })).toEqual([]);
  });

  it("includes contacts added by anyone but the full-timer, carrying the reviewed flag", () => {
    const items = inboxItemsFor("ft1", {
      contacts: [
        contact({ id: "c1", createdBy: "t1", reviewed: true, createdAt: "2026-01-02T00:00:00Z" }),
        contact({ id: "c2", createdBy: "someone-else", createdAt: "2026-01-03T00:00:00Z" }),
        // the full-timer's own contact and a creator-less one never surface
        contact({ id: "cMine", createdBy: "ft1", createdAt: "2026-01-04T00:00:00Z" }),
        contact({ id: "cNone", createdAt: "2026-01-05T00:00:00Z" }),
      ],
      interactions: [],
      threads: [],
    });
    // newest-first
    expect(items.map((x) => x.id)).toEqual(["contact:c2", "contact:c1"]);
    expect(items.find((x) => x.id === "contact:c1")).toMatchObject({ by: "t1", reviewed: true });
  });

  it("includes interactions logged by anyone but the full-timer", () => {
    const items = inboxItemsFor("ft1", {
      contacts: [],
      interactions: [
        interaction({ id: "i1", userId: "t1", contactId: "c1", createdAt: "2026-01-03T00:00:00Z" }),
        interaction({ id: "i2", userId: "other", contactId: "c2", createdAt: "2026-01-04T00:00:00Z" }),
        // the full-timer's own log doesn't surface
        interaction({ id: "iMine", userId: "ft1", contactId: "c3", createdAt: "2026-01-05T00:00:00Z" }),
      ],
      threads: [],
    });
    expect(items.map((x) => x.id)).toEqual(["interaction:i2", "interaction:i1"]);
  });

  it("surfaces unanswered questions from the team and drops answered or own ones", () => {
    const items = inboxItemsFor("ft1", {
      contacts: [],
      interactions: [],
      threads: [
        // unanswered question from a teammate
        thread({ id: "q1", contactId: "c1", from: "t1", kind: "question", at: "2026-02-01T00:00:00Z" }),
        // answered: a later reply from the full-timer at the same level
        thread({ id: "q2", contactId: "c2", from: "t1", kind: "question", at: "2026-02-01T00:00:00Z" }),
        thread({ id: "r2", contactId: "c2", from: "ft1", kind: "comment", at: "2026-02-02T00:00:00Z" }),
        // a non-question is never an inbox item on its own
        thread({ id: "n1", contactId: "c3", from: "t1", kind: "note", at: "2026-02-03T00:00:00Z" }),
        // the full-timer's own question doesn't surface in their own inbox
        thread({ id: "qSelf", contactId: "c4", from: "ft1", kind: "question", at: "2026-02-04T00:00:00Z" }),
      ],
    });
    expect(items.map((x) => x.id)).toEqual(["thread:q1"]);
  });

  it("sorts the combined feed newest-first", () => {
    const items = inboxItemsFor("ft1", {
      contacts: [contact({ id: "c1", createdBy: "t1", createdAt: "2026-01-01T00:00:00Z" })],
      interactions: [interaction({ id: "i1", userId: "t1", contactId: "c1", createdAt: "2026-03-01T00:00:00Z" })],
      threads: [thread({ id: "q1", contactId: "c1", from: "t1", kind: "question", at: "2026-02-01T00:00:00Z" })],
    });
    expect(items.map((x) => x.id)).toEqual(["interaction:i1", "thread:q1", "contact:c1"]);
  });
});

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

