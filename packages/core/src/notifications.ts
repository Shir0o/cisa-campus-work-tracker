// Pure "Notifications" logic — tone selection, and merging/grouping the
// personal + broadcast (ALL_ADMINS) notification streams into the bell
// panel's shape. Ported from web's src/components/layout/NotificationCenter.tsx
// inline logic; icon selection stays out of this module (platform-specific,
// mirrors history.ts/answered.ts's convention).
import type { Notification } from "./types";

export type NotificationTone = "accent" | "violet" | "amber" | "teal" | "sage";

/** Derives a tone from a notification's `type` (mirrors web's typeToTone). */
export function typeToTone(type: Notification["type"]): NotificationTone {
  switch (type) {
    case "assignment": return "teal";
    case "event": return "amber";
    case "success": return "sage";
    case "warning": return "amber";
    case "error": return "amber";
    default: return "accent";
  }
}

/** A notification's explicit `tone`, if set, else the type-derived tone. */
export function toneForNotification(n: Pick<Notification, "type" | "tone">): NotificationTone {
  return n.tone ?? typeToTone(n.type);
}

/**
 * Combines the personal + broadcast lists, sorts by createdAt desc, and
 * slices to `limit` (default 20) — mirrors web's `updateCombined`.
 */
export function mergeNotifications(
  personal: Notification[],
  broadcast: Notification[],
  limit = 20,
): Notification[] {
  return [...personal, ...broadcast]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
}

export interface NotificationGroups {
  unread: Notification[];
  read: Notification[];
  unreadCount: number;
}

/** Splits a merged list into unread ("Worth a look") / read ("Earlier") groups. */
export function groupNotifications(list: Notification[]): NotificationGroups {
  const unread = list.filter((n) => !n.read);
  const read = list.filter((n) => n.read);
  return { unread, read, unreadCount: unread.length };
}
