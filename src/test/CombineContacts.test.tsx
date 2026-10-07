import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CombineContacts from '../views/CombineContacts';
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

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ __name: name })),
  query: vi.fn((q: unknown) => q),
  orderBy: vi.fn(),
  onSnapshot: vi.fn((q: { __name?: string }, cb: (snap: unknown) => void) => {
    if (q?.__name === 'combineRecords') {
      cb({ docs: combineRecords.map((r) => ({ id: r.id, data: () => r })) });
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
  getIdToken.mockResolvedValue('token');
  global.fetch = vi.fn().mockImplementation((_url: string, opts: { body: string }) => {
    const body = JSON.parse(opts.body);
    if (body.dryRun) {
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
    return Promise.resolve({ ok: true, json: async () => ({ success: true }) });
  }) as unknown as typeof fetch;
});

describe('CombineContacts page', () => {
  it('renders the Queue tab and a three-column diff for a detected pair', () => {
    render(<CombineContacts />);
    expect(screen.getByRole('tab', { name: /queue/i })).toBeInTheDocument();
    expect(screen.getAllByText('Alice Smith').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Alice Second').length).toBeGreaterThan(0);
    expect(screen.getByText(/Kept contact/i)).toBeInTheDocument();
    expect(screen.getByText(/Combined-in contact/i)).toBeInTheDocument();
    expect(screen.getByText(/Result/i)).toBeInTheDocument();
  });

  it('has no Combine all button', () => {
    render(<CombineContacts />);
    expect(screen.queryByRole('button', { name: /combine all/i })).not.toBeInTheDocument();
  });

  it('posts the pair to the server endpoint when Combine is clicked', async () => {
    render(<CombineContacts />);
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

  it('removes a pair when it is skipped', () => {
    render(<CombineContacts />);
    fireEvent.click(screen.getByRole('button', { name: /skip for now/i }));
    expect(screen.getByText(/No duplicate contacts found/i)).toBeInTheDocument();
  });

  it('lists combine records with who, when and the match reason in Recent combines', async () => {
    render(<CombineContacts />);
    fireEvent.click(screen.getByRole('tab', { name: /recent combines/i }));

    expect(await screen.findByText('Matching email')).toBeInTheDocument();
    expect(screen.getByText('Picked from the directory')).toBeInTheDocument();
    expect(screen.getAllByTestId('combine-record')).toHaveLength(2);
    expect(screen.getAllByText(/Faith/).length).toBeGreaterThan(0);
  });

  it('marks undone records as undone with who undid them', async () => {
    render(<CombineContacts />);
    fireEvent.click(screen.getByRole('tab', { name: /recent combines/i }));

    expect(await screen.findByText(/Undone by Grace/i)).toBeInTheDocument();
    // The still-done record offers an undo; the undone one does not.
    expect(screen.getAllByRole('button', { name: /undo combine/i })).toHaveLength(1);
  });

  it('shows the undo preview before the confirm button, then posts the undo', async () => {
    render(<CombineContacts />);
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
});
