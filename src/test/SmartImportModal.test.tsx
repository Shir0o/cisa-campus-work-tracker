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
  auth: { currentUser: { getIdToken: vi.fn().mockResolvedValue('mock-token') } },
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
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        summary: { contactsCount: 1, interactionsCount: 0, discussionsCount: 1 },
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

  it('handles API failure gracefully', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: 'AI parsing failed' }),
    });

    render(<SmartImportModal isOpen={true} onClose={vi.fn()} />);

    await userEvent.type(screen.getByPlaceholderText(/Paste roster lists/i), 'Some text');
    await userEvent.click(screen.getByRole('button', { name: /Parse with Gemini AI/i }));

    await waitFor(() => {
      expect(screen.getByText('AI parsing failed')).toBeInTheDocument();
    });
  });

  it('handles network error gracefully', async () => {
    fetchMock.mockRejectedValueOnce(new Error('Network error'));

    render(<SmartImportModal isOpen={true} onClose={vi.fn()} />);

    await userEvent.type(screen.getByPlaceholderText(/Paste roster lists/i), 'Some text');
    await userEvent.click(screen.getByRole('button', { name: /Parse with Gemini AI/i }));

    await waitFor(() => {
      expect(screen.getByText('Network error')).toBeInTheDocument();
    });
  });

  it('handles 404 HTML responses gracefully without crashing with SyntaxError', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      json: async () => {
        throw new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON");
      },
      text: async () => '<!DOCTYPE html><html><body><pre>Cannot POST /api/smart-import/parse</pre></body></html>',
    });

    render(<SmartImportModal isOpen={true} onClose={vi.fn()} />);

    await userEvent.type(screen.getByPlaceholderText(/Paste roster lists/i), 'Some text');
    await userEvent.click(screen.getByRole('button', { name: /Parse with Gemini AI/i }));

    await waitFor(() => {
      expect(screen.getByText(/404/i)).toBeInTheDocument();
    });
  });

  it('handles 524 timeout responses gracefully with friendly message', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 524,
      statusText: 'Origin Time-out',
      json: async () => {
        throw new SyntaxError("Unexpected token '<', \"<!DOCTYPE \"... is not valid JSON");
      },
      text: async () => '<html><body>524 Gateway Timeout</body></html>',
    });

    render(<SmartImportModal isOpen={true} onClose={vi.fn()} />);

    await userEvent.type(screen.getByPlaceholderText(/Paste roster lists/i), 'Some long text');
    await userEvent.click(screen.getByRole('button', { name: /Parse with Gemini AI/i }));

    await waitFor(() => {
      expect(screen.getByText(/timed out \(HTTP 524\)/i)).toBeInTheDocument();
    });
  });

  it('allows deleting parsed items during dry run preview step', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          contacts: [{ tempId: 'c1', name: 'John Doe', stage: 'lead' }],
          interactions: [],
          discussions: [{ tempId: 'd1', title: 'Weekly Meeting', content: 'Notes', audience: 'team' }],
        },
      }),
    });

    render(<SmartImportModal isOpen={true} onClose={vi.fn()} />);

    await userEvent.type(screen.getByPlaceholderText(/Paste roster lists/i), 'Sample input');
    await userEvent.click(screen.getByRole('button', { name: /Parse with Gemini AI/i }));

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Weekly Meeting')).toBeInTheDocument();
    });

    // Delete discussion item
    const deleteButtons = screen.getAllByTitle('Delete item');
    await userEvent.click(deleteButtons[1]);

    expect(screen.queryByText('Weekly Meeting')).not.toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });

  it('supports tabs, select/deselect all, individual toggling, editing fields, and back button', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          contacts: [
            {
              tempId: 'c1',
              name: 'Carol White',
              email: 'carol@example.com',
              phone: '123-456-7890',
              stage: 'lead',
              role: 'Student',
              notes: 'Notes for Carol',
              matchedContactId: null,
            },
          ],
          interactions: [
            {
              tempId: 'i1',
              contactRef: 'c1',
              contactName: 'Carol White',
              dateTime: '2026-08-04',
              type: 'coffee',
              content: 'Coffee chat with Carol',
            },
          ],
          discussions: [
            {
              tempId: 'd1',
              title: 'Fall Planning',
              audience: 'team',
              content: 'Planning meeting content',
            },
          ],
        },
      }),
    });

    render(<SmartImportModal isOpen={true} onClose={vi.fn()} />);

    await userEvent.type(screen.getByPlaceholderText(/Paste roster lists/i), 'Carol White info');
    await userEvent.click(screen.getByRole('button', { name: /Parse with Gemini AI/i }));

    await waitFor(() => {
      expect(screen.getAllByText('Carol White')[0]).toBeInTheDocument();
    });

    // Test tab filtering
    const contactsTab = screen.getByRole('button', { name: /Contacts \(1\)/i });
    await userEvent.click(contactsTab);
    expect(screen.getAllByText('Carol White')[0]).toBeInTheDocument();
    expect(screen.queryByText('Fall Planning')).not.toBeInTheDocument();

    const interactionsTab = screen.getByRole('button', { name: /Interactions \(1\)/i });
    await userEvent.click(interactionsTab);
    expect(screen.getByText('Coffee chat with Carol')).toBeInTheDocument();
    expect(screen.queryByText('Fall Planning')).not.toBeInTheDocument();

    const discussionsTab = screen.getByRole('button', { name: /Discussions \(1\)/i });
    await userEvent.click(discussionsTab);
    expect(screen.getByText('Fall Planning')).toBeInTheDocument();
    expect(screen.queryByText('Coffee chat with Carol')).not.toBeInTheDocument();

    const allTab = screen.getByRole('button', { name: /All Items \(3\)/i });
    await userEvent.click(allTab);

    // Test Deselect All & Select All
    const deselectAllBtn = screen.getByRole('button', { name: /Deselect All/i });
    await userEvent.click(deselectAllBtn);
    expect(screen.getByRole('button', { name: /Confirm & Import \(0 Selected\)/i })).toBeDisabled();

    const selectAllBtn = screen.getByRole('button', { name: /^Select All$/i });
    await userEvent.click(selectAllBtn);
    expect(screen.getByRole('button', { name: /Confirm & Import \(3 Selected\)/i })).not.toBeDisabled();

    // Test editing items
    const editBtns = screen.getAllByTitle('Edit item details');
    // Open edit for contact (first item)
    await userEvent.click(editBtns[0]);
    const nameInput = screen.getByDisplayValue('Carol White');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Carol Vance');
    expect(screen.getAllByDisplayValue('Carol Vance')[0]).toBeInTheDocument();
    await userEvent.click(editBtns[0]); // close edit

    // Test Back to text button
    const backBtn = screen.getByRole('button', { name: /Back to text/i });
    await userEvent.click(backBtn);
    expect(screen.getByPlaceholderText(/Paste roster lists/i)).toBeInTheDocument();
  });

  it('imports matched contact, unlinked interaction, and custom audience discussion', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          contacts: [
            {
              tempId: 'c1',
              name: 'Dave Miller',
              email: 'dave@example.com',
              stage: 'active',
              matchedContactId: 'existing-dave-id',
              matchedContactName: 'Dave Miller',
            },
          ],
          interactions: [
            {
              tempId: 'i1',
              contactId: 'existing-dave-id',
              contactName: 'Dave Miller',
              type: 'call',
              content: 'Phone call catchup',
            },
          ],
          discussions: [
            {
              tempId: 'd1',
              title: 'Student Roster',
              audience: 'trainees',
              content: 'Trainees list',
            },
          ],
        },
      }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        summary: { contactsCount: 1, interactionsCount: 1, discussionsCount: 1 },
      }),
    });

    render(<SmartImportModal isOpen={true} onClose={vi.fn()} />);

    await userEvent.type(screen.getByPlaceholderText(/Paste roster lists/i), 'Dave Miller call');
    await userEvent.click(screen.getByRole('button', { name: /Parse with Gemini AI/i }));

    await waitFor(() => {
      expect(screen.getAllByText('Dave Miller')[0]).toBeInTheDocument();
    });

    const confirmBtn = screen.getByRole('button', { name: /Confirm & Import/i });
    await userEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.getByText('Import Completed!')).toBeInTheDocument();
    });

    const doneBtn = screen.getByRole('button', { name: /Done/i });
    await userEvent.click(doneBtn);
  });

  it('allows editing all fields of contacts, interactions, and discussions', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          contacts: [
            { tempId: 'c1', name: 'Original Name', email: 'old@example.com', phone: '111-222', stage: 'lead' },
          ],
          interactions: [
            { tempId: 'i1', contactName: 'Original Name', type: 'coffee', content: 'Old content' },
          ],
          discussions: [
            { tempId: 'd1', title: 'Old Title', audience: 'team', content: 'Old md' },
          ],
        },
      }),
    });

    render(<SmartImportModal isOpen={true} onClose={vi.fn()} />);

    await userEvent.type(screen.getByPlaceholderText(/Paste roster lists/i), 'Text content');
    await userEvent.click(screen.getByRole('button', { name: /Parse with Gemini AI/i }));

    await waitFor(() => {
      expect(screen.getAllByText('Original Name')[0]).toBeInTheDocument();
    });

    const editBtns = screen.getAllByTitle('Edit item details');
    expect(editBtns).toHaveLength(3);

    // Edit contact fields
    await userEvent.click(editBtns[0]);
    await userEvent.type(screen.getByDisplayValue('old@example.com'), 'new@example.com');
    await userEvent.type(screen.getByDisplayValue('111-222'), '-333');
    await userEvent.selectOptions(screen.getByDisplayValue('Lead'), 'active');

    // Edit interaction fields
    await userEvent.click(editBtns[1]);
    const contactNameInput = screen.getByDisplayValue('Original Name');
    await userEvent.clear(contactNameInput);
    await userEvent.type(contactNameInput, 'New Interaction Name');
    await userEvent.selectOptions(screen.getByDisplayValue('Coffee'), 'call');
    const contentTextarea = screen.getByDisplayValue('Old content');
    await userEvent.clear(contentTextarea);
    await userEvent.type(contentTextarea, 'Updated interaction content');

    // Edit discussion fields
    await userEvent.click(editBtns[2]);
    const titleInput = screen.getByDisplayValue('Old Title');
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'Updated Discussion Title');
    await userEvent.selectOptions(screen.getByDisplayValue('Team (Full-timers)'), 'everyone');
    const discussionMdTextarea = screen.getByDisplayValue('Old md');
    await userEvent.clear(discussionMdTextarea);
    await userEvent.type(discussionMdTextarea, 'Updated markdown');

    expect(screen.getByDisplayValue('Updated Discussion Title')).toBeInTheDocument();
  });
});

