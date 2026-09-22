import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";

// The users subscription that feeds the module roster (#1163). If the
// onSnapshot errors (transient permission/network blip) the listener dies and
// the roster silently stays empty — which broke the /around team filter until
// a hard reload. This locks down the retry + error-surfacing contract.
vi.mock("firebase/firestore", () => ({
  onSnapshot: vi.fn(),
  collection: vi.fn((_db: unknown, path: string) => ({ path })),
}));

vi.mock("../lib/firebase", () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: "LIST" },
}));

import { onSnapshot } from "firebase/firestore";
import { subscribeUsers } from "../lib/teams";

const onSnapshotMock = onSnapshot as unknown as Mock;

const usersSnap = (rows: Array<Record<string, unknown>>) => ({
  docs: rows.map((d, i) => ({ id: `u${i}`, data: () => d })),
});

describe("subscribeUsers (RosterSync)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });
  afterEach(() => vi.useRealTimers());

  it("delivers each snapshot row to the callback", () => {
    onSnapshotMock.mockImplementationOnce((_q, next) => {
      next(
        usersSnap([{ role: "admin", team: "yp", displayName: "A" }, { team: null }]),
      );
      return vi.fn();
    });
    const cb = vi.fn();
    subscribeUsers(cb);
    expect(cb).toHaveBeenCalledWith([
      { uid: "u0", role: "admin", team: "yp", displayName: "A" },
      { uid: "u1", team: null },
    ]);
  });

  it("surfaces the error to onError instead of throwing uncaught", () => {
    const onError = vi.fn();
    onSnapshotMock.mockImplementationOnce((_q, _next, err) => {
      err(new Error("permission-denied"));
      return vi.fn();
    });
    subscribeUsers(vi.fn(), onError, { retries: 0, delayMs: 10 });
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError.mock.calls[0][0].message).toBe("permission-denied");
  });

  it("retries after an error and repopulates once the subscription recovers", () => {
    onSnapshotMock
      .mockImplementationOnce((_q, _next, err) => {
        err(new Error("denied"));
        return vi.fn();
      })
      .mockImplementationOnce((_q, next) => {
        next(usersSnap([{ team: "yp" }]));
        return vi.fn();
      });
    const cb = vi.fn();
    subscribeUsers(cb, vi.fn(), { retries: 3, delayMs: 10 });

    expect(cb).not.toHaveBeenCalled();
    vi.advanceTimersByTime(11);
    expect(onSnapshotMock).toHaveBeenCalledTimes(2);
    expect(cb).toHaveBeenCalledTimes(1);
    expect(cb.mock.calls[0][0]).toEqual([{ uid: "u0", team: "yp" }]);
  });

  it("gives up after the retry cap and keeps calling onError", () => {
    onSnapshotMock.mockImplementation((_q, _next, err) => {
      err(new Error("denied"));
      return vi.fn();
    });
    const onError = vi.fn();
    subscribeUsers(vi.fn(), onError, { retries: 2, delayMs: 10 });

    vi.advanceTimersByTime(100);
    expect(onSnapshotMock).toHaveBeenCalledTimes(3); // initial + 2 retries
    expect(onError).toHaveBeenCalledTimes(3);
  });

  it("cleans up the live listener and any pending retry on unsubscribe", () => {
    const unsub = vi.fn();
    onSnapshotMock.mockImplementation((_q, _next, err) => {
      err(new Error("denied"));
      return unsub;
    });
    const stop = subscribeUsers(vi.fn(), vi.fn(), { retries: 5, delayMs: 10 });
    stop();
    expect(unsub).toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(onSnapshotMock).toHaveBeenCalledTimes(1); // retry cancelled
  });
});