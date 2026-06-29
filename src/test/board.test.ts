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
  audienceOf,
  boardLevelForRole,
  canSeeBoardDoc,
  boardAudiencesForRole,
  canViewBoard,
  canViewBoardNotes,
  canEditBoard,
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

  // ── Audience / visibility (Session 3) ───────────────────────────────────────
  describe('audienceOf', () => {
    it('defaults a page with no audience to the most private tier (team)', () => {
      expect(audienceOf({})).toBe('team');
      expect(audienceOf({ audience: undefined })).toBe('team');
    });

    it('returns the explicit audience when set', () => {
      expect(audienceOf({ audience: 'everyone' })).toBe('everyone');
      expect(audienceOf({ audience: 'trainees' })).toBe('trainees');
    });
  });

  describe('boardLevelForRole', () => {
    it('maps roles to board levels; community (viewer) is excluded', () => {
      expect(boardLevelForRole('admin')).toBe(2);
      expect(boardLevelForRole('manager')).toBe(1);
      expect(boardLevelForRole('operator')).toBe(0);
      expect(boardLevelForRole('viewer')).toBe(-1);
      expect(boardLevelForRole(null)).toBe(-1);
      expect(boardLevelForRole('unknown')).toBe(-1);
    });
  });

  describe('canSeeBoardDoc', () => {
    it('full-timer (admin) sees every tier, incl. legacy/no-audience pages', () => {
      expect(canSeeBoardDoc('admin', { audience: 'team' })).toBe(true);
      expect(canSeeBoardDoc('admin', { audience: 'trainees' })).toBe(true);
      expect(canSeeBoardDoc('admin', { audience: 'everyone' })).toBe(true);
      expect(canSeeBoardDoc('admin', {})).toBe(true);
    });

    it('trainee (manager) sees trainees + everyone, never team', () => {
      expect(canSeeBoardDoc('manager', { audience: 'team' })).toBe(false);
      expect(canSeeBoardDoc('manager', { audience: 'trainees' })).toBe(true);
      expect(canSeeBoardDoc('manager', { audience: 'everyone' })).toBe(true);
      expect(canSeeBoardDoc('manager', {})).toBe(false);
    });

    it('student (operator) sees only everyone', () => {
      expect(canSeeBoardDoc('operator', { audience: 'team' })).toBe(false);
      expect(canSeeBoardDoc('operator', { audience: 'trainees' })).toBe(false);
      expect(canSeeBoardDoc('operator', { audience: 'everyone' })).toBe(true);
    });

    it('community (viewer) and unknown roles see nothing', () => {
      expect(canSeeBoardDoc('viewer', { audience: 'everyone' })).toBe(false);
      expect(canSeeBoardDoc(null, { audience: 'everyone' })).toBe(false);
    });
  });

  describe('boardAudiencesForRole', () => {
    it('returns an empty list for admins (query is unconstrained)', () => {
      expect(boardAudiencesForRole('admin')).toEqual([]);
    });

    it('scopes lower roles to the tiers they may read', () => {
      expect(boardAudiencesForRole('manager')).toEqual(['trainees', 'everyone']);
      expect(boardAudiencesForRole('operator')).toEqual(['everyone']);
      expect(boardAudiencesForRole('viewer')).toEqual([]);
    });
  });

  describe('canViewBoard / canViewBoardNotes / canEditBoard', () => {
    it('grants Board view to Student and up only', () => {
      expect(canViewBoard('admin')).toBe(true);
      expect(canViewBoard('manager')).toBe(true);
      expect(canViewBoard('operator')).toBe(true);
      expect(canViewBoard('viewer')).toBe(false);
    });

    it('grants the notes archive to Full-timer + Trainee only', () => {
      expect(canViewBoardNotes('admin')).toBe(true);
      expect(canViewBoardNotes('manager')).toBe(true);
      expect(canViewBoardNotes('operator')).toBe(false);
      expect(canViewBoardNotes('viewer')).toBe(false);
    });

    it('grants editing to full-timers (admins) only', () => {
      expect(canEditBoard(true)).toBe(true);
      expect(canEditBoard(false)).toBe(false);
    });
  });
});
