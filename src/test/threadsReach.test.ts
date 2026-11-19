import { describe, it, expect } from "vitest";
import { buildStream } from "../lib/stream";
import { isOpenAsk, daysOpen, THREAD_KINDS } from "../lib/threads";

// #813 — when a follow-up ask is done.

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

  it("counts calendar days, as the stream does: raised 20 hours ago but yesterday reads 1 day in both", () => {
    const now = new Date(2026, 8, 24, 12, 0).getTime();
    const ask = { id: "ask", from: "maria", fromName: "Maria", kind: "nudge" as const, body: "?", at: new Date(2026, 8, 23, 16, 0).toISOString() };
    const [, row] = buildStream({ messages: [ask], viewer: { uid: "josh", role: "manager" }, now });
    expect(row.type === "row" && row.ask).toEqual({ status: "open", daysOpen: 1 });
    expect(daysOpen(ask, now)).toBe(1);
  });

  it("an ask raised this morning is open 0 days", () => {
    const now = new Date(2026, 8, 24, 12, 0).getTime();
    expect(daysOpen({ at: new Date(2026, 8, 24, 0, 30).toISOString() }, now)).toBe(0);
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
