// Helper library for Web Browser Push notifications (Web Notification API + Service Worker)

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

export async function showWebPushNotification(title: string, options?: NotificationOptions): Promise<boolean> {
  if (!isWebNotificationSupported() || Notification.permission !== "granted") return false;

  try {
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.ready;
      if (reg && reg.showNotification) {
        await reg.showNotification(title, {
          icon: "/logo.svg",
          badge: "/logo.svg",
          ...options,
        });
        return true;
      }
    }
    // Fallback to desktop Notification constructor
    new Notification(title, {
      icon: "/logo.svg",
      ...options,
    });
    return true;
  } catch (err) {
    console.error("Failed to display web notification:", err);
    return false;
  }
}
