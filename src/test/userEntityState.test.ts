import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import {
  UserEntityState,
  useUserEntityState,
  useEntityState,
  __resetUserEntityStateCache,
} from "../lib/userEntityState";

describe("UserEntityState (per-user read & done store)", () => {
  beforeEach(() => {
    localStorage.clear();
    __resetUserEntityStateCache();
  });

  describe("read axis", () => {
    it("tracks read state per uid and entity ref", () => {
      expect(UserEntityState.isRead("u1", "contact:123")).toBe(false);

      UserEntityState.markRead("u1", "contact:123");
      expect(UserEntityState.isRead("u1", "contact:123")).toBe(true);
      expect(UserEntityState.isRead("u2", "contact:123")).toBe(false);

      UserEntityState.markUnread("u1", "contact:123");
      expect(UserEntityState.isRead("u1", "contact:123")).toBe(false);
    });

    it("marks multiple entity refs as read", () => {
      UserEntityState.markAllRead("u1", [
        "contact:1",
        "interaction:2",
        "thread:3",
      ]);
      expect(UserEntityState.isRead("u1", "contact:1")).toBe(true);
      expect(UserEntityState.isRead("u1", "interaction:2")).toBe(true);
      expect(UserEntityState.isRead("u1", "thread:3")).toBe(true);
      expect(UserEntityState.isRead("u1", "contact:4")).toBe(false);
    });

    it("allows setRead with explicit boolean", () => {
      UserEntityState.setRead("u1", "contact:1", true);
      expect(UserEntityState.isRead("u1", "contact:1")).toBe(true);
      UserEntityState.setRead("u1", "contact:1", false);
      expect(UserEntityState.isRead("u1", "contact:1")).toBe(false);
    });
  });

  describe("done axis", () => {
    it("tracks done state independently from read state", () => {
      expect(UserEntityState.isDone("u1", "contact:10")).toBe(false);
      expect(UserEntityState.isRead("u1", "contact:10")).toBe(false);

      UserEntityState.markDone("u1", "contact:10");
      expect(UserEntityState.isDone("u1", "contact:10")).toBe(true);
      // Read state remains false unless explicitly set
      expect(UserEntityState.isRead("u1", "contact:10")).toBe(false);

      UserEntityState.markRead("u1", "contact:10");
      expect(UserEntityState.isRead("u1", "contact:10")).toBe(true);
      expect(UserEntityState.isDone("u1", "contact:10")).toBe(true);

      UserEntityState.markUndone("u1", "contact:10");
      expect(UserEntityState.isDone("u1", "contact:10")).toBe(false);
      expect(UserEntityState.isRead("u1", "contact:10")).toBe(true);
    });

    it("marks multiple entity refs as done", () => {
      UserEntityState.markAllDone("u1", ["conv:roomA", "message:msgB"]);
      expect(UserEntityState.isDone("u1", "conv:roomA")).toBe(true);
      expect(UserEntityState.isDone("u1", "message:msgB")).toBe(true);
    });

    it("clears done state for specified refs or all refs", () => {
      UserEntityState.markAllDone("u1", ["conv:1", "conv:2", "conv:3"]);

      UserEntityState.clearDone("u1", ["conv:1", "conv:2"]);
      expect(UserEntityState.isDone("u1", "conv:1")).toBe(false);
      expect(UserEntityState.isDone("u1", "conv:2")).toBe(false);
      expect(UserEntityState.isDone("u1", "conv:3")).toBe(true);

      UserEntityState.clearDone("u1");
      expect(UserEntityState.isDone("u1", "conv:3")).toBe(false);
    });

    it("removes done items correctly when referenced with and without prefixes", () => {
      UserEntityState.setDone("u1", "conv:room10", true);
      expect(UserEntityState.isDone("u1", "room10")).toBe(true);
      UserEntityState.setDone("u1", "room10", false);
      expect(UserEntityState.isDone("u1", "conv:room10")).toBe(false);

      UserEntityState.setDone("u1", "message:m10", true);
      expect(UserEntityState.isDone("u1", "m10")).toBe(true);
      UserEntityState.setDone("u1", "m10", false);
      expect(UserEntityState.isDone("u1", "message:m10")).toBe(false);
    });

    it("allows setDone with explicit boolean", () => {
      UserEntityState.setDone("u1", "item:1", true);
      expect(UserEntityState.isDone("u1", "item:1")).toBe(true);
      UserEntityState.setDone("u1", "item:1", false);
      expect(UserEntityState.isDone("u1", "item:1")).toBe(false);
    });

    it("clearAll clears both read and done state", () => {
      UserEntityState.markRead("u1", "contact:1");
      UserEntityState.markDone("u1", "contact:1");
      expect(UserEntityState.isRead("u1", "contact:1")).toBe(true);
      expect(UserEntityState.isDone("u1", "contact:1")).toBe(true);

      UserEntityState.clearAll("u1");
      expect(UserEntityState.isRead("u1", "contact:1")).toBe(false);
      expect(UserEntityState.isDone("u1", "contact:1")).toBe(false);
    });
  });

  describe("getState", () => {
    it("returns combined read and done state", () => {
      expect(UserEntityState.getState("u1", "contact:50")).toEqual({
        read: false,
        done: false,
      });

      UserEntityState.markRead("u1", "contact:50");
      expect(UserEntityState.getState("u1", "contact:50")).toEqual({
        read: true,
        done: false,
      });

      UserEntityState.markDone("u1", "contact:50");
      expect(UserEntityState.getState("u1", "contact:50")).toEqual({
        read: true,
        done: true,
      });
    });
  });

  describe("pub/sub notifications", () => {
    it("emits only on actual changes", () => {
      const fn = vi.fn();
      const unsub = UserEntityState.subscribe(fn);

      UserEntityState.markRead("u1", "c:1");
      expect(fn).toHaveBeenCalledTimes(1);

      // No-op repeat call should not emit
      UserEntityState.markRead("u1", "c:1");
      expect(fn).toHaveBeenCalledTimes(1);

      UserEntityState.markDone("u1", "c:1");
      expect(fn).toHaveBeenCalledTimes(2);

      UserEntityState.markDone("u1", "c:1");
      expect(fn).toHaveBeenCalledTimes(2);

      unsub();
      UserEntityState.markUnread("u1", "c:1");
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe("React hooks", () => {
    it("useUserEntityState re-renders on state changes", () => {
      const { result } = renderHook(() => useUserEntityState());
      expect(result.current.isRead("u1", "c:1")).toBe(false);

      act(() => {
        result.current.markRead("u1", "c:1");
      });
      expect(result.current.isRead("u1", "c:1")).toBe(true);
    });

    it("useEntityState provides live reactive helpers for a single ref", () => {
      const { result } = renderHook(() => useEntityState("u1", "thread:99"));
      expect(result.current.read).toBe(false);
      expect(result.current.done).toBe(false);

      act(() => {
        result.current.markRead();
      });
      expect(result.current.read).toBe(true);

      act(() => {
        result.current.markDone();
      });
      expect(result.current.done).toBe(true);

      act(() => {
        result.current.markUnread();
      });
      expect(result.current.read).toBe(false);

      act(() => {
        result.current.markUndone();
      });
      expect(result.current.done).toBe(false);
    });
  });

  describe("legacy migration", () => {
    it("migrates legacy cisa.inbox.read.<uid> into read axis", () => {
      localStorage.setItem(
        "cisa.inbox.read.uidA",
        JSON.stringify(["contact:100", "interaction:200"]),
      );

      __resetUserEntityStateCache();

      expect(UserEntityState.isRead("uidA", "contact:100")).toBe(true);
      expect(UserEntityState.isRead("uidA", "interaction:200")).toBe(true);
      expect(UserEntityState.isRead("uidA", "contact:999")).toBe(false);
    });

    it("migrates legacy cisa.conv.hidden.<uid> into done axis", () => {
      localStorage.setItem(
        "cisa.conv.hidden.uidA",
        JSON.stringify(["room-alpha", "room-beta"]),
      );

      __resetUserEntityStateCache();

      expect(UserEntityState.isDone("uidA", "conv:room-alpha")).toBe(true);
      expect(UserEntityState.isDone("uidA", "conv:room-beta")).toBe(true);
      expect(UserEntityState.isDone("uidA", "room-alpha")).toBe(true);
      expect(UserEntityState.isDone("uidA", "conv:room-gamma")).toBe(false);
    });

    it("migrates legacy cisa.msg.hidden.<uid> into done axis", () => {
      localStorage.setItem(
        "cisa.msg.hidden.uidA",
        JSON.stringify(["msg-1", "msg-2"]),
      );

      __resetUserEntityStateCache();

      expect(UserEntityState.isDone("uidA", "message:msg-1")).toBe(true);
      expect(UserEntityState.isDone("uidA", "message:msg-2")).toBe(true);
      expect(UserEntityState.isDone("uidA", "msg-1")).toBe(true);
      expect(UserEntityState.isDone("uidA", "message:msg-3")).toBe(false);
    });

    it("handles gracefully corrupted or empty localStorage data", () => {
      localStorage.setItem("cisa.user.entity.corrupt", "not-json{");
      __resetUserEntityStateCache();

      expect(UserEntityState.isRead("corrupt", "contact:1")).toBe(false);
      expect(UserEntityState.isDone("corrupt", "contact:1")).toBe(false);
    });
  });
});
