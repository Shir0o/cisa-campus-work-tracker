import { describe, it, expect } from "vitest";
import {
  FT_TRAINEES,
  FT_OF,
  isTrainee,
  fullTimerOf,
  traineesOf,
  walkingRecipient,
} from "../lib/walking";

describe("walking relationships", () => {
  it("FT_OF is the exact inverse of FT_TRAINEES", () => {
    for (const [ft, trainees] of Object.entries(FT_TRAINEES)) {
      for (const t of trainees) {
        expect(FT_OF[t]).toBe(ft);
      }
    }
    // No trainee maps to more than its single full-timer in the reverse map.
    const traineeCount = Object.values(FT_TRAINEES).reduce((n, ts) => n + ts.length, 0);
    expect(Object.keys(FT_OF).length).toBe(traineeCount);
  });

  it("resolves a seeded full-timer ↔ trainee pair", () => {
    const [ft, trainees] = Object.entries(FT_TRAINEES)[0];
    const trainee = trainees[0];

    expect(isTrainee(trainee)).toBe(true);
    expect(fullTimerOf(trainee)).toBe(ft);
    expect(traineesOf(ft)).toContain(trainee);
    // A full-timer is not themselves a trainee.
    expect(isTrainee(ft)).toBe(false);
  });

  it("treats unknown / nullish uids as not in a relationship", () => {
    expect(isTrainee("nobody")).toBe(false);
    expect(isTrainee(undefined)).toBe(false);
    expect(isTrainee(null)).toBe(false);
    expect(fullTimerOf("nobody")).toBeNull();
    expect(fullTimerOf(undefined)).toBeNull();
    expect(traineesOf("nobody")).toEqual([]);
    expect(traineesOf(undefined)).toEqual([]);
  });
});

describe("walkingRecipient", () => {
  const [ft, trainees] = Object.entries(FT_TRAINEES)[0];
  const trainee = trainees[0];

  it("routes a trainee's message to their full-timer", () => {
    expect(walkingRecipient(trainee, "anyone")).toBe(ft);
  });

  it("routes a full-timer's message to the trainee who added the contact", () => {
    expect(walkingRecipient(ft, trainee)).toBe(trainee);
  });

  it("returns null when the contact wasn't added by a trainee the full-timer walks with", () => {
    expect(walkingRecipient(ft, "some-other-uid")).toBeNull();
    expect(walkingRecipient(ft, undefined)).toBeNull();
  });

  it("returns null for a nullish sender", () => {
    expect(walkingRecipient(undefined, trainee)).toBeNull();
    expect(walkingRecipient(null)).toBeNull();
  });
});
