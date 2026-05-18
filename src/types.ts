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
  attendance?: Record<string, boolean | 'absent'>;
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
  dueDate: string;
  priority: 'low' | 'medium' | 'high';
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
  isRecurring?: boolean;
  recurrenceType?: 'none' | 'daily' | 'weekly' | 'monthly';
  recurrenceCount?: number;
  recurrenceEndDate?: string;
  recurrenceDays?: number[];
  monthlyType?: 'same-day' | 'relative-day';
  parentEventId?: string;
  createdAt: string;
}

export interface PrayerRecord {
  id: string;
  contactId: string;
  date?: string; // Legacy feature
  prayedFor?: string;
  unanswered?: string;
  burden?: string; // Legacy
  answer?: string; // Legacy
  updatedAt: string;
  updatedBy?: string;
  updatedByName?: string;
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
  read: boolean;
  readBy?: string[];
  dismissedBy?: string[];
  createdAt: string;
  link?: string;
  targetId?: string;
}
