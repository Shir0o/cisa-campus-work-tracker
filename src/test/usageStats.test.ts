import { describe, it, expect, beforeEach } from 'vitest';
import {
  UsageStats,
  usageReadings,
  usagePathLabel,
  UsageEvent,
} from '../lib/usageStats';

describe('usageStats', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('records, persists, and clears local usage events per uid', () => {
    UsageStats.record('u1', { type: 'screen', path: '/directory', createdAt: 1000 });
    UsageStats.record('u1', { type: 'search', path: '/directory', meta: 'abandoned', createdAt: 2000 });
    UsageStats.record('u2', { type: 'screen', path: '/prayer', createdAt: 3000 });

    expect(UsageStats.getEvents('u1')).toHaveLength(2);
    expect(UsageStats.getEvents('u2')).toHaveLength(1);
    expect(UsageStats.getEvents('u1')[0].path).toBe('/directory');

    // Persistence should survive a fresh module cache read (same localStorage key).
    expect(localStorage.getItem('cisa.usage.v1.u1')).toContain('/directory');

    UsageStats.clear('u1');
    expect(UsageStats.getEvents('u1')).toHaveLength(0);
    expect(UsageStats.getEvents('u2')).toHaveLength(1);
  });

  it('derives dead ends from screens left within four seconds', () => {
    const events: UsageEvent[] = [
      { id: '1', type: 'screen', path: '/directory', createdAt: 1000 },
      { id: '2', type: 'screen', path: '/prayer', createdAt: 3000 },
      { id: '3', type: 'screen', path: '/directory', createdAt: 5000 },
      { id: '4', type: 'screen', path: '/settings', createdAt: 10_000 },
    ];

    const readings = usageReadings(events);
    expect(readings.deadEnds).toEqual([
      { path: '/directory', count: 1 },
      { path: '/prayer', count: 1 },
    ]);
  });

  it('derives long walks from the last screen before a create', () => {
    const events: UsageEvent[] = [
      { id: '1', type: 'screen', path: '/directory', createdAt: 1000 },
      { id: '2', type: 'create', path: '/directory', meta: 'contact', createdAt: 2000 },
      { id: '3', type: 'screen', path: '/board', createdAt: 3000 },
      { id: '4', type: 'create', path: '/board', meta: 'interaction', createdAt: 4000 },
      { id: '5', type: 'screen', path: '/directory', createdAt: 4500 },
      { id: '6', type: 'create', path: '/directory', meta: 'contact', createdAt: 5000 },
    ];

    const readings = usageReadings(events);
    expect(readings.longWalks).toContainEqual({ from: '/directory', created: 'contact', count: 2 });
    expect(readings.longWalks).toContainEqual({ from: '/board', created: 'interaction', count: 1 });
  });

  it('derives slow finds from abandoned searches', () => {
    const events: UsageEvent[] = [
      { id: '1', type: 'search', path: '/directory', meta: 'abandoned', createdAt: 1000 },
      { id: '2', type: 'search', path: '/directory', meta: 'abandoned', createdAt: 2000 },
      { id: '3', type: 'search', path: '/prayer', meta: 'resolved', createdAt: 3000 },
    ];

    const readings = usageReadings(events);
    expect(readings.slowFinds).toEqual([{ path: '/directory', count: 2 }]);
  });

  it('maps route paths to friendly labels', () => {
    expect(usagePathLabel('/directory')).toBe('People');
    expect(usagePathLabel('/prayer')).toBe('On our hearts');
    expect(usagePathLabel('/custom')).toBe('/custom');
  });
});
