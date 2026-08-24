// Types for the shared calendar domain and UI.

export type CategoryId =
  | 'product'
  | 'meeting'
  | 'social'
  | 'workshop'
  | 'deadline'
  | 'travel'
  | 'holiday';

export type Role = 'member' | 'admin' | 'owner' | 'denied';

export interface Category {
  id: CategoryId;
  label: string;
  hue: number;
  dot: string;
  soft: string;
  ink: string;
}

export type Freq = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface RRule {
  freq: Freq;
  interval?: number;
  byday?: string[]; // SU MO TU WE TH FR SA or 1SU, -1FR
  until?: Date;
  count?: number;
  exdates?: string[]; // ISO yyyy-mm-dd
}

export interface CalendarEvent {
  id: string;
  title: string;
  cat: CategoryId;
  start: Date;
  dur?: number; // minutes (timed events)
  allDay?: boolean;
  end?: Date; // exclusive end for all-day / multi-day spans
  loc?: string;
  notes?: string;
  rrule?: RRule;
  syncOrigin?: 'gcal';
  gcalFeedId?: string;
  // Set on expanded recurrence instances (never persisted):
  __seriesId?: string;
  __instanceDate?: string;
}

export interface HoverPayload {
  ev: CalendarEvent;
  x: number;
  y: number;
  conflicts: number;
}

export interface MorePayload {
  day: Date;
  events: CalendarEvent[];
}

export type ViewId = 'month' | 'week' | 'agenda' | 'timeline' | 'year';

export type Density = 'compact' | 'default' | 'spacious';

export type Theme = 'light' | 'dark';

export interface Tweaks {
  density: Density;
  theme: Theme;
  accent: string;
  defaultView: ViewId;
  showWeekends: boolean;
  showConflicts: boolean;
}

export interface DateSuggestion {
  date: Date;
  count: number;
  busyMins: number;
}

export interface SlotSuggestion {
  h: number;
  m: number;
  conflicts: number;
  conflictEvents: CalendarEvent[];
}
