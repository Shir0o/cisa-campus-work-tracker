import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { StandardTagsProvider, useStandardTags, saveStandardTags } from '../lib/standardTags';
import { STANDARD_TAG_SEED } from '../lib/tags';

const h = vi.hoisted(() => ({
  snapshot: undefined as unknown,
  error: undefined as unknown,
  setDoc: vi.fn(),
  handleFirestoreError: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, collection: string, id: string) => ({ collection, id })),
  onSnapshot: vi.fn((_ref: unknown, cb: (snap: unknown) => void, onError?: (e: unknown) => void) => {
    if (h.error !== undefined) onError?.(h.error);
    else cb(h.snapshot);
    return () => {};
  }),
  setDoc: h.setDoc,
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: h.handleFirestoreError,
  OperationType: { WRITE: 'WRITE' },
}));

function Probe() {
  const tags = useStandardTags();
  return <div data-testid="tags">{tags.join(',')}</div>;
}

describe('standard tags (#1437, ADR 0039)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.snapshot = { data: () => undefined };
    h.error = undefined;
  });

  it('falls back to the seed when no provider has mounted', () => {
    render(<Probe />);
    expect(screen.getByTestId('tags').textContent).toBe(STANDARD_TAG_SEED.join(','));
  });

  it('falls back to the seed when the document is missing or has no tags', () => {
    h.snapshot = { data: () => undefined };
    render(
      <StandardTagsProvider>
        <Probe />
      </StandardTagsProvider>,
    );
    expect(screen.getByTestId('tags').textContent).toBe(STANDARD_TAG_SEED.join(','));
  });

  it('renders the stored standard tags once the document loads', () => {
    h.snapshot = { data: () => ({ tags: ['Welcome', 'BFA'] }) };
    render(
      <StandardTagsProvider>
        <Probe />
      </StandardTagsProvider>,
    );
    expect(screen.getByTestId('tags').textContent).toBe('Welcome,BFA');
  });

  it('keeps a loaded-but-empty list empty', () => {
    h.snapshot = { data: () => ({ tags: [] }) };
    render(
      <StandardTagsProvider>
        <Probe />
      </StandardTagsProvider>,
    );
    expect(screen.getByTestId('tags').textContent).toBe('');
  });

  it('writes the list to settings/standard_tags', async () => {
    h.setDoc.mockResolvedValueOnce(undefined);
    await saveStandardTags(['Saved', 'Welcome']);
    expect(h.setDoc).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'settings', id: 'standard_tags' }),
      { tags: ['Saved', 'Welcome'] },
    );
  });

  it('surfaces a write failure through handleFirestoreError', async () => {
    h.setDoc.mockRejectedValueOnce(new Error('denied'));
    await saveStandardTags(['Saved']);
    expect(h.handleFirestoreError).toHaveBeenCalled();
  });

  it('logs a subscription error instead of throwing', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    h.error = new Error('permission-denied');
    render(
      <StandardTagsProvider>
        <Probe />
      </StandardTagsProvider>,
    );
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
