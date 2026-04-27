export interface Contact {
  id: string;
  name: string;
  role: string;
  company: string;
  location: string;
  email: string;
  phone: string;
  stage: 'New' | 'First Contact' | 'Second Contact' | 'Regular';
  lastSeen: string;
  avatar?: string;
  initials: string;
  status?: 'Needs Contact' | 'Email Sent' | 'Qualified Lead' | 'Follow Up Required' | 'Meeting Scheduled';
  attendance?: Record<string, boolean | 'absent'>;
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
  role: 'admin' | 'community_manager';
}
