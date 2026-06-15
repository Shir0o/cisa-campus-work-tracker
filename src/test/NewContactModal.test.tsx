import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addDoc } from 'firebase/firestore';
import NewContactModal from '../components/modals/NewContactModal';
import { useAuth } from '../components/AuthProvider';
import React from 'react';

// Mock dependencies
vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  addDoc: vi.fn().mockResolvedValue({ id: 'test-doc-id' }),
  serverTimestamp: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  getDocs: vi.fn().mockResolvedValue({
    docs: [
      { id: 'stage-1', data: () => ({ label: 'Contacted', order: 1 }) }
    ]
  }),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', CREATE: 'CREATE' },
  logActivity: vi.fn(),
  sendNotification: vi.fn(),
}));

describe('NewContactModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      user: { uid: 'user-id', displayName: 'Test User' },
      role: 'operator',
    });
  });

  it('renders modal when isOpen is true', async () => {
    render(<NewContactModal isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => {
      expect(screen.getByText('New Contact')).toBeInTheDocument();
      expect(screen.getByText('Add a new connection to your network')).toBeInTheDocument();
    });
  });

  it('prefills the stage select from initialStage (e.g. "Add to {stage}")', async () => {
    render(<NewContactModal isOpen={true} onClose={vi.fn()} initialStage="Unassigned" />);
    await waitFor(() => {
      // Stage select is the first combobox; spiritual background is the second.
      const stageSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
      expect(stageSelect.value).toBe('Unassigned');
    });
  });

  it('defaults the stage to the first stage when no initialStage is given', async () => {
    render(<NewContactModal isOpen={true} onClose={vi.fn()} />);
    await waitFor(() => {
      const stageSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
      expect(stageSelect.value).toBe('Contacted');
    });
  });

  it('falls back to the first stage when initialStage is not a valid option', async () => {
    render(<NewContactModal isOpen={true} onClose={vi.fn()} initialStage="Nonexistent" />);
    await waitFor(() => {
      const stageSelect = screen.getAllByRole('combobox')[0] as HTMLSelectElement;
      expect(stageSelect.value).toBe('Contacted');
    });
  });

  it('submits correctly', async () => {
    const onClose = vi.fn();
    const mockUserAct = userEvent.setup();
    render(<NewContactModal isOpen={true} onClose={onClose} />);

    // Fill in required fields
    const firstName = await screen.findByPlaceholderText('e.g. Alex');
    await mockUserAct.type(firstName, 'John');

    const role = await screen.findByPlaceholderText('e.g. Student, Faculty');
    await mockUserAct.type(role, 'Student');

    const location = await screen.findByPlaceholderText('e.g. Campus Coffee, Miller Hall');
    await mockUserAct.type(location, 'Campus Coffee');

    const email = await screen.findByPlaceholderText('alex@campus.edu');
    await mockUserAct.type(email, 'john@example.com');
    
    const notes = await screen.findByPlaceholderText('Add some context about this contact...');
    await mockUserAct.type(notes, 'Nice guy');

    // Submit
    const submitBtn = screen.getByRole('button', { name: /Add Contact/i });
    await mockUserAct.click(submitBtn);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalled();
      expect(vi.mocked(addDoc)).toHaveBeenCalled();
    });
  });
});
