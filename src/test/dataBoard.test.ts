import { describe, it, expect, vi } from 'vitest';
import { Timestamp } from 'firebase/firestore';

// isExpiredTrash is pure and never touches db/rtdb, but importing the module
// pulls in ../lib/firebase, which eagerly initializes a real Firebase app at
// import time — mock it so this test doesn't need a valid API key/project.
vi.mock('../lib/firebase', () => ({ db: {}, rtdb: {} }));

import { isExpiredTrash } from '../lib/data/board';

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
