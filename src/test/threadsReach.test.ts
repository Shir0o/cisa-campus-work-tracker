import { describe, it, expect } from "vitest";
import { stakeholderUidsOf, isOpenAsk, daysOpen, THREAD_KINDS } from "../lib/threads";

// #813 — who a message on a contact reaches, and when a follow-up ask is done.

describe("stakeholderUidsOf — everyone tied to the contact", () => {
  it("includes the assigned caregiver, which the notify path used to miss", () => {
    const uids = stakeholderUidsOf({ createdBy: "t1", coCreators: ["t2"], owner: "t3" }, "ft1");
    expect(uids).toEqual(expect.arrayContaining(["t1", "t2", "t3"]));
  });

  it("never tells the poster about their own message", () => {
    expect(stakeholderUidsOf({ createdBy: "t1", owner: "t1" }, "t1")).toEqual([]);
  });

  it("dedupes someone who holds two ties at once", () => {
    // The adder is very often also the owner; they must be notified once.
    expect(stakeholderUidsOf({ createdBy: "t1", owner: "t1", coCreators: ["t1"] }, "ft1")).toEqual(["t1"]);
  });

  it("is empty when the caller passed no stakeholders", () => {
    expect(stakeholderUidsOf(null, "ft1")).toEqual([]);
    expect(stakeholderUidsOf(undefined, "ft1")).toEqual([]);
  });

  it("ignores empty and missing ids rather than notifying nobody-shaped uids", () => {
    expect(stakeholderUidsOf({ createdBy: "", coCreators: [""], owner: null }, "ft1")).toEqual([]);
  });
});

describe("a follow-up ask is open until someone says they did it", () => {
  const at = "2026-09-01T00:00:00.000Z";

  it("is open while nothing has closed it", () => {
    expect(isOpenAsk({ kind: "nudge", closedAt: null })).toBe(true);
  });

  it("is closed once someone recorded following up", () => {
    expect(isOpenAsk({ kind: "nudge", closedAt: "2026-09-02T00:00:00.000Z" })).toBe(false);
  });

  it("only applies to asks — a comment is never an open item", () => {
    expect(isOpenAsk({ kind: "comment", closedAt: null })).toBe(false);
    expect(isOpenAsk({ kind: "question", closedAt: null })).toBe(false);
  });

  it("states its age in whole days as a plain fact", () => {
    const now = new Date("2026-09-07T06:00:00.000Z").getTime();
    expect(daysOpen({ at }, now)).toBe(6);
  });

  it("never reports a negative age for a clock skew", () => {
    expect(daysOpen({ at }, new Date("2026-08-30T00:00:00.000Z").getTime())).toBe(0);
  });

  it("survives an unparseable timestamp", () => {
    expect(daysOpen({ at: "not a date" })).toBe(0);
  });
});

describe("the words on a bell notification", () => {
  it("calls a follow-up ask an ask, not a nudge", () => {
    // "nudge" stays the internal kind name; nothing user-facing says it.
    expect(THREAD_KINDS.nudge.label).toBe("Follow-up");
  });
});
