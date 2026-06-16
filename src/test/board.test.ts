import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  newId,
  sessionStatus,
  weekdayOf,
  dateLabelOf,
  todayISO,
  byDateAsc,
  docGroup,
  weekdayShort,
  dayNum,
  docByDateDesc,
  newDocMarkdown,
  type BoardSession,
  type BoardDoc,
} from '../lib/board';

describe('Board Pure Helpers', () => {
  describe('newId', () => {
    it('generates unique ids with optional prefixes', () => {
      const id1 = newId();
      const id2 = newId();
      expect(id1).not.toBe(id2);

      const idPrefixed = newId('action_');
      expect(idPrefixed.startsWith('action_')).toBe(true);
    });
  });

  describe('sessionStatus', () => {
    beforeEach(() => {
      // Pin system time to 2026-06-16 (Tuesday)
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-16T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('identifies upcoming sessions', () => {
      expect(sessionStatus('2026-06-17')).toBe('upcoming');
    });

    it('identifies today\'s sessions', () => {
      expect(sessionStatus('2026-06-16')).toBe('today');
    });

    it('identifies past sessions', () => {
      expect(sessionStatus('2026-06-15')).toBe('done');
    });

    it('returns upcoming for invalid dates', () => {
      expect(sessionStatus('invalid-date')).toBe('upcoming');
    });
  });

  describe('weekdayOf', () => {
    it('returns full weekday names', () => {
      expect(weekdayOf('2026-06-16')).toBe('Tuesday');
      expect(weekdayOf('2026-06-17')).toBe('Wednesday');
    });

    it('returns empty string for invalid dates', () => {
      expect(weekdayOf('invalid-date')).toBe('');
    });
  });

  describe('dateLabelOf', () => {
    it('returns formatted date label', () => {
      expect(dateLabelOf('2026-06-16')).toBe('Jun 16');
    });

    it('returns the input date if invalid', () => {
      expect(dateLabelOf('invalid-date')).toBe('invalid-date');
    });
  });

  describe('todayISO', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-16T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('returns today in yyyy-MM-dd format', () => {
      expect(todayISO()).toBe('2026-06-16');
    });
  });

  describe('byDateAsc', () => {
    it('sorts sessions oldest to newest', () => {
      const s1 = { date: '2026-06-18' } as BoardSession;
      const s2 = { date: '2026-06-16' } as BoardSession;
      const s3 = { date: '2026-06-17' } as BoardSession;

      const sorted = [s1, s2, s3].sort(byDateAsc);
      expect(sorted.map(s => s.date)).toEqual(['2026-06-16', '2026-06-17', '2026-06-18']);
    });
  });

  describe('docGroup', () => {
    beforeEach(() => {
      // Pin system time to 2026-06-16 (Tuesday). Week is Monday 2026-06-15 to Sunday 2026-06-21.
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-16T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('groups dates within current week under "This week"', () => {
      expect(docGroup('2026-06-15')).toBe('This week');
      expect(docGroup('2026-06-16')).toBe('This week');
      expect(docGroup('2026-06-21')).toBe('This week');
    });

    it('groups dates outside current week under "Earlier"', () => {
      expect(docGroup('2026-06-14')).toBe('Earlier');
      expect(docGroup('2026-06-22')).toBe('Earlier');
      expect(docGroup('invalid-date')).toBe('Earlier');
    });
  });

  describe('weekdayShort', () => {
    it('returns short weekday name', () => {
      expect(weekdayShort('2026-06-16')).toBe('Tue');
      expect(weekdayShort('invalid-date')).toBe('');
    });
  });

  describe('dayNum', () => {
    it('returns day of the month as string', () => {
      expect(dayNum('2026-06-16')).toBe('16');
      expect(dayNum('invalid-date')).toBe('');
    });
  });

  describe('docByDateDesc', () => {
    it('sorts docs newest to oldest', () => {
      const d1 = { date: '2026-06-16' } as BoardDoc;
      const d2 = { date: '2026-06-18' } as BoardDoc;
      const d3 = { date: '2026-06-17' } as BoardDoc;

      const sorted = [d1, d2, d3].sort(docByDateDesc);
      expect(sorted.map(d => d.date)).toEqual(['2026-06-18', '2026-06-17', '2026-06-16']);
    });
  });

  describe('newDocMarkdown', () => {
    it('returns the starter markdown content', () => {
      expect(newDocMarkdown()).toContain('# Untitled page');
    });
  });
});
