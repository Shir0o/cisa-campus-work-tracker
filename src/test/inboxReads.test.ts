import { describe, it, expect, beforeEach, vi } from "vitest";
import { InboxReads, __resetInboxReadsCache } from "../lib/inboxReads";

describe("InboxReads (per-user localStorage read-state)", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetInboxReadsCache();
  });

  it("tracks read state per uid, namespaced in localStorage", () => {
    expect(InboxReads.isRead("uidA", "contact:1")).toBe(false);

    InboxReads.markRead("uidA", "contact:1");
    expect(InboxReads.isRead("uidA", "contact:1")).toBe(true);
    // Different user does not see uidA's reads.
    expect(InboxReads.isRead("uidB", "contact:1")).toBe(false);

    const raw = localStorage.getItem("cisa.inbox.read.uidA");
    expect(JSON.parse(raw as string)).toContain("contact:1");
  });

  it("markUnread removes an item", () => {
    InboxReads.markRead("uidA", "interaction:9");
    InboxReads.markUnread("uidA", "interaction:9");
    expect(InboxReads.isRead("uidA", "interaction:9")).toBe(false);
  });

  it("markAll adds many at once", () => {
    InboxReads.markAll("uidA", ["thread:1", "thread:2", "contact:3"]);
    expect(InboxReads.isRead("uidA", "thread:1")).toBe(true);
    expect(InboxReads.isRead("uidA", "thread:2")).toBe(true);
    expect(InboxReads.isRead("uidA", "contact:3")).toBe(true);
  });

  it("notifies subscribers only on real changes", () => {
    const fn = vi.fn();
    const unsub = InboxReads.subscribe(fn);

    InboxReads.markRead("uidA", "contact:1");
    expect(fn).toHaveBeenCalledTimes(1);

    // No-op (already read) — should not emit.
    InboxReads.markRead("uidA", "contact:1");
    expect(fn).toHaveBeenCalledTimes(1);

    InboxReads.markUnread("uidA", "contact:1");
    expect(fn).toHaveBeenCalledTimes(2);

    unsub();
    InboxReads.markRead("uidA", "contact:1");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("hydrates existing read-state from localStorage", () => {
    localStorage.setItem("cisa.inbox.read.uidZ", JSON.stringify(["contact:42"]));
    __resetInboxReadsCache();
    expect(InboxReads.isRead("uidZ", "contact:42")).toBe(true);
  });
});
