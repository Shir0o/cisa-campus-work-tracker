import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Outreach, { otWhen } from '../views/Outreach';
import { useAuth } from '../components/AuthProvider';
import { canAccessRoute } from '../lib/permissions';

// ── seeded data ────────────────────────────────────────────────────────────
const DAY_MS = 86_400_000;
const isoDaysAgo = (n: number) => new Date(Date.now() - n * DAY_MS).toISOString().slice(0, 10);
const MS_AGO = (n: number) => Date.now() - n * DAY_MS;

const SEED_NAMES = [
  { id: 'ON-1', name: 'Duy Pham', contact: '+1 (614) 555-0101', spokeWith: 'u1', note: 'Wants a Bible in Vietnamese.', contactId: 'C-1', takenBy: null },
  { id: 'ON-2', name: 'Chloe Baptiste', contact: '+1 (614) 555-0102', spokeWith: 'u3', note: '', contactId: 'C-2', takenBy: null },
];
const SEED_OUTREACH = {
  date: isoDaysAgo(5),
  where: 'Cedar Park — the north lawn',
  went: ['u1', 'u3'],
  others: 8,
  handed: { bibles: 34, tracts: 120, booklets: 26 },
  how: 'Warm afternoon.',
  photoCount: 0,
  names: SEED_NAMES,
};
const SEED_CONTACTS = [
  { id: 'C-1', name: 'Duy Pham', initials: 'DP', stage: 'Lead' },
  { id: 'C-2', name: 'Chloe Baptiste', initials: 'CB', stage: 'Lead' },
];
const SEED_USERS = [
  { id: 'u1', displayName: 'Tony Wang', role: 'admin', approved: true, email: 'tony@example.com' },
  { id: 'u3', displayName: 'Ana Reyes', role: 'manager', approved: true, email: 'ana@example.com' },
];
// A touch on C-1 the day after the outing — Duy has been reached, Chloe hasn't.
const SEED_TOUCHES = [
  { id: 'i1', content: 'Rang him', createdAt: new Date(MS_AGO(4)).toISOString(), refPath: 'contacts/C-1/interactions/i1' },
];

vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

// The default onSnapshot routing — re-applied in beforeEach so tests that
// override it (the empty-state one) don't leak into the tests after them.
// Defined via vi.hoisted because the vi.mock factory below can't reference
// top-level consts (mocks are hoisted above them).
const { defaultOnSnapshot } = vi.hoisted(() => ({
  defaultOnSnapshot: ((ref: { path?: string }, callback: (s: unknown) => void) => {
    const path = ref?.path ?? '';
    if (path === 'outreach') callback({ docs: [SEED_OUTREACH].map((d) => ({ id: 'OT-1', data: () => d, ref: { path: 'outreach/OT-1' } })), size: 1, empty: false });
    else if (path === 'contacts') callback({ docs: SEED_CONTACTS.map((d) => ({ id: d.id, data: () => d, ref: { path: `contacts/${d.id}` } })), size: SEED_CONTACTS.length, empty: false });
    else if (path === 'users') callback({ docs: SEED_USERS.map((d) => ({ id: d.id, data: () => d, ref: { path: `users/${d.id}` } })), size: SEED_USERS.length, empty: false });
    else if (path === 'interactions') callback({ docs: SEED_TOUCHES.map((d) => ({ id: d.id, data: () => d, ref: { path: d.refPath } })), size: SEED_TOUCHES.length, empty: false });
    else callback({ docs: [], size: 0, empty: true });
    return () => {};
  }) as never,
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, path) => ({ path })),
  collectionGroup: vi.fn((_db, path) => ({ path })),
  query: vi.fn((ref) => ref),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(defaultOnSnapshot),
  updateDoc: vi.fn(() => Promise.resolve()),
  addDoc: vi.fn(() => Promise.resolve({ id: 'new-outreach-id' })),
  deleteDoc: vi.fn(() => Promise.resolve()),
  doc: vi.fn((_db, path, id) => ({ path, id: id ?? 'auto-name-id' })),
  getDocs: vi.fn(() => Promise.resolve({ empty: true, docs: [] })),
  serverTimestamp: vi.fn(() => 'mock-timestamp'),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', UPDATE: 'UPDATE', CREATE: 'CREATE', DELETE: 'DELETE' },
  logActivity: vi.fn(),
}));

vi.mock('../lib/todos', () => ({
  addTodo: vi.fn(() => Promise.resolve('todo-1')),
}));

vi.mock('../lib/threads', () => ({
  addThreadMessage: vi.fn(() => Promise.resolve()),
  subscribeAllThreads: vi.fn((cb) => {
    cb([]);
    return () => {};
  }),
}));

vi.mock('../components/modals/ContactDetailsModal', () => ({
  default: () => null,
}));

import { addTodo } from '../lib/todos';
import { addThreadMessage } from '../lib/threads';
import { logActivity } from '../lib/firebase';
import { addDoc, deleteDoc, onSnapshot, updateDoc } from 'firebase/firestore';

const asRole = (role: string, uid = 'u1') =>
  vi.mocked(useAuth).mockReturnValue({ user: { uid, displayName: uid === 'u1' ? 'Tony Wang' : 'Community Member' }, role } as never);

describe('Outreach', () => {
  beforeEach(() => {
    asRole('admin');
    vi.mocked(onSnapshot).mockImplementation(defaultOnSnapshot);
    vi.clearAllMocks();
  });

  it('renders the header, pending queue and figures', async () => {
    render(<Outreach />);
    expect(screen.getByText('Gospel')).toBeTruthy();
    // Chloe has no touch since the outing → still waiting, in the queue.
    expect(await screen.findByText('Chloe Baptiste')).toBeTruthy();
    expect(screen.getByText(/5 days waiting/)).toBeTruthy();
    // Duy was rung the day after → reached, so he is NOT in the pending queue.
    expect(screen.queryByText('Duy Pham')).toBeNull();
    // Expand the outing card to read the names back, reached and all.
    fireEvent.click(screen.getByText('Cedar Park — the north lawn'));
    expect(await screen.findByText('Duy Pham')).toBeTruthy();
    expect(screen.getByText('1 reached')).toBeTruthy();
    // Figures.
    expect(screen.getByText('months out')).toBeTruthy();
    expect(screen.getAllByText('34').length).toBeGreaterThan(0); // Bibles into hands
  });

  it("take claims a name and drops the ring-todo", async () => {
    render(<Outreach />);
    const button = await screen.findByRole('button', { name: "I'll take this" });
    fireEvent.click(button);
    await waitFor(() => expect(updateDoc).toHaveBeenCalled());
    await waitFor(() => expect(addTodo).toHaveBeenCalled());
    const todoCall = vi.mocked(addTodo).mock.calls[0][0];
    expect(todoCall.title).toContain('Ring Chloe');
    expect(todoCall.assigneeId).toBe('u1');
  });

  it('nudge reminds whoever spoke with them via a thread message', async () => {
    render(<Outreach />);
    const remind = await screen.findByRole('button', { name: 'Remind Ana' });
    fireEvent.click(remind);
    await waitFor(() => expect(addThreadMessage).toHaveBeenCalled());
    const call = vi.mocked(addThreadMessage).mock.calls[0];
    expect(call[0]).toBe('C-2'); // Chloe's contact
    expect(call[1].kind).toBe('nudge');
    expect(call[2]?.to).toBe('u3'); // Ana was the one who spoke with her
  });

  it('logs an outreach: every filled name becomes a contact + a ring-todo', async () => {
    render(<Outreach />);
    fireEvent.click(await screen.findByRole('button', { name: 'Log a gospel outing' }));
    fireEvent.change(await screen.findByPlaceholderText('e.g. Cedar Park — the north lawn'), { target: { value: 'Boardwalk' } });
    fireEvent.change(screen.getByPlaceholderText('Their name'), { target: { value: 'Nadia Halim' } });
    fireEvent.change(screen.getByPlaceholderText('Number or email'), { target: { value: '+1 (555) 0109' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log the outing' }));

    await waitFor(() => expect(addDoc).toHaveBeenCalledTimes(2)); // the contact, then the outreach
    const contactDoc = vi.mocked(addDoc).mock.calls[0][1] as Record<string, unknown>;
    expect(contactDoc.name).toBe('Nadia Halim');
    expect(contactDoc.phone).toBe('+1 (555) 0109');
    expect((contactDoc.tags as string[]).includes('outreach')).toBe(true);
    const outreachDoc = vi.mocked(addDoc).mock.calls[1][1] as { where: string; names: { name: string }[] };
    expect(outreachDoc.where).toBe('Boardwalk');
    expect(outreachDoc.names[0].name).toBe('Nadia Halim');
    await waitFor(() => expect(addTodo).toHaveBeenCalled());
    expect(vi.mocked(addTodo).mock.calls[0][0].title).toContain('Ring Nadia');
    expect(logActivity).toHaveBeenCalled();
  });

  it('a community logger creates the contact but not the auto-todo', async () => {
    asRole('viewer', 'v9');
    render(<Outreach />);
    fireEvent.click(await screen.findByRole('button', { name: 'Log a gospel outing' }));
    fireEvent.change(await screen.findByPlaceholderText('e.g. Cedar Park — the north lawn'), { target: { value: 'Riverside' } });
    fireEvent.change(screen.getByPlaceholderText('Their name'), { target: { value: 'Sam Ortiz' } });
    fireEvent.click(screen.getByRole('button', { name: 'Log the outing' }));
    await waitFor(() => expect(addDoc).toHaveBeenCalled());
    expect(addTodo).not.toHaveBeenCalled();
  });

  it('edits an outing without touching its names', async () => {
    render(<Outreach />);
    fireEvent.click(screen.getByText('Cedar Park — the north lawn'));
    fireEvent.click(await screen.findByText('Edit this one'));
    const where = await screen.findByPlaceholderText('e.g. Cedar Park — the north lawn');
    fireEvent.change(where, { target: { value: 'Cedar Park — by the bandstand' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(updateDoc).toHaveBeenCalled());
    const patch = vi.mocked(updateDoc).mock.calls[0][1] as unknown as { where: string; names?: unknown };
    expect(patch.where).toBe('Cedar Park — by the bandstand');
    expect(patch.names).toBeUndefined(); // names are the record's whole point — never edited
    expect(logActivity).toHaveBeenCalled();
  });

  it('keeps the Remove confirm when a fresh snapshot lands', async () => {
    // The list is a module-level component: while it was declared inside the
    // page, every parent re-render remounted every card, so the two-tap Remove
    // silently dropped back to its first step as soon as Firestore pushed.
    let emitOutreach: ((snap: unknown) => void) | null = null;
    vi.mocked(onSnapshot).mockImplementation(((ref: { path?: string }, callback: (s: unknown) => void, onError?: unknown) => {
      if ((ref?.path ?? '') === 'outreach') emitOutreach = callback;
      return (defaultOnSnapshot as unknown as (r: unknown, c: unknown, e: unknown) => () => void)(ref, callback, onError);
    }) as never);

    render(<Outreach />);
    const opened = await screen.findByRole('button', { name: /Cedar Park — the north lawn/ });
    fireEvent.click(opened);
    fireEvent.click(await screen.findByText('Remove'));
    expect(screen.getByText('Remove it from the record?')).toBeTruthy();
    const card = opened.closest('article')!;

    await act(async () => {
      emitOutreach!({
        docs: [{ id: 'OT-1', data: () => SEED_OUTREACH, ref: { path: 'outreach/OT-1' } }],
        size: 1,
        empty: false,
      });
    });

    // Same card node, still armed — nothing was torn down and rebuilt.
    expect(screen.getByText('Remove it from the record?')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Cedar Park — the north lawn/ }).closest('article')).toBe(card);
  });

  it('removes an outing after the two-tap confirm', async () => {
    render(<Outreach />);
    fireEvent.click(screen.getByText('Cedar Park — the north lawn'));
    fireEvent.click(await screen.findByText('Remove'));
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
    await waitFor(() => expect(deleteDoc).toHaveBeenCalled());
    expect(logActivity).toHaveBeenCalled();
  });

  it('community sees the page read-mostly: no take, remind, edit or remove', async () => {
    asRole('viewer', 'v9');
    render(<Outreach />);
    // The queue still shows Chloe, and she can open her — but not take her.
    expect(await screen.findByText('Chloe Baptiste')).toBeTruthy();
    expect(screen.queryByRole('button', { name: "I'll take this" })).toBeNull();
    expect(screen.queryByRole('button', { name: /Remind/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open' })).toBeTruthy();
    // Cards read, but no manage row.
    fireEvent.click(screen.getByText('Cedar Park — the north lawn'));
    expect(await screen.findByText('Duy Pham')).toBeTruthy();
    expect(screen.queryByText('Edit this one')).toBeNull();
    expect(screen.queryByText('Remove')).toBeNull();
  });

  it('renders one CTA, and no zeroed figures, when nothing has been logged (#1845)', async () => {
    vi.mocked(onSnapshot).mockImplementation(((ref: { path?: string }, callback: (s: unknown) => void) => {
      const path = ref?.path ?? '';
      callback({
        docs: path === 'outreach' ? [] : [{ id: 'x', data: () => ({}), ref: { path } }],
        size: 0,
        empty: true,
      });
      return () => {};
    }) as never);
    render(<Outreach />);

    // One primary action — the header's. The empty panel used to repeat it, so
    // two identical buttons sat above the fold.
    expect(await screen.findAllByRole('button', { name: 'Log a gospel outing' })).toHaveLength(1);
    // The header sentence stands alone; the panel carries the how instead.
    expect(screen.getAllByText(/Nothing written down yet/)).toHaveLength(1);
    expect(screen.getByText(/asks for six short things/)).toBeTruthy();
    expect(screen.getByText(/Who left us their number/)).toBeTruthy();
    // Three zeroes teach a first-time reader nothing: no figures until a record.
    expect(screen.queryByText('months out')).toBeNull();
    expect(screen.queryByText('Bibles into hands')).toBeNull();
    expect(screen.queryByText(/Counted only so nobody waits/)).toBeNull();
  });

  it('counts the figures as soon as a first record exists (#1845)', async () => {
    render(<Outreach />);
    expect(await screen.findByText('months out')).toBeTruthy();
    expect(screen.getByText('Bibles into hands')).toBeTruthy();
    expect(screen.getByText(/Counted only so nobody waits/)).toBeTruthy();
  });

  it('gives the queue a person, not a pair of question marks', async () => {
    render(<Outreach />);
    // The row's face is the person's initials — "??" is what the avatar shows
    // for a name the app does not know, and every name here is known.
    expect((await screen.findByTitle('Chloe Baptiste')).textContent).toBe('CB');
  });

  it('counts who is still waiting without claiming they all left a number', async () => {
    const names = [
      ...SEED_NAMES,
      { id: 'ON-3', name: 'Nadia Halim', contact: '', spokeWith: 'u1', note: '', contactId: 'C-3', takenBy: null },
    ];
    vi.mocked(onSnapshot).mockImplementation(((ref: { path?: string }, callback: (s: unknown) => void) => {
      if ((ref?.path ?? '') === 'outreach') {
        callback({ docs: [{ id: 'OT-1', data: () => ({ ...SEED_OUTREACH, names }), ref: { path: 'outreach/OT-1' } }], size: 1, empty: false });
        return () => {};
      }
      return (defaultOnSnapshot as unknown as (ref: unknown, callback: unknown) => () => void)(ref, callback);
    }) as never);
    render(<Outreach />);
    // Nadia never left a number, so two people are waiting but only one can be
    // rung — the header must not say "2 people left us a number".
    const header = (await screen.findByText(/still haven't heard back yet/)).closest('p');
    expect(header?.textContent).toMatch(/2 people still haven't heard back yet/);
    expect(header?.textContent).not.toMatch(/left us a number/);
  });

  it('announces whether an outing is expanded', async () => {
    render(<Outreach />);
    const toggle = await screen.findByRole('button', { name: /Cedar Park — the north lawn/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(screen.getByRole('button', { name: /Cedar Park — the north lawn/ }).getAttribute('aria-expanded')).toBe('true');
  });

  it('opens the log sheet as a dialog that Escape closes', async () => {
    render(<Outreach />);
    fireEvent.click(await screen.findByRole('button', { name: 'Log a gospel outing' }));
    const dialog = await screen.findByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    // The "who spoke with them" select had no accessible name at all.
    expect(screen.getByLabelText('Who spoke with them')).toBeTruthy();
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });

  it('exposes the who-went chips as pressed or not', async () => {
    render(<Outreach />);
    fireEvent.click(await screen.findByRole('button', { name: 'Log a gospel outing' }));
    expect((await screen.findByRole('button', { name: 'Tony Wang' })).getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Ana Reyes' }).getAttribute('aria-pressed')).toBe('false');
  });

  it('formats a date in the reader’s language', () => {
    const iso = '2026-08-14';
    const inSpanish = otWhen(iso, (_k, fallback) => fallback ?? _k, 'es');
    const expected = new Intl.DateTimeFormat('es', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
      new Date(iso + 'T12:00:00Z'),
    );
    expect(inSpanish).toBe(expected);
    expect(otWhen(iso, (_k, fallback) => fallback ?? _k, 'en')).toBe('Aug 14');
  });

  it('is full-timer + community — trainees and students are locked out', () => {
    expect(canAccessRoute('admin', '/outreach')).toBe(true);
    expect(canAccessRoute('viewer', '/outreach')).toBe(true);
    for (const role of ['manager', 'operator']) {
      expect(canAccessRoute(role, '/outreach')).toBe(false);
    }
  });
});
