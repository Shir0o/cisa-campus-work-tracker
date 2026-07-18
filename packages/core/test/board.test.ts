import { describe, it, expect } from 'vitest';
import {
  sessionStatus,
  todayISO,
  docGroup,
  audienceOf,
  canSeeBoardDoc,
  boardAudiencesForRole,
  boardLevelForRole,
  mdPreview,
  mdOpenTasks,
} from '../src/board';

describe('board date + status helpers', () => {
  it('derives session status from the date', () => {
    expect(sessionStatus(todayISO())).toBe('today');
    expect(sessionStatus('2000-01-01')).toBe('done');
    expect(sessionStatus('2999-01-01')).toBe('upcoming');
    expect(sessionStatus('not-a-date')).toBe('upcoming');
  });

  it('files old dates under Earlier and today under This week', () => {
    expect(docGroup(todayISO())).toBe('This week');
    expect(docGroup('2000-01-01')).toBe('Earlier');
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
