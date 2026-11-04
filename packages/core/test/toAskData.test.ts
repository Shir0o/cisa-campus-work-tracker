import { describe, it, expect, vi, beforeEach } from 'vitest';

// The notepad's storage, shape-checked against a mocked Firestore. The same
// writes run against the rules emulator in src/test/queryContract.test.ts.
const fs = vi.hoisted(() => {
  class FieldPath {
    segments: string[];
    constructor(...segments: string[]) {
      this.segments = segments;
    }
  }
  return {
    FieldPath,
    arrayUnion: vi.fn((...items: unknown[]) => ({ __arrayUnion: items })),
    deleteField: vi.fn(() => '__delete'),
    doc: vi.fn((_db: unknown, ...path: string[]) => ({ path: path.join('/') })),
    onSnapshot: vi.fn(),
    setDoc: vi.fn(async () => undefined),
  };
});

vi.mock('firebase/firestore', () => fs);

import {
  addToAskUpdate,
  dismissToAskLine,
  postToAskLineUpdate,
  setToAskDismissedAt,
} from '../src/data/toAsk';
import type { ToAskNotepad, ToAskUpdate } from '../src/toAsk';

const db = {} as never;
const AT = '2026-10-16T18:00:00.000Z';
const KEY = 'question|c1|q1';
const update: ToAskUpdate = { id: 'u1', text: 'She is coming Friday', at: AT, dest: 'thread' };

const call = (i = 0) => {
  const [ref, data, opts] = fs.setDoc.mock.calls[i] as unknown as [
    { path: string },
    Record<string, any>,
    { merge?: boolean; mergeFields?: InstanceType<typeof fs.FieldPath>[] },
  ];
  return { ref, data, opts, paths: opts.mergeFields?.map((p) => p.segments) };
};

const notepad: ToAskNotepad = {
  lines: [
    { id: 'n1', text: 'Who drives?', group: 'jae', createdAt: AT },
    { id: 'n2', text: 'other', group: 'jae', createdAt: AT, dismissedAt: AT, updates: [update] },
  ],
};

beforeEach(() => vi.clearAllMocks());

describe('setToAskDismissedAt', () => {
  it('writes only overrides.<key>.dismissedAt, by field path', async () => {
    await setToAskDismissedAt(db, 'ft', KEY, AT);
    const { ref, data, paths } = call();
    expect(ref.path).toBe('toAskNotes/ft');
    expect(data).toEqual({ overrides: { [KEY]: { dismissedAt: AT } } });
    expect(paths).toEqual([['overrides', KEY, 'dismissedAt']]);
  });

  it('deletes the field to bring the line back', async () => {
    await setToAskDismissedAt(db, 'ft', KEY, null);
    expect(call().data.overrides[KEY].dismissedAt).toBe('__delete');
  });
});

describe('addToAskUpdate', () => {
  it('appends to overrides.<key>.updates without touching anything else', async () => {
    await addToAskUpdate(db, 'ft', KEY, update);
    const { data, paths } = call();
    expect(data.overrides[KEY]).toEqual({ updates: { __arrayUnion: [update] } });
    expect(paths).toEqual([['overrides', KEY, 'updates']]);
  });

  it('ticks the line Asked in the same write', async () => {
    await addToAskUpdate(db, 'ft', KEY, update, { askedAt: AT });
    const { data, paths } = call();
    expect(data.overrides[KEY].askedAt).toBe(AT);
    expect(paths).toEqual([
      ['overrides', KEY, 'updates'],
      ['overrides', KEY, 'askedAt'],
    ]);
  });
});

describe('dismissToAskLine', () => {
  it('uses the field-path write for a drafted line', async () => {
    await dismissToAskLine(db, 'ft', notepad, KEY, AT);
    expect(call().paths).toEqual([['overrides', KEY, 'dismissedAt']]);
  });

  it('rewrites the lines array for a hand-written line', async () => {
    await dismissToAskLine(db, 'ft', notepad, 'note:n1', AT);
    const { data, opts } = call();
    expect(opts).toEqual({ merge: true });
    expect(data.lines[0]).toEqual({ ...notepad.lines![0], dismissedAt: AT });
    expect(data.lines[1]).toEqual(notepad.lines![1]);
  });

  it('drops dismissedAt from a hand-written line to bring it back', async () => {
    await dismissToAskLine(db, 'ft', notepad, 'note:n2', null);
    const line = call().data.lines[1];
    expect('dismissedAt' in line).toBe(false);
    expect(line.updates).toEqual([update]);
  });
});

describe('postToAskLineUpdate', () => {
  it('uses the field-path write for a drafted line', async () => {
    await postToAskLineUpdate(db, 'ft', notepad, KEY, update, { askedAt: AT });
    expect(call().paths).toEqual([
      ['overrides', KEY, 'updates'],
      ['overrides', KEY, 'askedAt'],
    ]);
  });

  it('appends to a hand-written line, oldest first, leaving it open without askedAt', async () => {
    const later = { ...update, id: 'u2', dest: 'line' as const };
    await postToAskLineUpdate(db, 'ft', notepad, 'note:n2', later);
    const line = call().data.lines[1];
    expect(line.updates).toEqual([update, later]);
    expect('askedAt' in line).toBe(false);
  });

  it('ticks a hand-written line Asked in the same write', async () => {
    await postToAskLineUpdate(db, 'ft', notepad, 'note:n1', update, { askedAt: AT });
    expect(call().data.lines[0]).toMatchObject({ askedAt: AT, updates: [update] });
  });
});
