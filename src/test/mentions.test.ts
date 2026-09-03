import { describe, it, expect } from "vitest";
import {
  extractMentionCandidate,
  reconcileMentionedUsers,
  filterMentionCandidates,
  type MentionUser,
} from "../lib/mentions";

describe("mentions helper", () => {
  const users: MentionUser[] = [
    { uid: "u1", name: "Tony Wang", role: "admin" },
    { uid: "u2", name: "Zion Park", role: "manager" },
    { uid: "u3", name: "Rio Tan", role: "admin" },
  ];

  it("extracts query when cursor is right after an '@'", () => {
    expect(extractMentionCandidate("Hello @", 7)).toEqual({
      query: "",
      atIndex: 6,
    });
    expect(extractMentionCandidate("Hello @Zio", 10)).toEqual({
      query: "Zio",
      atIndex: 6,
    });
  });

  it("does not trigger when cursor is detached or in normal text", () => {
    expect(extractMentionCandidate("user@example.com", 16)).toBeNull();
    expect(extractMentionCandidate("Hello world", 11)).toBeNull();
  });

  it("filters candidates by query and role for team scope", () => {
    // Normal scope: matches Tony and Zion
    expect(filterMentionCandidates(users, "on", false).map((u) => u.name)).toEqual([
      "Tony Wang",
      "Zion Park",
    ]);

    // Team scope: only admin / full-timers allowed
    expect(filterMentionCandidates(users, "on", true).map((u) => u.name)).toEqual([
      "Tony Wang",
    ]);
  });

  it("reconciles mentionedUserIds by verifying names are still present in text", () => {
    const selected = [
      { uid: "u1", name: "Tony Wang" },
      { uid: "u2", name: "Zion Park" },
    ];
    // Text only contains @Tony Wang
    const text = "Thanks @Tony Wang for the help!";
    expect(reconcileMentionedUsers(text, selected)).toEqual(["u1"]);

    // Case-insensitive match check
    const lowerText = "thanks @tony wang for the help!";
    expect(reconcileMentionedUsers(lowerText, selected)).toEqual(["u1"]);
  });
});
