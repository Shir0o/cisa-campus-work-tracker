import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  bucketFor,
  bucketLabel,
  bucketOrder,
  type DateBucket,
} from "../components/landing/dateBuckets";

const DAY = 86_400_000;
const ALL_BUCKETS: DateBucket[] = [
  "today",
  "yesterday",
  "thisWeek",
  "lastWeek",
  "thisMonth",
  "lastMonth",
  "older",
];

// System time is pinned to midday so calendar-day and rolling-day arithmetic
// agree for the boundary table; the calendar-day semantics are asserted
// separately below.
const NOW = "2026-08-17T12:00:00";

const daysAgo = (n: number) => new Date(Date.now() - n * DAY);

describe("dateBuckets", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(NOW));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  describe("bucketFor", () => {
    it.each([
      [0, "today"],
      [1, "yesterday"],
      [2, "thisWeek"],
      [6, "thisWeek"],
      [7, "lastWeek"],
      [13, "lastWeek"],
      [14, "thisMonth"],
      [30, "thisMonth"],
      [31, "lastMonth"],
      [60, "lastMonth"],
      [61, "older"],
      [365, "older"],
    ] as const)("maps %i days ago to %s", (days, bucket) => {
      expect(bucketFor(daysAgo(days))).toBe(bucket);
    });

    it("accepts ISO strings, Date objects, and epoch millis", () => {
      const now = new Date();
      expect(bucketFor(now.toISOString())).toBe("today");
      expect(bucketFor(now)).toBe("today");
      expect(bucketFor(now.getTime())).toBe("today");
    });

    it("returns null for empty or unparseable input", () => {
      expect(bucketFor(null)).toBeNull();
      expect(bucketFor(undefined)).toBeNull();
      expect(bucketFor("")).toBeNull();
      expect(bucketFor("not-a-date")).toBeNull();
      expect(bucketFor(Number.NaN)).toBeNull();
    });

    it("groups by calendar day, so 23:59 yesterday is Yesterday, not Today", () => {
      const yesterdayLate = new Date("2026-08-16T23:59:00");
      expect(bucketFor(yesterdayLate)).toBe("yesterday");
    });

    it("clamps future dates to Today", () => {
      expect(bucketFor(new Date(Date.now() + 3 * DAY))).toBe("today");
    });
  });

  describe("bucketLabel", () => {
    it.each([
      ["today", "Today"],
      ["yesterday", "Yesterday"],
      ["thisWeek", "This week"],
      ["lastWeek", "Last week"],
      ["thisMonth", "Earlier this month"],
      ["lastMonth", "Last month"],
      ["older", "Longer ago"],
    ] as const)("labels %s as %s", (key, label) => {
      expect(bucketLabel(key)).toBe(label);
    });

    it("has a warm label for every bucket", () => {
      for (const key of ALL_BUCKETS) {
        expect(bucketLabel(key)).toBeTruthy();
      }
    });
  });

  describe("bucketOrder", () => {
    it.each([
      ["today", 0],
      ["yesterday", 1],
      ["thisWeek", 2],
      ["lastWeek", 3],
      ["thisMonth", 4],
      ["lastMonth", 5],
      ["older", 6],
    ] as const)("orders %s as %i", (key, order) => {
      expect(bucketOrder(key)).toBe(order);
    });

    it("orders every bucket uniquely", () => {
      const orders = ALL_BUCKETS.map(bucketOrder);
      expect(new Set(orders).size).toBe(ALL_BUCKETS.length);
      expect(Math.min(...orders)).toBe(0);
      expect(Math.max(...orders)).toBe(ALL_BUCKETS.length - 1);
    });
  });
});