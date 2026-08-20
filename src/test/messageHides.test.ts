import { describe, it, expect, beforeEach, vi } from "vitest";
import { MessageHides, __resetMessageHidesCache } from "../lib/messageHides";

describe("MessageHides (per-user localStorage hide-from-view state)", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetMessageHidesCache();
  });

  it("hides messages per uid, namespaced in localStorage", () => {
    expect(MessageHides.has("uidA", "m1")).toBe(false);

    MessageHides.hide("uidA", "m1");
    expect(MessageHides.has("uidA", "m1")).toBe(true);
    // Different user does not see uidA's hides.
    expect(MessageHides.has("uidB", "m1")).toBe(false);

    const raw = localStorage.getItem("cisa.user.entity.uidA");
    expect(JSON.parse(raw as string).done).toContain("message:m1");
  });

  it("unhide removes a single message", () => {
    MessageHides.hide("uidA", "m1");
    MessageHides.hide("uidA", "m2");
    MessageHides.unhide("uidA", "m1");
    expect(MessageHides.has("uidA", "m1")).toBe(false);
    expect(MessageHides.has("uidA", "m2")).toBe(true);
  });

  it("unhideAll restores specific messages or everything", () => {
    MessageHides.hide("uidA", "m1");
    MessageHides.hide("uidA", "m2");

    MessageHides.unhideAll("uidA", ["m1"]);
    expect(MessageHides.has("uidA", "m1")).toBe(false);
    expect(MessageHides.has("uidA", "m2")).toBe(true);

    MessageHides.unhideAll("uidA");
    expect(MessageHides.has("uidA", "m2")).toBe(false);
  });

  it("notifies subscribers only on real changes", () => {
    const fn = vi.fn();
    const unsub = MessageHides.subscribe(fn);

    MessageHides.hide("uidA", "m1");
    expect(fn).toHaveBeenCalledTimes(1);

    // No-op (already hidden) — should not emit.
    MessageHides.hide("uidA", "m1");
    expect(fn).toHaveBeenCalledTimes(1);

    MessageHides.unhide("uidA", "m1");
    expect(fn).toHaveBeenCalledTimes(2);

    unsub();
    MessageHides.hide("uidA", "m2");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("hydrates existing hides from localStorage", () => {
    localStorage.setItem("cisa.msg.hidden.uidZ", JSON.stringify(["m42"]));
    __resetMessageHidesCache();
    expect(MessageHides.has("uidZ", "m42")).toBe(true);
  });

  it("useMessageHides hook returns MessageHides for valid uid and null for empty uid", async () => {
    const { useMessageHides } = await import("../lib/messageHides");
    const { renderHook } = await import("@testing-library/react");

    const { result: rNull } = renderHook(() => useMessageHides(null));
    expect(rNull.current).toBeNull();

    const { result: rUid } = renderHook(() => useMessageHides("u1"));
    expect(rUid.current).toBe(MessageHides);
  });
});
