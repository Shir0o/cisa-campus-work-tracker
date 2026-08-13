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
  docSortOrder,
  parseDocNotes,
  parseDocTasks,
  collectDocTaskNodes,
  newDocMarkdown,
  audienceOf,
  boardLevelForRole,
  canSeeBoardDoc,
  boardAudiencesForRole,
  canViewBoard,
  canViewBoardNotes,
  canEditBoard,
  BOARD_SERIES,
  slugifyHeading,
  parseDocHeadings,
  searchBoardContent,
  type BoardSession,
  type BoardDoc,
  type BoardNote,
  type BoardSearchResult,
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

    it('groups pinned docs under "Pinned"', () => {
      expect(docGroup('2026-06-14', true)).toBe('Pinned');
      expect(docGroup({ date: '2026-06-14', pinned: true })).toBe('Pinned');
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

  describe('docSortOrder', () => {
    it('floats pinned docs to the top regardless of date', () => {
      const d1 = { date: '2026-06-16', pinned: false } as BoardDoc;
      const d2 = { date: '2026-06-18', pinned: false } as BoardDoc;
      const d3 = { date: '2026-06-14', pinned: true } as BoardDoc;

      const sorted = [d1, d2, d3].sort(docSortOrder);
      expect(sorted.map((d) => d.date)).toEqual(['2026-06-14', '2026-06-18', '2026-06-16']);
    });

    it('falls back to newest-first among docs with the same pinned state', () => {
      const d1 = { date: '2026-06-16', pinned: true } as BoardDoc;
      const d2 = { date: '2026-06-18', pinned: true } as BoardDoc;

      const sorted = [d1, d2].sort(docSortOrder);
      expect(sorted.map((d) => d.date)).toEqual(['2026-06-18', '2026-06-16']);
    });

    it('respects pinnedOrder for pinned docs when specified', () => {
      const d1 = { id: '1', date: '2026-06-18', pinned: true, pinnedOrder: 1 } as BoardDoc;
      const d2 = { id: '2', date: '2026-06-16', pinned: true, pinnedOrder: 0 } as BoardDoc;

      const sorted = [d1, d2].sort(docSortOrder);
      expect(sorted.map((d) => d.id)).toEqual(['2', '1']);
    });
  });

  describe('newDocMarkdown', () => {
    it('returns the starter markdown content', () => {
      expect(newDocMarkdown()).toContain('# Untitled page');
    });
  });

  describe('parseDocNotes', () => {
    it('parses note comments with and without type from markdown', () => {
      const md = `
# Title
Some text
<!-- note:n-1 type:learning -->
More text
<!-- note:n-2 -->
      `;
      const notes = parseDocNotes(md);
      expect(notes).toEqual([
        { id: 'n-1', type: 'learning', rawLine: '<!-- note:n-1 type:learning -->' },
        { id: 'n-2', type: 'record', rawLine: '<!-- note:n-2 -->' },
      ]);
    });
  });

  describe('parseDocTasks & collectDocTaskNodes edge cases', () => {
    it('skips task lines without a valid task ID format', () => {
      const md = '- [ ] Just plain text without id tag';
      expect(parseDocTasks(md)).toEqual([]);
    });

    it('returns empty array when taskItem has no textblock child', () => {
      const mockDoc = {
        descendants: (cb: (node: any, pos: number) => void) => {
          cb({ type: { name: 'taskItem' }, firstChild: null }, 0);
        },
      } as any;
      expect(collectDocTaskNodes(mockDoc)).toEqual([]);
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

  describe('BOARD_SERIES', () => {
    it('has the updated series options without Friday Gathering and with Conferences/Trainings', () => {
      expect(BOARD_SERIES).toEqual(['Small Groups', 'Outreach', 'Conferences/Trainings', 'Team']);
    });
  });

  describe('slugifyHeading', () => {
    it('creates URL-friendly slug IDs from heading text', () => {
      expect(slugifyHeading('Small Groups & Outreach')).toBe('small-groups-outreach');
      expect(slugifyHeading('  Meeting Agenda #1  ')).toBe('meeting-agenda-1');
      expect(slugifyHeading('Follow-up items')).toBe('follow-up-items');
    });
  });

  describe('parseDocHeadings', () => {
    it('extracts Markdown headings with levels, line indices, and slug anchor IDs', () => {
      const md = `# Meeting Agenda\nWelcome team!\n## Small Groups\nDiscussion here\n### Breakout 1\nDetails\n## Follow Up`;
      const headings = parseDocHeadings(md);
      expect(headings).toHaveLength(4);
      expect(headings[0]).toEqual({ level: 1, text: 'Meeting Agenda', id: 'meeting-agenda', lineIndex: 0 });
      expect(headings[1]).toEqual({ level: 2, text: 'Small Groups', id: 'small-groups', lineIndex: 2 });
      expect(headings[2]).toEqual({ level: 3, text: 'Breakout 1', id: 'breakout-1', lineIndex: 4 });
      expect(headings[3]).toEqual({ level: 2, text: 'Follow Up', id: 'follow-up', lineIndex: 6 });
    });

    it('returns empty array for empty or non-heading markdown', () => {
      expect(parseDocHeadings('')).toEqual([]);
      expect(parseDocHeadings('Just some paragraph text\nwith bullet points\n- item 1')).toEqual([]);
    });
  });

  describe('searchBoardContent', () => {
    const mockDocs: BoardDoc[] = [
      {
        id: 'doc1',
        title: 'Weekly Standup',
        date: '2026-06-25',
        md: '# Agenda\n- Welcome\n## Small Groups\nDiscuss conferences and outreach',
        audience: 'team',
      },
      {
        id: 'doc2',
        title: 'Retreat Planning',
        date: '2026-06-20',
        md: '# Retreat Overview\nLocation details and welcome pack',
        audience: 'team',
      },
    ];

    const mockNotes: BoardNote[] = [
      {
        id: 'note1',
        title: 'Conferences Recap',
        body: 'Great turnout at the summer training',
        series: 'Conferences/Trainings',
        date: '2026-06-10',
        type: 'record',
        tags: ['conferences', 'training'],
        contributorIds: ['u1'],
      },
    ];

    const mockTasks: any[] = [
      {
        id: 'task1',
        title: 'Send welcome emails',
        assigneeName: 'Alex',
        status: 'pending',
        sourceDocId: 'doc1',
      },
    ];

    it('returns empty array for empty search queries', () => {
      expect(searchBoardContent(mockDocs, mockNotes, mockTasks, '')).toEqual([]);
      expect(searchBoardContent(mockDocs, mockNotes, mockTasks, '   ')).toEqual([]);
    });

    it('searches doc titles and content headings', () => {
      const results = searchBoardContent(mockDocs, mockNotes, mockTasks, 'Small Groups');
      expect(results).toHaveLength(1);
      expect(results[0].kind).toBe('heading');
      expect(results[0].docId).toBe('doc1');
      expect(results[0].headingText).toBe('Small Groups');
      expect(results[0].anchorId).toBe('small-groups');
    });

    it('searches across notes and tasks', () => {
      const noteResults = searchBoardContent(mockDocs, mockNotes, mockTasks, 'training');
      expect(noteResults.some((r) => r.kind === 'note' && r.noteId === 'note1')).toBe(true);

      const taskResults = searchBoardContent(mockDocs, mockNotes, mockTasks, 'welcome emails');
      expect(taskResults.some((r) => r.kind === 'task' && r.taskId === 'task1')).toBe(true);
    });
  });
});
