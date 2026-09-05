import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../lib/firebase", () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { READ: "read", WRITE: "write", LIST: "list", CREATE: "create", UPDATE: "update" },
}));

import {
  InboxState,
  PRUNE_AFTER_DAYS,
  __resetInboxState,
  localRefs,
  pruned,
  staleIds,
} from "../lib/inboxState";
import { UserEntityState, __resetUserEntityStateCache } from "../lib/userEntityState";

const DAY = 86_400_000;
const NOW = Date.parse("2026-09-04T12:00:00.000Z");
const daysAgo = (n: number) => new Date(NOW - n * DAY).toISOString();

describe("inboxState — pruning ids that stopped being interesting (#813)", () => {
  it("finds nothing in an empty or absent map", () => {
    expect(staleIds(undefined, PRUNE_AFTER_DAYS, NOW)).toEqual([]);
    expect(staleIds({}, PRUNE_AFTER_DAYS, NOW)).toEqual([]);
  });

  it("keeps ids from inside the term and drops the ones from before it", () => {
    const stamps = {
      fresh: daysAgo(1),
      lastMonth: daysAgo(30),
      lastTerm: daysAgo(PRUNE_AFTER_DAYS + 1),
      ancient: daysAgo(400),
    };
    expect(staleIds(stamps, PRUNE_AFTER_DAYS, NOW).sort()).toEqual(["ancient", "lastTerm"]);
    expect(Object.keys(pruned(stamps, NOW)).sort()).toEqual(["fresh", "lastMonth"]);
  });

  it("holds an id that is exactly on the boundary", () => {
    const stamps = { edge: daysAgo(PRUNE_AFTER_DAYS) };
    expect(staleIds(stamps, PRUNE_AFTER_DAYS, NOW)).toEqual([]);
  });

  it("keeps an unparseable stamp rather than silently losing the id", () => {
    const stamps = { broken: "not a date", fine: daysAgo(2) };
    expect(staleIds(stamps, PRUNE_AFTER_DAYS, NOW)).toEqual([]);
    expect(Object.keys(pruned(stamps, NOW)).sort()).toEqual(["broken", "fine"]);
  });

  it("leaves a document with nothing stale untouched", () => {
    const stamps = { a: daysAgo(3), b: daysAgo(9) };
    expect(pruned(stamps, NOW)).toEqual(stamps);
  });
});

describe("inboxState — the two axes stay apart", () => {
  const uid = "u1";

  beforeEach(() => {
    localStorage.clear();
    __resetUserEntityStateCache();
    __resetInboxState();
    vi.clearAllMocks();
  });

  it("marking something seen never marks it completed", () => {
    InboxState.markSeen(uid, "att:contact:c1");
    expect(InboxState.isSeen(uid, "att:contact:c1")).toBe(true);
    expect(InboxState.isCompleted(uid, "att:contact:c1")).toBe(false);
  });

  it("completing something leaves it unseen if it was never opened", () => {
    InboxState.markCompleted(uid, "att:contact:c1");
    expect(InboxState.isCompleted(uid, "att:contact:c1")).toBe(true);
    expect(InboxState.isSeen(uid, "att:contact:c1")).toBe(false);
  });

  it("undo takes a completion back and nothing else", () => {
    InboxState.markSeen(uid, "att:contact:c1");
    InboxState.markCompleted(uid, "att:contact:c1");
    InboxState.undoCompleted(uid, "att:contact:c1");
    expect(InboxState.isCompleted(uid, "att:contact:c1")).toBe(false);
    expect(InboxState.isSeen(uid, "att:contact:c1")).toBe(true);
  });

  it("takes a whole list at once, which is what Mark all seen does", () => {
    InboxState.markSeen(uid, ["att:contact:c1", "att:contact:c2"]);
    expect(InboxState.isSeen(uid, "att:contact:c1")).toBe(true);
    expect(InboxState.isSeen(uid, "att:contact:c2")).toBe(true);
  });

  it("keeps one person's worklist out of another's", () => {
    InboxState.markCompleted("ana", "att:contact:c1");
    expect(InboxState.isCompleted("ana", "att:contact:c1")).toBe(true);
    expect(InboxState.isCompleted("david", "att:contact:c1")).toBe(false);
  });

  it("mirrors into the local store, which is the synchronous cache in front", () => {
    InboxState.markSeen(uid, "att:contact:c1");
    InboxState.markCompleted(uid, "att:target:t1");
    expect(UserEntityState.isRead(uid, "att:contact:c1")).toBe(true);
    expect(UserEntityState.isDone(uid, "att:target:t1")).toBe(true);
  });

  it("reads back what this browser already knew, before any snapshot lands", () => {
    UserEntityState.markRead(uid, "att:contact:old");
    UserEntityState.markDone(uid, "att:contact:cleared");
    __resetInboxState();

    expect(localRefs(uid)).toEqual({
      seen: ["att:contact:old"],
      completed: ["att:contact:cleared"],
    });
    expect(InboxState.isSeen(uid, "att:contact:old")).toBe(true);
    expect(InboxState.isCompleted(uid, "att:contact:cleared")).toBe(true);
  });
});
