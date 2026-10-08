import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import CombineContacts from '../views/CombineContacts';
import { setDoc, deleteDoc } from 'firebase/firestore';
import type { Contact } from '../types';

const contacts: Contact[] = [
  {
    id: 'c1',
    name: 'Alice Smith',
    email: 'alice@example.com',
    phone: '',
    stage: 'Lead',
    location: 'Dorm A',
    lastSeen: '',
    initials: 'AS',
    createdAt: '2026-01-01T00:00:00.000Z',
    notes: 'first note',
  },
  {
    id: 'c2',
    name: 'Alice Second',
    email: 'alice@example.com',
    phone: '',
    stage: 'Contact',
    location: '',
    lastSeen: '',
    initials: 'AS',
    createdAt: '2026-02-01T00:00:00.000Z',
    notes: 'second note',
  },
  {
    id: 'c3',
    name: 'Bob Jones',
    email: 'bob@example.com',
    phone: '',
    stage: 'Contact',
    location: '',
    lastSeen: '',
    initials: 'BJ',
    createdAt: '2026-03-01T00:00:00.000Z',
  },
  {
    id: 'c4',
    name: 'Bobby Jones',
    email: 'bobby@example.com',
    phone: '',
    stage: 'Contact',
    location: '',
    lastSeen: '',
    initials: 'BJ',
    createdAt: '2026-04-01T00:00:00.000Z',
  },
];

const combineRecords = [
  {
    id: 'r1',
    keptId: 'c1',
    combinedInId: 'c2',
    reason: 'Matching email',
    status: 'done',
    combinedByName: 'Faith',
    combinedAt: '2026-03-01T00:00:00.000Z',
    keptBefore: { name: 'Alice Smith' },
    combinedInBefore: { name: 'Alice Second' },
  },
  {
    id: 'r0',
    keptId: 'c3',
    combinedInId: 'c4',
    reason: 'Picked from the directory',
    status: 'undone',
    combinedByName: 'Faith',
    combinedAt: '2026-02-01T00:00:00.000Z',
    undoneByName: 'Grace',
    undoneAt: '2026-02-02T00:00:00.000Z',
    keptBefore: { name: 'Bob Jones' },
    combinedInBefore: { name: 'Bobby Jones' },
  },
];

vi.mock('../components/LanguageProvider', () => ({
  useLanguage: () => ({ t: (_key: string, fallback?: string) => fallback || _key, language: 'en' }),
}));

vi.mock('../components/AuthProvider', () => ({
  useAuth: () => ({ effectiveUserId: 'admin1', effectiveUserName: 'Faith' }),
}));

const h = vi.hoisted(() => ({
  marks: [] as { id: string; contactIds: string[]; markedBy: string; markedByName: string; markedAt: string }[],
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ __name: name })),
  query: vi.fn((q: unknown) => q),
  orderBy: vi.fn(),
  where: vi.fn(() => ({})),
  getCountFromServer: vi.fn(async () => ({ data: () => ({ count: 0 }) })),
  doc: vi.fn((_db: unknown, col: string, id: string) => ({ __col: col, id })),
  setDoc: vi.fn(async () => {}),
  deleteDoc: vi.fn(async () => {}),
  serverTimestamp: vi.fn(() => 'ts'),
  onSnapshot: vi.fn((q: { __name?: string }, cb: (snap: unknown) => void) => {
    if (q?.__name === 'combineRecords') {
      cb({ docs: combineRecords.map((r) => ({ id: r.id, data: () => r })) });
      return () => {};
    }
    if (q?.__name === 'notSamePersonMarks') {
      cb({ docs: h.marks.map((m) => ({ id: m.id, data: () => m })) });
      return () => {};
    }
    cb({ docs: contacts.map((c) => ({ id: c.id, data: () => c })) });
    return () => {};
  }),
}));

const getIdToken = vi.fn().mockResolvedValue('token');
vi.mock('../lib/firebase', () => ({
  db: {},
  auth: { currentUser: { getIdToken: () => getIdToken() } },
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST' },
}));

beforeEach(() => {
  vi.clearAllMocks();
  h.marks = [];
  getIdToken.mockResolvedValue('token');
  global.fetch = vi.fn().mockImplementation((_url: string, opts: { body: string }) => {
    const body = JSON.parse(opts.body);
    if (body.dryRun) {
      if (body.combineRecordId) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            dryRun: true,
            preview: {
              goesBack: [{ kind: 'interactions', id: 'i1', label: 'hi' }],
              stays: [{ kind: 'interactions', id: 'new1', label: 'later' }],
              notRestored: [{ kind: 'field', label: 'email' }],
            },
          }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          success: true,
          dryRun: true,
          moves: [
            { kind: 'interactions', count: 2, items: [{ id: 'i1', label: 'hi' }, { id: 'i2', label: 'again' }] },
            { kind: 'gatherings', count: 1, items: [{ id: 'e1', label: 'Friday Gathering' }] },
            { kind: 'homes', count: 0, items: [] },
          ],
        }),
      });
    }
    return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
  }) as unknown as typeof fetch;
});

describe('CombineContacts page', () => {
  const renderPage = (entries: string[] = ['/directory/combine-contacts']) =>
    render(
      <MemoryRouter initialEntries={entries}>
        <CombineContacts />
      </MemoryRouter>,
    );

  it('renders in the shared popup frame (#1452)', () => {
    renderPage();
    expect(screen.getByRole('dialog', { name: 'Combine contacts' })).toBeInTheDocument();
  });

  it('renders the Queue tab and a three-column diff for a detected pair', () => {
    renderPage();
    expect(screen.getByRole('tab', { name: /queue/i })).toBeInTheDocument();
    expect(screen.getAllByText('Alice Smith').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Alice Second').length).toBeGreaterThan(0);
    expect(screen.getByText(/Kept contact/i)).toBeInTheDocument();
    expect(screen.getByText(/Combined-in contact/i)).toBeInTheDocument();
    expect(screen.getByText(/Result/i)).toBeInTheDocument();
  });

  it('has no Combine all button', () => {
    renderPage();
    expect(screen.queryByRole('button', { name: /combine all/i })).not.toBeInTheDocument();
  });

  it('posts the pair to the server endpoint when Combine is clicked', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /^combine$/i }));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/combine-contacts',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(body).toMatchObject({ keptId: 'c1', combinedInId: 'c2' });
  });

  it('changes the result column when a pick is chosen and sends it with the stamps', async () => {
    renderPage();
    const pick = await screen.findByTestId('pick-name');
    const row = pick.closest('tr') as HTMLTableRowElement;
    fireEvent.change(pick, { target: { value: 'combined-in' } });
    expect(row.querySelectorAll('td')[3].textContent).toBe('Alice Second');

    fireEvent.click(screen.getByRole('button', { name: /^combine$/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(body.picks).toEqual({ fields: { name: 'combined-in' } });
    expect(body).toHaveProperty('keptUpdatedAt');
    expect(body).toHaveProperty('combinedInUpdatedAt');
  });

  it('offers Kept, Combined-in or Both for notes', async () => {
    renderPage();
    const notes = await screen.findByTestId('pick-notes');
    const row = notes.closest('tr') as HTMLTableRowElement;
    expect(row.querySelectorAll('td')[3].textContent).toContain('second note');

    fireEvent.change(notes, { target: { value: 'kept' } });
    expect(row.querySelectorAll('td')[3].textContent).toBe('first note');
  });

  it('flips which contact is kept when swapped', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /swap/i }));
    fireEvent.click(screen.getByRole('button', { name: /^combine$/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(body).toMatchObject({ keptId: 'c2', combinedInId: 'c1' });
  });

  it('shows a conflict message when the server refuses a stale preview', async () => {
    (global.fetch as any).mockImplementationOnce(() =>
      Promise.resolve({
        ok: false,
        json: async () => ({ success: false, conflict: true, error: 'Contacts changed. Rebuild.' }),
      }),
    );
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /^combine$/i }));
    expect(await screen.findByText('Contacts changed. Rebuild.')).toBeInTheDocument();
  });

  it('shows the What moves groups with counts that expand to the items', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /what moves/i }));

    const section = await screen.findByTestId('what-moves');
    expect(within(section).getByText(/Interactions/)).toBeInTheDocument();
    expect(within(section).getByText(/\(2\)/)).toBeInTheDocument();
    expect(within(section).getByText('Friday Gathering')).toBeInTheDocument();
    // Groups that would move nothing are not shown.
    expect(within(section).queryByText(/Home members/)).not.toBeInTheDocument();
  });

  it('removes a pair when it is skipped', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    expect(screen.getByText(/No duplicate contacts found/i)).toBeInTheDocument();
  });

  it('Skip for now keeps the pair hidden only until the page is reopened', () => {
    const { unmount } = renderPage();
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    expect(screen.getByText(/No duplicate contacts found/i)).toBeInTheDocument();
    unmount();

    renderPage();
    expect(screen.getByTestId('combine-pair')).toBeInTheDocument();
  });

  it('marks a pair Not the same person, removing it from the Queue for everyone', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /not the same person/i }));

    await waitFor(() => expect(setDoc).toHaveBeenCalled());
    const [ref, data] = (setDoc as unknown as { mock: { calls: [unknown, Record<string, unknown>][] } })
      .mock.calls[0];
    expect(ref).toEqual({ __col: 'notSamePersonMarks', id: 'c1|c2' });
    expect(data).toMatchObject({
      contactIds: ['c1', 'c2'],
      markedBy: 'admin1',
      markedByName: 'Faith',
    });
    expect(await screen.findByText(/No duplicate contacts found/i)).toBeInTheDocument();
  });

  it('lists Not the same person marks with who and when, and removing one brings the pair back', async () => {
    h.marks = [
      {
        id: 'c1|c2',
        contactIds: ['c1', 'c2'],
        markedBy: 'admin1',
        markedByName: 'Faith',
        markedAt: '2026-03-05T00:00:00.000Z',
      },
    ];
    renderPage();
    // The marked pair is no longer suggested.
    expect(screen.getByText(/No duplicate contacts found/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /not the same person/i }));
    const markRow = await screen.findByTestId('not-same-mark');
    expect(within(markRow).getByText(/Faith/)).toBeInTheDocument();
    expect(within(markRow).getByText(/Alice Smith/)).toBeInTheDocument();

    fireEvent.click(within(markRow).getByRole('button', { name: /remove mark/i }));
    await waitFor(() => expect(deleteDoc).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('tab', { name: /queue/i }));
    expect(await screen.findByTestId('combine-pair')).toBeInTheDocument();
  });

  it('keeps the pair and shows an error when the mark cannot be saved', async () => {
    (setDoc as unknown as { mockRejectedValueOnce: (e: Error) => void }).mockRejectedValueOnce(
      new Error('denied'),
    );
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: /not the same person/i }));

    expect(await screen.findByText('denied')).toBeInTheDocument();
    expect(screen.getByTestId('combine-pair')).toBeInTheDocument();
  });

  it('shows an error when removing a mark fails', async () => {
    h.marks = [
      {
        id: 'c1|c2',
        contactIds: ['c1', 'c2'],
        markedBy: 'admin1',
        markedByName: 'Faith',
        markedAt: '2026-03-05T00:00:00.000Z',
      },
    ];
    (deleteDoc as unknown as { mockRejectedValueOnce: (e: Error) => void }).mockRejectedValueOnce(
      new Error('denied'),
    );
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /not the same person/i }));
    const markRow = await screen.findByTestId('not-same-mark');
    fireEvent.click(within(markRow).getByRole('button', { name: /remove mark/i }));

    expect(await screen.findByText('denied')).toBeInTheDocument();
    expect(screen.getByTestId('not-same-mark')).toBeInTheDocument();
  });

  it('lists combine records with who, when and the match reason in Recent combines', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /recent combines/i }));

    expect(await screen.findByText('Matching email')).toBeInTheDocument();
    expect(screen.getByText('Picked from the directory')).toBeInTheDocument();
    expect(screen.getAllByTestId('combine-record')).toHaveLength(2);
    expect(screen.getAllByText(/Faith/).length).toBeGreaterThan(0);
  });

  it('marks undone records as undone with who undid them', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /recent combines/i }));

    expect(await screen.findByText(/Undone by Grace/i)).toBeInTheDocument();
    // The still-done record offers an undo; the undone one does not.
    expect(screen.getAllByRole('button', { name: /undo combine/i })).toHaveLength(1);
  });

  it('shows the undo preview before the confirm button, then posts the undo', async () => {
    renderPage();
    fireEvent.click(screen.getByRole('tab', { name: /recent combines/i }));
    fireEvent.click(await screen.findByRole('button', { name: /undo combine/i }));

    const preview = await screen.findByTestId('undo-preview');
    expect(within(preview).getByText('hi')).toBeInTheDocument();
    expect(within(preview).getByText('later')).toBeInTheDocument();
    expect(within(preview).getByText('email')).toBeInTheDocument();
    expect(within(preview).getByText(/goes back/i)).toBeInTheDocument();
    expect(within(preview).getByText(/stays/i)).toBeInTheDocument();
    expect(within(preview).getByText(/not restored/i)).toBeInTheDocument();

    // The first call is the dry run that populated the preview.
    const dryRunBody = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(dryRunBody).toEqual({ combineRecordId: 'r1', dryRun: true });

    fireEvent.click(within(preview).getByRole('button', { name: /confirm undo/i }));
    await waitFor(() => {
      expect(JSON.parse((global.fetch as any).mock.calls[1][1].body)).toEqual({
        combineRecordId: 'r1',
        dryRun: false,
      });
    });
  });

  // #1433: a Full-timer picks any two contacts from the directory and combines
  // them through the same review, without a match reason.
  it('opens the review for two contacts picked from the directory (#1433)', async () => {
    renderPage(['/directory/combine-contacts?kept=c3&combinedIn=c4']);

    const pairs = await screen.findAllByTestId('combine-pair');
    const pair = pairs[0];
    expect(within(pair).getAllByText('Bob Jones').length).toBeGreaterThan(0);
    expect(within(pair).getAllByText('Bobby Jones').length).toBeGreaterThan(0);
    expect(within(pair).getByText('Picked from the directory')).toBeInTheDocument();
  });

  it('records a directory-picked combine as picked from the directory (#1433)', async () => {
    renderPage(['/directory/combine-contacts?kept=c3&combinedIn=c4']);

    const pairs = await screen.findAllByTestId('combine-pair');
    fireEvent.click(within(pairs[0]).getByRole('button', { name: /^combine$/i }));

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const body = JSON.parse((global.fetch as any).mock.calls[0][1].body);
    expect(body).toMatchObject({
      keptId: 'c3',
      combinedInId: 'c4',
      reason: 'Picked from the directory',
    });
  });

  it('ignores a picked pair whose ids are missing from the directory (#1433)', async () => {
    renderPage(['/directory/combine-contacts?kept=c3&combinedIn=missing']);

    await waitFor(() => expect(screen.getByTestId('combine-pair')).toBeInTheDocument());
    expect(screen.getAllByTestId('combine-pair')).toHaveLength(1);
  });
});
