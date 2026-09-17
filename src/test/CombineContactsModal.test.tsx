import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CombineContactsModal from '../components/modals/CombineContactsModal';
import type { Contact } from '../types';

const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockCommit = vi.fn().mockResolvedValue(undefined);

vi.mock('../components/AuthProvider', () => ({
  useAuth: () => ({
    user: { uid: 'u1', displayName: 'Admin', email: 'admin@test.com' },
  }),
}));

vi.mock('../components/LanguageProvider', () => ({
  useLanguage: () => ({
    t: (key: string, fallback?: string) => fallback || key,
    language: 'en',
  }),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, path: string, id: string) => ({ path, id })),
  writeBatch: vi.fn(() => ({
    update: mockUpdate,
    delete: mockDelete,
    commit: mockCommit,
  })),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { UPDATE: 'UPDATE', DELETE: 'DELETE' },
  logActivity: vi.fn(),
}));

const testContacts: Contact[] = [
  {
    id: 'c1',
    name: 'Alice Smith',
    email: 'alice@example.com',
    phone: '',
    role: 'Student',
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
    role: 'Student',
    stage: 'Contact',
    location: '',
    lastSeen: '',
    initials: 'AS',
    createdAt: '2026-02-01T00:00:00.000Z',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockCommit.mockResolvedValue(undefined);
});

describe('CombineContactsModal', () => {
  it('renders no duplicates message when contacts have no duplicates', () => {
    const single = [testContacts[0]];
    render(<CombineContactsModal contacts={single} onClose={vi.fn()} />);
    expect(screen.getByText(/No duplicate contacts found/i)).toBeInTheDocument();
  });

  it('renders dry-run preview when duplicate pair is found and defaults older as survivor', () => {
    render(<CombineContactsModal contacts={testContacts} onClose={vi.fn()} />);
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Alice Second')).toBeInTheDocument();
    expect(screen.getByText(/Matching email/i)).toBeInTheDocument();
  });

  it('allows swapping survivor and duplicate', () => {
    render(<CombineContactsModal contacts={testContacts} onClose={vi.fn()} />);
    const swapBtn = screen.getByRole('button', { name: /swap survivor/i });
    fireEvent.click(swapBtn);
    const applyBtn = screen.getByRole('button', { name: /combine 1 contact/i });
    expect(applyBtn).toBeInTheDocument();
  });

  it('allows dismissing a pair so it will not be combined', () => {
    render(<CombineContactsModal contacts={testContacts} onClose={vi.fn()} />);
    const dismissBtn = screen.getByRole('button', { name: /dismiss pair/i });
    fireEvent.click(dismissBtn);
    expect(screen.getByText(/No duplicate contacts found/i)).toBeInTheDocument();
  });

  it('applies batch changes and deletes duplicate on confirmation', async () => {
    const onClose = vi.fn();
    render(<CombineContactsModal contacts={testContacts} onClose={onClose} />);
    const applyBtn = screen.getByRole('button', { name: /combine 1 contact/i });
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockDelete).toHaveBeenCalled();
      expect(mockCommit).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });
});
