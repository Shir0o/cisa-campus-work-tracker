// The mobile app's SHELL — which navigation frame a role opens into, and the
// copy the trainee's queue chrome wears.
//
// The design project (`MOBILE-V2.md`, `views/mobile/{m2,member,ft}.jsx`) builds
// three shells, not one: the trainee has NO tab bar (a ☰ drawer over a
// full-screen queue), members get four tabs, and the full-timer gets four
// different ones. Deciding that here — beside `pickLandingForRole`, which
// decides which HOME each role sees — keeps the tab bar and the screens that
// need a back row reading from one source.
import type { AppRole } from "./permissions";
import { pickLandingForRole } from "./permissions";
import { MEMBER_TABS, memberRoleOf } from "./memberHome";

export type ShellKind = "queue" | "member" | "ft";

/** Trainee → the focus queue behind a drawer; student/community → the member
 *  tabs; everyone else (full-timer, and any unrecognized role) → the FT tabs. */
export function shellForRole(role: AppRole | string | null | undefined): ShellKind {
  const landing = pickLandingForRole(role ?? null);
  if (landing === "trainee") return "queue";
  if (landing === "student" || landing === "community") return "member";
  return "ft";
}

export interface ShellTab {
  /** The route file's name inside `app/(tabs)`. */
  name: string;
  title: string;
}

/**
 * The tabs a role sees, in the design's order. Empty for the trainee — that
 * shell has no bar at all, so the queue fills the screen.
 *
 * `views/mobile/member.jsx` (Today/What's on · Prayer · Messages · You) and
 * `views/mobile/ft.jsx` `FT_TABS` (Today · People · Messages · More).
 */
export function tabsForRole(role: AppRole | string | null | undefined): ShellTab[] {
  const shell = shellForRole(role);
  if (shell === "queue") return [];
  if (shell === "ft") {
    return [
      { name: "index", title: "Today" },
      { name: "people", title: "People" },
      { name: "messages", title: "Messages" },
      { name: "more", title: "More" },
    ];
  }
  // The labels ("Today" vs "What's on") already live in MEMBER_TABS; this only
  // says which route each one sits on.
  const memberRole = memberRoleOf(role as AppRole) ?? "student";
  return MEMBER_TAB_ROUTES.map((name, i) => ({ name, title: MEMBER_TABS[memberRole][i] }));
}

const MEMBER_TAB_ROUTES = ["index", "prayer", "messages", "more"];

/** True when the role reaches this screen by pushing onto it rather than by
 *  tapping a tab — i.e. it needs its own back row. */
export function isPushedScreen(role: AppRole | string | null | undefined, name: string): boolean {
  return !tabsForRole(role).some((t) => t.name === name);
}

export interface ShellLink {
  key: string;
  label: string;
  href: string;
}

/**
 * `M2_DRAWER` in `views/mobile/m2.jsx`, in order. The trainee's
 * everything-else; the queue itself is the app.
 *
 * The design runs `M2_DRAWER` through `m2DrawerFor(role)` so a row can never
 * open a screen the role is locked out of. This list is the trainee's already
 * resolved: **Gatherings and The Board are dropped**, because
 * `canAccessRoute("manager", …)` closes `/attendance` and `/coordination` and
 * a listed row that lands on "Not available" is worse than no row.
 *
 * Settings stays. `canAccessRoute` closes `/settings` to the trainee for the
 * WEB sidebar, but the queue's own prefs (the on-campus window, the nudges,
 * the day cap) live on that screen, so mobile gates it on `canSeePrefs`
 * instead — the same predicate the design's `M2Sub` uses.
 */
export const TRAINEE_DRAWER: ShellLink[] = [
  { key: "people", label: "People", href: "/people" },
  { key: "journey", label: "The Journey", href: "/journey" },
  { key: "messages", label: "Messages", href: "/messages" },
  // Not an app login — the form you hand to someone new so the team can keep
  // in touch (the design's navId "*": open to every role). See SIGNUP.md.
  { key: "signup", label: "Sign-up form", href: "/signup" },
  { key: "settings", label: "Settings", href: "/settings" },
];

export const TRAINEE_DRAWER_FOOT = "The queue is the app. Everything else lives here.";

/** `FT_MORE` in `views/mobile/ft.jsx`, verbatim and in order. People and
 *  Messages are tabs for this role, so they aren't repeated here. */
export const FT_MORE: ShellLink[] = [
  { key: "journey", label: "The Journey", href: "/journey" },
  { key: "gatherings", label: "Gatherings", href: "/attendance" },
  { key: "prayers", label: "Prayer log", href: "/prayer-log" },
  { key: "board", label: "The Board", href: "/coordination" },
  { key: "settings", label: "Settings", href: "/settings" },
];

export const FT_MORE_INTRO =
  "The screens you sometimes need on the move. Everything heavier lives on the desktop.";
export const FT_MORE_FOOT =
  "Board pages, gatherings and kinds are read-mostly here — edit them at a desk.";

// ── the queue's chrome copy (`.m2-top`, `.m2-queue`, `.m2-clear`) ──────────

export interface QueueMeta {
  /** "Today · 8 to look after" */
  left: string;
  /** "3 of 8", or "" when there is nothing to count. */
  right: string;
}

/**
 * The two labels either side of the meta row. `total` counts what the day
 * held — everything still queued PLUS what's already been looked after — so
 * working through cards moves the counter instead of shrinking the day.
 */
export function queueMeta(remaining: number, handled: number): QueueMeta {
  const total = remaining + handled;
  if (total === 0) return { left: "Today", right: "" };
  const position = Math.min(handled + 1, total);
  return {
    left: `Today · ${total} to look after`,
    right: `${position} of ${total}`,
  };
}

/**
 * The floor line under the up-next faces: "Then Ana, Rio, Kofi +2".
 * `names` is what each waiting card calls itself — a person's first name, or
 * the card's own label when there's nobody behind it (`nextName` in `m2.jsx`).
 */
export function upNextLine(names: string[]): string {
  if (names.length === 0) return "Last one today";
  const shown = names.slice(0, 3);
  const rest = names.length - shown.length;
  return `Then ${shown.join(", ")}${rest > 0 ? ` +${rest}` : ""}`;
}

/** The line under the all-clear headline. */
export function allClearLine(handled: number): string {
  if (handled === 0) return "Nothing is waiting on you right now. Enjoy the walk to class.";
  return `${handled} ${handled === 1 ? "thing" : "things"} looked after today. That's the work.`;
}
