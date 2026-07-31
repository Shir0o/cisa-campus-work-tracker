// Mobile v2 — the MEMBER app (student · community). PURE derivations, ported
// from the Claude Design project's `views/mobile/member.jsx` (`M2Member`).
//
// Not the trainee's focus queue and not the full-timer's widgets: a calm
// single-scroll "what's next", because members browse — they don't work a
// list. Members never see the CRM: no stages, no owners, no contact ids, no
// metrics, nothing about who cares for whom.
//
// Same split as ftHome.ts / queue.ts — the Firestore subscriptions and writes
// stay in each app's data layer; this is the behavior oracle, and the only
// part of the member app that carries automated tests (apps/mobile has none by
// convention).
//
// ONE SUBSTITUTION the prototype's mock data allowed and this schema doesn't:
// the design's "a note from the person who cares for you" reads a `caredById`
// off a mock persona. There is no student↔full-timer care relationship here —
// no link at all between a user account and a `Contact` — so
// `noteFromTheTeam` reads the newest direct message from ANY full-timer
// instead, and the copy says "from {name}", never "who cares for you".
import { format } from "date-fns";
import { ftLastHeard } from "./ftHome";
import { firstName } from "./history";
import { DAY_MS, daysSince, parseMs, toLocalDate, type PersonalPrayer } from "./myday";
import { pickLandingForRole, type AppRole } from "./permissions";
import { upcomingEventsForRsvp } from "./rsvp";
import type { ChatMessage, ChatRoom, Contact, Event, PrayerRecord, PrayerRequest } from "./types";

/** Events under the hero, in "Also coming up". */
export const MEMBER_ALSO_COMING = 3;
/** Open prayers a Community member is shown to carry. */
export const MEMBER_TEAM_HOLDING = 6;

/** The bottom-tab labels per role — the design's `MBR_TABS`. Kept here so the
 * two member roles read differently ("Today" vs "What's on") from one place;
 * `tabsForRole` in `shell.ts` pairs them with their routes. */
export const MEMBER_TABS: Record<"student" | "community", string[]> = {
  student: ["Today", "Prayer", "Messages", "You"],
  community: ["What's on", "Prayer", "Messages", "You"],
};

export type MemberRole = "student" | "community";

/** Which member app a role opens, or null for staff. Reads through
 * `pickLandingForRole` so "who is a member" is decided in exactly one place —
 * every screen that forks between the Material staff view and the v2 member
 * one asks this. */
export function memberRoleOf(role: AppRole | null | undefined): MemberRole | null {
  const landing = pickLandingForRole(role ?? null);
  return landing === "student" || landing === "community" ? landing : null;
}

// ── the header ─────────────────────────────────────────────────────────────

/** The design's two greetings, verbatim. */
export function memberGreeting(role: MemberRole, name: string): string {
  const first = firstName(name);
  return role === "student" ? `Hi ${first}.` : `Hello, ${first}.`;
}

export function memberIntro(role: MemberRole): string {
  return role === "student"
    ? "Here's what's next, and a quiet place to pray. You're welcome at any of it."
    : "Thank you for being part of the family around these students. Here's what's happening, and when there's room at your table.";
}

export function memberFoot(role: MemberRole): string {
  return role === "student"
    ? "You belong here — exactly as you are today."
    : "Thank you for making room for these students.";
}

// ── when something is ──────────────────────────────────────────────────────

/** "today" · "tomorrow" · "Thursday" · "in 9 days" — the design's
 * `mbrWhenWords`. Goes through `toLocalDate`, never `new Date(iso)`: an
 * `Event.date` is a bare `yyyy-MM-dd`, which `new Date()` reads as UTC
 * midnight — a day early everywhere behind UTC. */
export function memberWhenWords(date: string, now: number = Date.now()): string {
  const d = toLocalDate(date);
  if (!d) return "";
  const today = toLocalDate(format(new Date(now), "yyyy-MM-dd"));
  if (!today) return "";
  const days = Math.round((d.getTime() - today.getTime()) / DAY_MS);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days < 0) return "already been";
  if (days < 7) return format(d, "EEEE");
  return `in ${days} days`;
}

/** "today" · "yesterday" · "3 days ago" from a timestamp.
 *
 * The member screens carry ISO dates, not day counts, and `agoLabel` prints
 * "0 days ago" for something that happened an hour ago — which reads as a bug
 * on a request you just sent. The phrasing is `ftLastHeard`'s, reused rather
 * than restated so the two rooms say the same words for the same gap. */
export function memberAgo(iso: string | null | undefined, now: number = Date.now()): string {
  const ms = parseMs(iso);
  if (ms == null) return "a while ago";
  return ftLastHeard(daysSince(ms, now));
}

export interface MemberUpcoming {
  /** The one hero at the top — the next thing on. */
  next: Event | null;
  /** The handful under it, in "Also coming up". */
  rest: Event[];
}

/** Reads through `upcomingEventsForRsvp`, so the member app and the two
 * Material landings agree on what "upcoming" means (yesterday-onward grace
 * window, soonest first, ties broken by `order`). */
export function memberUpcoming(events: Event[], now: number = Date.now()): MemberUpcoming {
  const rows = upcomingEventsForRsvp(events, MEMBER_ALSO_COMING + 1, now);
  return { next: rows[0]?.ev ?? null, rest: rows.slice(1).map((r) => r.ev) };
}

// ── a note from the team ───────────────────────────────────────────────────

export interface MemberNote {
  roomId: string;
  fromUid: string;
  fromName: string;
  body: string;
  at: string | null;
}

/** The newest direct message a full-timer sent me. See the substitution note
 * at the top: the design's "the person who cares for you" has no equivalent
 * here, so this is "someone on the team wrote to you". */
export function noteFromTheTeam(
  rooms: ChatRoom[],
  uid: string | null | undefined,
  fullTimerUids: string[],
): MemberNote | null {
  if (!uid) return null;
  const staff = new Set(fullTimerUids);
  const candidates = rooms
    .filter(
      (r) =>
        r.type === "direct" &&
        r.memberIds.includes(uid) &&
        !!r.lastMessage &&
        r.lastMessage.senderId !== uid &&
        staff.has(r.lastMessage.senderId),
    )
    .sort(
      (a, b) =>
        (parseMs(b.lastMessage?.timestamp as string | null) ?? 0) -
        (parseMs(a.lastMessage?.timestamp as string | null) ?? 0),
    );
  const top = candidates[0];
  if (!top?.lastMessage) return null;
  return {
    roomId: top.id,
    fromUid: top.lastMessage.senderId,
    fromName: top.lastMessage.senderName,
    body: top.lastMessage.text,
    at: (top.lastMessage.timestamp as string | null) ?? null,
  };
}

// ── announcements ──────────────────────────────────────────────────────────

export interface MemberAnnouncement {
  roomId: string;
  name: string;
  body: string;
  at: string | null;
  unread: boolean;
}

/** The announcement rooms I'm in that have something in them, newest first.
 * `isRead` is the per-device last-opened check each app already owns. */
export function announcementRows(
  rooms: ChatRoom[],
  uid: string | null | undefined,
  isUnread: (room: ChatRoom) => boolean,
): MemberAnnouncement[] {
  if (!uid) return [];
  return rooms
    .filter((r) => r.type === "announcement" && r.memberIds.includes(uid) && !!r.lastMessage)
    .sort(
      (a, b) =>
        (parseMs(b.lastMessage?.timestamp as string | null) ?? 0) -
        (parseMs(a.lastMessage?.timestamp as string | null) ?? 0),
    )
    .map((r) => ({
      roomId: r.id,
      name: r.name || "Announcement",
      body: r.lastMessage!.text,
      at: (r.lastMessage!.timestamp as string | null) ?? null,
      unread: isUnread(r),
    }));
}

// ── prayer ─────────────────────────────────────────────────────────────────

export interface MemberPrayerGroups<T> {
  open: T[];
  answered: T[];
}

/** "People on your heart" — the member's own private list, split into the ones
 * still open and the ones to look back on. Archived rows stay hidden, matching
 * `useStudentLandingData`'s own filter. */
export function memberPrayerGroups(
  prayers: PersonalPrayer[],
): MemberPrayerGroups<PersonalPrayer> {
  const live = prayers.filter((p) => p.status !== "archived");
  return {
    open: live.filter((p) => p.status !== "answered"),
    answered: live.filter((p) => p.status === "answered"),
  };
}

/** "What you've asked" — the member's own requests to the team, newest first. */
export function memberAsks(requests: PrayerRequest[]): MemberPrayerGroups<PrayerRequest> {
  const byNewest = [...requests].sort(
    (a, b) => (parseMs(b.createdAt) ?? 0) - (parseMs(a.createdAt) ?? 0),
  );
  return {
    open: byNewest.filter((r) => r.status === "open"),
    answered: byNewest.filter((r) => r.status === "answered"),
  };
}

export interface MemberHolding {
  prayerId: string;
  /** "Rio" — a first name, never a contact id. Members don't see the CRM. */
  who: string;
  burden: string;
}

/** What the team is carrying, for a Community member to carry too. Read-only,
 * newest first, and capped — this is a window, not a caseload. Prayers with no
 * contact behind them drop out: "names, not cases" needs a name. */
export function teamHolding(
  prayers: PrayerRecord[],
  contacts: Contact[],
  limit: number = MEMBER_TEAM_HOLDING,
): MemberHolding[] {
  return prayers
    .filter((p) => p.status === "pending" || p.status === "ongoing")
    .sort((a, b) => (parseMs(b.date) ?? 0) - (parseMs(a.date) ?? 0))
    .map((p) => {
      const c = contacts.find((x) => x.id === p.contactId);
      return c ? { prayerId: p.id, who: firstName(c.name), burden: p.burden } : null;
    })
    .filter((row): row is MemberHolding => row !== null)
    .slice(0, limit);
}

// ── bringing someone with you ──────────────────────────────────────────────

/** The one line under an event: what kind it is and where. The design also put
 * a time of day here; `Event` has no time field at all (the same gap ftHome.ts
 * hit with its "team prayer" tile), so it reads type · location. */
export function memberEventSub(ev: Event): string {
  return [ev.type, ev.location].filter(Boolean).join(" · ");
}

/** The invitation a student sends — the design's own sentence. "The easiest
 * invitation is 'come with me'." */
export function inviteMessage(ev: Event | null, now: number = Date.now()): string {
  if (!ev) return "Come along to something with me this week?";
  const when = memberWhenWords(ev.date, now);
  const tail = ev.location ? `${when} at ${ev.location}` : when;
  return `Hey — I'm going to ${ev.name} ${tail}. Come with me?`;
}

// ── messages ───────────────────────────────────────────────────────────────

/** The design's `mbrSenderName`: "You" for my own, first names for everyone
 * else, so a thread reads like people talking. */
export function memberSenderName(
  message: ChatMessage,
  uid: string | null | undefined,
): string {
  return message.senderId === uid ? "You" : firstName(message.senderName);
}
