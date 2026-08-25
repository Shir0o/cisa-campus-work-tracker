import { describe, it, expect } from "vitest";
import {
  applyRoster,
  applyWalkingPairs,
  isFullTimer,
  isTrainee,
  fullTimerIds,
  traineeIds,
  fullTimerOf,
  traineesOf,
  walkingRecipient,
} from "../lib/walking";

describe("roster predicates (issue #549 — no pairing)", () => {
  const USERS = [
    { uid: "ft1", role: "admin" },
    { uid: "ft2", role: "admin" },
    { uid: "t1", role: "manager" },
    { uid: "t2", role: "manager" },
    { uid: "other", role: "viewer" },
  ];

  it("isFullTimer / isTrainee read the roster roles", () => {
    applyRoster(USERS);
    expect(isFullTimer("ft1")).toBe(true);
    expect(isFullTimer("ft2")).toBe(true);
    expect(isTrainee("t1")).toBe(true);
    expect(isTrainee("t2")).toBe(true);
    // viewer/community is neither
    expect(isFullTimer("other")).toBe(false);
    expect(isTrainee("other")).toBe(false);
  });

  it("fullTimerIds / traineeIds return the sets", () => {
    applyRoster(USERS);
    expect(fullTimerIds()).toEqual(["ft1", "ft2"]);
    expect(traineeIds()).toEqual(["t1", "t2"]);
  });

  it("treats unknown / nullish uids as neither", () => {
    applyRoster(USERS);
    expect(isFullTimer("nobody")).toBe(false);
    expect(isFullTimer(undefined)).toBe(false);
    expect(isFullTimer(null)).toBe(false);
    expect(isTrainee("nobody")).toBe(false);
    expect(isTrainee(undefined)).toBe(false);
    expect(isTrainee(null)).toBe(false);
  });

  it("applyRoster replaces the previous roster", () => {
    applyRoster(USERS);
    expect(isFullTimer("ft1")).toBe(true);
    applyRoster([{ uid: "ft9", role: "admin" }]);
    expect(isFullTimer("ft1")).toBe(false);
    expect(isFullTimer("ft9")).toBe(true);
    expect(traineeIds()).toEqual([]);
  });
});

describe("archived pairing (kept only for the Settings block)", () => {
  it("applyWalkingPairs still maintains the archived map", () => {
    applyWalkingPairs({ ft1: ["t1"] });
    expect(traineesOf("ft1")).toEqual(["t1"]);
    expect(fullTimerOf("t1")).toBe("ft1");
    applyWalkingPairs({});
  });

  it("isTrainee no longer reflects the archived pairing", () => {
    applyWalkingPairs({ ft1: ["t1"] });
    expect(isTrainee("t1")).toBe(false);
    applyWalkingPairs({});
  });
});

describe("walkingRecipient", () => {
  it("returns null for a nullish sender", () => {
    expect(walkingRecipient(undefined, "t1")).toBeNull();
    expect(walkingRecipient(null)).toBeNull();
  });

  it("a full-timer's reply reaches the trainee who added the contact", () => {
    applyRoster([
      { uid: "ft1", role: "admin" },
      { uid: "t1", role: "manager" },
    ]);
    expect(walkingRecipient("ft1", "t1")).toBe("t1");
    // a full-timer replying to a viewer/community-added contact has no trainee to ping
    expect(walkingRecipient("ft1", "viewer1")).toBeNull();
  });

  it("a trainee's message has no single recipient under the no-pairing model", () => {
    applyRoster([
      { uid: "ft1", role: "admin" },
      { uid: "t1", role: "manager" },
    ]);
    expect(walkingRecipient("t1", "anyone")).toBeNull();
  });
});
