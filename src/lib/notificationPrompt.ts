export const NOTIFICATION_PROMPT_LS_KEY = "cisa.notification_prompt_dismissed.v1";

export function getNotificationPromptDismissed(): boolean {
  if (typeof window === "undefined" || !window.localStorage) return false;
  return localStorage.getItem(NOTIFICATION_PROMPT_LS_KEY) === "true";
}

export function setNotificationPromptDismissed(dismissed: boolean): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  if (dismissed) {
    localStorage.setItem(NOTIFICATION_PROMPT_LS_KEY, "true");
  } else {
    localStorage.removeItem(NOTIFICATION_PROMPT_LS_KEY);
  }
}

export function shouldShowNotificationPrompt(
  status: NotificationPermission | "unsupported",
  dismissed: boolean
): boolean {
  if (status !== "default") return false;
  return !dismissed;
}

export function getNotificationPlatformName(): "browser" | "iOS" | "Android" {
  return "browser";
}
