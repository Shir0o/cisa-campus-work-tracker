import React from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NotificationPermissionBanner } from "../components/notifications/NotificationPermissionBanner";
import * as webPush from "../lib/webPush";
import * as notificationPrompt from "../lib/notificationPrompt";

describe("NotificationPermissionBanner", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("does not render when permission is already granted", () => {
    vi.spyOn(webPush, "getWebNotificationPermissionStatus").mockReturnValue("granted");
    vi.spyOn(notificationPrompt, "getNotificationPromptDismissed").mockReturnValue(false);

    render(<NotificationPermissionBanner />);
    expect(screen.queryByText(/notification permission/i)).toBeNull();
  });

  it("does not render when permission is denied", () => {
    vi.spyOn(webPush, "getWebNotificationPermissionStatus").mockReturnValue("denied");
    vi.spyOn(notificationPrompt, "getNotificationPromptDismissed").mockReturnValue(false);

    render(<NotificationPermissionBanner />);
    expect(screen.queryByText(/notification permission/i)).toBeNull();
  });

  it("does not render when prompt was dismissed previously", () => {
    vi.spyOn(webPush, "getWebNotificationPermissionStatus").mockReturnValue("default");
    vi.spyOn(notificationPrompt, "getNotificationPromptDismissed").mockReturnValue(true);

    render(<NotificationPermissionBanner />);
    expect(screen.queryByText(/notification permission/i)).toBeNull();
  });

  it("renders when permission is default and not dismissed, showing plain browser wording", () => {
    vi.spyOn(webPush, "getWebNotificationPermissionStatus").mockReturnValue("default");
    vi.spyOn(notificationPrompt, "getNotificationPromptDismissed").mockReturnValue(false);

    render(<NotificationPermissionBanner />);
    expect(screen.getByText(/Enable notifications/i)).toBeDefined();
    expect(screen.getByText(/browser/i)).toBeDefined();
    expect(screen.getByRole("button", { name: /enable/i })).toBeDefined();
    expect(screen.getByRole("button", { name: /later/i })).toBeDefined();
  });

  it("dismisses and sets localStorage when 'Later' is clicked", async () => {
    vi.spyOn(webPush, "getWebNotificationPermissionStatus").mockReturnValue("default");
    const setDismissedSpy = vi.spyOn(notificationPrompt, "setNotificationPromptDismissed");

    render(<NotificationPermissionBanner />);
    const laterBtn = screen.getByRole("button", { name: /later/i });
    fireEvent.click(laterBtn);

    await waitFor(() => {
      expect(screen.queryByText(/notification permission/i)).toBeNull();
    });
    expect(setDismissedSpy).toHaveBeenCalledWith(true);
  });

  it("requests permission and registers service worker when 'Enable' is clicked", async () => {
    vi.spyOn(webPush, "getWebNotificationPermissionStatus").mockReturnValue("default");
    const requestSpy = vi.spyOn(webPush, "requestWebNotificationPermission").mockResolvedValue(true);
    const registerSWSpy = vi.spyOn(webPush, "registerServiceWorker").mockResolvedValue(null);
    const setDismissedSpy = vi.spyOn(notificationPrompt, "setNotificationPromptDismissed");

    render(<NotificationPermissionBanner />);
    const enableBtn = screen.getByRole("button", { name: /enable/i });
    fireEvent.click(enableBtn);

    await waitFor(() => {
      expect(requestSpy).toHaveBeenCalled();
      expect(registerSWSpy).toHaveBeenCalled();
      expect(setDismissedSpy).toHaveBeenCalledWith(true);
      expect(screen.queryByText(/notification permission/i)).toBeNull();
    });
  });
});
