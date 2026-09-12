import type { AppRole } from './permissions';

/** How we first met (#356) — the fixed "How we met" vocabulary replacing the
 * residence-hall concept. Values are stored as-is on Contact.metVia. */
export const MET_VIA = [
  'Sign-up form',
  'Outreach',
  'A friend brought them',
  'Gathering',
  'Met on campus',
];

export interface Contact {
  id: string;
  name: string;
  role: string;
  location: string;
  email: string;
  phone: string;
  stage: string;
  lastSeen: string;
  avatar?: string;
  initials: string;
  attendance?: Record<string, boolean | 'absent' | 'late'>;
  notes?: string;
  tags?: string[];
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
  createdByName?: string;
  updatedBy?: string;
  updatedByName?: string;
  hasNewActivity?: boolean;
  spiritualBackground?: string;
  // Captured by the public sign-up form (Overhaul #22); surfaced in the profile later.
  pronouns?: string;
  gender?: string;
  year?: string;
  major?: string;
  instagram?: string;
  howHeard?: string;
  /** How we first met — the "How we met" source (sign-up form / outreach /
   * a friend brought them / gathering / met on campus). Replaces the
   * residence-hall concept on the header line (#356). */
  metVia?: string;
  addedBy?: string;
  owner?: string;
  coCreators?: string[];
  season?: string;
  prayerRequest?: string;
}

export interface Stage {
  id: string;
  label: string;
  color: string;
  order: number;
}

export interface Metric {
  label: string;
  value: string | number;
  trend?: string;
  icon: string;
}

export interface Activity {
  id: string;
  user: string;
  userPhoto?: string;
  action: string;
  target: string;
  contactId?: string;
  time: string;
  description?: string;
  type: 'call' | 'email' | 'event' | 'alert' | 'edit' | 'create' | 'comment';
}

export interface SystemActivity {
  id?: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  action: string;
  targetId: string;
  targetName: string;
  targetType: 'contact' | 'event' | 'comment' | 'interaction';
  description?: string;
  type: Activity['type'];
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  dueDate?: string | null;
  priority: 'low' | 'medium' | 'high';
  status?: 'pending' | 'completed' | 'canceled';
  contactId?: string | null;
  contactName?: string | null;
  assigneeId?: string | null;
  sourceInteractionId?: string | null;
  sourceInteractionTitle?: string | null;
  // Who created/assigned the to-do — surfaces as the "from {name}" line.
  createdById?: string | null;
  createdByName?: string | null;
  // The Board page a to-do was made from (highlight → "Make a to-do").
  sourceDocId?: string | null;
  sourceDocTitle?: string | null;
  createdAt?: unknown;
}

export interface Comment {
  id: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  text: string;
  createdAt: string;
  parentId?: string;
}

export interface Interaction {
  id: string;
  userId?: string;
  userName?: string;
  createdById?: string;
  createdByName?: string;
  contactId?: string;
  contactName?: string;
  userPhoto?: string;
  content: string;
  dateTime: string;
  duration?: string;
  type?: string;
  createdAt: string;
}

// A recurring "Rhythm" — Wednesday Bible Study, Friday Gathering, etc. — as
// its own Firestore record (issue #957 / ADR 0016). Previously this was
// inferred by grouping sibling `events` docs on `parentEventId`; that made a
// term un-extendable and forced roster edits to prompt "this one or all
// future?" on every edit. Now the Rhythm itself carries name/cadence/
// location/roster, and each occasion (a `Gathering` doc in `events`) just
// points back at it via `rhythmId`.
export interface Rhythm {
  id: string;
  name: string;
  cadence: {
    type: 'weekly' | 'monthly';
    /** Day-of-week (0=Sun..6=Sat) for weekly; day-of-month anchor days for monthly. */
    days: number[];
    monthlyType?: 'same-day' | 'relative-day';
  };
  location?: string;
  /** The standing roster — who's expected at every occasion, absent an override. */
  roster: string[];
  /** yyyy-MM-dd — earliest generated occurrence. */
  termStart: string;
  /** yyyy-MM-dd — extendable; `extendRhythmTerm` generates occasions up to it. */
  termEnd: string;
  createdAt: string;
  createdById: string;
}

// One occasion — a one-off gathering, or one occurrence of a Rhythm. Lives in
// the `events` collection (kept — renaming buys nothing per the issue).
export interface Gathering {
  id: string;
  /** Authoritative only for a one-off (no `rhythmId`). A Rhythm-linked row
   *  resolves its display name live from the Rhythm, since the name isn't
   *  duplicated onto every occasion. */
  name: string;
  date: string;
  order: number;
  /** Set when this occasion belongs to a Rhythm; replaces `parentEventId`. */
  rhythmId?: string;
  /** Per-occasion override; falls back to `rhythm.location` when unset. */
  location?: string;
  /** Roster override for a Rhythm-linked occasion (added/removed just for this
   *  one week) — layered on top of `rhythm.roster` by `resolveRoster`. */
  rosterOverride?: string[];
  /** A week that was called off — no absence is counted, and it's excluded
   *  from missed-streak scans. Undoable from the Rhythm drawer. */
  cancelled?: boolean;
  createdAt: string;
  /** A one-off's own expected roster. Also kept (unwritten) on pre-migration
   *  Rhythm-linked docs so old code paths can still read it during rollout —
   *  new writes for a Rhythm-linked occasion use `rosterOverride` instead. */
  roster?: string[];
  /** ISO timestamp; stamped on the Gathering the first time attendance is
   *  recorded for it. Absent on Gatherings created before this field
   *  existed — those are read as "happened, but nobody marked it" until
   *  someone does. Never stamped for a future-dated Gathering. */
  attendanceTakenAt?: string;
  /** Display name of the person who recorded attendance. */
  attendanceTakenBy?: string;
  /** uid of the same person, for join-free display. */
  attendanceTakenById?: string;
}

// Deprecated alias — kept only for modules this issue didn't touch. Remove
// once those modules are next touched; new code should use `Gathering`.
export type Event = Gathering;

// Team-wide season/club-rush settings (one doc: settings/season). The active
// season is auto-derived from today's date unless `override` is set; `clubRush`
// flags the busy intake weeks. Publicly readable so the public sign-up reflects it.
export interface SeasonSettings {
  override?: string | null;
  clubRush?: boolean;
}

// Team-wide gospel partners (one doc: settings/partners). The map is keyed by
// term ("Fall 2026") and values are groups of trainee uids who go out as one.
// Admin-only writes; readable by the app so both sides of a pair resolve
// "who goes out with me" and creation paths stamp the partner as a co-creator.
export interface PartnerGroupDoc {
  members: string[];
}

export interface PartnersSettings {
  byTerm?: Record<string, PartnerGroupDoc[] | string[][]>;
}

export interface PrayerRecord {
  id: string;
  contactId: string;
  date: string;
  burden: string;
  status: 'pending' | 'answered' | 'ongoing' | 'unanswered';
  answer?: string;
  answeredAt?: string;
  /** Photos attached to "how it was answered" (mirrors web `PrayerRecord`). */
  answeredPhotos?: { path: string; url: string; name?: string }[];
  /** Optional reason explaining why a prayer was archived (#708). */
  archiveReason?: string;
  updatedAt: string;
  updatedBy?: string;
  updatedByName?: string;
  prayerPage?: boolean;
  /**
   * Whether this burden is carried by the whole team, i.e. whether it shows on
   * the team prayer page ("Who we're carrying" / "On our hearts"). The log
   * sheet's "Bring it to team prayer" toggle, off by default.
   *
   * ABSENT MEANS TEAM. Every prayer written before the toggle existed has no
   * field, and all of them stay where they were — read it through
   * `isTeamPrayer`, never as a bare truthiness check.
   *
   * Not an access boundary: a private prayer is still readable by the team
   * under the Firestore rules, it just isn't surfaced on that page. It always
   * shows on its own contact's Prayers tab, where the person who wrote it
   * looks for it.
   */
  teamPrayer?: boolean;
}

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  approved: boolean;
  role: 'admin' | 'manager' | 'operator' | 'viewer';
  pushToken?: string | null;
  /** Which team they're on — the division above the gospel-partner pairs
   *  (#727). Absent means unassigned. */
  team?: string | null;
}

export interface Invitation {
  email: string;
  role: 'admin' | 'manager' | 'operator' | 'viewer';
  approved: boolean;
  invitedBy: string;
  createdAt: unknown;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'assignment' | 'event';
  tone?: 'accent' | 'violet' | 'amber' | 'teal' | 'sage';
  read: boolean;
  readBy?: string[];
  dismissedBy?: string[];
  createdAt: string;
  link?: string;
  targetId?: string;
}

export type FeedbackKind = 'thought' | 'idea' | 'off' | 'request';

export type FeedbackOutcome = 'shipped' | 'not-planned' | 'already-there';

export interface Feedback {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  type: 'bug' | 'enhancement';
  kind?: FeedbackKind;
  outcome?: FeedbackOutcome;
  message: string;
  status: 'new' | 'in_progress' | 'resolved';
  createdAt: string;
  githubIssueUrl?: string;
  url?: string;
  screenshot?: string; // base64 JPEG
  userAgent?: string;
  viewport?: string;
  archived?: boolean;
}

export interface ChatAttachment {
  type: 'contact' | 'interaction' | 'event' | 'todo' | 'note' | 'prayer' | 'feedback' | 'phone';
  id: string;
  name: string;
  subtitle?: string;
  status?: string;
  priority?: string;
}

export interface ChatRoom {
  id: string;
  // 'announcement' is a room the whole audience reads but only Full-timers can
  // post to — the design's "broadcast" conversation (MOBILE-V2.md, the member
  // app's "Announcements" block). Enforced in firestore.rules; `canPostToRoom`
  // in ./chat is the client-side mirror of that rule.
  type: 'direct' | 'group' | 'announcement';
  name?: string;
  memberIds: string[];
  createdById: string;
  createdByName: string;
  createdAt: unknown;
  lastMessage?: {
    text: string;
    senderId: string;
    senderName: string;
    timestamp: unknown;
  };
  /** Audience preset stored for announcement rooms (#743). */
  audiencePreset?: 'everyone' | 'custom';
  /** Uids who hid this conversation from their own list ("delete for me").
   *  The room stays intact for everyone else; `sendMessage` clears the array
   *  so a new message brings the conversation back (WhatsApp-style). */
  deletedFor?: string[];
}

// A member asking the team to pray for them (MOBILE-V2.md, the member app's
// "Ask the team to pray"). Deliberately NOT a `Prayer`: that entity hangs off a
// `contactId`, and a member is a user account, not a contact. Lives at
// prayerRequests/{id}; the asker owns it, staff read it.
export interface PrayerRequest {
  id: string;
  uid: string;
  name: string;
  body: string;
  status: 'open' | 'answered';
  createdAt: string;
  updatedAt: string;
}

// A Community member offering their table (MOBILE-V2.md, "Open your home").
// One doc per household at hospitalityOffers/{uid}, so re-offering updates the
// standing offer rather than piling up.
export interface HospitalityOffer {
  uid: string;
  name: string;
  availability: string[];
  seats: string;
  note: string;
  updatedAt: string;
}

export interface ChatReaction {
  by: string;
  emoji: string;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  text: string;
  senderId: string;
  senderName: string;
  senderPhoto?: string;
  timestamp: unknown;
  type: 'text' | 'system';
  attachments?: ChatAttachment[];
  /** Emoji reactions — anyone in the room can add or take their own back. */
  reactions?: ChatReaction[];
  /** A message pinned to the top of its conversation (thread's pinned strip). */
  pinned?: boolean;
  /** Tombstone for "take back for everyone": the author or a Full-timer sets
   *  it and the thread shows a gone label instead of the text. Once set it
   *  stays — a conversation never silently rewrites itself. */
  deleted?: { by: string; at: unknown };
  /** Slack-shaped thread parentId: null = top-level; set = reply (#563). */
  parentId?: string | null;
  /** Passive read receipts: uids who have had this announcement post appear on screen (#743). */
  readBy?: string[];
  /** Active acknowledgement: uids who deliberately tapped "Got it" (#743). */
  acknowledged?: string[];
}

export interface ImpersonateTarget {
  key: string;
  name: string;
  initials: string;
  sub: string;
  note: string;
  role: AppRole;
  persona?: any;
}
