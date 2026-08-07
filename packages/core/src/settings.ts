// Pure "Settings" logic — role options/cards and the "Your team" roster's
// search/split derivation. Shared by web (inline in src/views/Settings.tsx)
// and mobile. Icon/color selection stays out of this module, matching
// feedback.ts/history.ts's convention.
import { firstName } from "./history";
import { ROLE_LABELS, roleLabel, type AppRole } from "./permissions";
import type { AppUser, Invitation } from "./types";

export interface RoleOption {
  value: AppRole;
  label: string;
}

// Ordered low → high, mirrors web's ROLE_OPTIONS.
export const ROLE_OPTIONS: RoleOption[] = [
  { value: "viewer", label: ROLE_LABELS.viewer },
  { value: "operator", label: ROLE_LABELS.operator },
  { value: "manager", label: ROLE_LABELS.manager },
  { value: "admin", label: ROLE_LABELS.admin },
];

/** The Full-timer (admin) role option is only offered to admins (RBAC) —
 * mirrors web's EditRoleModal/InviteModal option filtering. */
export function roleOptionsFor(isAdmin: boolean): RoleOption[] {
  return ROLE_OPTIONS.filter((o) => isAdmin || o.value !== "admin");
}

export interface RoleCard {
  key: AppRole;
  label: string;
  initials: string;
  description: string;
  access: string[];
}

// Ported from web's Settings.tsx RolesReference data — "Today" relabeled to
// "Home" to match the mobile NAV_ITEMS label for '/'.
export const ROLE_CARDS: RoleCard[] = [
  {
    key: "admin",
    label: "Full-timer",
    initials: "FT",
    description: "Full-time staff. Sees the whole work — every person, the team board, and all admin tools.",
    access: ["Home", "People", "The Journey", "Gatherings", "Prayer", "History", "Settings"],
  },
  {
    key: "manager",
    label: "Trainee",
    initials: "TR",
    description: "Cares for the team. Manages users and accesses all data surfaces, minus dev-only admin.",
    access: ["Home", "People", "The Journey", "Gatherings", "Prayer", "History"],
  },
  {
    key: "operator",
    label: "Student",
    initials: "ST",
    description: "Can add and update people, log interactions, and mark attendance.",
    access: ["Home", "People", "Gatherings", "Prayer"],
  },
  {
    key: "viewer",
    label: "Community",
    initials: "CM",
    description: "A read-only window — can see gatherings and prayers, nothing else.",
    access: ["Gatherings", "Prayer"],
  },
];

/** e2e/dev fixture accounts are seeded with a "cisa-" prefixed email or
 * display name and shouldn't clutter the team roster. */
export function isTestAccount(u: { email?: string; displayName?: string }): boolean {
  const email = (u.email || "").toLowerCase();
  const displayName = (u.displayName || "").toLowerCase();
  return email.startsWith("cisa-") || displayName.startsWith("cisa-");
}

export function matchesTeamSearch(u: { email: string; displayName?: string }, q: string): boolean {
  if (!q) return true;
  const needle = q.toLowerCase();
  return u.email.toLowerCase().includes(needle) || (u.displayName?.toLowerCase().includes(needle) ?? false);
}

export interface TeamRoster {
  pending: AppUser[];
  approved: AppUser[];
  invites: Invitation[];
}

/**
 * Splits the live users+invitations lists into the roster shown by the
 * "Your team" section: test-fixture accounts excluded, search applied,
 * users split into pending (unapproved) vs. approved, and invitations whose
 * email already matches an existing user filtered out (they've since signed
 * up) — mirrors web's Settings.tsx roster derivation.
 */
export function splitTeamRoster(users: AppUser[], invitations: Invitation[], search: string): TeamRoster {
  const realUsers = users.filter((u) => !isTestAccount(u));
  const filteredUsers = realUsers.filter((u) => matchesTeamSearch(u, search));
  const pending = filteredUsers.filter((u) => !u.approved);
  const approved = filteredUsers.filter((u) => u.approved);
  const invites = invitations
    .filter((i) => !realUsers.some((u) => u.email.toLowerCase() === i.email.toLowerCase()))
    .filter((i) => matchesTeamSearch({ email: i.email }, search));
  return { pending, approved, invites };
}

export function emailAlreadyRegistered(users: AppUser[], emailLower: string): boolean {
  return users.some((u) => !isTestAccount(u) && u.email.toLowerCase() === emailLower);
}

// ── Mobile v2 copy (the design's `M2Settings`) ──────────────────────────────
// The phone's Settings is a short, honest page: who you are, how the app should
// behave, and one line about what stays on the desktop. No roster, no admin.

/** The line under the me block: "4 people in your care · 2 things looked after
 *  today". A full-timer has no queue, so pass `null` and the second clause is
 *  dropped rather than reported as zero. */
export function settingsCareLine(people: number, handled: number | null): string {
  const care = `${people} ${people === 1 ? "person" : "people"} in your care`;
  if (handled === null) return care;
  return `${care} · ${handled} ${handled === 1 ? "thing" : "things"} looked after today`;
}

/** The foot. The design says the quiet part out loud — the phone is not where
 *  the team gets managed. */
export function settingsFoot(role: AppRole | string | null): string {
  return `The team roster and everything admin live on the desktop site. Your role here is a label: ${roleLabel(role)}.`;
}

/** "Ana cares for you", or nothing when nobody is named. */
export function caredForBy(name: string | null | undefined): string {
  return name ? `${firstName(name)} cares for you` : "";
}

/** Settings → "How it looks" → Daylight / Dark / Match my phone. The design
 *  keeps this on `M2Prefs.appearance`, per person. */
export type SchemePref = "light" | "dark" | "system";

/** Narrow whatever came back out of storage. `null` means nothing usable was
 *  saved, so the caller keeps its own default rather than guessing. */
export function parseSchemePref(raw: unknown): SchemePref | null {
  return raw === "light" || raw === "dark" || raw === "system" ? raw : null;
}
