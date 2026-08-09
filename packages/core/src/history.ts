// Pure "Looking back" (History) logic — humanizing logged activities into
// warm, human language, day-grouping, and filtering. Shared by web
// (src/views/History.tsx) and mobile (the History screen). Ported from
// History.tsx; icon selection is left to each platform's UI layer (this
// module only returns a `bucket`, since packages/core can't import
// lucide-react or @expo/vector-icons).
import type { Activity } from "./types";

export type Bucket = "steps" | "prayer" | "talk" | "gather";

export interface HistoryKindOption {
  id: "all" | Bucket;
  label: string;
}

export const HISTORY_KINDS: HistoryKindOption[] = [
  { id: "all", label: "Everything" },
  { id: "steps", label: "Steps forward" },
  { id: "prayer", label: "Prayer" },
  { id: "talk", label: "Conversations" },
  { id: "gather", label: "Gatherings" },
];

export interface Hist {
  id: string;
  user: string;
  userPhoto?: string;
  action: string;
  target: string;
  contactId?: string;
  type: Activity["type"];
  description?: string;
  createdAt: string;
}

export interface Humanized {
  bucket: Bucket;
  lead: string;
  tail?: string;
  showTarget: boolean;
  detail?: string;
}

// Strip DB-isms (char counts, masked digits, C-0xxx ids) into plain language.
const scrub = (s?: string): string =>
  (s || "")
    .replace(/\(\+?\d+\s*chars?\)/gi, "") // "(+34 chars)"
    .replace(/[•*]{2,}\s*\d*/g, "") // masked "•••• 1234" / "****"
    .replace(/\bC-\d+\b/g, "") // raw contact ids
    .replace(/\s{2,}/g, " ")
    .trim();

const truncate = (s: string, n = 160) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const quote = (s?: string) => {
  const t = scrub(s);
  return t ? `"${truncate(t)}"` : undefined;
};

/** Map a real logged action onto warm, human language. */
export const humanize = (a: Hist): Humanized => {
  const act = a.action.toLowerCase();
  const desc = a.description;

  if (act.startsWith("moved contact to stage")) {
    const m = scrub(desc).match(/from\s+(.+?)\s+to\s+(.+)$/i);
    const toStage = a.action.match(/to stage\s+"([^"]+)"/i)?.[1];
    return {
      bucket: "steps",
      lead: "walked",
      tail: "a step further",
      showTarget: true,
      detail: m
        ? `A step forward — from ${m[1].trim()} toward ${m[2].trim()}.`
        : toStage
          ? `A step forward — toward ${toStage}.`
          : undefined,
    };
  }
  if (act.startsWith("created a new contact") || act === "created contact") {
    return { bucket: "steps", lead: "welcomed", showTarget: true };
  }
  if (act.startsWith("deleted contact")) {
    return { bucket: "steps", lead: "let go of", showTarget: true };
  }
  if (act.startsWith("added a prayer burden for")) {
    return {
      bucket: "prayer",
      lead: "started praying for",
      showTarget: true,
      detail: quote(desc) ? `Began carrying ${quote(desc)}.` : undefined,
    };
  }
  if (act.startsWith("edited a prayer burden for")) {
    return {
      bucket: "prayer",
      lead: "added to a prayer for",
      showTarget: true,
      detail: quote(desc) ?? "Added a few lines to a prayer.",
    };
  }
  if (act.startsWith("marked a prayer burden as")) {
    const status = act.match(/as\s+(\w+)\s+for/)?.[1];
    if (status === "answered") {
      return {
        bucket: "prayer",
        lead: "gave thanks for an answered prayer for",
        showTarget: true,
        detail: "Answered, after carrying it together.",
      };
    }
    return {
      bucket: "prayer",
      lead: "updated a prayer for",
      showTarget: true,
      detail: status ? `Now marked ${status}.` : undefined,
    };
  }
  if (act.startsWith("logged a visit to") || act.startsWith("edited a visit to") || act.startsWith("removed a visit to")) {
    const lead = act.startsWith("logged")
      ? "went round to"
      : act.startsWith("edited")
        ? "wrote more about a visit to"
        : "removed a visit to";
    const where = scrub(desc);
    return { bucket: "talk", lead, showTarget: true, detail: where ? `At ${where}.` : undefined };
  }
  if (act.startsWith("logged an interaction for") || act.startsWith("logged a batch interaction for")) {
    const lead =
      a.type === "call"
        ? "called"
        : a.type === "email"
          ? "emailed"
          : a.type === "event"
            ? "met with"
            : a.type === "comment"
              ? "left a note for"
              : "spent time with";
    return { bucket: "talk", lead, showTarget: true, detail: quote(desc) };
  }
  if (act.startsWith("updated an interaction for")) {
    return { bucket: "talk", lead: "updated a conversation with", showTarget: true };
  }
  if (act.startsWith("left a comment on")) {
    return { bucket: "talk", lead: "left a note for", showTarget: true, detail: quote(desc) };
  }
  if (act.includes("tag")) {
    const removed = act.startsWith("removed");
    return {
      bucket: "talk",
      lead: removed ? "removed a tag from" : "added a tag for",
      showTarget: true,
    };
  }
  if (act.startsWith('updated attendance for "') && act.includes('" to ')) {
    return { bucket: "gather", lead: "noted who gathered at", showTarget: true };
  }
  if (act.startsWith("submitted feedback")) {
    return { bucket: "talk", lead: "shared some feedback", showTarget: false, detail: quote(desc) };
  }
  if (act.startsWith("updated")) {
    return {
      bucket: "talk",
      lead: "updated details for",
      showTarget: true,
      detail: scrub(desc) ? "Tidied up their details." : undefined,
    };
  }
  // Fallback — keep the verb, drop the DB-isms.
  return { bucket: "talk", lead: a.action, showTarget: !!a.contactId, detail: quote(desc) };
};

export interface DayInfo {
  label: string;
  sub: string;
}

export const dayInfo = (iso: string, now: number = Date.now()): DayInfo => {
  const d = new Date(iso);
  const nowD = new Date(now);
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(nowD) - startOf(d)) / 86_400_000);
  const md = d.toLocaleDateString(undefined, { month: "long", day: "numeric" });
  if (diff === 0) return { label: "Today", sub: md };
  if (diff === 1) return { label: "Yesterday", sub: md };
  if (diff > 1 && diff < 7) return { label: d.toLocaleDateString(undefined, { weekday: "long" }), sub: md };
  return { label: md, sub: d.toLocaleDateString(undefined, { weekday: "long" }) };
};

export const firstName = (name: string) => (name || "Someone").split(" ")[0];

export type HistoryRow = { type: "date"; at: string; key: string } | { type: "item"; a: Hist; key: string };

export interface HistoryFilters {
  kind: "all" | Bucket;
  who: string;
  q?: string;
}

/** Distinct staff for the "Whole team" filter option, from every activity. */
export function historyStaff(activities: Hist[]): string[] {
  const names = new Set<string>();
  activities.forEach((a) => a.user && names.add(a.user));
  return [...names].sort();
}

/** Count of distinct contacts touched by any activity. */
export function peopleRemembered(activities: Hist[]): number {
  return new Set(activities.filter((a) => a.contactId).map((a) => a.contactId)).size;
}

/**
 * Filters activities by kind/who/free-text and flattens them into a single
 * stream of rows with a date marker wherever the day changes.
 */
export function buildHistoryRows(activities: Hist[], filters: HistoryFilters): HistoryRow[] {
  const needle = (filters.q ?? "").trim().toLowerCase();
  const filtered = activities.filter((a) => {
    if (filters.who !== "all" && a.user !== filters.who) return false;
    if (filters.kind !== "all" && humanize(a).bucket !== filters.kind) return false;
    if (needle) {
      const hay = `${a.user} ${a.action} ${a.target} ${a.description || ""}`.toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });

  const rows: HistoryRow[] = [];
  let lastDay: string | null = null;
  filtered.forEach((a) => {
    const k = new Date(a.createdAt).toDateString();
    if (k !== lastDay) {
      rows.push({ type: "date", at: a.createdAt, key: "d:" + k });
      lastDay = k;
    }
    rows.push({ type: "item", a, key: a.id });
  });
  return rows;
}
