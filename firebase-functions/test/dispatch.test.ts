import { describe, it, expect, vi } from "vitest";
import { dispatchNotification, type DispatchDeps, type RegisteredDevice } from "../src/dispatch";

const expoDevice = (id: string, token: string): RegisteredDevice => ({ id, device: { kind: "expo", token } });
const webDevice = (id: string, endpoint: string): RegisteredDevice => ({
  id,
  device: { kind: "web", endpoint, keys: { p256dh: "p", auth: "a" } },
});

function makeDeps(devices: Record<string, RegisteredDevice[]>, overrides: Partial<DispatchDeps> = {}) {
  const deps: DispatchDeps = {
    fullTimerIds: vi.fn(async () => ["ft1", "ft2"]),
    devicesOf: vi.fn(async (uid: string) => devices[uid] ?? []),
    claimCoalesce: vi.fn(async () => true),
    send: vi.fn(async () => "ok" as const),
    removeDevice: vi.fn(async () => {}),
    ...overrides,
  };
  return deps;
}

const base = { title: "Ana mentioned you on Lila", message: "hi", link: "/people/c1?tab=thread", targetId: "c1" };

describe("dispatchNotification", () => {
  it("pushes a personal notification to every device the recipient registered", async () => {
    const deps = makeDeps({ u1: [expoDevice("d1", "ExponentPushToken[a]"), webDevice("d2", "https://push/x")] });
    const result = await dispatchNotification({ id: "n1", userId: "u1", ...base }, deps);

    expect(deps.send).toHaveBeenCalledTimes(2);
    const payload = { title: base.title, body: "hi", link: base.link, targetId: "c1", notificationId: "n1" };
    expect(deps.send).toHaveBeenCalledWith("u1", expoDevice("d1", "ExponentPushToken[a]").device, payload);
    expect(deps.send).toHaveBeenCalledWith("u1", webDevice("d2", "https://push/x").device, payload);
    expect(result).toEqual({ recipients: ["u1"], sent: 2, coalesced: 0, removed: 0 });
  });

  it("fans an ALL_ADMINS broadcast out to full-timers only", async () => {
    const deps = makeDeps({
      ft1: [expoDevice("d1", "t1")],
      ft2: [webDevice("d2", "https://push/y")],
      trainee: [expoDevice("d3", "t3")],
    });
    const result = await dispatchNotification({ id: "n2", userId: "ALL_ADMINS", title: "New Student Sign-up", message: "x" }, deps);

    expect(result.recipients).toEqual(["ft1", "ft2"]);
    expect(deps.devicesOf).not.toHaveBeenCalledWith("trainee");
    expect(result.sent).toBe(2);
  });

  it("holds a coalesced push when the recipient already heard about this key within the hour", async () => {
    const deps = makeDeps(
      { u1: [expoDevice("d1", "t1")] },
      { claimCoalesce: vi.fn(async () => false) },
    );
    const result = await dispatchNotification({ id: "n3", userId: "u1", ...base, coalesceKey: "contact:c1" }, deps);

    expect(deps.claimCoalesce).toHaveBeenCalledWith("u1", "contact:c1", 60 * 60_000);
    expect(deps.send).not.toHaveBeenCalled();
    expect(result.coalesced).toBe(1);
  });

  it("never consults the throttle when the notification carries no coalesce key", async () => {
    const deps = makeDeps({ u1: [expoDevice("d1", "t1")] });
    await dispatchNotification({ id: "n4", userId: "u1", ...base }, deps);
    expect(deps.claimCoalesce).not.toHaveBeenCalled();
  });

  it("drops a device the push service reports as gone", async () => {
    const deps = makeDeps(
      { u1: [expoDevice("d1", "t1"), webDevice("d2", "https://push/z")] },
      { send: vi.fn(async (_u, d) => (d.kind === "web" ? ("gone" as const) : ("ok" as const))) },
    );
    const result = await dispatchNotification({ id: "n5", userId: "u1", ...base }, deps);

    expect(deps.removeDevice).toHaveBeenCalledWith("u1", "d2");
    expect(result).toMatchObject({ sent: 1, removed: 1 });
  });

  it("keeps going when one device fails to send", async () => {
    const deps = makeDeps(
      { u1: [expoDevice("d1", "t1"), expoDevice("d2", "t2")] },
      {
        send: vi.fn(async (_u, d) => {
          if (d.kind === "expo" && d.token === "t1") throw new Error("boom");
          return "ok" as const;
        }),
      },
    );
    const result = await dispatchNotification({ id: "n6", userId: "u1", ...base }, deps);
    expect(result.sent).toBe(1);
  });

  it("does nothing for a user with no registered devices", async () => {
    const deps = makeDeps({});
    const result = await dispatchNotification({ id: "n7", userId: "nobody", ...base }, deps);
    expect(deps.send).not.toHaveBeenCalled();
    expect(result.sent).toBe(0);
  });

  it("falls back to an empty body and root link", async () => {
    const deps = makeDeps({ u1: [expoDevice("d1", "t1")] });
    await dispatchNotification({ id: "n8", userId: "u1", title: "T" }, deps);
    expect(deps.send).toHaveBeenCalledWith(
      "u1",
      { kind: "expo", token: "t1" },
      { title: "T", body: "", link: "/", targetId: null, notificationId: "n8" },
    );
  });
});
