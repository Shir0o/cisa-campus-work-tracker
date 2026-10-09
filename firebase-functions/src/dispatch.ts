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
 *  push (uninstalled app, revoked subscription) — it is deleted. An "ok" Expo
 *  send carries the ticket id its real delivery outcome is later read from
 *  (the receipt); a Web Push send has none. */
export type SendOutcome = { status: "ok"; ticketId?: string } | { status: "gone" };

export interface DispatchDeps {
  /** Full-timers (role `admin`) — the audience of an `ALL_ADMINS` broadcast. */
  fullTimerIds(): Promise<string[]>;
  devicesOf(uid: string): Promise<RegisteredDevice[]>;
  /** True when `uid` may be pushed for `key` now (and records that it was). */
  claimCoalesce(uid: string, key: string, windowMs: number): Promise<boolean>;
  send(uid: string, device: PushDevice, payload: PushPayload): Promise<SendOutcome>;
  /** Persist an Expo ticket id so its delivery receipt can be checked later. */
  recordTicket(uid: string, deviceId: string, ticketId: string): Promise<void>;
  removeDevice(uid: string, deviceId: string): Promise<void>;
}

export const BROADCAST_TO_FULL_TIMERS = "ALL_ADMINS";
const COALESCE_WINDOW_MS = 60 * 60_000;

/** Web Push and Expo both reject a request body larger than 4096 bytes. Web
 *  Push encrypts the JSON we hand it (aes128gcm adds a header, tag and padding
 *  delimiter) and Expo wraps it in a message envelope, so the serialized
 *  payload is capped well under that ceiling. */
export const MAX_PUSH_PAYLOAD_BYTES = 3200;

/** Titles are short labels; the body takes whatever budget is left. */
const MAX_PUSH_TITLE_BYTES = 200;

const ELLIPSIS = "…";
const encoder = new TextEncoder();

function encodedBytes(s: string): number {
  return encoder.encode(s).length;
}

/** Trim `s` to `maxBytes` UTF-8 bytes, marking the cut with an ellipsis.
 *  Iterates by code point, so a multi-byte character or surrogate pair is
 *  never split. */
function truncateWithEllipsis(s: string, maxBytes: number): string {
  if (encodedBytes(s) <= maxBytes) return s;
  const room = maxBytes - encodedBytes(ELLIPSIS);
  let out = "";
  let used = 0;
  for (const cp of s) {
    const size = encodedBytes(cp);
    if (used + size > room) break;
    out += cp;
    used += size;
  }
  return out + ELLIPSIS;
}

/** Trim a payload so its serialized JSON fits the transport budget, body first
 *  (keeping as much as fits) then title. The bell entry keeps its full message
 *  (ADR 0031); only the pushed copy is shortened. */
export function capPushPayload(p: PushPayload): PushPayload {
  if (encodedBytes(JSON.stringify(p)) <= MAX_PUSH_PAYLOAD_BYTES) return p;

  const title = truncateWithEllipsis(p.title, MAX_PUSH_TITLE_BYTES);
  const titled: PushPayload = title === p.title ? p : { ...p, title };
  if (encodedBytes(JSON.stringify(titled)) <= MAX_PUSH_PAYLOAD_BYTES) return titled;

  // Binary-search the longest body prefix whose serialized payload fits. The
  // length is measured on the serialized JSON, so escaping can't push it over.
  const chars = [...titled.body];
  let lo = 0;
  let hi = chars.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const body = chars.slice(0, mid).join("") + ELLIPSIS;
    if (encodedBytes(JSON.stringify({ ...titled, body })) <= MAX_PUSH_PAYLOAD_BYTES) lo = mid;
    else hi = mid - 1;
  }
  return { ...titled, body: chars.slice(0, lo).join("") + ELLIPSIS };
}

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
  const payload = capPushPayload({
    title: n.title,
    body: n.message ?? "",
    link: n.link || "/",
    targetId: n.targetId ?? null,
    notificationId: n.id,
  });
  const result: DispatchResult = { recipients, sent: 0, coalesced: 0, removed: 0 };

  for (const uid of recipients) {
    if (n.coalesceKey && !(await deps.claimCoalesce(uid, n.coalesceKey, COALESCE_WINDOW_MS))) {
      result.coalesced++;
      continue;
    }
    for (const { id, device } of await deps.devicesOf(uid)) {
      try {
        const outcome = await deps.send(uid, device, payload);
        if (outcome.status === "gone") {
          await deps.removeDevice(uid, id);
          result.removed++;
        } else {
          if (outcome.ticketId) await deps.recordTicket(uid, id, outcome.ticketId);
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
