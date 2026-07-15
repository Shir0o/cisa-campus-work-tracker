import { describe, it, expect, vi, beforeEach } from 'vitest';
import { format } from 'date-fns';

// Mock firebase *before* importing todos.ts so the module-level `db` binding
// resolves to the mock.
const mockAddDoc = vi.fn().mockResolvedValue({ id: 'new-id' });
const mockUpdateDoc = vi.fn().mockResolvedValue(undefined);
const mockDeleteDoc = vi.fn().mockResolvedValue(undefined);
vi.mock('firebase/firestore', () => ({
  addDoc: (...args: any[]) => mockAddDoc(...args),
  updateDoc: (...args: any[]) => mockUpdateDoc(...args),
  deleteDoc: (...args: any[]) => mockDeleteDoc(...args),
  collection: vi.fn((_db: any, path: string) => `col:${path}`),
  doc: vi.fn((_db: any, col: string, id: string) => `doc:${col}/${id}`),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
}));

vi.mock('../lib/firebase', () => ({
  db: 'mock-db',
  handleFirestoreError: vi.fn(),
  OperationType: { CREATE: 'create', UPDATE: 'update', DELETE: 'delete', LIST: 'list' },
}));

import {
  dueChip,
  duePresetToISO,
  presetForDue,
  DUE_PRESETS,
  addTodo,
  updateTodo,
  setTodoDone,
  deleteTodo,
} from '../lib/todos';
import { handleFirestoreError } from '../lib/firebase';

const DAY_MS = 86_400_000;

describe('todos.ts', () => {
  beforeEach(() => vi.clearAllMocks());

  // ── dueChip ───────────────────────────────────────────────────────────────
  describe('dueChip', () => {
    it('returns null for undefined / null / empty string', () => {
      expect(dueChip()).toBeNull();
      expect(dueChip(null)).toBeNull();
      expect(dueChip('')).toBeNull();
    });

    it('returns "Overdue" for a past date', () => {
      const yesterday = format(new Date(Date.now() - DAY_MS), 'yyyy-MM-dd');
      const chip = dueChip(yesterday);
      expect(chip).toEqual({ label: 'Overdue', tone: 'overdue' });
    });

    it('returns "Due today" for today', () => {
      const today = format(new Date(), 'yyyy-MM-dd');
      expect(dueChip(today)).toEqual({ label: 'Due today', tone: 'soon' });
    });

    it('returns "Due tomorrow" for tomorrow', () => {
      const tomorrow = format(new Date(Date.now() + DAY_MS), 'yyyy-MM-dd');
      expect(dueChip(tomorrow)).toEqual({ label: 'Due tomorrow', tone: 'soon' });
    });

    it('returns "Due <weekday>" with "soon" tone for 2 days out', () => {
      const d = new Date();
      d.setDate(d.getDate() + 2);
      const chip = dueChip(format(d, 'yyyy-MM-dd'));
      expect(chip?.label).toMatch(/^Due \w+day$/);
      expect(chip?.tone).toBe('soon');
    });

    it('returns "Due <weekday>" with "normal" tone for 4 days out', () => {
      const d = new Date();
      d.setDate(d.getDate() + 4);
      const chip = dueChip(format(d, 'yyyy-MM-dd'));
      expect(chip?.label).toMatch(/^Due \w+day$/);
      expect(chip?.tone).toBe('normal');
    });

    it('returns "Due <Mon d>" for a date >6 days out', () => {
      const d = new Date();
      d.setDate(d.getDate() + 10);
      const chip = dueChip(format(d, 'yyyy-MM-dd'));
      expect(chip?.label).toMatch(/^Due \w{3} \d{1,2}$/);
      expect(chip?.tone).toBe('normal');
    });

    it('handles a full ISO-8601 datetime string (non-date-only format)', () => {
      const chip = dueChip(new Date().toISOString());
      // Should parse without error — the exact result depends on the time of day.
      expect(chip).toBeTruthy();
      expect(chip?.tone).toBeDefined();
    });

    it('returns null for a completely invalid date string', () => {
      expect(dueChip('not-a-date')).toBeNull();
    });
  });

  // ── duePresetToISO ────────────────────────────────────────────────────────
  describe('duePresetToISO', () => {
    it('returns null for null days', () => {
      expect(duePresetToISO(null)).toBeNull();
    });

    it('returns today for days=0', () => {
      expect(duePresetToISO(0)).toBe(format(new Date(), 'yyyy-MM-dd'));
    });

    it('returns tomorrow for days=1', () => {
      const d = new Date();
      d.setDate(d.getDate() + 1);
      expect(duePresetToISO(1)).toBe(format(d, 'yyyy-MM-dd'));
    });
  });

  // ── presetForDue ──────────────────────────────────────────────────────────
  describe('presetForDue', () => {
    it('returns "none" for null/undefined/empty', () => {
      expect(presetForDue()).toBe('none');
      expect(presetForDue(null)).toBe('none');
      expect(presetForDue('')).toBe('none');
    });

    it('matches "today" preset when dueDate equals today ISO', () => {
      const today = duePresetToISO(0)!;
      expect(presetForDue(today)).toBe('today');
    });

    it('matches "tomorrow" preset', () => {
      const tomorrow = duePresetToISO(1)!;
      expect(presetForDue(tomorrow)).toBe('tomorrow');
    });

    it('returns "custom" for an arbitrary future date', () => {
      expect(presetForDue('2099-12-31')).toBe('custom');
    });
  });

  // ── Firestore writes ─────────────────────────────────────────────────────
  describe('addTodo', () => {
    it('writes to the tasks collection with all fields', async () => {
      await addTodo(
        { title: '  Hello  ', assigneeId: 'u2', dueDate: '2026-07-01', source: { docId: 'bd1', docTitle: 'Page' } },
        { uid: 'u1', name: 'Tony' },
      );
      expect(mockAddDoc).toHaveBeenCalledWith('col:tasks', expect.objectContaining({
        title: 'Hello',
        assigneeId: 'u2',
        dueDate: '2026-07-01',
        priority: 'medium',
        status: 'pending',
        createdById: 'u1',
        createdByName: 'Tony',
        sourceDocId: 'bd1',
        sourceDocTitle: 'Page',
        createdAt: 'SERVER_TS',
      }));
    });

    it('handles errors through handleFirestoreError', async () => {
      mockAddDoc.mockRejectedValueOnce(new Error('boom'));
      await addTodo(
        { title: 'X', assigneeId: null, dueDate: null },
        { uid: 'u1', name: 'T' },
      );
      expect(handleFirestoreError).toHaveBeenCalled();
    });

    it('falls back to null when uid or name are empty strings', async () => {
      await addTodo(
        { title: 'Task', assigneeId: null, dueDate: null },
        { uid: '', name: '' },
      );
      expect(mockAddDoc).toHaveBeenCalledWith('col:tasks', expect.objectContaining({
        createdById: null,
        createdByName: null,
      }));
    });
  });

  describe('updateTodo', () => {
    it('writes a partial patch to the task doc', async () => {
      await updateTodo('t1', { title: '  New title  ', dueDate: '2026-08-01' });
      expect(mockUpdateDoc).toHaveBeenCalledWith('doc:tasks/t1', {
        title: 'New title',
        dueDate: '2026-08-01',
      });
    });

    it('only includes defined fields in the patch', async () => {
      await updateTodo('t2', { assigneeId: 'u3' });
      expect(mockUpdateDoc).toHaveBeenCalledWith('doc:tasks/t2', { assigneeId: 'u3' });
    });

    it('handles errors through handleFirestoreError', async () => {
      mockUpdateDoc.mockRejectedValueOnce(new Error('boom'));
      await updateTodo('t1', { title: 'X' });
      expect(handleFirestoreError).toHaveBeenCalled();
    });
  });

  describe('setTodoDone', () => {
    it('sets status to "completed" when done=true', async () => {
      await setTodoDone('t1', true);
      expect(mockUpdateDoc).toHaveBeenCalledWith('doc:tasks/t1', { status: 'completed' });
    });

    it('sets status to "pending" when done=false', async () => {
      await setTodoDone('t1', false);
      expect(mockUpdateDoc).toHaveBeenCalledWith('doc:tasks/t1', { status: 'pending' });
    });

    it('handles errors through handleFirestoreError', async () => {
      mockUpdateDoc.mockRejectedValueOnce(new Error('boom'));
      await setTodoDone('t1', true);
      expect(handleFirestoreError).toHaveBeenCalled();
    });
  });

  describe('deleteTodo', () => {
    it('deletes the task doc', async () => {
      await deleteTodo('t1');
      expect(mockDeleteDoc).toHaveBeenCalledWith('doc:tasks/t1');
    });

    it('handles errors through handleFirestoreError', async () => {
      mockDeleteDoc.mockRejectedValueOnce(new Error('boom'));
      await deleteTodo('t1');
      expect(handleFirestoreError).toHaveBeenCalled();
    });
  });
});
