// Announcements — a Full-timer posts, it reaches every approved Full-timer and
// Trainee (a bell entry, hence a push, each), shows as a card on their home until
// they say "Got it", and the poster sees who has not. No replies, no page of its
// own (cut-or-keep §20). Pure shaping shared by web and phone; the Firestore
// reads and writes live in ./data/announcements.ts.
import type { AppUser } from "./types";

/** Longest announcement the rules accept. */
export const ANNOUNCEMENT_MAX_LENGTH = 2000;

/** The bell's body is capped at 512 characters by the rules; a push shows far
 *  less. Cut well under it. */
const NOTIFICATION_BODY_MAX = 200;

/** The rules cap the bell's title at 128 characters. A long author name is cut
 *  so the whole title still fits. */
const NOTIFICATION_TITLE_MAX = 128;

/** `announcements/{id}`. `gotIt` maps a uid to when that person said Got it. */
export interface Announcement {
  id: string;
  body: string;
  authorId: string;
  authorName: string;
  /** ISO time; null while the poster's own write is still waiting on the server. */
  createdAt: string | null;
  gotIt: Record<string, string | null>;
}

/** What `postAnnouncement` hands the app to write as a bell entry. */
export interface AnnouncementNotifyPayload {
  userId: string;
  title: string;
  message: string;
  type: "info";
  targetId: string;
  link: string;
}

const onTheTeam = (u: Pick<AppUser, "role" | "approved">): boolean =>
  u.approved === true && (u.role === "admin" || u.role === "manager");

/** Everyone an announcement is for: the approved Full-timers and Trainees,
 *  except the person who posted it. */
export function announcementAudience(team: AppUser[], authorId: string): AppUser[] {
  return team.filter((u) => onTheTeam(u) && u.uid !== authorId);
}

/** Who has not said Got it yet, by name. The poster is never one of them. */
export function whoHasNot(a: Announcement, team: AppUser[]): AppUser[] {
  return announcementAudience(team, a.authorId)
    .filter((u) => !a.gotIt[u.uid])
    .sort((x, y) => (x.displayName || "").localeCompare(y.displayName || ""));
}

/** "4 of 6 got it": how many of the audience have, out of how many it reached.
 *  Someone since removed from the team counts toward neither. */
export function gotItProgress(
  a: Announcement,
  team: AppUser[],
): { got: number; total: number; missing: AppUser[] } {
  const audience = announcementAudience(team, a.authorId);
  const missing = whoHasNot(a, team);
  return { got: audience.length - missing.length, total: audience.length, missing };
}

const newestFirst = (x: Announcement, y: Announcement): number => {
  // A write still waiting on its server timestamp is the newest there is.
  if (x.createdAt === y.createdAt) return 0;
  if (x.createdAt === null) return -1;
  if (y.createdAt === null) return 1;
  return y.createdAt.localeCompare(x.createdAt);
};

/** The cards on someone's home: what they have not marked Got it, newest first.
 *  The poster's own announcement is theirs to track, not to acknowledge. */
export function openAnnouncements(list: Announcement[], uid: string): Announcement[] {
  return list.filter((a) => a.authorId !== uid && !a.gotIt[uid]).sort(newestFirst);
}

/** How long a poster keeps seeing their own announcement, and who has not got it. */
export const YOUR_ANNOUNCEMENTS_DAYS = 7;

/** What this person posted this past week, newest first — the poster's own
 *  count and names. */
export function yourAnnouncements(list: Announcement[], uid: string, now: number = Date.now()): Announcement[] {
  const since = now - YOUR_ANNOUNCEMENTS_DAYS * 24 * 60 * 60 * 1000;
  return list
    .filter((a) => a.authorId === uid && (a.createdAt === null || Date.parse(a.createdAt) >= since))
    .sort(newestFirst);
}

/** The bell entry for one recipient. */
export function announcementNotification(
  a: Pick<Announcement, "id" | "body" | "authorName">,
  userId: string,
): AnnouncementNotifyPayload {
  const body = a.body.trim();
  const postedBy = " posted an announcement";
  const nameMax = NOTIFICATION_TITLE_MAX - postedBy.length;
  const author =
    a.authorName.length > nameMax ? `${a.authorName.slice(0, nameMax - 1)}…` : a.authorName;
  return {
    userId,
    title: `${author}${postedBy}`,
    message: body.length > NOTIFICATION_BODY_MAX ? `${body.slice(0, NOTIFICATION_BODY_MAX - 1)}…` : body,
    type: "info",
    targetId: a.id,
    link: "/",
  };
}
