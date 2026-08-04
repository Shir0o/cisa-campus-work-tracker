import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { setDoc, addDoc } from 'firebase/firestore';
import SmartImportModal from '../components/modals/SmartImportModal';
import { useAuth } from '../components/AuthProvider';
import React from 'react';

vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...paths) => ({ path: paths.join('/') })),
  doc: vi.fn((_db, ...paths) => ({ id: paths[paths.length - 1] || 'generated-doc-id' })),
  addDoc: vi.fn().mockResolvedValue({ id: 'added-interaction-id' }),
  setDoc: vi.fn().mockResolvedValue(undefined),
  serverTimestamp: vi.fn(() => 'server-timestamp'),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', CREATE: 'CREATE' },
  logActivity: vi.fn(),
}));

const fetchMock = vi.fn();

describe('SmartImportModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', fetchMock);
    (useAuth as any).mockReturnValue({
      user: { uid: 'user-123', displayName: 'Test Staff', getIdToken: vi.fn().mockResolvedValue('fake-token') },
      role: 'admin',
    });
  });

  it('renders modal when isOpen is true and loads sample text', async () => {
    render(<SmartImportModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText('Smart Text Import')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Paste roster lists/i)).toBeInTheDocument();

    const sampleBtn = screen.getByText(/Load sample text/i);
    await userEvent.click(sampleBtn);

    const textarea = screen.getByPlaceholderText(/Paste roster lists/i) as HTMLTextAreaElement;
    expect(textarea.value).toContain('Jane Smith');
  });

  it('handles parsing via API and transitions to dry run preview', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          contacts: [
            {
              tempId: 'c1',
              name: 'Jane Smith',
              email: 'jane@example.com',
              phone: '555-0123',
              stage: 'lead',
              role: 'Student',
              notes: 'Met at welcome booth',
              tags: ['freshman'],
              matchedContactId: null,
              matchedContactName: null,
            },
            {
              tempId: 'c2',
              name: 'John Doe',
              email: 'john@example.com',
              phone: '555-9999',
              stage: 'contact',
              role: 'Student',
              notes: 'Existing student',
              tags: [],
              matchedContactId: 'existing-john-id',
              matchedContactName: 'John Doe',
            },
          ],
          interactions: [
            {
              tempId: 'i1',
              contactRef: 'c1',
              contactName: 'Jane Smith',
              dateTime: '2026-08-03',
              type: 'coffee',
              content: 'Discussed campus transition.',
            },
          ],
          discussions: [
            {
              tempId: 'd1',
              title: 'Welcome Strategy',
              audience: 'team',
              content: '# Plan\nOutreach goals...',
              tags: ['strategy'],
            },
          ],
        },
      }),
    });

    render(<SmartImportModal isOpen={true} onClose={vi.fn()} />);

    const textarea = screen.getByPlaceholderText(/Paste roster lists/i);
    await userEvent.type(textarea, 'Met Jane Smith and John Doe');

    const parseBtn = screen.getByRole('button', { name: /Parse with Gemini AI/i });
    await userEvent.click(parseBtn);

    await waitFor(() => {
      expect(screen.getAllByText('Jane Smith')[0]).toBeInTheDocument();
    });

    expect(screen.getByText('New Contact')).toBeInTheDocument();
    expect(screen.getByText(/Matches existing: John Doe/i)).toBeInTheDocument();
    expect(screen.getByText('Discussed campus transition.')).toBeInTheDocument();
    expect(screen.getByText('Welcome Strategy')).toBeInTheDocument();
  });

  it('allows editing fields and confirming import into Firestore', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          contacts: [
            {
              tempId: 'c1',
              name: 'Alice Brown',
              email: 'alice@example.com',
              stage: 'lead',
              matchedContactId: null,
            },
          ],
          interactions: [],
          discussions: [
            {
              tempId: 'd1',
              title: 'Team Notes',
              audience: 'team',
              content: 'Meeting notes content',
            },
          ],
        },
      }),
    });

    const onImportComplete = vi.fn();
    render(<SmartImportModal isOpen={true} onClose={vi.fn()} onImportComplete={onImportComplete} />);

    await userEvent.type(screen.getByPlaceholderText(/Paste roster lists/i), 'Alice Brown meeting notes');
    await userEvent.click(screen.getByRole('button', { name: /Parse with Gemini AI/i }));

    await waitFor(() => {
      expect(screen.getByText('Alice Brown')).toBeInTheDocument();
    });

    // Confirm import
    const confirmBtn = screen.getByRole('button', { name: /Confirm & Import/i });
    await userEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByText('Import Completed!')).toBeInTheDocument();
    });

    expect(setDoc).toHaveBeenCalled();
    expect(onImportComplete).toHaveBeenCalledWith({
      contactsCount: 1,
      interactionsCount: 0,
      discussionsCount: 1,
    });
  });

  it('does not render when isOpen is false', () => {
    const { container } = render(<SmartImportModal isOpen={false} onClose={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
