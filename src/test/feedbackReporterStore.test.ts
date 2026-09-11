import { describe, it, expect } from 'vitest';
import { ensureReporterLabel } from '../lib/feedbackReporterStore';

type UserRecord = { reporterLabel?: string };

function makeDb(seed: Record<string, UserRecord> = {}) {
  const users = new Map<string, UserRecord>(Object.entries(seed));

  return {
    collection: (_name: string) => ({
      doc: (id: string) => ({
        get: async () => ({
          exists: users.has(id),
          data: () => users.get(id),
        }),
        set: async (data: UserRecord) => {
          users.set(id, { ...(users.get(id) ?? {}), ...data });
        },
      }),
      where: (field: string, _op: string, value: string) => ({
        get: async () => {
          const matched = Array.from(users.entries())
            .filter(([, data]) => (data as any)[field] === value)
            .map(([id, data]) => ({ id, data: () => data }));
          return { docs: matched, size: matched.length };
        },
      }),
    }),
  };
}

describe('ensureReporterLabel', () => {
  it('assigns first name plus last initial and persists it', async () => {
    const db = makeDb();
    await expect(ensureReporterLabel(db as any, 'u1', 'Sarah Carvajal')).resolves.toBe('reporter:sarah-c');
    await expect(ensureReporterLabel(db as any, 'u1', 'Sarah Carvajal')).resolves.toBe('reporter:sarah-c');
  });

  it('adds a numeric suffix when a different user claims the same label', async () => {
    const db = makeDb();
    await expect(ensureReporterLabel(db as any, 'u1', 'Sarah Carvajal')).resolves.toBe('reporter:sarah-c');
    await expect(ensureReporterLabel(db as any, 'u2', 'Sarah Clark')).resolves.toBe('reporter:sarah-c-2');
  });

  it('returns no label for anonymous reporters', async () => {
    const db = makeDb();
    await expect(ensureReporterLabel(db as any, 'u1', 'Anonymous User')).resolves.toBeNull();
  });
});
