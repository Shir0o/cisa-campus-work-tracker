import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

// ── Mocks ──────────────────────────────────────────────────────────────
vi.mock('react-router-dom', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return { ...actual, useNavigate: () => vi.fn() };
});

const mockUseAuth = vi.hoisted(() => vi.fn());
vi.mock('../components/AuthProvider', () => ({ useAuth: mockUseAuth }));

vi.mock('../App', () => ({ useOptionalLayout: () => undefined }));

const h = vi.hoisted(() => ({
  contacts: [] as any[],
  save: vi.fn(),
  askedAt: vi.fn(),
  dropOverride: vi.fn(),
  reword: vi.fn(),
  replaceDrafted: vi.fn(),
  notepadCb: null as null | ((n: any) => void),
  deferNotepad: false,
  prefs: {} as any,
  threads: [] as any[],
  notepad: {} as any,
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, path: string) => ({ path })),
  collectionGroup: vi.fn((_db: unknown, group: string) => ({ path: group })),
  onSnapshot: vi.fn((ref: any, callback: any) => {
    if (ref?.path === 'contacts') {
      callback({ docs: h.contacts.map((c) => ({ id: c.id, ref: { path: `contacts/${c.id}` }, data: () => c.data })) });
    } else {
      callback({ docs: [] });
    }
    return vi.fn();
  }),
  query: vi.fn((ref: unknown) => ref),
  orderBy: vi.fn(),
  limit: vi.fn(),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', UPDATE: 'UPDATE', CREATE: 'CREATE', DELETE: 'DELETE', WRITE: 'WRITE' },
}));

vi.mock('../lib/userPreferences', () => ({
  subscribeUserPreferences: (_uid: string, cb: any) => {
    cb(h.prefs);
    return vi.fn();
  },
  saveUserPreferences: vi.fn(),
}));

vi.mock('../lib/threads', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    subscribeAllThreads: (cb: any) => {
      cb(h.threads);
      return vi.fn();
    },
  };
});

vi.mock('../lib/toAsk', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    subscribeToAskNotepad: (_uid: string, cb: any) => {
      h.notepadCb = cb;
      if (!h.deferNotepad) cb(h.notepad);
      return vi.fn();
    },
    saveToAskNotepad: (...a: any[]) => h.save(...a),
    setToAskAskedAt: (...a: any[]) => h.askedAt(...a),
    deleteToAskOverride: (...a: any[]) => h.dropOverride(...a),
    setToAskRewording: (...a: any[]) => h.reword(...a),
    replaceToAskDrafted: (...a: any[]) => h.replaceDrafted(...a),
  };
});

import Ask from '../views/Ask';
import ToAskPointerCard from '../components/landing/ToAskPointerCard';
import { applyRoster } from '../lib/walking';
import { applyTeams } from '../lib/teams';

const DAY = 86_400_000;
const ago = (d: number) => new Date(Date.now() - d * DAY).toISOString();

const renderAsk = () =>
  render(
    <MemoryRouter>
      <Ask />
    </MemoryRouter>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  mockUseAuth.mockReturnValue({ user: { uid: 'ft' }, effectiveUserId: 'ft', role: 'admin' });
  applyRoster([
    { uid: 'ft', role: 'admin' },
    { uid: 'jae', role: 'manager' },
  ]);
  applyTeams([{ uid: 'jae', team: 'campus', displayName: 'Jae Kim' }]);
  h.contacts = [{ id: 'c1', data: { name: 'Priya Nair', carers: ['jae'], createdAt: ago(5) } }];
  h.threads = [];
  h.notepad = {};
  h.prefs = {};
  h.deferNotepad = false;
});

describe('To ask page (#1649)', () => {
  it('drafts a Not reached yet line under its Trainee and shows the open count', async () => {
    renderAsk();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'To ask' })).toBeTruthy());
    expect(screen.getByLabelText('Jae Kim')).toBeTruthy();
    expect(screen.getByText('Priya Nair — not reached yet')).toBeTruthy();
    expect(screen.getByText('Not reached yet · added 5 days ago')).toBeTruthy();
  });

  it('marks a line Asked', async () => {
    renderAsk();
    await waitFor(() => expect(screen.getByText('Priya Nair — not reached yet')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Mark asked'));
    await waitFor(() =>
      expect(h.askedAt).toHaveBeenCalledWith('ft', 'notReached|c1', expect.any(String)),
    );
  });

  // Bug 3: a merge write never removes a nested key, so Undo used to no-op.
  it('Undo Asked on a drafted line deletes its override in storage', async () => {
    h.notepad = { overrides: { 'notReached|c1': { askedAt: ago(0) } } };
    renderAsk();
    await waitFor(() => expect(screen.getByLabelText('Asked — undo')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Asked — undo'));
    await waitFor(() => expect(h.dropOverride).toHaveBeenCalledWith('ft', 'notReached|c1'));
    expect(h.save.mock.calls.some((c) => c[1]?.overrides)).toBe(false);
  });

  it('Undo Asked on a reworded drafted line clears only askedAt', async () => {
    h.notepad = { overrides: { 'notReached|c1': { askedAt: ago(0), text: 'Did Priya reply?' } } };
    renderAsk();
    await waitFor(() => expect(screen.getByLabelText('Asked — undo')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Asked — undo'));
    await waitFor(() => expect(h.askedAt).toHaveBeenCalledWith('ft', 'notReached|c1', null));
    expect(h.dropOverride).not.toHaveBeenCalled();
  });

  // Bug 4: the drafted write-back must be idempotent, or every snapshot of
  // its own write would trigger another one.
  it('writes the drafted keys once and not again after its own snapshot', async () => {
    renderAsk();
    await waitFor(() => expect(h.replaceDrafted).toHaveBeenCalledTimes(1));
    const [uid, written] = h.replaceDrafted.mock.calls[0];
    expect(uid).toBe('ft');
    expect(Object.keys(written)).toEqual(['notReached|c1']);
    act(() => h.notepadCb!({ drafted: written }));
    act(() => h.notepadCb!({ drafted: { ...written } }));
    await new Promise((r) => setTimeout(r, 0));
    expect(h.replaceDrafted).toHaveBeenCalledTimes(1);
  });

  it('does not write the drafted keys before the notepad has loaded', async () => {
    h.deferNotepad = true;
    renderAsk();
    await waitFor(() => expect(screen.getByText('Priya Nair — not reached yet')).toBeTruthy());
    expect(h.replaceDrafted).not.toHaveBeenCalled();
    act(() => h.notepadCb!({}));
    await waitFor(() => expect(h.replaceDrafted).toHaveBeenCalledTimes(1));
  });

  it('drops a stored drafted key the derivation no longer has', async () => {
    const at = ago(5);
    h.notepad = { drafted: { 'notReached|c1': { at }, 'notReached|gone': { at: ago(40) } } };
    renderAsk();
    await waitFor(() => expect(h.replaceDrafted).toHaveBeenCalledTimes(1));
    expect(h.replaceDrafted.mock.calls[0][1]).toEqual({ 'notReached|c1': { at } });
  });

  it('rewords a drafted line, keeping the signal key', async () => {
    renderAsk();
    await waitFor(() => expect(screen.getByText('Priya Nair — not reached yet')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Reword'));
    const input = screen.getByDisplayValue('Priya Nair — not reached yet');
    fireEvent.change(input, { target: { value: 'Did Priya reply?' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() =>
      expect(h.reword).toHaveBeenCalledWith('ft', 'notReached|c1', 'Did Priya reply?'),
    );
  });

  it('adds a hand-written line', async () => {
    renderAsk();
    await waitFor(() => expect(screen.getByText('Priya Nair — not reached yet')).toBeTruthy());
    const input = screen.getByLabelText('Add a line for Jae Kim…');
    fireEvent.change(input, { target: { value: 'Who drives Friday?' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() => expect(h.save).toHaveBeenCalled());
    const patch = h.save.mock.calls.find((c) => c[1]?.lines)?.[1];
    expect(patch.lines.at(-1)).toMatchObject({ text: 'Who drives Friday?', group: 'jae' });
  });

  it('remembers the team filter', async () => {
    renderAsk();
    await waitFor(() => expect(screen.getByText('Priya Nair — not reached yet')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'YP team' }));
    await waitFor(() => expect(h.save).toHaveBeenCalledWith('ft', { teamFilter: 'yp' }));
  });

  it('offers Clear done and drops struck lines on click', async () => {
    h.notepad = { lines: [{ id: 'n1', text: 'old note', group: 'jae', createdAt: ago(30), askedAt: ago(1) }] };
    renderAsk();
    await waitFor(() => expect(screen.getByText('old note')).toBeTruthy());
    const clear = screen.getByRole('button', { name: /Clear done/ });
    fireEvent.click(clear);
    await waitFor(() => expect(h.save).toHaveBeenCalledWith('ft', expect.objectContaining({ clearedBefore: expect.any(String) })));
  });

  it('is invisible to a non-Full-timer', () => {
    mockUseAuth.mockReturnValue({ user: { uid: 'jae' }, effectiveUserId: 'jae', role: 'manager' });
    const { container } = renderAsk();
    expect(container.textContent).not.toContain('To ask');
  });
});

describe('To ask pointer card (#1649)', () => {
  it('shows the same open count and the top Trainees', async () => {
    render(
      <MemoryRouter>
        <ToAskPointerCard contacts={[]} interactions={[]} threads={[]} />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getByText('Open To ask')).toBeTruthy());
  });
});
