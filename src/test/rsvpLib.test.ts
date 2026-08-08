import { describe, it, expect, vi, beforeEach } from "vitest";
import { setDoc, deleteDoc, onSnapshot } from "firebase/firestore";
import { setRsvp, subscribeEventRsvps, subscribeMyRsvps } from "../lib/rsvp";

vi.mock("firebase/firestore", () => ({
  collection: vi.fn((_db, ...segments: string[]) => ({ path: segments.join("/") })),
  collectionGroup: vi.fn((_db, group: string) => ({ group })),
  doc: vi.fn((_db, ...segments: string[]) => ({ path: segments.join("/") })),
  query: vi.fn((ref) => ref),
  where: vi.fn((field, op, value) => ({ field, op, value })),
  onSnapshot: vi.fn(),
  setDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  serverTimestamp: vi.fn(() => "ts"),
}));

vi.mock("../lib/firebase", () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: "LIST", CREATE: "CREATE", DELETE: "DELETE" },
}));

describe("rsvp lib", () => {
  beforeEach(() => vi.clearAllMocks());

  it("setRsvp(going=true) writes a going doc keyed by uid", async () => {
    await setRsvp("ev1", { uid: "u1", name: "Ada" }, true);
    expect(setDoc).toHaveBeenCalledWith(
      { path: "events/ev1/rsvps/u1" },
      { uid: "u1", name: "Ada", status: "going", createdAt: "ts" },
    );
    expect(deleteDoc).not.toHaveBeenCalled();
  });

  it("setRsvp(going=false) deletes the user's doc", async () => {
    await setRsvp("ev1", { uid: "u1", name: "Ada" }, false);
    expect(deleteDoc).toHaveBeenCalledWith({ path: "events/ev1/rsvps/u1" });
    expect(setDoc).not.toHaveBeenCalled();
  });

  it("setRsvp routes errors through handleFirestoreError", async () => {
    const { handleFirestoreError } = await import("../lib/firebase");
    vi.mocked(setDoc).mockRejectedValueOnce(new Error("denied"));
    await setRsvp("ev1", { uid: "u1", name: "Ada" }, true);
    expect(handleFirestoreError).toHaveBeenCalled();
  });

  it("setRsvp(going=false) routes delete errors through handleFirestoreError", async () => {
    const { handleFirestoreError } = await import("../lib/firebase");
    vi.mocked(deleteDoc).mockRejectedValueOnce(new Error("denied"));
    await setRsvp("ev1", { uid: "u1", name: "Ada" }, false);
    expect(handleFirestoreError).toHaveBeenCalledWith(
      new Error("denied"),
      "DELETE",
      "events/ev1/rsvps/u1",
    );
  });

  it("subscribeEventRsvps maps snapshot docs to Rsvp[]", () => {
    vi.mocked(onSnapshot).mockImplementation((_ref: any, next: any) => {
      next({ docs: [{ data: () => ({ uid: "u1", name: "Ada", status: "going" }) }] });
      return vi.fn();
    });
    const cb = vi.fn();
    subscribeEventRsvps("ev1", cb);
    expect(cb).toHaveBeenCalledWith([{ uid: "u1", name: "Ada", status: "going" }]);
  });

  it("subscribeMyRsvps extracts the parent event id for each rsvp doc", () => {
    vi.mocked(onSnapshot).mockImplementation((_ref: any, next: any) => {
      next({
        docs: [
          { ref: { parent: { parent: { id: "ev1" } } } },
          { ref: { parent: { parent: { id: "ev2" } } } },
          { ref: { parent: { parent: null } } }, // ignored
        ],
      });
      return vi.fn();
    });
    const cb = vi.fn();
    subscribeMyRsvps("u1", cb);
    expect(cb).toHaveBeenCalledWith(new Set(["ev1", "ev2"]));
  });

  it("subscribeEventRsvps routes subscription errors to onError", () => {
    vi.mocked(onSnapshot).mockImplementation((_ref: any, _next: any, err: any) => {
      err(new Error("boom"));
      return vi.fn();
    });
    const onError = vi.fn();
    subscribeEventRsvps("ev1", vi.fn(), onError);
    expect(onError).toHaveBeenCalledWith(new Error("boom"));
  });

  it("subscribeEventRsvps logs to console when no onError is given", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(onSnapshot).mockImplementation((_ref: any, _next: any, err: any) => {
      err(new Error("boom"));
      return vi.fn();
    });
    subscribeEventRsvps("ev1", vi.fn());
    expect(spy).toHaveBeenCalledWith("event rsvps subscription error", new Error("boom"));
    spy.mockRestore();
  });

  it("subscribeMyRsvps routes subscription errors to onError", () => {
    vi.mocked(onSnapshot).mockImplementation((_ref: any, _next: any, err: any) => {
      err(new Error("boom"));
      return vi.fn();
    });
    const onError = vi.fn();
    subscribeMyRsvps("u1", vi.fn(), onError);
    expect(onError).toHaveBeenCalledWith(new Error("boom"));
  });

  it("subscribeMyRsvps logs to console when no onError is given", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(onSnapshot).mockImplementation((_ref: any, _next: any, err: any) => {
      err(new Error("boom"));
      return vi.fn();
    });
    subscribeMyRsvps("u1", vi.fn());
    expect(spy).toHaveBeenCalledWith("my rsvps subscription error", new Error("boom"));
    spy.mockRestore();
  });
});
