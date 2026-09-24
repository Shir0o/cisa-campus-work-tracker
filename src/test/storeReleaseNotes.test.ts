import { describe, it, expect } from "vitest";
import {
  fitToLimit,
  formatStoreReleaseNotes,
  LIMITS,
} from "../../scripts/store-release-notes";

describe("fitToLimit", () => {
  it("keeps bullets that fit within the limit", () => {
    const bullets = ["First change", "Second change"];
    const result = fitToLimit(bullets, 500);
    expect(result).toBe("• First change\n• Second change");
    expect(result.length).toBeLessThanOrEqual(500);
  });

  it("does not exceed limit when candidate exceeds limit", () => {
    const bullets = ["A".repeat(40), "B".repeat(40)];
    // "• " + 40 chars = 42 chars
    // two bullets = 42 + 1 + 42 = 85 chars
    const result = fitToLimit(bullets, 50);
    expect(result).toBe(`• ${"A".repeat(40)}`);
    expect(result.length).toBeLessThanOrEqual(50);
  });

  it("truncates the first bullet if even the first bullet alone exceeds limit", () => {
    const longBullet = "A".repeat(100);
    const result = fitToLimit([longBullet], 50);
    expect(result.length).toBeLessThanOrEqual(50);
    expect(result.endsWith("…")).toBe(true);
  });
});

describe("formatStoreReleaseNotes", () => {
  it("never exceeds the 500 character limit for Google Play", () => {
    const bullets = [
      "Partners: founders are co-equal, and the current-term widening is retired",
      "Founders are recorded when a person is brought in by a pair, and existing contacts are backfilled",
      "Attendance moves onto the Gathering, with a staged intake and review",
      "Coordination docs can be shared with guests via a link",
      "Bible study copies a permanent per-week link, not just the latest",
      "Bible study renders the verse reference in accent color",
      "Tags suggest BFA and auto-remove the new-contact tag after five days",
      "Retain directory filters when returning from a contact detail",
    ];

    const notes = formatStoreReleaseNotes(bullets, "play");
    expect(notes.length).toBeLessThanOrEqual(LIMITS.play);
    expect(notes.length).toBeLessThanOrEqual(500);
    expect(notes.endsWith("\n")).toBe(false);
  });
});
