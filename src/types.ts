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
  year?: string;
  major?: string;
  instagram?: string;
  howHeard?: string;
  interests?: string[];
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
  // Who created/assigned the to-do — surfaces as the "from {name}" line.
  createdById?: string | null;
  createdByName?: string | null;
  // The Board page a to-do was made from (highlight → "Make a to-do").
  sourceDocId?: string | null;
  sourceDocTitle?: string | null;
  createdAt?: unknown;
  subtasks?: Subtask[];
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

export interface PrayerRecord {
  id: string;
  contactId: string;
  date: string; 
  burden: string;
  status: 'pending' | 'answered' | 'ongoing' | 'unanswered';
  answer?: string;
  answeredAt?: string;
  updatedAt: string;
  updatedBy?: string;
  updatedByName?: string;
  prayerPage?: boolean;
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
}

