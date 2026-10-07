import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

vi.mock('../components/LanguageProvider', () => ({
  useLanguage: () => ({ t: (_key: string, fallback?: string) => fallback || _key, language: 'en' }),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(() => ({})),
  query: vi.fn((q: unknown) => q),
  orderBy: vi.fn(),
  onSnapshot: vi.fn((_q: unknown, cb: (snap: unknown) => void) => {
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
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ success: true, combineRecordId: 'r1' }) }) as unknown as typeof fetch;
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
});
