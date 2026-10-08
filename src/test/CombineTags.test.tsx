import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CombineTags from '../views/CombineTags';
import type { Contact } from '../types';

const defaultContacts: Contact[] = [
  { id: 'c1', name: 'Alice', tags: ['BFA table', 'BFA'] } as Contact,
  { id: 'c2', name: 'Bob', tags: ['bfa-table'] } as Contact,
  { id: 'c3', name: 'Cara', tags: ['intersted'] } as Contact,
  { id: 'c4', name: 'Dan', tags: ['Prayer walk table'] } as Contact,
  { id: 'c5', name: 'Eve', tags: ['Prayer walk'] } as Contact,
];

const h = vi.hoisted(() => ({
  contacts: [] as { id: string; data: () => unknown }[],
  records: [] as { id: string; data: () => unknown }[],
  setDoc: vi.fn(),
}));

vi.mock('../components/LanguageProvider', () => ({
  useLanguage: () => ({ t: (_key: string, fallback?: string) => fallback || _key, language: 'en' }),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ __name: name })),
  doc: vi.fn(() => ({})),
  query: vi.fn((q: unknown) => q),
  orderBy: vi.fn(),
  setDoc: h.setDoc,
  onSnapshot: vi.fn((q: { __name?: string }, cb: (snapshot: unknown) => void) => {
    cb({ docs: q?.__name === 'combineRecords' ? h.records : h.contacts });
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

const jsonResponse = (body: unknown, ok = true) => ({
  ok,
  json: async () => body,
});

const setContacts = (list: Contact[]) => {
  h.contacts = list.map((contact) => ({ id: contact.id, data: () => contact }));
};

describe('CombineTags', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setContacts(defaultContacts);
    h.records = [];
    getIdToken.mockResolvedValue('token');
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ success: true, changedCount: 2 }));
  });

  it('starts strong guesses checked and weak guesses unchecked', () => {
    render(<CombineTags />);

    const strong = within(screen.getByTestId('strong-guesses'));
    expect(strong.getAllByRole('checkbox')[0]).toBeChecked();

    const weak = within(screen.getByTestId('weak-guesses'));
    expect(
      weak.getAllByRole('checkbox').every((box) => !(box as HTMLInputElement).checked),
    ).toBe(true);
  });

  it('offers Prayer walk table → Prayer walk and intersted → Interested as weak guesses', () => {
    render(<CombineTags />);
    const prayer = within(screen.getByTestId('tag-guess-guess-prayer-walk-weak'));
    expect(prayer.getAllByText('Prayer walk table').length).toBeGreaterThan(0);
    expect((prayer.getByRole('combobox') as HTMLInputElement).value).toBe('Prayer walk');
    const interested = within(screen.getByTestId('tag-guess-guess-interested-weak'));
    expect(interested.getAllByText('intersted').length).toBeGreaterThan(0);
  });

  it('updates the count and the result when a variant is removed', () => {
    render(<CombineTags />);

    expect(screen.getByRole('button', { name: /Combine 2 contacts/i })).toBeEnabled();

    fireEvent.click(screen.getByTestId('remove-variant-guess-bfa-strong-bfa-table'));

    expect(screen.getByRole('button', { name: /Combine 1 contact/i })).toBeEnabled();
    // Bob only had bfa-table, so his row disappears from the preview.
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('updates the result when a guess target is changed', () => {
    render(<CombineTags />);

    const interested = within(screen.getByTestId('tag-guess-guess-interested-weak'));
    fireEvent.click(interested.getByRole('checkbox'));
    fireEvent.change(interested.getByRole('combobox'), { target: { value: 'Open' } });

    const row = screen.getByText('Cara').closest('div')!;
    expect(within(row).getByText(/Open/)).toBeInTheDocument();
  });

  it('applies the enabled combines through the server', async () => {
    render(<CombineTags />);

    fireEvent.click(screen.getByRole('button', { name: /Combine 2 contacts/i }));

    await waitFor(() => expect(screen.getByTestId('tag-combine-applied')).toBeInTheDocument());

    const [url, options] = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/combine-tags');
    expect(options.headers.Authorization).toBe('Bearer token');
    expect(JSON.parse(options.body)).toEqual({
      combines: [{ variants: ['BFA table', 'bfa-table'], target: 'BFA' }],
    });
  });

  it('shows the server error message when applying fails', async () => {
    global.fetch = vi.fn().mockResolvedValue(jsonResponse({ error: 'Forbidden' }, false));
    render(<CombineTags />);

    fireEvent.click(screen.getByRole('button', { name: /Combine 2 contacts/i }));

    await waitFor(() => expect(screen.getByText('Forbidden')).toBeInTheDocument());
  });

  it('shows an empty state when there are no guesses', () => {
    setContacts([{ id: 'q1', name: 'Quiet', tags: ['Saved'] } as Contact]);
    render(<CombineTags />);
    expect(screen.getByText('No tag combines found')).toBeInTheDocument();
  });

  describe('standard tags panel (#1437)', () => {
    it('renders the seed list before the stored list loads', () => {
      render(<CombineTags />);
      const panel = within(screen.getByTestId('standard-tags-panel'));
      expect(panel.getByTestId('standard-tag-Saved')).toBeInTheDocument();
      expect(panel.getByTestId('standard-tag-BFA')).toBeInTheDocument();
    });

    it('adds a standard tag and persists only the list', () => {
      render(<CombineTags />);
      const panel = within(screen.getByTestId('standard-tags-panel'));

      fireEvent.change(panel.getByLabelText('Add a standard tag'), {
        target: { value: 'Welcome' },
      });
      fireEvent.click(panel.getByRole('button', { name: 'Add' }));

      expect(panel.getByTestId('standard-tag-Welcome')).toBeInTheDocument();
      // Only the standard-tags document is written — never a contact.
      expect(h.setDoc).toHaveBeenCalledTimes(1);
      expect(h.setDoc).toHaveBeenCalledWith(expect.anything(), {
        tags: ['Saved', 'Baptized', 'Interested', 'Open', 'Club Rush', 'BFA', 'Welcome'],
      });
    });

    it('uses a newly added standard tag as a preferred guess target', () => {
      setContacts([{ id: 'c1', name: 'Ada', tags: ['Welcome table'] } as Contact]);
      render(<CombineTags />);
      expect(screen.getByText('No tag combines found')).toBeInTheDocument();

      const panel = within(screen.getByTestId('standard-tags-panel'));
      fireEvent.change(panel.getByLabelText('Add a standard tag'), {
        target: { value: 'Welcome' },
      });
      fireEvent.click(panel.getByRole('button', { name: 'Add' }));

      const guess = within(screen.getByTestId('tag-guess-guess-welcome-strong'));
      expect(guess.getByDisplayValue('Welcome')).toBeInTheDocument();
      expect(guess.getAllByText('Welcome table').length).toBeGreaterThan(0);
    });

    it('removes a standard tag without touching contacts', () => {
      render(<CombineTags />);
      const panel = within(screen.getByTestId('standard-tags-panel'));

      fireEvent.click(panel.getByTestId('remove-standard-tag-Saved'));

      expect(panel.queryByTestId('standard-tag-Saved')).not.toBeInTheDocument();
      expect(h.setDoc).toHaveBeenCalledWith(expect.anything(), {
        tags: ['Baptized', 'Interested', 'Open', 'Club Rush', 'BFA'],
      });
    });

    it('reorders a standard tag and persists the new order', () => {
      render(<CombineTags />);
      const panel = within(screen.getByTestId('standard-tags-panel'));

      fireEvent.click(panel.getByLabelText('Move Saved down'));

      expect(h.setDoc).toHaveBeenCalledWith(expect.anything(), {
        tags: ['Baptized', 'Saved', 'Interested', 'Open', 'Club Rush', 'BFA'],
      });
    });
  });

  describe('recent tag combines (#1436)', () => {
    const record = {
      id: 'r1',
      kind: 'tags',
      status: 'done',
      combinedByName: 'Ada',
      combinedAt: '2026-10-01T00:00:00.000Z',
      contacts: [
        { contactId: 'c1', name: 'Alice', before: ['BFA table', 'BFA'], after: ['BFA'] },
        { contactId: 'c2', name: 'Bob', before: ['bfa-table'], after: ['BFA'] },
      ],
    };

    it('lists a tag combine with who, when and how many contacts it changed', () => {
      h.records = [{ id: record.id, data: () => record }];
      render(<CombineTags />);

      const section = within(screen.getByTestId('recent-tag-combines'));
      expect(section.getByText(/Ada/)).toBeInTheDocument();
      expect(section.getByText(/2 contacts/i)).toBeInTheDocument();
    });

    it('undoes a tag combine and lists the skipped contacts', async () => {
      h.records = [{ id: record.id, data: () => record }];
      global.fetch = vi.fn().mockResolvedValue(
        jsonResponse({
          success: true,
          restoredCount: 1,
          preview: {
            skipped: [
              { contactId: 'c2', name: 'Bob', current: ['BFA', 'Fall 2026'], after: ['BFA'] },
            ],
          },
        }),
      );
      render(<CombineTags />);

      fireEvent.click(screen.getByRole('button', { name: /Undo combine/i }));

      await waitFor(() => expect(screen.getByTestId('tag-undo-result')).toBeInTheDocument());
      const result = screen.getByTestId('tag-undo-result');
      expect(result.textContent).toContain('Bob');
      expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe(
        '/api/combine-tags/undo',
      );
    });

    it('hides undo for an already-undone combine and shows who undid it', () => {
      h.records = [
        {
          id: record.id,
          data: () => ({
            ...record,
            status: 'undone',
            undoneByName: 'Bea',
            undoneAt: '2026-10-02T00:00:00.000Z',
          }),
        },
      ];
      render(<CombineTags />);

      const section = within(screen.getByTestId('recent-tag-combines'));
      expect(section.getByText(/Bea/)).toBeInTheDocument();
      expect(section.queryByRole('button', { name: /Undo combine/i })).not.toBeInTheDocument();
    });
  });
});
