import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SyncSheetModal from '../components/modals/SyncSheetModal';
import * as firestore from 'firebase/firestore';
import { useAuth } from '../components/AuthProvider';
import { fetchSheetData, extractSpreadsheetId } from '../services/sheetsService';

// Mock Auth
vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

// Mock sheets service
vi.mock('../services/sheetsService', () => ({
  fetchSheetData: vi.fn(),
  extractSpreadsheetId: vi.fn(),
}));

// Mock Firestore
vi.mock('firebase/firestore', () => {
  return {
    collection: vi.fn().mockReturnValue({ id: 'mock-collection-id' }),
    doc: vi.fn().mockReturnValue({ id: 'mock-doc-id' }),
    updateDoc: vi.fn().mockResolvedValue(true),
    addDoc: vi.fn().mockResolvedValue({ id: 'new-contact-id' }),
    getDocs: vi.fn().mockResolvedValue({
      docs: [
        { id: 'event-a', data: () => ({ name: 'Event A' }) },
      ],
    }),
    query: vi.fn(),
    where: vi.fn(),
  };
});

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', UPDATE: 'UPDATE', CREATE: 'CREATE' },
}));

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

const mockContacts = [
  {
    id: 'c1',
    name: 'Alice',
    email: 'alice@example.com',
    role: 'Student',
    location: 'Main Hall',
    phone: '123-456-7890',
    stage: 'Contacted',
    lastSeen: '2026-06-17',
    initials: 'A',
  },
];

describe('SyncSheetModal Component', () => {
  const mockOnClose = vi.fn();
  const mockAuthorizeSheets = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      authorizeSheets: mockAuthorizeSheets,
      isAdmin: true,
    });
  });

  it('renders correctly when isOpen is true', () => {
    render(<SyncSheetModal isOpen={true} onClose={mockOnClose} contacts={mockContacts} />);
    expect(screen.getByText('Sync Google Sheet')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('https://docs.google.com/spreadsheets/d/...')).toBeInTheDocument();
  });

  it('performs dry run and shows summary', async () => {
    mockAuthorizeSheets.mockResolvedValue('mock-token');
    vi.mocked(extractSpreadsheetId).mockReturnValue('sheet-id-123');
    vi.mocked(fetchSheetData).mockResolvedValue([
      ['Name', 'Event A', 'Event B'],
      ['Alice', 'present', 'absent'],
      ['Charlie', 'present', 'present'],
    ]);

    render(<SyncSheetModal isOpen={true} onClose={mockOnClose} contacts={mockContacts} />);

    // Fill in sheet URL
    const urlInput = screen.getByPlaceholderText('https://docs.google.com/spreadsheets/d/...');
    fireEvent.change(urlInput, { target: { value: 'https://docs.google.com/spreadsheets/d/sheet-id-123/edit' } });

    // Click dry run
    const dryRunBtn = screen.getByRole('button', { name: /Run Dry Run/i });
    fireEvent.click(dryRunBtn);

    // Verify dry run summary items
    expect(await screen.findByText('Sync Preview')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Charlie')).toBeInTheDocument();
    expect(screen.getByText('Will create new event: Event B')).toBeInTheDocument();

    // Click Sync Now
    const syncBtn = screen.getByRole('button', { name: /Confirm & Commit/i });
    fireEvent.click(syncBtn);

    await waitFor(() => {
      // Should add Charlie as a new contact and update Alice
      expect(firestore.addDoc).toHaveBeenCalled();
      expect(firestore.updateDoc).toHaveBeenCalled();
      expect(screen.getByText('Sync completed successfully!')).toBeInTheDocument();
    });
  });
});
