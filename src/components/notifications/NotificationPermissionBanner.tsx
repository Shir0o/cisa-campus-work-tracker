import React, { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import {
  getWebNotificationPermissionStatus,
  requestWebNotificationPermission,
  registerServiceWorker,
} from "../../lib/webPush";
import {
  shouldShowNotificationPrompt,
  getNotificationPromptDismissed,
  setNotificationPromptDismissed,
  getNotificationPlatformName,
} from "../../lib/notificationPrompt";

export function NotificationPermissionBanner() {
  const [visible, setVisible] = useState(false);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    const status = getWebNotificationPermissionStatus();
    const dismissed = getNotificationPromptDismissed();
    if (shouldShowNotificationPrompt(status, dismissed)) {
      setVisible(true);
    }
  }, []);

  if (!visible) return null;

  const platform = getNotificationPlatformName();

  const handleDismiss = () => {
    setNotificationPromptDismissed(true);
    setVisible(false);
  };

  const handleEnable = async () => {
    if (requesting) return;
    setRequesting(true);
    try {
      const granted = await requestWebNotificationPermission();
      if (granted) {
        await registerServiceWorker();
      }
    } finally {
      setNotificationPromptDismissed(true);
      setVisible(false);
      setRequesting(false);
    }
  };

  return (
    <div
      role="region"
      aria-label="Notification Permission"
      className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:max-w-md z-50 animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      <div className="bg-surface border border-outline/20 shadow-lg rounded-2xl p-4 flex flex-col gap-3 text-on-surface">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-primary/10 text-primary shrink-0">
            <Bell className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0 pr-2">
            <h4 className="text-sm font-semibold leading-tight">
              Enable notifications
            </h4>
            <p className="text-xs text-on-surface-variant mt-1 leading-normal">
              CISA Campus Work Tracker is requesting notification permission for your {platform}.
            </p>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Close"
            className="text-on-surface-variant hover:text-on-surface p-1 rounded-lg transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1 border-t border-outline/10">
          <button
            type="button"
            onClick={handleDismiss}
            className="px-3 py-1.5 text-xs font-medium rounded-lg text-on-surface-variant hover:bg-surface-variant/40 transition-colors"
          >
            Later
          </button>
          <button
            type="button"
            onClick={handleEnable}
            disabled={requesting}
            className="px-3.5 py-1.5 text-xs font-semibold rounded-lg bg-primary text-on-primary hover:opacity-95 transition-opacity disabled:opacity-50"
          >
            {requesting ? "Enabling…" : "Enable"}
          </button>
        </div>
      </div>
    </div>
  );
}
