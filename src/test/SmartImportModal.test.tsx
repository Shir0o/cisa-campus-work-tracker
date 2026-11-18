import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import SmartImportModal from '../components/modals/SmartImportModal';
import { useAuth } from '../components/AuthProvider';
import React from 'react';

// The shared popup frame renders through motion/react; keep the elements plain
// so jsdom doesn't animate, and run its open-focus callback synchronously so it
// can't race the userEvent typing below.
vi.mock('motion/react', () => {
  const cache = new Map<PropertyKey, any>();
  const motion = new Proxy(
    {},
    {
      get: (_target, prop) => {
        if (!cache.has(prop)) {
          cache.set(prop, ({ children, ...props }: any) => {
            const Tag = prop as any;
            return <Tag {...props}>{children}</Tag>;
          });
        }
        return cache.get(prop);
      },
    },
  );
  return { motion, AnimatePresence: ({ children }: any) => <>{children}</> };
});

beforeAll(() => {
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  });
  vi.stubGlobal('cancelAnimationFrame', () => {});
});

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

  it('renders modal when isOpen is true, with no sample-text shortcut', () => {
    render(<SmartImportModal isOpen={true} onClose={vi.fn()} />);

    expect(screen.getByText('Smart Text Import')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Paste roster lists/i)).toBeInTheDocument();
    expect(screen.queryByText(/Load sample text/i)).not.toBeInTheDocument();
  });

  it('previews contacts only — no interactions or discussions sections', async () => {
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
              notes: 'Met at welcome booth',
              tags: ['freshman'],
              matchedContactId: null,
              matchedContactName: null,
            },
          ],
          // A legacy server response may still carry these; the modal must not
          // render them (cut-or-keep §14).
          interactions: [
            { tempId: 'i1', contactRef: 'c1', contactName: 'Jane Smith', type: 'coffee', content: 'Coffee chat' },
          ],
          discussions: [{ tempId: 'd1', title: 'Welcome Strategy', audience: 'team', content: '# Plan' }],
        },
      }),
    });

    render(<SmartImportModal isOpen={true} onClose={vi.fn()} />);

    await userEvent.type(screen.getByPlaceholderText(/Paste roster lists/i), 'Met Jane Smith');
    await userEvent.click(screen.getByRole('button', { name: /Parse with Gemini AI/i }));

    await waitFor(() => {
      expect(screen.getAllByText('Jane Smith')[0]).toBeInTheDocument();
    });

    expect(screen.getByText('New Contact')).toBeInTheDocument();
    expect(screen.queryByText('Coffee chat')).not.toBeInTheDocument();
    expect(screen.queryByText('Welcome Strategy')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Interactions/i })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Discussions/i })).not.toBeInTheDocument();
  });

  it('allows editing contact fields and confirms import into Firestore', async () => {
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
        },
      }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true, summary: { contactsCount: 1 } }),
    });

    const onImportComplete = vi.fn();
    render(<SmartImportModal isOpen={true} onClose={vi.fn()} onImportComplete={onImportComplete} />);

    await userEvent.type(screen.getByPlaceholderText(/Paste roster lists/i), 'Alice Brown meeting notes');
    await userEvent.click(screen.getByRole('button', { name: /Parse with Gemini AI/i }));

    await waitFor(() => {
      expect(screen.getByText('Alice Brown')).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /Confirm & Import/i }));

    await waitFor(() => {
      expect(screen.getByText('Import Completed!')).toBeInTheDocument();
    });

    expect(onImportComplete).toHaveBeenCalledWith({ contactsCount: 1 });
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

  it('supports select/deselect all, individual toggling, editing and back', async () => {
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
              notes: 'Notes for Carol',
              matchedContactId: null,
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

    const deselectAllBtn = screen.getByRole('button', { name: /Deselect All/i });
    await userEvent.click(deselectAllBtn);
    expect(screen.getByRole('button', { name: /Confirm & Import \(0 Selected\)/i })).toBeDisabled();

    const selectAllBtn = screen.getByRole('button', { name: /^Select All$/i });
    await userEvent.click(selectAllBtn);
    expect(screen.getByRole('button', { name: /Confirm & Import \(1 Selected\)/i })).not.toBeDisabled();

    const editBtn = screen.getAllByTitle('Edit item details')[0];
    await userEvent.click(editBtn);
    const nameInput = screen.getByDisplayValue('Carol White');
    await userEvent.clear(nameInput);
    await userEvent.type(nameInput, 'Carol Vance');
    expect(screen.getAllByDisplayValue('Carol Vance')[0]).toBeInTheDocument();
    await userEvent.click(editBtn);

    await userEvent.click(screen.getByRole('button', { name: /Back to text/i }));
    expect(screen.getByPlaceholderText(/Paste roster lists/i)).toBeInTheDocument();
  });

  it('deletes a parsed contact during the preview', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          contacts: [{ tempId: 'c1', name: 'John Doe', stage: 'lead' }],
        },
      }),
    });

    render(<SmartImportModal isOpen={true} onClose={vi.fn()} />);

    await userEvent.type(screen.getByPlaceholderText(/Paste roster lists/i), 'Sample input');
    await userEvent.click(screen.getByRole('button', { name: /Parse with Gemini AI/i }));

    await waitFor(() => {
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });

    await userEvent.click(screen.getAllByTitle('Delete item')[0]);
    expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
  });

  it('disables Parse until text is entered', () => {
    render(<SmartImportModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByRole('button', { name: /Parse with Gemini AI/i })).toBeDisabled();
  });

  it('disables confirm with no contacts selected', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: {
          contacts: [
            { tempId: 'c1', name: 'Solo Contact', stage: 'lead', matchedContactId: null },
            { tempId: 'c2', name: 'Other Contact', stage: 'lead', matchedContactId: null },
          ],
        },
      }),
    });

    render(<SmartImportModal isOpen={true} onClose={vi.fn()} />);
    await userEvent.type(screen.getByPlaceholderText(/Paste roster lists/i), 'Two contacts');
    await userEvent.click(screen.getByRole('button', { name: /Parse with Gemini AI/i }));

    await waitFor(() => {
      expect(screen.getAllByText('Solo Contact')[0]).toBeInTheDocument();
    });

    const soloRow = screen.getAllByText('Solo Contact')[0].closest('.p-4')!;
    await userEvent.click(soloRow.querySelectorAll('button')[0]);
    expect(screen.getByRole('button', { name: /Confirm & Import \(1 Selected\)/i })).not.toBeDisabled();

    const otherRow = screen.getAllByText('Other Contact')[0].closest('.p-4')!;
    await userEvent.click(otherRow.querySelectorAll('button')[0]);
    expect(screen.getByRole('button', { name: /Confirm & Import \(0 Selected\)/i })).toBeDisabled();
  });

  it('shows the server error message when the commit request fails', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { contacts: [{ tempId: 'c1', name: 'Failing Commit', stage: 'lead' }] },
      }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Commit rejected by server' }),
    });

    render(<SmartImportModal isOpen={true} onClose={vi.fn()} />);
    await userEvent.type(screen.getByPlaceholderText(/Paste roster lists/i), 'Failing commit');
    await userEvent.click(screen.getByRole('button', { name: /Parse with Gemini AI/i }));

    await waitFor(() => {
      expect(screen.getAllByText('Failing Commit')[0]).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /Confirm & Import/i }));
    await waitFor(() => {
      expect(screen.getByText('Commit rejected by server')).toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: /Confirm & Import/i })).toBeInTheDocument();
  });

  it('shows the API error when commit returns success:false', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        success: true,
        data: { contacts: [{ tempId: 'c1', name: 'Unsuccessful Commit', stage: 'lead' }] },
      }),
    });
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: false, error: 'dry-run mismatch' }),
    });

    render(<SmartImportModal isOpen={true} onClose={vi.fn()} />);
    await userEvent.type(screen.getByPlaceholderText(/Paste roster lists/i), 'Unsuccessful');
    await userEvent.click(screen.getByRole('button', { name: /Parse with Gemini AI/i }));

    await waitFor(() => {
      expect(screen.getAllByText('Unsuccessful Commit')[0]).toBeInTheDocument();
    });

    await userEvent.click(screen.getByRole('button', { name: /Confirm & Import/i }));
    await waitFor(() => {
      expect(screen.getByText('dry-run mismatch')).toBeInTheDocument();
    });
    expect(screen.queryByText('Import Completed!')).not.toBeInTheDocument();
  });

  it('renders through the shared popup frame, labelled with its title (#1454)', () => {
    render(<SmartImportModal isOpen={true} onClose={vi.fn()} />);
    expect(screen.getByRole('dialog', { name: 'Smart Text Import' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Parse with Gemini AI/i })).toBeInTheDocument();
  });
});
