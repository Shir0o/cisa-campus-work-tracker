// "Message" a contact from My Day. Contacts aren't app users, so this opens a
// real SMS / iMessage conversation by phone number rather than an in-app DM.
//   - phones and macOS understand the `sms:` URI (opens Messages / iMessage /
//     the default SMS app), so we use it directly there.
//   - other desktops (Windows / Linux) have no `sms:` handler, so we fall back
//     to Google Messages for web. An explicit user preference overrides
//     detection (see userPreferences.desktopMessagingApp).
import type { DesktopMessagingApp } from "./userPreferences";

const GOOGLE_MESSAGES_WEB = "https://messages.google.com/web/";

function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iphone|ipad|ipod|android/i.test(navigator.userAgent);
}

function isMac(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = `${navigator.platform || ""} ${navigator.userAgent || ""}`;
  return /mac/i.test(ua) && !/iphone|ipad|ipod/i.test(navigator.userAgent);
}

// Open a message conversation with the given phone number. `pref` (when set)
// forces the desktop target; otherwise the platform is auto-detected.
export function openMessage(phone?: string | null, pref?: DesktopMessagingApp): void {
  if (typeof window === "undefined") return;
  const digits = (phone || "").replace(/[^\d+]/g, "");

  const wantsGoogle = pref === "google" || (!pref && !isMobile() && !isMac());
  if (wantsGoogle || !digits) {
    window.open(GOOGLE_MESSAGES_WEB, "_blank", "noopener");
    return;
  }
  window.open(`sms:${digits}`);
}
