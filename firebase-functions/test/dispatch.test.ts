import { describe, it, expect, vi } from "vitest";
import {
  dispatchNotification,
  capPushPayload,
  MAX_PUSH_PAYLOAD_BYTES,
  type DispatchDeps,
  type PushPayload,
  type RegisteredDevice,
} from "../src/dispatch";

const utf8 = (s: string) => new TextEncoder().encode(s).length;

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

  it("caps a long bell message in the payload handed to every device (#1440)", async () => {
    const deps = makeDeps({ u1: [expoDevice("d1", "t1")] });
    await dispatchNotification({ id: "n9", userId: "u1", title: "T", message: "x".repeat(10_000) }, deps);

    const sent = vi.mocked(deps.send).mock.calls[0][2];
    expect(utf8(JSON.stringify(sent))).toBeLessThanOrEqual(MAX_PUSH_PAYLOAD_BYTES);
    expect(sent.body.endsWith("…")).toBe(true);
  });
});

describe("capPushPayload", () => {
  const base: PushPayload = { title: "T", body: "B", link: "/people/c1", targetId: "c1", notificationId: "n1" };

  it("passes a payload within budget through unchanged", () => {
    const p = { ...base, body: "a short message" };
    expect(capPushPayload(p)).toEqual(p);
  });

  it("caps the serialized payload to the byte budget, keeping the other fields", () => {
    const p = { ...base, body: "x".repeat(10_000) };
    const capped = capPushPayload(p);

    expect(utf8(JSON.stringify(capped))).toBeLessThanOrEqual(MAX_PUSH_PAYLOAD_BYTES);
    expect(capped.body.endsWith("…")).toBe(true);
    expect(utf8(capped.body)).toBeLessThan(utf8(p.body));
    expect(capped).toMatchObject({
      title: p.title,
      link: p.link,
      targetId: p.targetId,
      notificationId: p.notificationId,
    });
  });

  it("bounds an over-long title too", () => {
    const p = { ...base, title: "T".repeat(5_000) };
    const capped = capPushPayload(p);

    expect(utf8(JSON.stringify(capped))).toBeLessThanOrEqual(MAX_PUSH_PAYLOAD_BYTES);
    expect(capped.title).not.toBe(p.title);
    expect(capped.title.endsWith("…")).toBe(true);
  });

  it("never splits a multi-byte character when truncating", () => {
    const p = { ...base, body: "😀".repeat(5_000) };
    const capped = capPushPayload(p);

    expect(utf8(JSON.stringify(capped))).toBeLessThanOrEqual(MAX_PUSH_PAYLOAD_BYTES);
    expect(capped.body.includes("\uFFFD")).toBe(false);
    for (const ch of capped.body.slice(0, -1)) expect(ch).toBe("😀");
  });
});
