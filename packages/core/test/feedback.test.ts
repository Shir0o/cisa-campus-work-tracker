import { describe, it, expect } from 'vitest';
import {
  kindMeta,
  kindToType,
  typeToKind,
  FEEDBACK_OUTCOMES,
  outcomeCopy,
  outcomeLabel,
} from '../src/feedback';
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

describe('FEEDBACK_OUTCOMES & outcomeCopy', () => {
  it('defines the three canonical canned outcomes', () => {
    expect(FEEDBACK_OUTCOMES).toEqual(['shipped', 'not-planned', 'already-there']);
  });

  it('returns the exact canned copy for each outcome', () => {
    expect(outcomeCopy('shipped')).toBe('This shipped! Thank you for helping shape the app.');
    expect(outcomeCopy('not-planned')).toBe("We looked into this and aren't planning to build it right now, but thank you for speaking up.");
    expect(outcomeCopy('already-there')).toBe("This is already in the app! Ask someone on the team and we'll show you where it lives.");
  });

  it('provides a human-readable label for each outcome', () => {
    expect(outcomeLabel('shipped')).toBe('Shipped');
    expect(outcomeLabel('not-planned')).toBe('Not planned');
    expect(outcomeLabel('already-there')).toBe('Already in the app');
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
