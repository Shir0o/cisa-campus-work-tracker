// The two push services a device can be reached through. Each resolves "gone"
// when the service says the device will never take another push, and throws
// on anything else so the failure is logged rather than swallowed.
import type webpush from "web-push";
import type { PushPayload, SendOutcome } from "./dispatch";

export const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

/** Native iOS/Android via Expo's push service. */
export function expoSender(fetchImpl: typeof fetch, accessToken: string | undefined) {
  return async (token: string, p: PushPayload): Promise<SendOutcome> => {
    const res = await fetchImpl(EXPO_PUSH_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify([
        {
          to: token,
          title: p.title,
          body: p.body,
          sound: "default",
          // Android: the channel the app registers at MAX importance, so the
          // push shows as a heads-up banner rather than landing silently.
          channelId: "default",
          priority: "high",
          data: { link: p.link, targetId: p.targetId, notificationId: p.notificationId },
        },
      ]),
    });
    const json = (await res.json()) as {
      data?: Array<{ status: string; message?: string; details?: { error?: string } }>;
      errors?: Array<{ message?: string }>;
    };
    if (json.errors?.length) throw new Error(`Expo push rejected: ${json.errors.map((e) => e.message).join("; ")}`);
    const ticket = json.data?.[0];
    if (ticket?.status === "ok") return "ok";
    if (ticket?.details?.error === "DeviceNotRegistered") return "gone";
    throw new Error(`Expo push failed: ${ticket?.message ?? ticket?.details?.error ?? "no ticket"}`);
  };
}

/** Browsers and installed PWAs (Chrome, Edge, Firefox, Safari incl. iOS
 *  Home Screen apps) via the standard Web Push protocol. */
export function webPushSender(client: Pick<typeof webpush, "sendNotification">) {
  return async (
    sub: { endpoint: string; keys: { p256dh: string; auth: string } },
    p: PushPayload,
  ): Promise<SendOutcome> => {
    try {
      await client.sendNotification(sub, JSON.stringify(p), { TTL: 86_400, urgency: "high" });
      return "ok";
    } catch (e) {
      const status = (e as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) return "gone";
      throw e;
    }
  };
}
