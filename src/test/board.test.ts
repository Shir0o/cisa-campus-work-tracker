import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  newId,
  sessionStatus,
  weekdayOf,
  dateLabelOf,
  longDateOf,
  todayISO,
  docGroup,
  weekdayShort,
  dayNum,
  docByDateDesc,
  docSortOrder,
  parseDocTasks,
  collectDocTaskNodes,
  newDocMarkdown,
  bodyMarkdownForDisplay,
  persistDocEdit,
  audienceOf,
  canViewBoard,
  canEditBoard,
  AUDIENCE_ORDER,
  BOARD_AUDIENCE,
  slugifyHeading,
  parseDocHeadings,
  searchBoardContent,
  type BoardDoc,
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
      expect(weekdayOf('2026-06-16', 'en')).toBe('Tuesday');
      expect(weekdayOf('2026-06-17', 'en')).toBe('Wednesday');
    });

    it('returns empty string for invalid dates', () => {
      expect(weekdayOf('invalid-date', 'en')).toBe('');
    });
  });

  describe('dateLabelOf', () => {
    it('returns formatted date label', () => {
      expect(dateLabelOf('2026-06-16', 'en')).toBe('Jun 16');
    });

    it('returns the input date if invalid', () => {
      expect(dateLabelOf('invalid-date', 'en')).toBe('invalid-date');
    });
  });

  describe('longDateOf', () => {
    it('writes the weekday and date in English', () => {
      expect(longDateOf('2026-10-24', 'en')).toBe('Saturday, Oct 24');
    });

    it('returns empty string for invalid dates', () => {
      expect(longDateOf('invalid-date', 'en')).toBe('');
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
      expect(weekdayShort('2026-06-16', 'en')).toBe('Tue');
      expect(weekdayShort('invalid-date', 'en')).toBe('');
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
      expect(newDocMarkdown()).toContain('Start writing');
    });

    // #1772: a page carries its name in the title field, so seeding a matching
    // `# Untitled page` heading made every new page print its title twice.
    it('does not seed a heading that duplicates the page title', () => {
      expect(newDocMarkdown()).not.toMatch(/^#\s/m);
    });
  });

  describe('bodyMarkdownForDisplay', () => {
    it('drops a leading heading that only repeats the page title', () => {
      expect(bodyMarkdownForDisplay('# Monday kickoff\n\nBody text.', 'Monday kickoff')).toBe('Body text.');
    });

    it('keeps a leading heading that says something else', () => {
      expect(bodyMarkdownForDisplay('# Agenda\n\nBody text.', 'Monday kickoff')).toBe('# Agenda\n\nBody text.');
    });

    it('leaves markdown without a leading heading alone', () => {
      expect(bodyMarkdownForDisplay('Body text.', 'Monday kickoff')).toBe('Body text.');
    });
  });

  describe('persistDocEdit', () => {
    // #1772: the toolbar said "Saved" 1.2s after a keystroke whether or not the
    // write landed. The state must follow the write's outcome.
    it('reports saved only when the write resolved true', async () => {
      await expect(persistDocEdit(async () => true)).resolves.toBe('saved');
    });

    it('reports failed when the write resolved false', async () => {
      await expect(persistDocEdit(async () => false)).resolves.toBe('failed');
    });

    it('reports failed when the write rejects', async () => {
      await expect(
        persistDocEdit(async () => {
          throw new Error('offline');
        }),
      ).resolves.toBe('failed');
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

  describe('AUDIENCE_ORDER', () => {
    it('no longer offers the trainees tier to a new page (#1849)', () => {
      expect(AUDIENCE_ORDER).toEqual(['everyone', 'team']);
    });

    it('still labels legacy trainee-tagged pages so they render', () => {
      expect(BOARD_AUDIENCE.trainees.label).toBe('Trainees');
    });
  });

  describe('canViewBoard / canEditBoard', () => {
    it('grants Board view to Full-timers only (cut-or-keep §19)', () => {
      expect(canViewBoard('admin')).toBe(true);
      expect(canViewBoard('manager')).toBe(false);
      expect(canViewBoard('operator')).toBe(false);
      expect(canViewBoard('viewer')).toBe(false);
      expect(canViewBoard(null)).toBe(false);
    });

    it('grants editing to full-timers (admins) only', () => {
      expect(canEditBoard(true)).toBe(true);
      expect(canEditBoard(false)).toBe(false);
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
      expect(searchBoardContent(mockDocs, mockTasks, '', 'en')).toEqual([]);
      expect(searchBoardContent(mockDocs, mockTasks, '   ', 'en')).toEqual([]);
    });

    it('searches doc titles and content headings', () => {
      const results = searchBoardContent(mockDocs, mockTasks, 'Small Groups', 'en');
      expect(results).toHaveLength(1);
      expect(results[0].kind).toBe('heading');
      expect(results[0].docId).toBe('doc1');
      expect(results[0].headingText).toBe('Small Groups');
      expect(results[0].anchorId).toBe('small-groups');
    });

    it('searches tasks (and no longer notes)', () => {
      const taskResults = searchBoardContent(mockDocs, mockTasks, 'welcome emails', 'en');
      expect(taskResults.some((r) => r.kind === 'task' && r.taskId === 'task1')).toBe(true);
      expect(taskResults.some((r) => (r.kind as string) === 'note')).toBe(false);
    });
  });
});
