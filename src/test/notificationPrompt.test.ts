import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  NOTIFICATION_PROMPT_LS_KEY,
  getNotificationPromptDismissed,
  setNotificationPromptDismissed,
  shouldShowNotificationPrompt,
  getNotificationPlatformName,
} from "../lib/notificationPrompt";

describe("notificationPrompt", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe("getNotificationPromptDismissed & setNotificationPromptDismissed", () => {
    it("defaults to false when localStorage has no entry", () => {
      expect(getNotificationPromptDismissed()).toBe(false);
    });

    it("persists true when setNotificationPromptDismissed(true) is called", () => {
      setNotificationPromptDismissed(true);
      expect(localStorage.getItem(NOTIFICATION_PROMPT_LS_KEY)).toBe("true");
      expect(getNotificationPromptDismissed()).toBe(true);
    });

    it("resets when setNotificationPromptDismissed(false) is called", () => {
      setNotificationPromptDismissed(true);
      setNotificationPromptDismissed(false);
      expect(getNotificationPromptDismissed()).toBe(false);
    });
  });

  describe("shouldShowNotificationPrompt", () => {
    it("returns true when permission is 'default' and prompt has not been dismissed", () => {
      expect(shouldShowNotificationPrompt("default", false)).toBe(true);
    });

    it("returns false when permission is 'default' but prompt has already been dismissed", () => {
      expect(shouldShowNotificationPrompt("default", true)).toBe(false);
    });

    it("returns false when permission is already 'granted'", () => {
      expect(shouldShowNotificationPrompt("granted", false)).toBe(false);
      expect(shouldShowNotificationPrompt("granted", true)).toBe(false);
    });

    it("returns false when permission is 'denied'", () => {
      expect(shouldShowNotificationPrompt("denied", false)).toBe(false);
      expect(shouldShowNotificationPrompt("denied", true)).toBe(false);
    });

    it("returns false when notifications are 'unsupported'", () => {
      expect(shouldShowNotificationPrompt("unsupported", false)).toBe(false);
      expect(shouldShowNotificationPrompt("unsupported", true)).toBe(false);
    });
  });

  describe("getNotificationPlatformName", () => {
    it("returns 'browser' in web environment", () => {
      expect(getNotificationPlatformName()).toBe("browser");
    });
  });
});
