import { Contact, Activity, Task } from './types';

export const CONTACTS: Contact[] = [
  {
    id: '1',
    name: 'Sarah Jenkins',
    role: 'Sponsor',
    location: 'San Francisco, CA',
    email: 'sarah.j@techflow.io',
    phone: '(415) 555-0198',
    stage: 'Regular',
    lastSeen: '2 hours ago',
    initials: 'SJ',
    status: 'Meeting Scheduled',
    attendance: {
      'Oct 12': false,
      'Oct 19': false,
      'Oct 26': false,
      'Nov 02': false,
      'Nov 09': false,
    }
  },
  {
    id: '2',
    name: 'Marcus Chen',
    role: 'Volunteer',
    location: 'Chicago, IL',
    email: 'm.chen@glogistics.com',
    phone: '(312) 555-8821',
    stage: 'First Contact',
    lastSeen: '1 day ago',
    initials: 'MC',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=100&h=100&fit=crop',
    status: 'Email Sent',
    attendance: {
      'Oct 12': true,
      'Oct 19': false,
      'Oct 26': 'absent',
      'Nov 02': true,
      'Nov 09': false,
    }
  },
  {
    id: '3',
    name: 'Eleanor Richards',
    role: 'Community Lead',
    location: 'Austin, TX',
    email: 'elena@nexusretail.co',
    phone: '(512) 555-0123',
    stage: 'New',
    lastSeen: 'Just now',
    initials: 'ER',
    status: 'Needs Contact',
    attendance: {
      'Oct 12': true,
      'Oct 19': true,
      'Oct 26': false,
      'Nov 02': false,
      'Nov 09': false,
    }
  },
  {
    id: '4',
    name: 'David Thompson',
    role: 'Partner',
    location: 'Seattle, WA',
    email: 'dkim@innovate.net',
    phone: '(206) 555-9876',
    stage: 'Regular',
    lastSeen: 'Oct 12, 2023',
    initials: 'DT',
    status: 'Qualified Lead',
    attendance: {
      'Oct 12': true,
      'Oct 19': true,
      'Oct 26': true,
      'Nov 02': true,
      'Nov 09': false,
    }
  },
  {
    id: '5',
    name: 'Bessie Cooper',
    role: 'Web Lead',
    location: 'New York, NY',
    email: 'bessie.c@example.com',
    phone: '(212) 555-4433',
    stage: 'New',
    lastSeen: 'Yesterday',
    initials: 'BC',
  },
  {
    id: '6',
    name: 'Jerome Bell',
    role: 'Marketing',
    location: 'Denver, CO',
    email: 'jerome.b@growth.com',
    phone: '(303) 555-1122',
    stage: 'First Contact',
    lastSeen: 'Oct 12',
    initials: 'JB',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop',
    status: 'Email Sent'
  },
  {
    id: '7',
    name: 'Courtney Henry',
    role: 'Volunteer',
    location: 'Portland, OR',
    email: 'courtney.h@eco.org',
    phone: '(503) 555-6677',
    stage: 'Regular',
    lastSeen: 'Sep 28',
    initials: 'CH',
  }
];

export const ACTIVITIES: Activity[] = [
  {
    id: '1',
    user: 'Sarah Jenkins',
    action: 'logged a call with',
    target: 'Michael Chang',
    time: '2 hours ago',
    description: 'Discussed Q3 proposal',
    type: 'call'
  },
  {
    id: '2',
    user: 'Automated Sequence',
    action: 'sent follow-up email to',
    target: 'Tech Innovators Inc.',
    time: '5 hours ago',
    description: 'Campaign: Fall Outreach',
    type: 'email'
  },
  {
    id: '3',
    user: 'David Chen',
    action: 'scheduled a meeting with',
    target: 'Regional Director',
    time: 'Yesterday',
    description: 'Virtual Sync',
    type: 'event'
  },
  {
    id: '4',
    user: 'System Alert',
    action: '',
    target: '5 contacts require immediate follow-up.',
    time: 'Yesterday',
    description: 'SLA Breach Warning',
    type: 'alert'
  }
];

export const TASKS: Task[] = [
  {
    id: '1',
    title: 'Review draft for City Council',
    dueDate: 'Due Today',
    priority: 'high'
  },
  {
    id: '2',
    title: "Follow up with Mayor's office",
    dueDate: 'Due Tomorrow',
    priority: 'medium'
  },
  {
    id: '3',
    title: 'Prepare monthly outreach report',
    dueDate: 'Due Friday',
    priority: 'low'
  }
];
