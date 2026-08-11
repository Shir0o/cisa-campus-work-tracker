import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** First name from a display name — "Someone" when absent. Mirrors the shared
 *  @cisa/core helper (this app deliberately has no @cisa/core dependency). */
export function firstName(name: string | null | undefined): string {
  return (name || "Someone").split(" ")[0];
}

export function getUserAvatar(photoURL: string | null | undefined, gender?: string | null) {
  if (photoURL) return photoURL;
  
  const isFemale = gender === 'female';
  return isFemale 
    ? "https://api.dicebear.com/7.x/avataaars/svg?seed=Aneka&gender=female" 
    : "https://api.dicebear.com/7.x/avataaars/svg?seed=Felix&gender=male";
}

export function formatPhoneNumber(value: string) {
  if (!value) return value;
  const phoneNumber = value.replace(/[^\d]/g, '');
  const phoneNumberLength = phoneNumber.length;
  if (phoneNumberLength < 4) return phoneNumber;
  if (phoneNumberLength < 7) {
    return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3)}`;
  }
  return `(${phoneNumber.slice(0, 3)}) ${phoneNumber.slice(3, 6)}-${phoneNumber.slice(6, 10)}`;
}

export function validatePhoneNumber(value: string) {
  const digits = value.replace(/[^\d]/g, '');
  return digits.length === 10;
}

export function getUserInitials(name: string | null | undefined) {
  if (!name) return '??';
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

/**
 * Warm, plain-language relative time ("just now", "5m ago", "3d ago", then a
 * short date). Shared by History ("Looking back") and Global Search.
 */
export function relTime(iso: string) {
  const date = new Date(iso);
  const now = new Date();
  const m = Math.floor((now.getTime() - date.getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const dd = Math.floor(h / 24);
  if (dd < 7) return `${dd}d ago`;
  // Older than a week: show the date. Include the year when it's not this
  // year, so historical entries (e.g. "Jun 3") aren't ambiguous across years.
  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  if (date.getFullYear() !== now.getFullYear()) options.year = "numeric";
  return date.toLocaleDateString(undefined, options);
}

/** Bidirectional relative time for notifications — handles future items (events). */
export function ntfWhen(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff > 0) {
    const days = Math.round(diff / 86_400_000);
    if (days <= 0) return 'today';
    if (days === 1) return 'tomorrow';
    if (days < 7) return `in ${days} days`;
    return `in ${Math.round(days / 7)} wk`;
  }
  return relTime(iso);
}
