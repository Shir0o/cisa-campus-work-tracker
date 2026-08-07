import { describe, it, expect } from 'vitest';
import { Timestamp } from 'firebase/firestore';
import {
  sessionStatus,
  todayISO,
  docGroup,
  audienceOf,
  canSeeBoardDoc,
  boardAudiencesForRole,
  boardLevelForRole,
  isTrashedBoardDoc,
  docSortOrder,
  mdPreview,
  mdOpenTasks,
  boardRowLine,
  boardKeeperFoot,
  boardCountNote,
  AUDIENCE_TONE_KEY,
  AUDIENCE_ORDER,
  type BoardDoc,
} from '../src/board';
import { isExpiredTrash } from '../src/data/board';

describe('board date + status helpers', () => {
  it('derives session status from the date', () => {
    expect(sessionStatus(todayISO())).toBe('today');
    expect(sessionStatus('2000-01-01')).toBe('done');
    expect(sessionStatus('2999-01-01')).toBe('upcoming');
    expect(sessionStatus('not-a-date')).toBe('upcoming');
  });

  it('files old dates under Earlier, today under This week, and pinned docs under Pinned', () => {
    expect(docGroup(todayISO())).toBe('This week');
    expect(docGroup('2000-01-01')).toBe('Earlier');
    expect(docGroup('2000-01-01', true)).toBe('Pinned');
    expect(docGroup({ date: '2000-01-01', pinned: true })).toBe('Pinned');
    expect(docGroup({ date: todayISO(), pinned: false })).toBe('This week');
  });
});

describe('board audience / visibility', () => {
  it('defaults a page with no audience to the most private tier', () => {
    expect(audienceOf({})).toBe('team');
    expect(audienceOf({ audience: 'everyone' })).toBe('everyone');
  });

  it('maps roles to board levels', () => {
    expect(boardLevelForRole('admin')).toBe(2);
    expect(boardLevelForRole('manager')).toBe(1);
    expect(boardLevelForRole('operator')).toBe(0);
    expect(boardLevelForRole('viewer')).toBe(-1);
  });

  it('lets a role see only pages at or below its level', () => {
    // operator (Student) sees Open pages, not Trainee/Team pages
    expect(canSeeBoardDoc('operator', { audience: 'everyone' })).toBe(true);
    expect(canSeeBoardDoc('operator', { audience: 'trainees' })).toBe(false);
    expect(canSeeBoardDoc('operator', { audience: 'team' })).toBe(false);
    // manager (Trainee) sees Open + Trainee, not Team
    expect(canSeeBoardDoc('manager', { audience: 'trainees' })).toBe(true);
    expect(canSeeBoardDoc('manager', { audience: 'team' })).toBe(false);
    // admin sees everything
    expect(canSeeBoardDoc('admin', { audience: 'team' })).toBe(true);
    // community has no board access
    expect(canSeeBoardDoc('viewer', { audience: 'everyone' })).toBe(false);
  });

  it('scopes the query audiences per role', () => {
    expect(boardAudiencesForRole('admin')).toEqual([]); // unconstrained
    expect(boardAudiencesForRole('manager')).toEqual(['trainees', 'everyone']);
    expect(boardAudiencesForRole('operator')).toEqual(['everyone']);
  });
});

describe('board trash', () => {
  it('treats a doc as trashed only once deletedAt is set', () => {
    expect(isTrashedBoardDoc({})).toBe(false);
    expect(isTrashedBoardDoc({ deletedAt: null })).toBe(false);
    expect(isTrashedBoardDoc({ deletedAt: new Date() })).toBe(true);
  });
});

describe('docSortOrder', () => {
  it('floats pinned docs to the top regardless of date', () => {
    const d1 = { date: '2026-06-16', pinned: false } as BoardDoc;
    const d2 = { date: '2026-06-18', pinned: false } as BoardDoc;
    const d3 = { date: '2026-06-14', pinned: true } as BoardDoc;
    expect([d1, d2, d3].sort(docSortOrder).map((d) => d.date)).toEqual(['2026-06-14', '2026-06-18', '2026-06-16']);
  });

  it('falls back to newest-first among docs with the same pinned state', () => {
    const d1 = { date: '2026-06-16', pinned: true } as BoardDoc;
    const d2 = { date: '2026-06-18', pinned: true } as BoardDoc;
    expect([d1, d2].sort(docSortOrder).map((d) => d.date)).toEqual(['2026-06-18', '2026-06-16']);
  });

  it('respects pinnedOrder for pinned docs when specified', () => {
    const d1 = { id: '1', date: '2026-06-18', pinned: true, pinnedOrder: 1 } as BoardDoc;
    const d2 = { id: '2', date: '2026-06-16', pinned: true, pinnedOrder: 0 } as BoardDoc;
    expect([d1, d2].sort(docSortOrder).map((d) => d.id)).toEqual(['2', '1']);
  });
});

// parseDocNotes / parseDocTasks / collectDocTaskNodes are NOT here: they're
// TipTap-editor-specific (collectDocTaskNodes walks a live ProseMirror doc),
// only ever run in the web coordination editor, and covered there in
// src/test/board.test.ts against the real functions in src/lib/board.ts.
// apps/mobile's Board is read-only and carries no TipTap dependency at all, so
// this platform-agnostic package never had them — these two blocks were a
// stray copy-paste duplicate that happened to still pass because vitest treats
// an undefined import as `undefined`... except calling `undefined(md)` throws,
// which is exactly what was failing here.

describe('isExpiredTrash', () => {
  const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;
  const now = new Date('2026-07-01T00:00:00Z').getTime();

  it('is false for a doc with no deletedAt', () => {
    expect(isExpiredTrash(undefined, now)).toBe(false);
    expect(isExpiredTrash(null, now)).toBe(false);
  });

  it('is false just under 30 days, true once 30 days have elapsed', () => {
    const justUnder = Timestamp.fromMillis(now - THIRTY_DAYS_MS + 1000);
    const exactly30 = Timestamp.fromMillis(now - THIRTY_DAYS_MS);
    expect(isExpiredTrash(justUnder, now)).toBe(false);
    expect(isExpiredTrash(exactly30, now)).toBe(true);
  });

  it('is true well past 30 days', () => {
    const wayOld = Timestamp.fromMillis(now - THIRTY_DAYS_MS * 3);
    expect(isExpiredTrash(wayOld, now)).toBe(true);
  });
});

describe('mdPreview', () => {
  it('returns the first readable, de-marked-up line', () => {
    expect(mdPreview('# Heading\n\nHello **world**\nSecond line')).toBe('Hello world');
    expect(mdPreview('- [ ] a checklist item')).toBe('a checklist item');
    expect(mdPreview('- a bullet')).toBe('a bullet');
    expect(mdPreview('1. an ordered item')).toBe('an ordered item');
    expect(mdPreview('> a quote')).toBe('a quote');
    expect(mdPreview('**Meta only line**\nReal content')).toBe('Real content');
    expect(mdPreview('[a link](https://example.com)')).toBe('a link');
    expect(mdPreview('`code span`')).toBe('code span');
  });

  it('falls back to "Empty page" when nothing readable remains', () => {
    expect(mdPreview('')).toBe('Empty page');
    expect(mdPreview(undefined)).toBe('Empty page');
    expect(mdPreview('# Just a heading\n**bold meta**')).toBe('Empty page');
  });
});

describe('mdOpenTasks', () => {
  it('counts open checklist items only', () => {
    expect(mdOpenTasks('- [ ] one\n- [x] done\n- [ ] two')).toBe(2);
    expect(mdOpenTasks('no tasks here')).toBe(0);
    expect(mdOpenTasks(undefined)).toBe(0);
  });
});

describe('mobile v2 Board copy', () => {
  it('joins a row line from whichever of time, place and leader exist', () => {
    expect(boardRowLine({ time: '7pm', place: 'Kirkbride' }, 'Ana Beltrán')).toBe(
      '7pm · Kirkbride · Ana leading',
    );
    expect(boardRowLine({ time: '', place: 'Kirkbride' }, 'Ana Beltrán')).toBe('Kirkbride · Ana leading');
    expect(boardRowLine({ time: '7pm', place: undefined }, null)).toBe('7pm');
  });

  it('returns an empty row line when there is nothing to say', () => {
    // The caller hides the line rather than printing separators around nothing.
    expect(boardRowLine({ time: undefined, place: undefined }, null)).toBe('');
    expect(boardRowLine({ time: '  ', place: '' }, undefined)).toBe('');
  });

  it('names who keeps an open page, or the team when nobody is named', () => {
    expect(boardKeeperFoot('Mei Tanaka')).toBe(
      "Mei keeps this page. Writing happens on the desktop site — here you're reading.",
    );
    expect(boardKeeperFoot(null)).toBe(
      "The team keeps this page. Writing happens on the desktop site — here you're reading.",
    );
    expect(boardKeeperFoot('')).toBe(
      "The team keeps this page. Writing happens on the desktop site — here you're reading.",
    );
  });

  it('counts pages for the screen note', () => {
    expect(boardCountNote(0)).toBe('No pages');
    expect(boardCountNote(1)).toBe('1 page');
    expect(boardCountNote(7)).toBe('7 pages');
  });

  it('paints every audience tier with a v2 tone', () => {
    expect(AUDIENCE_TONE_KEY.team).toBe('pray');
    expect(AUDIENCE_TONE_KEY.trainees).toBe('due');
    expect(AUDIENCE_TONE_KEY.everyone).toBe('note');
    // Every tier the picker offers must have a dot, or a pill renders colourless.
    AUDIENCE_ORDER.forEach((a) => expect(AUDIENCE_TONE_KEY[a]).toBeTruthy());
  });
});
