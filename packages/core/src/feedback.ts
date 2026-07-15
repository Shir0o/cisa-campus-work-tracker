// Pure "Feedback" logic — kind metadata, kind<->type mapping, and the admin
// list's combined filter. Shared by web (src/lib/feedbackKinds.ts +
// src/views/FeedbackList.tsx's inline filtering) and mobile. Icon selection
// stays out of this module (platform-specific, mirrors history.ts/
// answered.ts/notifications.ts's convention); so does web's Tailwind
// TONE_CLASSES map — each platform owns its own tone->color mapping.
import type { Feedback, FeedbackKind } from "./types";

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
