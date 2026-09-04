import { describe, it, expect, beforeEach } from "vitest";
import {
  filterAttentionStacks,
  actorsInStacks,
  soleTeamOf,
  type AttentionStack,
} from "../lib/attention";
import { applyTeams } from "../lib/teams";

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

// Mei and Daniel are on YP; Grace and Jonah on Campus.
const roster = [
  { uid: "mei", team: "yp", displayName: "Mei Tanaka" },
  { uid: "daniel", team: "yp", displayName: "Daniel Okonkwo" },
  { uid: "grace", team: "campus", displayName: "Grace Lim" },
  { uid: "jonah", team: "campus", displayName: "Jonah Reyes" },
];

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
  beforeEach(() => applyTeams(roster));

  it("returns the stacks untouched when nothing is chosen", () => {
    const out = filterAttentionStacks(stacks, {});
    expect(out).toBe(stacks);
  });

  it("cuts on who did it, not on the contact", () => {
    expect(ids(filterAttentionStacks(stacks, { team: "yp" }))).toEqual([
      "kofi",
      "elena",
      "sofia",
    ]);
  });

  it("narrows to one teammate", () => {
    expect(ids(filterAttentionStacks(stacks, { who: "mei" }))).toEqual([
      "kofi",
      "sofia",
    ]);
  });

  it("keeps a stack two people touched under either of their teams", () => {
    expect(ids(filterAttentionStacks(stacks, { team: "campus" }))).toContain("sofia");
  });

  it("drops actorless stacks once a filter is on — nobody did them", () => {
    expect(ids(filterAttentionStacks(stacks, { team: "yp" }))).not.toContain("notif");
    expect(ids(filterAttentionStacks(stacks, {}))).toContain("notif");
  });

  it("requires one actor to satisfy both the team and the teammate", () => {
    // Grace is on Campus, so asking for Grace within YP matches nobody.
    expect(filterAttentionStacks(stacks, { team: "yp", who: "grace" })).toEqual([]);
  });

  it("returns an empty list rather than everything when a filter matches nothing", () => {
    expect(filterAttentionStacks(stacks, { who: "nobody" })).toEqual([]);
  });
});

describe("actorsInStacks (#727)", () => {
  beforeEach(() => applyTeams(roster));

  it("lists the distinct actors, so the select only offers people who show up", () => {
    expect(actorsInStacks(stacks).sort()).toEqual(["daniel", "grace", "jonah", "mei"]);
  });

  it("scopes the actors to a team when one is chosen", () => {
    expect(actorsInStacks(stacks, "yp").sort()).toEqual(["daniel", "mei"]);
  });
});

describe("soleTeamOf (#727)", () => {
  beforeEach(() => applyTeams(roster));

  it("names the team when the actors agree", () => {
    expect(soleTeamOf(stack("x", ["mei", "daniel"]))).toBe("yp");
  });

  it("says nothing when two teams touched it, or when nobody is on one", () => {
    expect(soleTeamOf(stack("x", ["mei", "grace"]))).toBeNull();
    expect(soleTeamOf(stack("x", ["ruth"]))).toBeNull();
    expect(soleTeamOf(stack("x", []))).toBeNull();
  });
});
