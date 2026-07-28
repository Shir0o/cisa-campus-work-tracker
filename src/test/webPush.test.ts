import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isWebNotificationSupported,
  getWebNotificationPermissionStatus,
  requestWebNotificationPermission,
  registerServiceWorker,
  showWebPushNotification,
} from "../lib/webPush";

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

  // ── showWebPushNotification ────────────────────────────────────────

  describe("showWebPushNotification", () => {
    let originalSW: ServiceWorkerContainer;

    beforeEach(() => {
      originalSW = navigator.serviceWorker;
    });

    afterEach(() => {
      Object.defineProperty(navigator, "serviceWorker", { value: originalSW, configurable: true });
    });

    it("returns false when notification is unsupported", async () => {
      clearNotification();
      expect(await showWebPushNotification("hello")).toBe(false);
    });

    it("returns false when permission is not granted", async () => {
      stubNotification("default");
      expect(await showWebPushNotification("hello")).toBe(false);
    });

    it("uses service worker showNotification when available", async () => {
      stubNotification("granted");
      const showNotificationFn = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, "serviceWorker", {
        value: { ready: Promise.resolve({ showNotification: showNotificationFn }) },
        configurable: true,
      });
      const result = await showWebPushNotification("Test Title", { body: "Test body" });
      expect(result).toBe(true);
      expect(showNotificationFn).toHaveBeenCalledWith("Test Title", {
        icon: "/logo.svg",
        badge: "/logo.svg",
        body: "Test body",
      });
    });

    it("falls back to Notification constructor when SW has no showNotification", async () => {
      const Fake = stubNotification("granted");
      Object.defineProperty(navigator, "serviceWorker", {
        value: { ready: Promise.resolve({ showNotification: null }) },
        configurable: true,
      });
      const result = await showWebPushNotification("Fallback Title");
      expect(result).toBe(true);
      expect(Fake).toHaveBeenCalledWith("Fallback Title", { icon: "/logo.svg" });
    });


    it("returns false when display throws", async () => {
      stubNotification("granted");
      Object.defineProperty(navigator, "serviceWorker", {
        value: {
          ready: Promise.resolve({
            showNotification: vi.fn().mockRejectedValue(new Error("display-fail")),
          }),
        },
        configurable: true,
      });
      const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
      expect(await showWebPushNotification("Err")).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();
    });
  });
});
