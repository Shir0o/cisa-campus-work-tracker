import { AppRole } from './lib/permissions';

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
  // Whether the full-timer walking with the adder has reviewed this contact
  // (used by the "Walking together" inbox). createdBy doubles as "added by".
  reviewed?: boolean;
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
  lastContactedBy?: string;
  lastContactedById?: string;
  lastContactedDate?: string;
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

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
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
  subtasks?: Subtask[];
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

/** One photo attached to a visit. `path` is the Cloud Storage object path (what
 *  we need to delete it); `url` is the download URL we render. */
export interface VisitPhoto {
  path: string;
  url: string;
  name?: string;
}

/** A record of having gone to where someone lives. Logged after the fact,
 *  full-timers only, usually a pair, sometimes several people seen at once.
 *  The source of truth for a visit is this doc — each person we saw also gets a
 *  mirrored interaction so their card tells the whole story and links back. */
export interface Visit {
  id: string;
  /** 'YYYY-MM-DD' — the day we went, not when it was written down. */
  date: string;
  contactIds: string[];
  /** Denormalized so a card renders without joining the contacts collection. */
  contactNames: string[];
  /** uids of the staff who went. */
  went: string[];
  wentNames: string[];
  where: string;
  purpose: string;
  how: string;
  followUp: string;
  followUpTaskId?: string | null;
  prayerId?: string | null;
  /** The prayer's own words, denormalized like `contactNames` — the card reads
   *  it back without joining the prayers collection. Absent on visits logged
   *  before we kept it, which still read as "a prayer came out of this". */
  prayerBurden?: string | null;
  photos: VisitPhoto[];
  createdAt: string;
  createdById: string;
  createdByName: string;
  updatedAt?: string;
  updatedBy?: string;
  updatedByName?: string;
}

export interface Event {
  id: string;
  name: string;
  date: string;
  order: number;
  type?: string;
  location?: string;
  isRecurring?: boolean;
  recurrenceType?: 'none' | 'daily' | 'weekly' | 'monthly';
  recurrenceCount?: number;
  recurrenceEndDate?: string;
  recurrenceDays?: number[];
  monthlyType?: 'same-day' | 'relative-day';
  parentEventId?: string;
  createdAt: string;
}

// A managed "kind of gathering" (Weekly / Small Group / …) with a warm one-line
// blurb. Lives in the `gatheringTypes` collection so the list is team-shared and
// editable (mirrors the `stages` taxonomy). Events reference a type by NAME.
export interface GatheringType {
  id: string;
  name: string;
  blurb?: string;
  order: number;
}

// Team-wide season/club-rush settings (one doc: settings/season). The active
// season is auto-derived from today's date unless `override` is set; `clubRush`
// flags the busy intake weeks. Publicly readable so the public sign-up reflects it.
export interface SeasonSettings {
  override?: string | null;
  clubRush?: boolean;
}

// Team-wide walking-together pairs (one doc: settings/walking). The map keys are
// full-timer uids and values are the trainee uids walking with them. Admin-only
// writes; readable by the app so both sides can resolve "who walks with me".
export interface WalkingPairs {
  pairs: Record<string, string[]>;
}

export interface PrayerRecord {
  id: string;
  contactId: string;
  date: string; 
  burden: string;
  status: 'pending' | 'answered' | 'ongoing' | 'unanswered';
  answer?: string;
  answeredAt?: string;
  /** Photos attached to "how it was answered" (#267). Same shape as `VisitPhoto`:
   *  `path` locates the Storage object for deletion, `url` is the download URL we
   *  render. */
  answeredPhotos?: VisitPhoto[];
  updatedAt: string;
  updatedBy?: string;
  updatedByName?: string;
  prayerPage?: boolean;
  /** Whether the whole team carries this burden — see the fuller note on
   *  `PrayerRecord` in packages/core/src/types.ts. Absent means team; read it
   *  through `isTeamPrayer`, never as a bare truthiness check. */
  teamPrayer?: boolean;
}

export interface AppUser {
  uid: string;
  email: string;
  displayName: string;
  photoURL: string;
  approved: boolean;
  role: 'admin' | 'manager' | 'operator' | 'viewer';
}

export interface Invitation {
  email: string;
  role: 'admin' | 'manager' | 'operator' | 'viewer';
  approved: boolean;
  invitedBy: string;
  createdAt: any;
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

export interface Feedback {
  id: string;
  userId: string;
  userEmail: string;
  userName: string;
  type: 'bug' | 'enhancement';
  kind?: FeedbackKind;
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
  // post to (mobile v2's member "Announcements"). Kept in step with
  // packages/core/src/types.ts; firestore.rules is what enforces it.
  type: 'direct' | 'group' | 'announcement';
  name?: string;
  memberIds: string[];
  createdById: string;
  createdByName: string;
  createdAt: any;
  lastMessage?: {
    text: string;
    senderId: string;
    senderName: string;
    timestamp: any;
  };
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
  timestamp: any;
  type: 'text' | 'system';
  attachments?: ChatAttachment[];
  /** Emoji reactions — anyone in the room can add or take their own back. */
  reactions?: ChatReaction[];
  /** A message pinned to the top of its conversation (thread's pinned strip). */
  pinned?: boolean;
  /** Tombstone for "take back for everyone": the author or a Full-timer sets
   *  it and the thread shows a gone label instead of the text. Once set it
   *  stays — a conversation never silently rewrites itself. */
  deleted?: { by: string; at: any };
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

export interface ParsedContactItem {
  tempId: string;
  name: string;
  email?: string;
  phone?: string;
  stage?: string;
  role?: string;
  notes?: string;
  tags?: string[];
  spiritualBackground?: string;
  matchedContactId?: string | null;
  matchedContactName?: string | null;
  selected?: boolean;
}

export interface ParsedInteractionItem {
  tempId: string;
  contactRef?: string;
  contactId?: string | null;
  contactName?: string;
  dateTime?: string;
  type?: string;
  content: string;
  selected?: boolean;
}

export interface ParsedDiscussionItem {
  tempId: string;
  title: string;
  audience?: 'team' | 'trainees' | 'everyone';
  content: string;
  tags?: string[];
  mentionedContactNames?: string[];
  selected?: boolean;
}

export interface SmartImportParsedData {
  contacts: ParsedContactItem[];
  interactions: ParsedInteractionItem[];
  discussions: ParsedDiscussionItem[];
}



