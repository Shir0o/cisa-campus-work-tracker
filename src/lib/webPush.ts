// Helper library for Web Browser Push notifications (Web Notification API + Service Worker)
//
// A browser (or installed PWA) is reached by Web Push: it subscribes with the
// app's VAPID public key and the subscription is stored under
// users/{uid}/pushDevices, where the notification Cloud Function
// (firebase-functions/) finds it for every new bell entry. That is what makes
// an alert arrive with the tab closed — including iOS 16.4+ Home Screen apps.
import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { db } from "./firebase";

/** Public half of the VAPID pair. Must match VAPID_PUBLIC_KEY in
 *  firebase-functions/src/index.ts — the private half lives only in Secret Manager. */
export const WEB_PUSH_PUBLIC_KEY =
  "BESowlSRnYT2GRypWx6vPeMIyX0VaHY-UsgEDbwtBX_oN30MVpw1uXDrunyXnOdHmlh4PDnl5Mq-4iSrBV3E9IM";

export function isWebNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getWebNotificationPermissionStatus(): NotificationPermission | "unsupported" {
  if (!isWebNotificationSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestWebNotificationPermission(): Promise<boolean> {
  if (!isWebNotificationSupported()) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;

  try {
    const permission = await Notification.requestPermission();
    return permission === "granted";
  } catch (err) {
    console.error("Failed to request web notification permission:", err);
    return false;
  }
}

export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return null;

  try {
    const registration = await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    return registration;
  } catch (err) {
    console.error("Failed to register service worker:", err);
    return null;
  }
}

function base64UrlToBytes(value: string): Uint8Array<ArrayBuffer> {
  const base64 = (value + "=".repeat((4 - (value.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** A browser's device doc id: a hash of its push endpoint, so re-registering
 *  the same browser overwrites rather than duplicates (one alert, not two). */
export async function webPushDeviceId(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  return `web-${hex.slice(0, 40)}`;
}

/** Subscribes this browser to Web Push and records it for `uid`. Needs
 *  permission already granted; where the Push API is missing (iOS Safari in a
 *  tab rather than a Home Screen app) it quietly reports false. */
export async function registerWebPush(uid: string): Promise<boolean> {
  if (getWebNotificationPermissionStatus() !== "granted" || !("PushManager" in window)) return false;
  if (!(await registerServiceWorker())) return false;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(WEB_PUSH_PUBLIC_KEY),
      }));
    const { endpoint } = sub;
    const { keys } = sub.toJSON();
    if (!endpoint || !endpoint.startsWith("https://") || typeof keys?.p256dh !== "string" || !keys.p256dh || typeof keys?.auth !== "string" || !keys.auth) {
      throw new Error("Push subscription is missing required endpoint or encryption keys");
    }
    await setDoc(doc(db, "users", uid, "pushDevices", await webPushDeviceId(endpoint)), {
      kind: "web",
      endpoint,
      keys: { p256dh: keys.p256dh, auth: keys.auth },
      updatedAt: serverTimestamp(),
    });
    return true;
  } catch (err) {
    console.error("Failed to register for web push:", err);
    return false;
  }
}

/** On sign-out: stop this browser receiving `uid`'s alerts, so whoever signs
 *  in next on a shared machine is not shown them. */
export async function unregisterWebPush(uid: string): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.serviceWorker) return;
  try {
    const reg = await navigator.serviceWorker.getRegistration("/");
    const sub = await reg?.pushManager?.getSubscription();
    if (!sub) return;
    await deleteDoc(doc(db, "users", uid, "pushDevices", await webPushDeviceId(sub.endpoint)));
    await sub.unsubscribe();
  } catch (err) {
    console.error("Failed to unregister web push:", err);
  }
}
