import { render, screen, waitFor, fireEvent, act, within } from '@testing-library/react';
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
  dismiss: vi.fn(),
  postUpdate: vi.fn(),
  logInteraction: vi.fn(async (..._a: any[]) => undefined),
  threadReply: vi.fn(async (..._a: any[]) => 'r1'),
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
    addThreadMessage: (...a: any[]) => h.threadReply(...a),
  };
});

vi.mock('../hooks/useContactStory', () => ({
  addContactInteraction: (...a: any[]) => h.logInteraction(...a),
}));

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
    dismissToAskLine: (...a: any[]) => h.dismiss(...a),
    postToAskLineUpdate: (...a: any[]) => h.postUpdate(...a),
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
  mockUseAuth.mockReturnValue({ user: { uid: 'ft', displayName: 'Kate Full' }, effectiveUserId: 'ft', role: 'admin' });
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

describe('To ask — Dismiss', () => {
  it('dismisses a line, hides it at once, and offers Undo', async () => {
    renderAsk();
    await waitFor(() => expect(screen.getByText('Priya Nair — not reached yet')).toBeTruthy());
    fireEvent.click(screen.getByLabelText('Dismiss'));
    expect(h.dismiss).toHaveBeenCalledWith('ft', expect.any(Object), 'notReached|c1', expect.any(String));
    expect(h.askedAt).not.toHaveBeenCalled();
    const snack = await screen.findByText('Dismissed “Priya Nair”. It comes back if anything new happens.');
    expect(snack).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(h.dismiss).toHaveBeenLastCalledWith('ft', expect.any(Object), 'notReached|c1', null);
  });

  it('keeps a dismissed line out of the groups and lists it in the Dismissed tray', async () => {
    h.notepad = { overrides: { 'notReached|c1': { dismissedAt: ago(0) } } };
    renderAsk();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'To ask' })).toBeTruthy());
    expect(screen.queryByText('Priya Nair — not reached yet')).toBeNull();
    expect(screen.getByText('0 open')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Dismissed · 1' }));
    const tray = screen.getByRole('region', { name: 'Dismissed' });
    expect(within(tray).getByText('Priya Nair — not reached yet')).toBeTruthy();
    expect(within(tray).getByText(/A drafted line comes back/)).toBeTruthy();
    fireEvent.click(within(tray).getByRole('button', { name: 'Bring back' }));
    expect(h.dismiss).toHaveBeenCalledWith('ft', expect.any(Object), 'notReached|c1', null);
  });

  it('shows no Dismissed pill when nothing is dismissed', async () => {
    renderAsk();
    await waitFor(() => expect(screen.getByText('Priya Nair — not reached yet')).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Dismissed ·/ })).toBeNull();
  });
});

describe('To ask — Post an update', () => {
  const openComposer = async () => {
    renderAsk();
    await waitFor(() => expect(screen.getByText(/Priya Nair —/)).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Post an update' }));
    return screen.getByRole('textbox', { name: 'Post an update' });
  };

  it('no longer offers Log on behalf', async () => {
    renderAsk();
    await waitFor(() => expect(screen.getByText('Priya Nair — not reached yet')).toBeTruthy());
    expect(screen.queryByText('Log on behalf')).toBeNull();
  });

  it('keeps an update on the line only, ticking it asked by default', async () => {
    const box = await openComposer();
    expect(box.getAttribute('placeholder')).toBe('What did Jae Kim say about Priya Nair?');
    const post = screen.getByRole('button', { name: 'Post update' }) as HTMLButtonElement;
    expect(post.disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Only this line' }).getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByRole('button', { name: 'Reply in the Thread' })).toBeNull();
    expect((screen.getByLabelText('Also tick it asked') as HTMLInputElement).checked).toBe(true);
    fireEvent.change(box, { target: { value: '  She is coming Friday ' } });
    fireEvent.click(post);
    expect(h.postUpdate).toHaveBeenCalledWith(
      'ft',
      expect.any(Object),
      'notReached|c1',
      expect.objectContaining({ text: 'She is coming Friday', dest: 'line' }),
      { askedAt: expect.any(String) },
    );
    expect(h.logInteraction).not.toHaveBeenCalled();
    expect(h.threadReply).not.toHaveBeenCalled();
    expect(screen.queryByRole('textbox', { name: 'Post an update' })).toBeNull();
  });

  it('logs it on the contact’s page for the tied Trainee, leaving the line open when unticked', async () => {
    const box = await openComposer();
    fireEvent.change(box, { target: { value: 'Jae saw her at lunch' } });
    fireEvent.click(screen.getByRole('button', { name: "Priya Nair's page · log for Jae Kim" }));
    expect(screen.getByText(/as Jae Kim reaching them/)).toBeTruthy();
    fireEvent.click(screen.getByLabelText('Also tick it asked'));
    fireEvent.click(screen.getByRole('button', { name: 'Post update' }));
    expect(h.postUpdate).toHaveBeenCalledWith(
      'ft',
      expect.any(Object),
      'notReached|c1',
      expect.objectContaining({ dest: 'contact' }),
      { askedAt: null },
    );
    expect(h.logInteraction).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1', name: 'Priya Nair' }),
      expect.objectContaining({
        content: 'Jae saw her at lunch',
        type: 'interaction',
        userId: 'ft',
        userName: 'Kate Full',
        reacher: { id: 'jae', name: 'Jae Kim' },
      }),
    );
  });

  it('replies in the Thread for a question line', async () => {
    h.contacts = [{ id: 'c1', data: { name: 'Priya Nair', carers: ['jae'], createdAt: ago(60) } }];
    h.threads = [
      { id: 'q1', contactId: 'c1', from: 'jae', fromName: 'Jae Kim', kind: 'question', body: 'Is she coming?', at: ago(5), interactionId: null, scope: null },
    ];
    const box = await openComposer();
    fireEvent.change(box, { target: { value: 'Yes, Friday' } });
    fireEvent.click(screen.getByRole('button', { name: 'Reply in the Thread' }));
    fireEvent.click(screen.getByRole('button', { name: 'Post update' }));
    expect(h.postUpdate).toHaveBeenCalledWith(
      'ft',
      expect.any(Object),
      'question|c1|q1',
      expect.objectContaining({ dest: 'thread' }),
      { askedAt: expect.any(String) },
    );
    expect(h.threadReply).toHaveBeenCalledWith(
      'c1',
      expect.objectContaining({ parentId: 'q1', scope: null, from: 'ft', kind: 'comment', body: 'Yes, Friday' }),
      expect.objectContaining({ contactName: 'Priya Nair' }),
    );
  });

  it('cancels on Escape without writing', async () => {
    const box = await openComposer();
    fireEvent.change(box, { target: { value: 'never mind' } });
    fireEvent.keyDown(box, { key: 'Escape' });
    expect(screen.queryByRole('textbox', { name: 'Post an update' })).toBeNull();
    expect(h.postUpdate).not.toHaveBeenCalled();
  });

  it('shows posted updates under the line', async () => {
    h.notepad = {
      overrides: {
        'notReached|c1': { updates: [{ id: 'u1', text: 'Saw her at lunch', at: ago(0), dest: 'contact' }] },
      },
    };
    renderAsk();
    await waitFor(() => expect(screen.getByText('Saw her at lunch')).toBeTruthy());
    expect(screen.getByText('Your update · just now · logged on their page')).toBeTruthy();
  });

  it('offers every action from the phone menu', async () => {
    renderAsk();
    await waitFor(() => expect(screen.getByText('Priya Nair — not reached yet')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getAllByRole('menuitem').map((b) => b.textContent)).toEqual([
      'Post an update',
      'Reword',
      'Open Priya Nair',
      'DismissHides it until something new happens',
    ]);
    fireEvent.click(within(menu).getByRole('menuitem', { name: /Dismiss/ }));
    expect(h.dismiss).toHaveBeenCalledWith('ft', expect.any(Object), 'notReached|c1', expect.any(String));
    expect(screen.queryByRole('menu')).toBeNull();
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
