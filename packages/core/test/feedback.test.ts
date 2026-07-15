import { describe, it, expect } from 'vitest';
import { filterFeedback, kindMeta, kindToType, typeToKind, type FeedbackFilters } from '../src/feedback';
import type { Feedback } from '../src/types';

const item = (overrides: Partial<Feedback> = {}): Feedback => ({
  id: 'f1',
  userId: 'u1',
  userEmail: 'a@example.com',
  userName: 'Ada',
  type: 'enhancement',
  kind: 'idea',
  message: 'It would be great if...',
  status: 'new',
  archived: false,
  createdAt: new Date('2026-07-13T12:00:00Z').toISOString(),
  ...overrides,
});

const baseFilters: FeedbackFilters = { kind: 'all', status: 'all', includeArchived: false };

describe('kindToType / typeToKind', () => {
  it('maps "off" to bug and everything else to enhancement', () => {
    expect(kindToType('off')).toBe('bug');
    expect(kindToType('thought')).toBe('enhancement');
    expect(kindToType('idea')).toBe('enhancement');
    expect(kindToType('request')).toBe('enhancement');
  });

  it('maps bug back to "off" and enhancement back to "idea" (legacy fallback)', () => {
    expect(typeToKind('bug')).toBe('off');
    expect(typeToKind('enhancement')).toBe('idea');
  });
});

describe('kindMeta', () => {
  it('returns the matching kind metadata', () => {
    expect(kindMeta('request').label).toBe('A request');
  });

  it('falls back to the first kind when given undefined', () => {
    expect(kindMeta(undefined)).toBe(kindMeta('thought'));
  });
});

describe('filterFeedback', () => {
  it('excludes archived items by default', () => {
    const items = [item({ id: 'a' }), item({ id: 'b', archived: true })];
    expect(filterFeedback(items, baseFilters).map((f) => f.id)).toEqual(['a']);
  });

  it('includes archived items when includeArchived is true', () => {
    const items = [item({ id: 'a' }), item({ id: 'b', archived: true })];
    expect(filterFeedback(items, { ...baseFilters, includeArchived: true }).map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('filters by kind, falling back to typeToKind for legacy docs with no kind', () => {
    const items = [
      item({ id: 'has-kind', kind: 'request' }),
      item({ id: 'legacy-bug', kind: undefined, type: 'bug' }),
    ];
    expect(filterFeedback(items, { ...baseFilters, kind: 'request' }).map((f) => f.id)).toEqual(['has-kind']);
    expect(filterFeedback(items, { ...baseFilters, kind: 'off' }).map((f) => f.id)).toEqual(['legacy-bug']);
  });

  it('filters by status', () => {
    const items = [item({ id: 'new', status: 'new' }), item({ id: 'resolved', status: 'resolved' })];
    expect(filterFeedback(items, { ...baseFilters, status: 'resolved' }).map((f) => f.id)).toEqual(['resolved']);
  });

  it('filters by free-text search across message/userName/userEmail', () => {
    const items = [
      item({ id: 'by-message', message: 'the export button is broken' }),
      item({ id: 'by-name', userName: 'Grace Hopper', message: 'unrelated' }),
      item({ id: 'no-match', userName: 'Nobody', message: 'unrelated' }),
    ];
    expect(filterFeedback(items, { ...baseFilters, search: 'export' }).map((f) => f.id)).toEqual(['by-message']);
    expect(filterFeedback(items, { ...baseFilters, search: 'grace' }).map((f) => f.id)).toEqual(['by-name']);
  });

  it('combines all filters together', () => {
    const items = [
      item({ id: 'match', kind: 'off', status: 'in_progress', message: 'crash on save' }),
      item({ id: 'wrong-kind', kind: 'idea', status: 'in_progress', message: 'crash on save' }),
      item({ id: 'wrong-status', kind: 'off', status: 'resolved', message: 'crash on save' }),
      item({ id: 'archived', kind: 'off', status: 'in_progress', message: 'crash on save', archived: true }),
    ];
    const filters: FeedbackFilters = { kind: 'off', status: 'in_progress', includeArchived: false, search: 'crash' };
    expect(filterFeedback(items, filters).map((f) => f.id)).toEqual(['match']);
  });
});
