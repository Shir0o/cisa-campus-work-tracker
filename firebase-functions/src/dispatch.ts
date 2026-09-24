// Every notification-bell entry becomes an OS push on each device its
// recipient registered. This is the one place push is sent from: the bell doc
// is the trigger, so a writer cannot put something in the bell and forget the
// phone (the bug this replaced — push used to be opt-in per call site).
// I/O is injected so the rules here are testable without Firebase.

/** A push endpoint a signed-in user registered: an Expo token from the native
 *  app, or a Web Push subscription from a browser / installed PWA. */
export type PushDevice =
  | { kind: "expo"; token: string }
  | { kind: "web"; endpoint: string; keys: { p256dh: string; auth: string } };

export interface RegisteredDevice {
  id: string;
  device: PushDevice;
}

export interface PushPayload {
  title: string;
  body: string;
  link: string;
  targetId: string | null;
  notificationId: string;
}

export interface BellNotification {
  id: string;
  userId: string;
  title: string;
  message?: string | null;
  link?: string | null;
  targetId?: string | null;
  /** At most one push per key per recipient per hour; the bell still keeps
   *  every entry (#813). */
  coalesceKey?: string | null;
}

/** "gone" means the push service says this device will never accept another
 *  push (uninstalled app, revoked subscription) — it is deleted. */
export type SendOutcome = "ok" | "gone";

export interface DispatchDeps {
  /** Full-timers (role `admin`) — the audience of an `ALL_ADMINS` broadcast. */
  fullTimerIds(): Promise<string[]>;
  devicesOf(uid: string): Promise<RegisteredDevice[]>;
  /** True when `uid` may be pushed for `key` now (and records that it was). */
  claimCoalesce(uid: string, key: string, windowMs: number): Promise<boolean>;
  send(uid: string, device: PushDevice, payload: PushPayload): Promise<SendOutcome>;
  removeDevice(uid: string, deviceId: string): Promise<void>;
}

export const BROADCAST_TO_FULL_TIMERS = "ALL_ADMINS";
const COALESCE_WINDOW_MS = 60 * 60_000;

export interface DispatchResult {
  recipients: string[];
  sent: number;
  coalesced: number;
  removed: number;
}

export async function dispatchNotification(
  n: BellNotification,
  deps: DispatchDeps,
): Promise<DispatchResult> {
  const recipients =
    n.userId === BROADCAST_TO_FULL_TIMERS ? await deps.fullTimerIds() : [n.userId];
  const payload: PushPayload = {
    title: n.title,
    body: n.message ?? "",
    link: n.link || "/",
    targetId: n.targetId ?? null,
    notificationId: n.id,
  };
  const result: DispatchResult = { recipients, sent: 0, coalesced: 0, removed: 0 };

  for (const uid of recipients) {
    if (n.coalesceKey && !(await deps.claimCoalesce(uid, n.coalesceKey, COALESCE_WINDOW_MS))) {
      result.coalesced++;
      continue;
    }
    for (const { id, device } of await deps.devicesOf(uid)) {
      try {
        if ((await deps.send(uid, device, payload)) === "gone") {
          await deps.removeDevice(uid, id);
          result.removed++;
        } else {
          result.sent++;
        }
      } catch (e) {
        // One bad device must not cost the recipient's other devices.
        console.error(`push to ${uid}/${id} failed`, e);
      }
    }
  }
  return result;
}
