import { describe, it, expect, vi, beforeEach } from 'vitest';
import { writeBatch, doc, addDoc, collection } from 'firebase/firestore';
import {
  STAGE_COLOR,
  addStage,
  applyStageReorder,
  persistStageOrder,
  removeStageWithReassign,
  renameStageWithContacts,
} from '../lib/data/stages';
import type { Stage } from '../types';

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('firebase/firestore', () => ({
  writeBatch: vi.fn(),
  doc: vi.fn((_db: unknown, coll: string, id: string) => ({ path: `${coll}/${id}`, id })),
  collection: vi.fn((_db: unknown, path: string) => ({ path })),
  addDoc: vi.fn(() => Promise.resolve({ id: 'new-stage' })),
}));

vi.mock('../lib/firebase', () => ({ db: {} }));

const stage = (id: string, label: string, order: number): Stage => ({
  id,
  label,
  color: 'bg-board-teal',
  order,
});

// ── applyStageReorder (pure) ─────────────────────────────────────────────────

describe('applyStageReorder', () => {
  it('moves the active stage to the over position and reindexes order 0..n-1', () => {
    const stages = [
      stage('s1', 'First Contact', 0),
      stage('s2', 'Regular', 1),
      stage('s3', 'Church Home', 2),
    ];
    const reordered = applyStageReorder(stages, 's1', 's2');
    expect(reordered.map((s) => s.label)).toEqual(['Regular', 'First Contact', 'Church Home']);
    expect(reordered.map((s) => s.order)).toEqual([0, 1, 2]);
  });

  it('moves a stage that originally came after the over position', () => {
    const stages = [
      stage('s1', 'First Contact', 0),
      stage('s2', 'Regular', 1),
      stage('s3', 'Church Home', 2),
    ];
    const reordered = applyStageReorder(stages, 's3', 's1');
    expect(reordered.map((s) => s.label)).toEqual(['Church Home', 'First Contact', 'Regular']);
    expect(reordered.map((s) => s.order)).toEqual([0, 1, 2]);
  });

  it('returns the same array when active and over are the same stage', () => {
    const stages = [stage('s1', 'First Contact', 0), stage('s2', 'Regular', 1)];
    expect(applyStageReorder(stages, 's1', 's1')).toEqual(stages);
  });

  it('returns the input unchanged when the ids are unknown', () => {
    const stages = [stage('s1', 'First Contact', 0), stage('s2', 'Regular', 1)];
    expect(applyStageReorder(stages, 'nope', 's2')).toEqual(stages);
    expect(applyStageReorder(stages, 's1', 'nope')).toEqual(stages);
  });
});

// ── persistStageOrder ────────────────────────────────────────────────────────

describe('persistStageOrder', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('batch-updates every stage with label, color, and the new order', async () => {
    const update = vi.fn();
    const commit = vi.fn(() => Promise.resolve());
    vi.mocked(writeBatch).mockReturnValue({ update, commit } as never);

    const reordered = [
      stage('s2', 'Regular', 0),
      stage('s1', 'First Contact', 1),
    ];

    await persistStageOrder(reordered);

    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith(
      { path: 'stages/s2', id: 's2' },
      { label: 'Regular', color: 'bg-board-teal', order: 0 },
    );
    expect(update).toHaveBeenCalledWith(
      { path: 'stages/s1', id: 's1' },
      { label: 'First Contact', color: 'bg-board-teal', order: 1 },
    );
    expect(commit).toHaveBeenCalledTimes(1);
  });
});

// ── Step management, moved out of the Journey board into Settings (§22) ─────

const mockBatch = () => {
  const update = vi.fn();
  const remove = vi.fn();
  const commit = vi.fn(() => Promise.resolve());
  vi.mocked(writeBatch).mockReturnValue({ update, delete: remove, commit } as never);
  return { update, remove, commit };
};

describe('addStage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('adds the step at the end, carrying the one persisted colour the rule requires', async () => {
    await addStage('  Church Home  ', 3);

    expect(collection).toHaveBeenCalledWith({}, 'stages');
    expect(addDoc).toHaveBeenCalledWith({ path: 'stages' }, {
      label: 'Church Home',
      color: STAGE_COLOR,
      order: 3,
    });
  });
});

describe('renameStageWithContacts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renames the step and moves its people to the new label in one batch', async () => {
    const { update, commit } = mockBatch();

    await renameStageWithContacts(stage('s2', 'Regular', 1), 'Established', ['c1', 'c2']);

    expect(update).toHaveBeenCalledWith(
      { path: 'stages/s2', id: 's2' },
      { label: 'Established', color: 'bg-board-teal', order: 1 },
    );
    expect(update).toHaveBeenCalledWith({ path: 'contacts/c1', id: 'c1' }, { stage: 'Established' });
    expect(update).toHaveBeenCalledWith({ path: 'contacts/c2', id: 'c2' }, { stage: 'Established' });
    expect(update).toHaveBeenCalledTimes(3);
    expect(commit).toHaveBeenCalledTimes(1);
  });
});

describe('removeStageWithReassign', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reassigns every person on the step to the chosen step, then deletes the step", async () => {
    const { update, remove, commit } = mockBatch();

    await removeStageWithReassign('s2', ['c1', 'c2'], 'Regular');

    expect(update).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledWith({ path: 'contacts/c1', id: 'c1' }, { stage: 'Regular' });
    expect(update).toHaveBeenCalledWith({ path: 'contacts/c2', id: 'c2' }, { stage: 'Regular' });
    expect(remove).toHaveBeenCalledWith({ path: 'stages/s2', id: 's2' });
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it('deletes an empty step without touching any person', async () => {
    const { update, remove, commit } = mockBatch();

    await removeStageWithReassign('s3', [], '');

    expect(update).not.toHaveBeenCalled();
    expect(remove).toHaveBeenCalledWith({ path: 'stages/s3', id: 's3' });
    expect(commit).toHaveBeenCalledTimes(1);
  });
});
