import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import TagGenderModal from '../components/modals/TagGenderModal';
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

const alreadyTaggedContacts: Contact[] = [
  {
    id: 'c1',
    name: 'John Doe',
    email: '',
    phone: '',
    role: 'Student',
    stage: 'Lead',
    location: '',
    lastSeen: '',
    initials: 'J',
    spiritualBackground: '',
    gender: 'M',
    tags: ['Student', 'M'],
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

const untaggedContacts: Contact[] = [
  {
    id: 'c2',
    name: 'Alice Smith',
    email: '',
    phone: '',
    role: 'Student',
    stage: 'Lead',
    location: '',
    lastSeen: '',
    initials: 'A',
    spiritualBackground: '',
    tags: ['Freshman'],
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockCommit.mockResolvedValue(undefined);
});

describe('TagGenderModal', () => {
  it('lays over the app shell with z-[100] above the sidebar', () => {
    const { container } = render(<TagGenderModal contacts={alreadyTaggedContacts} onClose={vi.fn()} />);
    const dialog = container.querySelector('div[class*="z-[100]"]');
    expect(dialog).not.toBeNull();
  });

  it('shows an empty state when there are no contacts to tag', () => {
    render(<TagGenderModal contacts={alreadyTaggedContacts} onClose={vi.fn()} />);

    expect(screen.getByText('All contacts already have M/F tags.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Nothing to tag/i })).toBeDisabled();
  });

  it('shows a dry-run preview and applies the M/F tags after confirmation', async () => {
    const onClose = vi.fn();
    render(<TagGenderModal contacts={untaggedContacts} onClose={onClose} />);

    expect(screen.getByText('1 contact would have M/F tags added.')).toBeInTheDocument();
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText(/Freshman, F/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Tag 1 contact/i }));

    await waitFor(() => expect(mockCommit).toHaveBeenCalledTimes(1));
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        tags: ['Freshman', 'F'],
        gender: 'F',
      }),
    );
    expect(logActivity).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('surfaces Firestore update errors through handleFirestoreError', async () => {
    mockCommit.mockRejectedValue(new Error('denied'));
    render(<TagGenderModal contacts={untaggedContacts} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Tag 1 contact/i }));

    await waitFor(() => expect(handleFirestoreError).toHaveBeenCalled());
  });
});
