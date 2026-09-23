import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isWebNotificationSupported,
  getWebNotificationPermissionStatus,
  requestWebNotificationPermission,
  registerServiceWorker,
  registerWebPush,
  unregisterWebPush,
  webPushDeviceId,
  WEB_PUSH_PUBLIC_KEY,
} from "../lib/webPush";
import { setDoc, deleteDoc, doc } from "firebase/firestore";

vi.mock("../lib/firebase", () => ({ db: {} }));
vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db: unknown, ...path: string[]) => path.join("/")),
  setDoc: vi.fn(async () => {}),
  deleteDoc: vi.fn(async () => {}),
  serverTimestamp: vi.fn(() => "SERVER_TS"),
}));

/* ── Helpers ─────────────────────────────────────────────────────────── */

function stubNotification(permission: NotificationPermission) {
  const FakeNotification = vi.fn() as unknown as typeof Notification;
  Object.defineProperty(FakeNotification, "permission", { value: permission, configurable: true });
  FakeNotification.requestPermission = vi.fn();
  Object.defineProperty(window, "Notification", { value: FakeNotification, configurable: true });
  return FakeNotification;
}

function clearNotification() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).Notification;
}

/* ── Tests ────────────────────────────────────────────────────────────── */

describe("webPush", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    clearNotification();
  });

  // ── isWebNotificationSupported ─────────────────────────────────────

  describe("isWebNotificationSupported", () => {
    it("returns true when Notification exists on window", () => {
      stubNotification("default");
      expect(isWebNotificationSupported()).toBe(true);
    });

    it("returns false when Notification is absent", () => {
      clearNotification();
      expect(isWebNotificationSupported()).toBe(false);
    });
  });

  // ── getWebNotificationPermissionStatus ─────────────────────────────

  describe("getWebNotificationPermissionStatus", () => {
    it("returns the current permission when supported", () => {
      stubNotification("granted");
      expect(getWebNotificationPermissionStatus()).toBe("granted");
    });

    it('returns "unsupported" when the API is absent', () => {
      clearNotification();
      expect(getWebNotificationPermissionStatus()).toBe("unsupported");
    });
  });

  // ── requestWebNotificationPermission ───────────────────────────────

  describe("requestWebNotificationPermission", () => {
    it("returns false when unsupported", async () => {
      clearNotification();
      expect(await requestWebNotificationPermission()).toBe(false);
    });

    it("returns true immediately when already granted", async () => {
      stubNotification("granted");
      expect(await requestWebNotificationPermission()).toBe(true);
    });

    it("returns false immediately when denied", async () => {
      stubNotification("denied");
      expect(await requestWebNotificationPermission()).toBe(false);
    });

    it("requests permission and returns true on grant", async () => {
      const Fake = stubNotification("default");
      (Fake.requestPermission as ReturnType<typeof vi.fn>).mockResolvedValue("granted");
      expect(await requestWebNotificationPermission()).toBe(true);
    });

    it("requests permission and returns false on denial", async () => {
      const Fake = stubNotification("default");
      (Fake.requestPermission as ReturnType<typeof vi.fn>).mockResolvedValue("denied");
      expect(await requestWebNotificationPermission()).toBe(false);
    });

    it("returns false when requestPermission throws", async () => {
      const Fake = stubNotification("default");
      (Fake.requestPermission as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("boom"));
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(await requestWebNotificationPermission()).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  // ── registerServiceWorker ──────────────────────────────────────────

  describe("registerServiceWorker", () => {
    let originalSW: ServiceWorkerContainer;

    beforeEach(() => {
      originalSW = navigator.serviceWorker;
    });

    afterEach(() => {
      Object.defineProperty(navigator, "serviceWorker", { value: originalSW, configurable: true });
    });

    it("returns null when serviceWorker is not in navigator", async () => {
      Object.defineProperty(navigator, "serviceWorker", { value: undefined, configurable: true });
      expect(await registerServiceWorker()).toBeNull();
    });

    it("registers and returns the registration", async () => {
      const mockReg = { scope: "/" } as ServiceWorkerRegistration;
      const registerFn = vi.fn().mockResolvedValue(mockReg);
      Object.defineProperty(navigator, "serviceWorker", {
        value: { register: registerFn },
        configurable: true,
      });
      const result = await registerServiceWorker();
      expect(registerFn).toHaveBeenCalledWith("/sw.js", { scope: "/" });
      expect(result).toBe(mockReg);
    });

    it("returns null when registration throws", async () => {
      const registerFn = vi.fn().mockRejectedValue(new Error("sw-fail"));
      Object.defineProperty(navigator, "serviceWorker", {
        value: { register: registerFn },
        configurable: true,
      });
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(await registerServiceWorker()).toBeNull();
      expect(consoleSpy).toHaveBeenCalled();
    });
  });

  // ── registerWebPush / unregisterWebPush ────────────────────────────

  describe("Web Push registration", () => {
    let originalSW: ServiceWorkerContainer;
    const endpoint = "https://fcm.googleapis.com/fcm/send/abc";
    const subscription = {
      endpoint,
      toJSON: () => ({ endpoint, keys: { p256dh: "P256", auth: "AUTH" } }),
      unsubscribe: vi.fn(async () => true),
    };

    function stubWorker(existing: typeof subscription | null) {
      const pushManager = {
        getSubscription: vi.fn(async () => existing),
        subscribe: vi.fn(async (_opts: PushSubscriptionOptionsInit) => subscription),
      };
      const reg = { pushManager };
      Object.defineProperty(navigator, "serviceWorker", {
        value: {
          register: vi.fn(async () => reg),
          getRegistration: vi.fn(async () => reg),
          ready: Promise.resolve(reg),
        },
        configurable: true,
      });
      Object.defineProperty(window, "PushManager", { value: function PushManager() {}, configurable: true });
      return pushManager;
    }

    beforeEach(() => {
      originalSW = navigator.serviceWorker;
      vi.mocked(setDoc).mockClear();
      vi.mocked(deleteDoc).mockClear();
      subscription.unsubscribe.mockClear();
    });

    afterEach(() => {
      Object.defineProperty(navigator, "serviceWorker", { value: originalSW, configurable: true });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).PushManager;
    });

    it("derives a stable, rules-safe device id from the endpoint", async () => {
      const id = await webPushDeviceId(endpoint);
      expect(id).toMatch(/^web-[0-9a-f]{40}$/);
      expect(await webPushDeviceId(endpoint)).toBe(id);
      expect(await webPushDeviceId(endpoint + "x")).not.toBe(id);
    });

    it("subscribes with the app's VAPID key and records the device on the user", async () => {
      stubNotification("granted");
      const pushManager = stubWorker(null);

      expect(await registerWebPush("u1")).toBe(true);

      const opts = pushManager.subscribe.mock.calls[0][0];
      expect(opts.userVisibleOnly).toBe(true);
      expect((opts.applicationServerKey as Uint8Array).length).toBe(65);
      expect(WEB_PUSH_PUBLIC_KEY.length).toBeGreaterThan(80);
      const id = await webPushDeviceId(endpoint);
      expect(doc).toHaveBeenCalledWith({}, "users", "u1", "pushDevices", id);
      expect(setDoc).toHaveBeenCalledWith(`users/u1/pushDevices/${id}`, {
        kind: "web",
        endpoint,
        keys: { p256dh: "P256", auth: "AUTH" },
        updatedAt: "SERVER_TS",
      });
    });

    it("reuses an existing subscription rather than minting another", async () => {
      stubNotification("granted");
      const pushManager = stubWorker(subscription);
      expect(await registerWebPush("u1")).toBe(true);
      expect(pushManager.subscribe).not.toHaveBeenCalled();
      expect(setDoc).toHaveBeenCalledTimes(1);
    });

    it("does nothing until notification permission is granted", async () => {
      stubNotification("default");
      stubWorker(null);
      expect(await registerWebPush("u1")).toBe(false);
      expect(setDoc).not.toHaveBeenCalled();
    });

    it("does nothing where the browser has no Push API (e.g. iOS Safari outside a Home Screen app)", async () => {
      stubNotification("granted");
      stubWorker(null);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (window as any).PushManager;
      expect(await registerWebPush("u1")).toBe(false);
    });

    it("reports failure instead of throwing when subscribing fails", async () => {
      stubNotification("granted");
      const pushManager = stubWorker(null);
      pushManager.subscribe.mockRejectedValueOnce(new Error("push service unavailable"));
      vi.spyOn(console, "error").mockImplementation(() => {});
      expect(await registerWebPush("u1")).toBe(false);
    });

    it("on sign-out, forgets this browser so the next person on it gets nothing meant for you", async () => {
      stubWorker(subscription);
      await unregisterWebPush("u1");
      const id = await webPushDeviceId(endpoint);
      expect(deleteDoc).toHaveBeenCalledWith(`users/u1/pushDevices/${id}`);
      expect(subscription.unsubscribe).toHaveBeenCalled();
    });

    it("sign-out is a no-op for a browser that never subscribed", async () => {
      stubWorker(null);
      await unregisterWebPush("u1");
      expect(deleteDoc).not.toHaveBeenCalled();
    });
  });
});
