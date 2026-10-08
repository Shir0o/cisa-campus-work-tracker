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

const h = vi.hoisted(() => ({ contacts: [] as { id: string; data: () => unknown }[] }));

vi.mock('../components/LanguageProvider', () => ({
  useLanguage: () => ({ t: (_key: string, fallback?: string) => fallback || _key, language: 'en' }),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, name: string) => ({ __name: name })),
  query: vi.fn((q: unknown) => q),
  orderBy: vi.fn(),
  onSnapshot: vi.fn((_q: unknown, cb: (snapshot: unknown) => void) => {
    cb({ docs: h.contacts });
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
});
