import { describe, it, expect, vi } from "vitest";
import { expoSender, webPushSender, EXPO_PUSH_URL } from "../src/transports";

const payload = { title: "T", body: "B", link: "/people/c1", targetId: "c1", notificationId: "n1" };

const jsonResponse = (body: unknown) => ({ json: async () => body }) as Response;

describe("expoSender", () => {
  it("posts a high-priority message on the default Android channel with the deep link", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [{ status: "ok", id: "x" }] }));
    const send = expoSender(fetchImpl as unknown as typeof fetch, "tok");

    expect(await send("ExponentPushToken[a]", payload)).toBe("ok");
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(EXPO_PUSH_URL);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    expect(JSON.parse(init.body as string)).toEqual([
      {
        to: "ExponentPushToken[a]",
        title: "T",
        body: "B",
        sound: "default",
        channelId: "default",
        priority: "high",
        data: { link: "/people/c1", targetId: "c1", notificationId: "n1" },
      },
    ]);
  });

  it("omits the Authorization header when no access token is configured", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: [{ status: "ok" }] }));
    await expoSender(fetchImpl as unknown as typeof fetch, undefined)("t", payload);
    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("reports an unregistered device as gone", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ data: [{ status: "error", details: { error: "DeviceNotRegistered" } }] }),
    );
    expect(await expoSender(fetchImpl as unknown as typeof fetch, "tok")("t", payload)).toBe("gone");
  });

  it("throws on any other Expo error so the failure is logged", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ data: [{ status: "error", message: "InvalidCredentials" }] }),
    );
    await expect(expoSender(fetchImpl as unknown as typeof fetch, "tok")("t", payload)).rejects.toThrow(
      /InvalidCredentials/,
    );
  });

  it("throws on a request-level Expo error", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ errors: [{ code: "PUSH_TOO_MANY", message: "slow down" }] }));
    await expect(expoSender(fetchImpl as unknown as typeof fetch, "tok")("t", payload)).rejects.toThrow(/slow down/);
  });
});

describe("webPushSender", () => {
  const sub = { endpoint: "https://push/x", keys: { p256dh: "p", auth: "a" } };

  it("sends the payload as JSON the service worker reads", async () => {
    const sendNotification = vi.fn(async () => ({}));
    const send = webPushSender({ sendNotification } as never);

    expect(await send(sub, payload)).toBe("ok");
    expect(sendNotification).toHaveBeenCalledWith(
      sub,
      JSON.stringify({ title: "T", body: "B", link: "/people/c1", targetId: "c1", notificationId: "n1" }),
      { TTL: 86_400, urgency: "high" },
    );
  });

  it.each([404, 410])("reports a %i subscription as gone", async (statusCode) => {
    const sendNotification = vi.fn(async () => {
      throw Object.assign(new Error("expired"), { statusCode });
    });
    expect(await webPushSender({ sendNotification } as never)(sub, payload)).toBe("gone");
  });

  it("rethrows other push-service errors", async () => {
    const sendNotification = vi.fn(async () => {
      throw Object.assign(new Error("server"), { statusCode: 500 });
    });
    await expect(webPushSender({ sendNotification } as never)(sub, payload)).rejects.toThrow("server");
  });
});
