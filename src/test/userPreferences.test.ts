import { describe, it, expect, vi, beforeEach } from "vitest";
import { onSnapshot, setDoc } from "firebase/firestore";
import { subscribeUserPreferences, saveUserPreferences } from "../lib/userPreferences";

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db, ...segments: string[]) => ({ path: segments.join("/") })),
  onSnapshot: vi.fn(),
  setDoc: vi.fn(() => Promise.resolve()),
}));

vi.mock("../lib/firebase", () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { WRITE: "WRITE" },
}));

describe("userPreferences", () => {
  beforeEach(() => vi.clearAllMocks());

  it("subscribeUserPreferences maps snapshot data to prefs", () => {
    vi.mocked(onSnapshot).mockImplementation((_ref: any, next: any) => {
      next({ data: () => ({ desktopMessagingApp: "apple" }) });
      return vi.fn();
    });
    const cb = vi.fn();
    subscribeUserPreferences("u1", cb);
    expect(cb).toHaveBeenCalledWith({ desktopMessagingApp: "apple" });
  });

  it("subscribeUserPreferences falls back to {} when the doc does not exist", () => {
    vi.mocked(onSnapshot).mockImplementation((_ref: any, next: any) => {
      next({ data: () => undefined });
      return vi.fn();
    });
    const cb = vi.fn();
    subscribeUserPreferences("u1", cb);
    expect(cb).toHaveBeenCalledWith({});
  });

  it("subscribeUserPreferences routes subscription errors to onError", () => {
    vi.mocked(onSnapshot).mockImplementation((_ref: any, _next: any, err: any) => {
      err(new Error("boom"));
      return vi.fn();
    });
    const onError = vi.fn();
    subscribeUserPreferences("u1", vi.fn(), onError);
    expect(onError).toHaveBeenCalledWith(new Error("boom"));
  });

  it("subscribeUserPreferences logs to console when no onError is given", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(onSnapshot).mockImplementation((_ref: any, _next: any, err: any) => {
      err(new Error("boom"));
      return vi.fn();
    });
    subscribeUserPreferences("u1", vi.fn());
    expect(spy).toHaveBeenCalledWith("userPreferences subscription error", new Error("boom"));
    spy.mockRestore();
  });

  it("saveUserPreferences merges a patch onto the user doc", async () => {
    await saveUserPreferences("u1", { desktopMessagingApp: "google", language: "es" });
    expect(setDoc).toHaveBeenCalledWith(
      { path: "userPreferences/u1" },
      { desktopMessagingApp: "google", language: "es" },
      { merge: true },
    );
  });

  it("subscribeUserPreferences correctly reads language preference", () => {
    vi.mocked(onSnapshot).mockImplementation((_ref: any, next: any) => {
      next({ data: () => ({ language: "es" }) });
      return vi.fn();
    });
    const cb = vi.fn();
    subscribeUserPreferences("u1", cb);
    expect(cb).toHaveBeenCalledWith({ language: "es" });
  });

  it("saveUserPreferences routes write errors through handleFirestoreError", async () => {
    const { handleFirestoreError } = await import("../lib/firebase");
    vi.mocked(setDoc).mockRejectedValueOnce(new Error("denied"));
    await saveUserPreferences("u1", { desktopMessagingApp: "google" });
    expect(handleFirestoreError).toHaveBeenCalledWith(new Error("denied"), "WRITE", "userPreferences/u1");
  });
});
