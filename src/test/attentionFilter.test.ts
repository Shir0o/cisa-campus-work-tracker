import { describe, it, expect } from "vitest";
import {
  filterAttentionStacks,
  actorsInStacks,
  type AttentionStack,
} from "../lib/attention";

const stack = (id: string, by: string[]): AttentionStack =>
  ({
    id,
    contactId: id,
    targetId: null,
    items: [],
    at: new Date().toISOString(),
    bucket: "today",
    by,
    kinds: ["contact"],
    unread: 0,
  }) as AttentionStack;

// Mei and Daniel are on YP; Grace and Jonah on Campus; Ruth is unassigned.
const teamOf = (uid: string) =>
  ({ mei: "yp", daniel: "yp", grace: "campus", jonah: "campus" })[uid] ?? null;

const stacks = [
  stack("kofi", ["mei"]),
  stack("elena", ["daniel"]),
  stack("aisha", ["grace"]),
  stack("marcus", ["jonah"]),
  stack("sofia", ["mei", "grace"]),
  stack("notif", []),
];

const ids = (s: AttentionStack[]) => s.map((x) => x.id);

describe("filterAttentionStacks (#727)", () => {
  it("returns the stacks untouched when nothing is chosen", () => {
    const out = filterAttentionStacks(stacks, {}, teamOf);
    expect(out).toBe(stacks);
  });

  it("cuts on who did it, not on the contact", () => {
    expect(ids(filterAttentionStacks(stacks, { team: "yp" }, teamOf))).toEqual([
      "kofi",
      "elena",
      "sofia",
    ]);
  });

  it("narrows to one teammate", () => {
    expect(ids(filterAttentionStacks(stacks, { who: "mei" }, teamOf))).toEqual([
      "kofi",
      "sofia",
    ]);
  });

  it("keeps a stack two people touched under either of their teams", () => {
    expect(ids(filterAttentionStacks(stacks, { team: "campus" }, teamOf))).toContain("sofia");
  });

  it("drops actorless stacks once a filter is on — nobody did them", () => {
    expect(ids(filterAttentionStacks(stacks, { team: "yp" }, teamOf))).not.toContain("notif");
    expect(ids(filterAttentionStacks(stacks, {}, teamOf))).toContain("notif");
  });

  it("requires one actor to satisfy both the team and the teammate", () => {
    // Grace is on Campus, so asking for Grace within YP matches nobody.
    expect(filterAttentionStacks(stacks, { team: "yp", who: "grace" }, teamOf)).toEqual([]);
  });

  it("returns an empty list rather than everything when a filter matches nothing", () => {
    expect(filterAttentionStacks(stacks, { who: "nobody" }, teamOf)).toEqual([]);
  });
});

describe("actorsInStacks (#727)", () => {
  it("lists the distinct actors, so the select only offers people who show up", () => {
    expect(actorsInStacks(stacks).sort()).toEqual(["daniel", "grace", "jonah", "mei"]);
  });

  it("scopes the actors to a team when one is chosen", () => {
    expect(actorsInStacks(stacks, "yp", teamOf).sort()).toEqual(["daniel", "mei"]);
  });
});
