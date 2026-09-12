// Pure "Feedback" logic — kind metadata, kind<->type mapping, and the admin
// list's combined filter. Shared by web (src/lib/feedbackKinds.ts +
// src/views/FeedbackList.tsx's inline filtering) and mobile. Icon selection
// stays out of this module (platform-specific, mirrors history.ts/
// answered.ts/notifications.ts's convention); so does web's Tailwind
// TONE_CLASSES map — each platform owns its own tone->color mapping.
import type { Feedback, FeedbackKind, FeedbackOutcome } from "./types";

export type { FeedbackOutcome };

export const FEEDBACK_OUTCOMES: readonly FeedbackOutcome[] = [
  "shipped",
  "not-planned",
  "already-there",
];

const OUTCOME_COPY: Record<FeedbackOutcome, string> = {
  shipped: "This shipped! Thank you for helping shape the app.",
  "not-planned": "We looked into this and aren't planning to build it right now, but thank you for speaking up.",
  "already-there": "This is already in the app! Ask someone on the team and we'll show you where it lives.",
};

const OUTCOME_LABELS: Record<FeedbackOutcome, string> = {
  shipped: "Shipped",
  "not-planned": "Not planned",
  "already-there": "Already in the app",
};

export const outcomeCopy = (outcome: FeedbackOutcome): string => OUTCOME_COPY[outcome];

export const outcomeLabel = (outcome: FeedbackOutcome): string => OUTCOME_LABELS[outcome];

export type FeedbackTone = "accent" | "violet" | "amber" | "teal";

export interface FeedbackKindMeta {
  id: FeedbackKind;
  label: string;
  placeholder: string;
  tone: FeedbackTone;
}

// Single source of truth for the four "Leave a note" kinds — mirrors web's
// FEEDBACK_KINDS, minus the lucide `icon` field.
export const FEEDBACK_KINDS: readonly FeedbackKindMeta[] = [
  { id: "thought", label: "A thought", placeholder: "What's on your mind?", tone: "accent" },
  { id: "idea", label: "An idea", placeholder: "What if we tried…", tone: "violet" },
  { id: "off", label: "Something's off", placeholder: "Something felt a bit off when…", tone: "amber" },
  { id: "request", label: "A request", placeholder: "It would help if…", tone: "teal" },
];

/** Derive the stored coarse `type` from a kind. Only "Something's off" is a bug. */
export const kindToType = (kind: FeedbackKind): "bug" | "enhancement" =>
  kind === "off" ? "bug" : "enhancement";

/** Legacy fallback: docs written before `kind` existed only carry `type`. */
export const typeToKind = (type: "bug" | "enhancement"): FeedbackKind =>
  type === "bug" ? "off" : "idea";

export const kindMeta = (kind?: FeedbackKind): FeedbackKindMeta =>
  FEEDBACK_KINDS.find((k) => k.id === kind) ?? FEEDBACK_KINDS[0];

export type FeedbackStatus = Feedback["status"];

export interface FeedbackFilters {
  /** A FeedbackKind, or "all" for no kind filter. */
  kind: FeedbackKind | "all";
  /** A FeedbackStatus, or "all" for no status filter. */
  status: FeedbackStatus | "all";
  includeArchived: boolean;
  search?: string;
}

const matchesSearch = (f: Feedback, q: string): boolean => {
  if (!q) return true;
  const needle = q.toLowerCase();
  return [f.message, f.userName, f.userEmail].some((v) => (v ?? "").toLowerCase().includes(needle));
};

/**
 * Filters the admin feedback list by kind/status/archive-state/free-text —
 * mirrors web's FeedbackList.tsx inline filter combination.
 */
export function filterFeedback(items: Feedback[], filters: FeedbackFilters): Feedback[] {
  const needle = (filters.search ?? "").trim();
  return items
    .filter((f) => (filters.includeArchived ? true : !f.archived))
    .filter((f) => filters.kind === "all" || (f.kind ?? typeToKind(f.type)) === filters.kind)
    .filter((f) => filters.status === "all" || f.status === filters.status)
    .filter((f) => matchesSearch(f, needle));
}

// --- Screenshot capture contract -------------------------------------------
// Feedback screenshots are captured in-app, stored on the Firestore feedback
// doc as a base64 JPEG data URL, and shown to admins in the feedback list.
// They are never sent to GitHub — see ADR 0018 decision 7.
//
// The ceiling mirrors the `feedback` rule in firestore.rules, which rejects a
// screenshot over 200000 characters. The server writes through the Admin SDK
// and so bypasses rules, but it holds itself to the same limit: a doc that
// rules would reject is one a client-direct write could never have made, and
// Firestore caps a whole document at 1MB regardless.
export const MAX_SCREENSHOT_CHARS = 200000;

// Longest edge, in pixels, before a capture is downscaled. Keeps a desktop
// screenshot from blowing the character budget on resolution the admin list
// renders as a thumbnail anyway.
export const MAX_SCREENSHOT_DIMENSION = 1000;

// Quality ladder for re-encoding. Each rung is tried in order until the
// encoded length fits MAX_SCREENSHOT_CHARS; if none fit, the capture is
// dropped rather than truncated — half a JPEG renders as a broken image.
export const SCREENSHOT_QUALITY_LADDER: readonly number[] = [0.65, 0.4, 0.25];

/** True when `value` is a JPEG/PNG data URL within the size ceiling. */
export function isStorableScreenshot(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_SCREENSHOT_CHARS &&
    /^data:image\/(jpeg|jpg|png);base64,/.test(value)
  );
}
