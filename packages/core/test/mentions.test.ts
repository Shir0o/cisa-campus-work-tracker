import { describe, it, expect } from "vitest";
import { isOpenMention, isOpenMentionFor, joinNames, mentionsClosedByReply, waitingOn } from "../src/mentions";

const msg = (over: Record<string, unknown> = {}) => ({
  id: "m1",
  from: "kate",
  kind: "comment",
  at: "2026-11-01T10:00:00.000Z",
  parentId: null as string | null,
  mentionedUserIds: ["tony", "sarah"] as string[] | undefined,
  closedAt: null as string | null,
  ...over,
});

describe("an @mention is a for-you item", () => {
  it("is open for each mentioned person until it is closed", () => {
    expect(isOpenMentionFor(msg(), "tony")).toBe(true);
    expect(isOpenMentionFor(msg(), "sarah")).toBe(true);
    expect(isOpenMentionFor(msg(), "jae")).toBe(false);
    expect(isOpenMentionFor(msg({ closedAt: "2026-11-02T10:00:00.000Z" }), "tony")).toBe(false);
  });

  it("is never on the sender's own list, even if they named themselves", () => {
    expect(isOpenMentionFor(msg({ mentionedUserIds: ["kate"] }), "kate")).toBe(false);
    expect(isOpenMention(msg({ mentionedUserIds: ["kate"] }))).toBe(false);
  });

  it("is not a mention item without anyone mentioned", () => {
    expect(isOpenMention(msg({ mentionedUserIds: undefined }))).toBe(false);
    expect(isOpenMention(msg({ mentionedUserIds: [] }))).toBe(false);
  });

  it("leaves a legacy question or follow-up ask to its own rules", () => {
    expect(isOpenMention(msg({ kind: "question" }))).toBe(false);
    expect(isOpenMention(msg({ kind: "nudge" }))).toBe(false);
  });

  it("says who it is still waiting on, without the sender", () => {
    expect(waitingOn(msg({ mentionedUserIds: ["tony", "kate", "tony", "sarah"] }))).toEqual(["tony", "sarah"]);
    expect(waitingOn(msg({ closedAt: "2026-11-02T10:00:00.000Z" }))).toEqual([]);
  });
});

describe("a reply closes the mentions it answers", () => {
  const parent = msg();
  const reply = (from: string, over: Record<string, unknown> = {}) =>
    msg({ id: "r-" + from, from, parentId: "m1", at: "2026-11-01T11:00:00.000Z", mentionedUserIds: undefined, ...over });

  it("closes the parent when a mentioned person replies", () => {
    expect(mentionsClosedByReply([parent], reply("sarah")).map((m) => m.id)).toEqual(["m1"]);
  });

  it("does not close it when someone not mentioned replies", () => {
    expect(mentionsClosedByReply([parent], reply("jae"))).toEqual([]);
    expect(mentionsClosedByReply([parent], reply("kate"))).toEqual([]);
  });

  it("does not close a mention that is already closed", () => {
    expect(mentionsClosedByReply([msg({ closedAt: "2026-11-01T10:30:00.000Z" })], reply("tony"))).toEqual([]);
  });

  it("is only a reply that closes: a new top-level message does not", () => {
    expect(mentionsClosedByReply([parent], msg({ id: "m2", from: "tony", mentionedUserIds: undefined }))).toEqual([]);
  });

  it("closes an earlier mention written as a reply in the same Thread", () => {
    const mentionInThread = reply("kate", { id: "r0", at: "2026-11-01T10:30:00.000Z", mentionedUserIds: ["jae"] });
    const answer = reply("jae", { at: "2026-11-01T12:00:00.000Z" });
    expect(mentionsClosedByReply([parent, mentionInThread], answer).map((m) => m.id)).toEqual(["r0"]);
  });

  it("does not close a mention written after the reply, nor one in another Thread", () => {
    const later = reply("kate", { id: "r9", at: "2026-11-01T13:00:00.000Z", mentionedUserIds: ["jae"] });
    const elsewhere = msg({ id: "x1", parentId: "other", mentionedUserIds: ["jae"], at: "2026-11-01T09:00:00.000Z" });
    expect(mentionsClosedByReply([later, elsewhere], reply("jae", { at: "2026-11-01T12:00:00.000Z" }))).toEqual([]);
  });
});

describe("the composer's list line names people plainly", () => {
  it("joins one, two and three names", () => {
    expect(joinNames(["Tony"], "and")).toBe("Tony");
    expect(joinNames(["Tony", "Sarah"], "and")).toBe("Tony and Sarah");
    expect(joinNames(["Tony", "Sarah", "Jae"], "y")).toBe("Tony, Sarah y Jae");
  });
});
