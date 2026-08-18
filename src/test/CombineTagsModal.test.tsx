import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CombineTagsModal from '../components/modals/CombineTagsModal';
import { logActivity, handleFirestoreError } from '../lib/firebase';
import type { Contact } from '../types';

const mockUpdate = vi.fn();
const mockCommit = vi.fn().mockResolvedValue(undefined);

vi.mock('../components/AuthProvider', () => ({
  useAuth: () => ({
    user: { uid: 'u1', displayName: 'Admin', email: 'admin@test.com' },
  }),
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db: unknown, path: string, id: string) => ({ path, id })),
  writeBatch: vi.fn(() => ({
    update: mockUpdate,
    commit: mockCommit,
  })),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { UPDATE: 'UPDATE' },
  logActivity: vi.fn(),
}));

const cleanContacts: Contact[] = [
  {
    id: 'c1',
    name: 'Ari',
    email: '',
    phone: '',
    role: 'Student',
    stage: 'Lead',
    location: '',
    lastSeen: '',
    initials: 'A',
    spiritualBackground: '',
    tags: ['Fall 2026'],
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

const dirtyContacts: Contact[] = [
  {
    ...cleanContacts[0],
    tags: ["Fall '26", 'Fall 2026'],
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockCommit.mockResolvedValue(undefined);
});

describe('CombineTagsModal', () => {
  it('lays over the app shell — z-index above the sidebar (issue #357)', () => {
    const { container } = render(<CombineTagsModal contacts={cleanContacts} onClose={vi.fn()} />);
    // The sidebar sits at z-[70]; the modal must stack above it so it isn't
    // covered on the wide screen.
    const dialog = container.querySelector('div[class*="z-[100]"]');
    expect(dialog).not.toBeNull();
    expect(container.querySelector('div[class*="z-50"]')).toBeNull();
  });

  it('shows an empty state when there are no tags to combine', () => {
    render(<CombineTagsModal contacts={cleanContacts} onClose={vi.fn()} />);

    expect(screen.getByText('No duplicate or overlapping tags found.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nothing to combine/i })).toBeDisabled();
  });

  it('shows a dry-run preview and applies the combined tags after confirmation', async () => {
    const onClose = vi.fn();
    render(<CombineTagsModal contacts={dirtyContacts} onClose={onClose} />);

    expect(screen.getByText('1 contact would have their tags combined.')).toBeInTheDocument();
    expect(screen.getByText(/Fall '26/)).toBeInTheDocument();
    expect(screen.getByText('Fall 2026')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Combine 1 contact/i }));

    await waitFor(() => expect(mockCommit).toHaveBeenCalledTimes(1));
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ tags: ['Fall 2026'] }),
    );
    expect(logActivity).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('surfaces Firestore update errors through handleFirestoreError', async () => {
    mockCommit.mockRejectedValue(new Error('denied'));
    render(<CombineTagsModal contacts={dirtyContacts} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Combine 1 contact/i }));

    await waitFor(() => expect(handleFirestoreError).toHaveBeenCalled());
  });
});
