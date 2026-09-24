import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CombineContactsModal from '../components/modals/CombineContactsModal';
import type { Contact } from '../types';

const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockSet = vi.fn();
const mockCommit = vi.fn().mockResolvedValue(undefined);
const mockGetDocs = vi.fn().mockResolvedValue({ docs: [] });

vi.mock('../components/AuthProvider', () => ({
  useAuth: () => ({
    user: { uid: 'u1', displayName: 'Admin', email: 'admin@test.com' },
  }),
}));

vi.mock('../components/LanguageProvider', () => ({
  useLanguage: () => ({
    t: (key: string, fallback?: string) => {
      if (key === 'modals.combine_all') return 'Combine all ({n})';
      return fallback || key;
    },
    language: 'en',
  }),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, path: string, id: string) => ({ path, id })),
  collection: vi.fn(() => ({})),
  query: vi.fn((q: unknown) => q),
  where: vi.fn(),
  getDocs: () => mockGetDocs(),
  writeBatch: vi.fn(() => ({
    update: mockUpdate,
    delete: mockDelete,
    set: mockSet,
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
  mockGetDocs.mockResolvedValue({ docs: [] });
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
    const applyBtn = screen.getByRole('button', { name: /combine all/i });
    expect(applyBtn).toBeInTheDocument();
  });

  it('skips a pair so it will not be combined', () => {
    render(<CombineContactsModal contacts={testContacts} onClose={vi.fn()} />);
    const skipBtn = screen.getByRole('button', { name: /skip for now/i });
    fireEvent.click(skipBtn);
    expect(screen.getByText(/No duplicate contacts found/i)).toBeInTheDocument();
  });

  it('combines a single pair inline and removes its card', async () => {
    const onApplied = vi.fn();
    render(<CombineContactsModal contacts={testContacts} onClose={vi.fn()} onApplied={onApplied} />);
    const inlineBtn = screen.getByRole('button', { name: /^Combine$/i });
    fireEvent.click(inlineBtn);

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockSet).not.toHaveBeenCalled();
      expect(mockDelete).toHaveBeenCalled();
      expect(mockCommit).toHaveBeenCalled();
      expect(onApplied).toHaveBeenCalled();
      expect(screen.getByText(/No duplicate contacts found/i)).toBeInTheDocument();
    });
  });

  it('combines all remaining pairs on bulk apply', async () => {
    const onClose = vi.fn();
    render(<CombineContactsModal contacts={testContacts} onClose={onClose} />);
    const applyBtn = screen.getByRole('button', { name: /combine all \(1\)/i });
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalled();
      expect(mockDelete).toHaveBeenCalled();
      expect(mockCommit).toHaveBeenCalled();
      expect(onClose).toHaveBeenCalled();
    });
  });

  it('renders "Created" yyyy-mm-dd from string createdAt', () => {
    render(<CombineContactsModal contacts={testContacts} onClose={vi.fn()} />);
    expect(screen.getByText('Created: 2026-01-01')).toBeInTheDocument();
    expect(screen.getByText('Created: 2026-02-01')).toBeInTheDocument();
  });

  it('renders "Created" yyyy-mm-dd from a Firestore Timestamp-shaped createdAt without crashing', () => {
    const timestampContact: Contact = {
      ...testContacts[0],
      createdAt: { seconds: 1700000000, nanoseconds: 0 } as unknown as string,
    };
    render(<CombineContactsModal contacts={[timestampContact, testContacts[1]]} onClose={vi.fn()} />);
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Created: 2023-11-14')).toBeInTheDocument();
  });

  it('renders "Created" yyyy-mm-dd from a numeric ms createdAt', () => {
    const numericContact: Contact = {
      ...testContacts[0],
      createdAt: new Date('2025-06-15T00:00:00.000Z').getTime() as unknown as string,
    };
    render(<CombineContactsModal contacts={[numericContact, testContacts[1]]} onClose={vi.fn()} />);
    expect(screen.getByText('Created: 2025-06-15')).toBeInTheDocument();
  });

  it('shows a field-change badge and expands to reveal merge details', () => {
    render(<CombineContactsModal contacts={testContacts} onClose={vi.fn()} />);
    const toggle = screen.getByRole('button', { name: /1 field will change/i });
    expect(toggle).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(screen.getByText(/Kept survivor's/i)).toBeInTheDocument();
    expect(screen.getByText(/Kept "Lead"; dropped "Contact" from the duplicate/i)).toBeInTheDocument();
  });

  it('shows "No fields will change" when the pair merge changes nothing', () => {
    const a: Contact = {
      id: 'x1',
      name: 'Same',
      email: 'same@x.com',
      phone: '555',
      role: 'Student',
      stage: 'Lead',
      location: 'A',
      lastSeen: '',
      initials: 'S',
      notes: 'note',
      tags: ['T'],
      createdAt: '2026-01-01',
    };
    render(<CombineContactsModal contacts={[a, { ...a, id: 'x2', createdAt: '2026-02-01' }]} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /no fields will change/i })).toBeInTheDocument();
  });

  it('renders backfilled and unioned change rows', () => {
    const survivor: Contact = {
      id: 's',
      name: 'Survivor',
      email: 'dup@x.com',
      phone: '',
      role: 'Student',
      stage: 'Lead',
      location: '',
      lastSeen: '',
      initials: 'S',
      tags: ['A'],
      notes: 'first',
      createdAt: '2026-01-01',
    };
    const duplicate: Contact = {
      id: 'd',
      name: 'Duplicate',
      email: 'dup@x.com',
      phone: '555',
      role: 'Student',
      stage: 'Lead',
      location: '',
      lastSeen: '',
      initials: 'D',
      tags: ['A', 'B'],
      notes: 'second',
      createdAt: '2026-02-01',
    };
    render(<CombineContactsModal contacts={[survivor, duplicate]} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /fields will change/i }));
    expect(screen.getByText(/Backfilled/i)).toBeInTheDocument();
    expect(screen.getByText(/Unioned/i)).toBeInTheDocument();
  });

  it('merge details are read-only — no editable controls appear', () => {
    render(<CombineContactsModal contacts={testContacts} onClose={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: /1 field will change/i }));
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });
});