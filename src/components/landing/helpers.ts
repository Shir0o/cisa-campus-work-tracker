// Shared helpers for the role-based landing pages and My Day. Extracted from
// MyDay.tsx so the new Trainee/Student/Community landings reuse the same
// formatting and styling primitives instead of duplicating them.
import { Stage } from "../../types";

export const DAY_MS = 86_400_000;

export const parseMs = (s?: string | null): number | null => {
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isNaN(t) ? null : t;
};

export const daysSince = (ms: number) => Math.max(0, Math.floor((Date.now() - ms) / DAY_MS));

export const connectedLabel = (d: number) =>
  d === 0
    ? "Connected today"
    : d === 1
      ? "Last connected yesterday"
      : `Last connected ${d} days ago`;

export const truncate = (s: string | undefined, n: number) =>
  s && s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s || "";

export const agoLabel = (iso?: string | null) => {
  const ms = parseMs(iso);
  const d = ms == null ? 0 : daysSince(ms);
  return `${d} ${d === 1 ? "day" : "days"} ago`;
};

export const getGreeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

// Shared input/label classes for the inline editors and composers.
export const editInputClass =
  "w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface text-sm text-on-surface focus:border-primary focus:outline-none";
export const dueLabelClass =
  "text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant";

// Card shell shared by the landing/My Day sections.
export const cardClass = "bg-surface rounded-2xl border border-outline-variant/60 px-5";

// Resolve a stage's color classes from the stage list (fallback neutral).
export const stageColor = (stages: Stage[], label?: string) =>
  stages.find((s) => s.label === label)?.color || "bg-surface-variant text-on-surface-variant";
