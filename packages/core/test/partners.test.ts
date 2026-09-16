import { describe, it, expect } from "vitest";
import {
  dayKey,
  shiftDay,
  termBounds,
  partnersTermKey,
  cleanPartnerGroups,
  groupsForTerm,
  cleanPairings,
  pairingId,
  pairingCovers,
  pairingsOverlap,
  findOverlap,
  partnersAt,
  pairingsByTerm,
  migrateByTermToPairings,
  openPairing,
  endPairing,
  rePair,
  applyPartners,
  currentTermKey,
  partnersOf,
  stampPartners,
  serializePairings,
  serializeByTerm,
  deserializeByTerm,
  deserializePartners,
  type PartnerPairing,
} from "../src/data/partners";

const P = (id: string, members: string[], startDate: string, endDate?: string): PartnerPairing => ({
  id,
  members,
  startDate,
  ...(endDate ? { endDate } : {}),
});

describe("days & terms", () => {
  it("dayKey formats a local calendar day as YYYY-MM-DD", () => {
    expect(dayKey(new Date(2026, 8, 1))).toBe("2026-09-01");
    expect(dayKey(new Date(2026, 11, 31))).toBe("2026-12-31");
  });

  it("shiftDay moves a day key forward and back across month bounds", () => {
    expect(shiftDay("2026-09-01", 1)).toBe("2026-09-02");
    expect(shiftDay("2026-09-01", -1)).toBe("2026-08-31");
    expect(shiftDay("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("termBounds returns the first/last day of a labelled term", () => {
    expect(termBounds("Fall 2026")).toEqual({ start: "2026-08-01", end: "2026-12-31" });
    expect(termBounds("Spring 2026")).toEqual({ start: "2026-03-01", end: "2026-05-31" });
    expect(termBounds("Winter 2026")).toEqual({ start: "2026-01-01", end: "2026-02-28" });
  });

  it("termBounds is null for unrecognised keys", () => {
    expect(termBounds("Mictober 2026")).toBeNull();
    expect(termBounds("Fall")).toBeNull();
    expect(termBounds("Fall 2026 x")).toBeNull();
  });

  it("labels a date with its season and year", () => {
    expect(partnersTermKey(new Date(2026, 2, 15))).toBe("Spring 2026");
    expect(partnersTermKey(new Date(2026, 8, 1))).toBe("Fall 2026");
  });
});

describe("legacy per-term groups (migration input)", () => {
  it("cleanPartnerGroups drops groups with fewer than two people and de-dupes", () => {
    expect(cleanPartnerGroups([["a", "b"], ["solo"], ["x", "x", "y"], null as any, ["", "b"]])).toEqual([
      ["a", "b"],
      ["x", "y"],
    ]);
    expect(cleanPartnerGroups(undefined)).toEqual([]);
    expect(cleanPartnerGroups(null)).toEqual([]);
  });

  it("groupsForTerm reads one term, cleaned", () => {
    expect(groupsForTerm({ "Fall 2026": [["a", "b"], ["solo"]] }, "Fall 2026")).toEqual([["a", "b"]]);
    expect(groupsForTerm(undefined, "Fall 2026")).toEqual([]);
  });
});

describe("cleanPairings", () => {
  it("normalises members, ids and drops invalid records", () => {
    const cleaned = cleanPairings([
      P("1", ["a", "b"], "2026-09-01"),
      { id: "", members: ["x", "x", "y"], startDate: "2026-09-01" },
      { id: "", members: ["solo"], startDate: "2026-09-01" } as any,
      P("3", ["a", "b"], "not-a-date"),
      P("4", ["a", "b"], "2026-09-10", "2026-09-01"),
      null as any,
    ]);
    expect(cleaned).toEqual([
      P("1", ["a", "b"], "2026-09-01"),
      { id: "x+y@2026-09-01", members: ["x", "y"], startDate: "2026-09-01" },
    ]);
  });

  it("keeps an open-ended record when endDate is absent or null", () => {
    expect(cleanPairings([P("1", ["a", "b"], "2026-09-01")])[0].endDate).toBeUndefined();
    expect(cleanPairings([{ ...P("1", ["a", "b"], "2026-09-01"), endDate: null }])[0].endDate).toBeUndefined();
  });
});

describe("pairing interval logic", () => {
  it("pairingCovers is inclusive of start and end, and open-ended when endDate is absent", () => {
    const open = P("1", ["a", "b"], "2026-09-01");
    expect(pairingCovers(open, "2026-09-01")).toBe(true);
    expect(pairingCovers(open, "2026-12-25")).toBe(true);
    const closed = P("1", ["a", "b"], "2026-09-01", "2026-09-30");
    expect(pairingCovers(closed, "2026-09-01")).toBe(true);
    expect(pairingCovers(closed, "2026-09-30")).toBe(true);
    expect(pairingCovers(closed, "2026-10-01")).toBe(false);
  });

  it("pairingsOverlap is true when ranges intersect", () => {
    expect(pairingsOverlap(P("1", ["a"], "2026-09-01", "2026-09-15"), P("2", ["a"], "2026-09-10", "2026-09-20"))).toBe(true);
    expect(pairingsOverlap(P("1", ["a"], "2026-09-01", "2026-09-10"), P("2", ["a"], "2026-09-11", "2026-09-20"))).toBe(false);
    // an open-ended pairing overlaps anything that starts before forever
    expect(pairingsOverlap(P("1", ["a"], "2026-09-01"), P("2", ["a"], "2026-10-01"))).toBe(true);
  });

  it("findOverlap returns the conflicting pairing only when a member is shared", () => {
    const base = [P("1", ["a", "b"], "2026-09-01")];
    expect(findOverlap(base, ["a", "c"], "2026-09-10")).toEqual(P("1", ["a", "b"], "2026-09-01"));
    // different people, same time — no conflict
    expect(findOverlap(base, ["x", "y"], "2026-09-10")).toBeNull();
  });
});

describe("partnersAt — who was paired with whom at an instant", () => {
  const history = [
    P("1", ["a", "b"], "2026-01-01", "2026-06-30"),
    P("2", ["a", "c"], "2026-08-01"), // open
  ];

  it("resolves one answer for any past date the history covers", () => {
    expect(partnersAt(history, "a", "2026-03-15")).toEqual(["b"]);
    expect(partnersAt(history, "a", "2026-09-15")).toEqual(["c"]);
    expect(partnersAt(history, "b", "2026-03-15")).toEqual(["a"]);
  });

  it("answers nothing for a date before the pairing began or after it ended", () => {
    expect(partnersAt(history, "a", "2025-12-31")).toEqual([]);
    expect(partnersAt(history, "a", "2026-07-15")).toEqual([]);
    expect(partnersAt(history, "nobody", "2026-03-15")).toEqual([]);
  });
});

describe("pairingsByTerm", () => {
  it("groups pairings by the term they began in", () => {
    const byTerm = pairingsByTerm([
      P("1", ["a", "b"], "2026-03-01"),
      P("2", ["c", "d"], "2026-09-01"),
    ]);
    expect(Object.keys(byTerm).sort()).toEqual(["Fall 2026", "Spring 2026"]);
    expect(byTerm["Spring 2026"].map((p) => p.id)).toEqual(["1"]);
    expect(byTerm["Fall 2026"].map((p) => p.id)).toEqual(["2"]);
  });
});

describe("migrateByTermToPairings", () => {
  it("turns a per-term arrangement into dated records using term boundaries", () => {
    const migrated = migrateByTermToPairings(
      { "Spring 2026": [["a", "b"]], "Fall 2026": [["c", "d"]] },
      new Date(2026, 8, 1), // Fall 2026
    );
    expect(migrated).toEqual([
      P(pairingId(["a", "b"], "2026-03-01"), ["a", "b"], "2026-03-01", "2026-05-31"),
      P(pairingId(["c", "d"], "2026-08-01"), ["c", "d"], "2026-08-01"), // current term stays open
    ]);
  });

  it("an unrecognised term key keeps its group dated to now so nothing is lost", () => {
    const migrated = migrateByTermToPairings({ Mictober: [["a", "b"]] }, new Date(2026, 8, 1));
    expect(migrated).toEqual([P(pairingId(["a", "b"], "2026-09-01"), ["a", "b"], "2026-09-01", "2026-09-01")]);
  });
});

describe("openPairing", () => {
  it("records a pairing with a start date (defaults to today, accepts a past date)", () => {
    const none = openPairing([], ["a", "b"]);
    expect(none).toHaveLength(1);
    expect(none[0].startDate).toBe(dayKey());
    const backdated = openPairing([], ["a", "b"], "2026-01-10");
    expect(backdated[0].startDate).toBe("2026-01-10");
  });

  it("rejects a pairing that overlaps an existing pairing of any member", () => {
    const base = [P("1", ["a", "b"], "2026-09-01")];
    const rejected = openPairing(base, ["b", "c"], "2026-09-15");
    expect(rejected).toEqual(base);
  });
});

describe("endPairing", () => {
  it("ends an open pairing on a date", () => {
    const base = [P("1", ["a", "b"], "2026-09-01")];
    const ended = endPairing(base, "1", "2026-10-15");
    expect(ended[0].endDate).toBe("2026-10-15");
  });

  it("leaves an already-closed pairing alone (append-only correction)", () => {
    const base = [P("1", ["a", "b"], "2026-09-01", "2026-09-30")];
    expect(endPairing(base, "1", "2026-10-15")).toEqual(base);
  });
});

describe("rePair", () => {
  it("closes the previous pairing and opens a new one, keeping both readable", () => {
    const base = [P("1", ["a", "b"], "2026-08-01")];
    const next = rePair(base, ["a", "c"], "2026-10-15");
    expect(next).toHaveLength(2);
    const old = next.find((p) => p.id === "1")!;
    expect(old.endDate).toBe("2026-10-14");
    const fresh = next.find((p) => p.id === pairingId(["a", "c"], "2026-10-15"))!;
    expect(fresh.startDate).toBe("2026-10-15");
    expect(fresh.endDate).toBeUndefined();
    // the pre-change arrangement is still readable on the day before
    expect(partnersAt(next, "a", "2026-10-14")).toEqual(["b"]);
    expect(partnersAt(next, "a", "2026-10-15")).toEqual(["c"]);
  });

  it("refuses to re-pair while the old pairing still covers the date", () => {
    const base = [P("1", ["a", "b"], "2026-08-01", "2026-09-15")];
    const next = rePair(base, ["a", "c"], "2026-09-01");
    expect(next).toEqual(base);
  });
});

describe("applyPartners / partnersOf / stampPartners", () => {
  it("applyPartners keeps the dated history and partnersOf answers the day of apply", () => {
    applyPartners([P("1", ["a", "b"], "2026-08-01")], new Date(2026, 8, 1));
    expect(currentTermKey()).toBe("Fall 2026");
    expect(partnersOf("a")).toEqual(["b"]);
    expect(partnersOf("b")).toEqual(["a"]);
    expect(partnersOf(undefined)).toEqual([]);
  });

  it("stampPartners names the adder's partner as a co-creator", () => {
    applyPartners([P("1", ["a", "b"], "2026-08-01")], new Date(2026, 8, 1));
    const contact = stampPartners<{ name: string; coCreators?: string[] }>({ name: "Mira" }, "a");
    expect(contact.coCreators).toEqual(["b"]);
    const again = stampPartners<{ name: string; coCreators?: string[] }>({ name: "Mira", coCreators: ["b", "c"] }, "a");
    expect(again.coCreators).toEqual(["b", "c"]);
  });

  it("stampPartners is a no-op without a partner or a uid", () => {
    applyPartners([P("1", ["a", "b"], "2026-08-01")], new Date(2026, 8, 1));
    expect(stampPartners({ name: "Mira" }, "solo")).toEqual({ name: "Mira" });
    expect(stampPartners({ name: "Mira" }, null)).toEqual({ name: "Mira" });
    expect(stampPartners({ name: "Mira" }, undefined)).toEqual({ name: "Mira" });
  });
});

describe("serialization", () => {
  it("serializePairings writes flat arrays (Firestore-safe) and omits a null end", () => {
    const serialized = serializePairings([P("1", ["a", "b"], "2026-09-01"), P("2", ["c", "d"], "2026-09-01", "2026-09-30")]);
    expect(serialized).toEqual([
      { id: "1", members: ["a", "b"], startDate: "2026-09-01" },
      { id: "2", members: ["c", "d"], startDate: "2026-09-01", endDate: "2026-09-30" },
    ]);
  });

  it("deserializePartners reads the dated records when present", () => {
    const raw = { pairings: [{ id: "1", members: ["a", "b"], startDate: "2026-09-01" }] };
    expect(deserializePartners(raw)).toEqual([P("1", ["a", "b"], "2026-09-01")]);
  });

  it("deserializePartners migrates a legacy byTerm shape in memory", () => {
    const raw = { byTerm: { "Fall 2026": [{ members: ["a", "b"] }] } };
    const out = deserializePartners(raw);
    expect(out[0].members).toEqual(["a", "b"]);
    expect(out[0].startDate).toBe("2026-08-01");
  });

  it("legacy byTerm serialization helpers still round-trip", () => {
    const input = { "Fall 2026": [["a", "b"]] };
    const serialized = serializeByTerm(input);
    expect(serialized).toEqual({ "Fall 2026": [{ members: ["a", "b"] }] });
    expect(deserializeByTerm(serialized)).toEqual(input);
    expect(deserializeByTerm(null)).toEqual({});
  });
});