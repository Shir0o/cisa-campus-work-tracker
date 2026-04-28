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
  status?: 'Needs Contact' | 'Email Sent' | 'Qualified Lead' | 'Follow Up Required' | 'Meeting Scheduled';
  attendance?: Record<string, boolean | 'absent'>;
  notes?: string;
  createdAt?: string;
  hasNewActivity?: boolean;
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
  action: string;
  target: string;
  time: string;
  description?: string;
  type: 'call' | 'email' | 'event' | 'alert';
}

export interface Task {
  id: string;
  title: string;
  dueDate: string;
  priority: 'low' | 'medium' | 'high';
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
