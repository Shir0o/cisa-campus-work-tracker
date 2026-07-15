import { describe, it, expect } from 'vitest';
import { typeToTone, toneForNotification, mergeNotifications, groupNotifications } from '../src/notifications';
import type { Notification } from '../src/types';

const NOW = new Date('2026-07-13T12:00:00Z').getTime();
const DAY_MS = 86_400_000;

const notif = (overrides: Partial<Notification> = {}): Notification => ({
  id: 'n1',
  userId: 'user-1',
  title: 'title',
  message: 'message',
  type: 'info',
  read: false,
  createdAt: new Date(NOW).toISOString(),
  ...overrides,
});

describe('typeToTone', () => {
  it('maps assignment to teal', () => {
    expect(typeToTone('assignment')).toBe('teal');
  });

  it('maps event to amber', () => {
    expect(typeToTone('event')).toBe('amber');
  });

  it('maps success to sage', () => {
    expect(typeToTone('success')).toBe('sage');
  });

  it('maps warning to amber', () => {
    expect(typeToTone('warning')).toBe('amber');
  });

  it('maps error to amber', () => {
    expect(typeToTone('error')).toBe('amber');
  });

  it('maps info (default) to accent', () => {
    expect(typeToTone('info')).toBe('accent');
  });
});

describe('toneForNotification', () => {
  it('prefers an explicit tone over the type-derived one', () => {
    expect(toneForNotification({ type: 'event', tone: 'violet' })).toBe('violet');
  });

  it('falls back to typeToTone when no explicit tone is set', () => {
    expect(toneForNotification({ type: 'assignment' })).toBe('teal');
  });
});

describe('mergeNotifications', () => {
  it('returns an empty list for no input', () => {
    expect(mergeNotifications([], [])).toEqual([]);
  });

  it('combines personal and broadcast lists sorted newest-first', () => {
    const older = notif({ id: 'older', createdAt: new Date(NOW - 2 * DAY_MS).toISOString() });
    const newer = notif({ id: 'newer', createdAt: new Date(NOW - 1 * DAY_MS).toISOString() });
    const broadcast = notif({ id: 'broadcast', userId: 'ALL_ADMINS', createdAt: new Date(NOW).toISOString() });
    const merged = mergeNotifications([older, newer], [broadcast]);
    expect(merged.map((n) => n.id)).toEqual(['broadcast', 'newer', 'older']);
  });

  it('slices to the limit when combined size exceeds it', () => {
    const personal = Array.from({ length: 15 }, (_, i) =>
      notif({ id: `p${i}`, createdAt: new Date(NOW - i * DAY_MS).toISOString() }));
    const broadcast = Array.from({ length: 15 }, (_, i) =>
      notif({ id: `b${i}`, userId: 'ALL_ADMINS', createdAt: new Date(NOW - i * DAY_MS).toISOString() }));
    expect(mergeNotifications(personal, broadcast).length).toBe(20);
  });

  it('respects a custom limit', () => {
    const personal = [notif({ id: 'a' }), notif({ id: 'b', createdAt: new Date(NOW - DAY_MS).toISOString() })];
    expect(mergeNotifications(personal, [], 1).map((n) => n.id)).toEqual(['a']);
  });
});

describe('groupNotifications', () => {
  it('returns empty groups and a zero count for no notifications', () => {
    expect(groupNotifications([])).toEqual({ unread: [], read: [], unreadCount: 0 });
  });

  it('partitions into unread and read', () => {
    const unread = notif({ id: 'unread', read: false });
    const read = notif({ id: 'read', read: true });
    const groups = groupNotifications([unread, read]);
    expect(groups.unread.map((n) => n.id)).toEqual(['unread']);
    expect(groups.read.map((n) => n.id)).toEqual(['read']);
    expect(groups.unreadCount).toBe(1);
  });
});
