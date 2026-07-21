import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onSnapshot } from 'firebase/firestore';
import CoordinationTrash from '../views/CoordinationTrash';
import { useAuth } from '../components/AuthProvider';
import { restoreBoardDoc, deleteBoardDoc, purgeExpiredTrash } from '../lib/data/board';

vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  Link: ({ to, children, ...rest }: { to: string; children: React.ReactNode }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, path: string) => ({ path })),
  query: vi.fn((ref: unknown) => ref),
  orderBy: vi.fn(),
  onSnapshot: vi.fn((_ref: unknown, _cb: unknown) => vi.fn()),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', UPDATE: 'UPDATE', DELETE: 'DELETE' },
}));

vi.mock('../lib/data/board', () => ({
  restoreBoardDoc: vi.fn(() => Promise.resolve()),
  deleteBoardDoc: vi.fn(() => Promise.resolve()),
  purgeExpiredTrash: vi.fn(() => Promise.resolve()),
}));

const trashedDocs = [
  {
    id: 'doc-1',
    data: () => ({ title: 'Old planning page', date: '2026-06-01', md: '', deletedAt: 'mock-ts' }),
  },
  {
    id: 'doc-2',
    data: () => ({ title: 'Another deleted page', date: '2026-06-05', md: '', deletedAt: 'mock-ts' }),
  },
];

function setupSnapshot(docs: typeof trashedDocs) {
  (onSnapshot as ReturnType<typeof vi.fn>).mockImplementation((_ref: unknown, cb: (snap: unknown) => void) => {
    cb({ docs });
    return vi.fn();
  });
}

describe('CoordinationTrash', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ isAdmin: true });
  });

  it('shows "Not available" for non-admins and does not subscribe', () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ isAdmin: false });
    setupSnapshot(trashedDocs);
    render(<CoordinationTrash />);

    expect(screen.getByText('Not available.')).toBeInTheDocument();
    expect(onSnapshot).not.toHaveBeenCalled();
  });

  it('lists trashed pages for admins and sweeps expired ones', async () => {
    setupSnapshot(trashedDocs);
    render(<CoordinationTrash />);

    await screen.findByText('Old planning page');
    expect(screen.getByText('Another deleted page')).toBeInTheDocument();
    expect(purgeExpiredTrash).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ id: 'doc-1' }), expect.objectContaining({ id: 'doc-2' })]),
    );
  });

  it('shows an empty state when there is nothing in Trash', async () => {
    setupSnapshot([]);
    render(<CoordinationTrash />);

    expect(await screen.findByText('Trash is empty.')).toBeInTheDocument();
  });

  it('restores a page when clicking Restore', async () => {
    setupSnapshot(trashedDocs);
    render(<CoordinationTrash />);

    await screen.findByText('Old planning page');
    fireEvent.click(screen.getAllByRole('button', { name: /Restore/i })[0]);

    await waitFor(() => {
      expect(restoreBoardDoc).toHaveBeenCalledWith(expect.objectContaining({ id: 'doc-1' }));
    });
  });

  it('permanently deletes a page after confirming "Delete Forever"', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    setupSnapshot(trashedDocs);
    render(<CoordinationTrash />);

    await screen.findByText('Old planning page');
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete Forever' })[0]);

    await waitFor(() => {
      expect(deleteBoardDoc).toHaveBeenCalledWith(expect.objectContaining({ id: 'doc-1' }));
    });
  });

  it('does not delete when "Delete Forever" confirm is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    setupSnapshot(trashedDocs);
    render(<CoordinationTrash />);

    await screen.findByText('Old planning page');
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete Forever' })[0]);

    expect(deleteBoardDoc).not.toHaveBeenCalled();
  });
});
