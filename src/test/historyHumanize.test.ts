/**
 * The activity vocabulary (#1768).
 *
 * `cleared a prayer for` is written by `clearPrayer` in src/lib/prayers.ts. It
 * matched no branch in `humanize`, so a prayer event fell through to the
 * fallback — filed under Conversations with a pencil, and excluded from the
 * Prayer filter, on the team's record of what they did.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, path) => ({ path })),
  query: vi.fn((ref) => ref),
  onSnapshot: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'list' },
}));

vi.mock('../components/AuthProvider', () => ({ useAuth: vi.fn() }));
vi.mock('../components/layout/PageContainer', () => ({ default: ({ children }: any) => children }));
vi.mock('../views/HistoryMobile', () => ({ default: () => null }));

import { humanize } from '../views/History';

const row = (action: string, over: Record<string, unknown> = {}) =>
  ({
    id: 'a1',
    user: 'Zion Adeyemi',
    action,
    target: 'Lila Mora',
    contactId: 'c1',
    type: 'edit',
    createdAt: '2026-10-24T09:40:00.000Z',
    ...over,
  }) as any;

describe('humanize', () => {
  it('files a cleared prayer under Prayer, not Conversations', () => {
    const h = humanize(row('cleared a prayer for', { type: 'comment', description: 'Visa renewal' }));
    expect(h.bucket).toBe('prayer');
    expect(h.lead).toBe('cleared a prayer for');
  });

  it('still files a logged interaction under Conversations', () => {
    expect(humanize(row('logged an interaction for', { type: 'call' })).bucket).toBe('talk');
  });

  it('files an answered prayer under Prayer', () => {
    expect(humanize(row('marked a prayer burden as answered for')).bucket).toBe('prayer');
  });

  it('files a stage move under Steps forward', () => {
    expect(humanize(row('moved contact to stage "Regular Contact"')).bucket).toBe('steps');
  });
});
