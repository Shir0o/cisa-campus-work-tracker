import { describe, it, expect } from "vitest";
import {
  aroundTeamStackIds,
  aroundTeamToWorkThrough,
  reviewedStackIds,
  REVIEWED_PRUNE_AFTER_DAYS,
  type AroundTeamInput,
} from "../src/aroundTeam";

// The Full-timer's "to work through" count (#1336): the Around the team cards
// not yet Reviewed. The web copy in src/lib/attention.ts is the behaviour
// oracle; src/test/aroundTeamParity.test.ts holds the two in step.

const ME = "ft1";
const T0 = "2026-06-01T12:00:00.000Z";
const LATER = "2026-06-01T13:00:00.000Z";

const base: AroundTeamInput = {
  uid: ME,
  contacts: [
    { id: "mine", createdBy: ME },
    { id: "theirs", createdBy: "tr1" },
    { id: "nobody" },
    { id: "co", createdBy: "tr1", coCreators: [ME] },
  ],
  interactions: [],
  threads: [],
};

describe("aroundTeamStackIds", () => {
  it("is one card per person someone else added, never the reader's own or a tied one", () => {
    expect(aroundTeamStackIds(base).sort()).toEqual(["att:contact:nobody", "att:contact:theirs"]);
  });

  it("leaves a person the reader keeps on their own My Day to On you", () => {
    expect(aroundTeamStackIds({ ...base, personalContactIds: new Set(["theirs"]) })).toEqual([
      "att:contact:nobody",
    ]);
  });

  it("moves a card that mentions the reader to On you", () => {
    const ids = aroundTeamStackIds({
      ...base,
      threads: [{ id: "m1", contactId: "theirs", from: "tr1", kind: "comment", at: T0, mentionedUserIds: [ME] }],
    });
    expect(ids).toEqual(["att:contact:nobody"]);
  });

  it("moves a card with the reader's own unanswered question to On you, and back once answered", () => {
    const asked = { id: "q1", contactId: "theirs", from: ME, kind: "question", at: T0 };
    expect(aroundTeamStackIds({ ...base, threads: [asked] })).toEqual(["att:contact:nobody"]);
    const answered = { id: "r1", contactId: "theirs", from: "tr1", kind: "comment", at: LATER };
    expect(aroundTeamStackIds({ ...base, threads: [asked, answered] }).sort()).toEqual([
      "att:contact:nobody",
      "att:contact:theirs",
    ]);
  });

  it("gives a teammate's activity on a person with no contact doc its own card", () => {
    const ids = aroundTeamStackIds({
      ...base,
      contacts: [],
      interactions: [
        { id: "i1", contactId: "gone", userId: "tr1" },
        { id: "i2", contactId: "gone2", userId: ME },
      ],
    });
    expect(ids).toEqual(["att:contact:gone"]);
  });
});

describe("aroundTeamToWorkThrough", () => {
  it("counts the cards not yet Reviewed", () => {
    expect(aroundTeamToWorkThrough(base, new Set())).toBe(2);
    expect(aroundTeamToWorkThrough(base, new Set(["att:contact:theirs"]))).toBe(1);
    expect(aroundTeamToWorkThrough(base, new Set(["att:contact:theirs", "att:contact:nobody"]))).toBe(0);
  });
});

describe("reviewedStackIds", () => {
  const NOW = Date.parse("2026-06-02T00:00:00.000Z");
  const DAY = 86_400_000;

  it("reads the Reviewed stamps, dropping any older than a term", () => {
    const ids = reviewedStackIds(
      {
        fresh: new Date(NOW - DAY).toISOString(),
        stale: new Date(NOW - (REVIEWED_PRUNE_AFTER_DAYS + 1) * DAY).toISOString(),
        undated: "not a date",
      },
      NOW,
    );
    expect([...ids].sort()).toEqual(["fresh", "undated"]);
  });

  it("is empty with no stamps", () => {
    expect(reviewedStackIds(undefined, NOW).size).toBe(0);
  });
});
