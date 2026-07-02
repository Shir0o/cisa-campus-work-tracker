import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import EditEventModal from '../components/modals/EditEventModal';
import { updateDoc } from 'firebase/firestore';
import { logActivity } from '../lib/firebase';

vi.mock('firebase/firestore', () => ({
  doc: vi.fn((_db, path, id) => ({ path, id })),
  updateDoc: vi.fn(() => Promise.resolve()),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { UPDATE: 'UPDATE' },
  logActivity: vi.fn(),
}));

vi.mock('../lib/gatheringTypes', () => ({
  useGatheringTypes: () => [
    { id: 't1', name: 'Weekly', blurb: '', order: 0 },
    { id: 't2', name: 'Small Group', blurb: '', order: 1 },
  ],
}));

vi.mock('motion/react', () => ({
  motion: { div: ({ children, ...props }: any) => <div {...props}>{children}</div> },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock('../components/ui/DatePicker', () => ({
  default: ({ label, value, onChange }: any) => (
    <input aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

const EVENT = {
  id: 'e1',
  name: 'Friday Gathering',
  type: 'Weekly',
  location: 'Lower Common Room',
  date: '2026-06-12',
  order: 1,
  createdAt: '',
};

describe('EditEventModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not render when closed or with no event', () => {
    const { rerender } = render(<EditEventModal isOpen={false} onClose={vi.fn()} event={EVENT} />);
    expect(screen.queryByText('Edit gathering')).not.toBeInTheDocument();
    rerender(<EditEventModal isOpen onClose={vi.fn()} event={null} />);
    expect(screen.queryByText('Edit gathering')).not.toBeInTheDocument();
  });

  it('prefills the form from the event', () => {
    render(<EditEventModal isOpen onClose={vi.fn()} event={EVENT} />);
    expect(screen.getByDisplayValue('Friday Gathering')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Lower Common Room')).toBeInTheDocument();
  });

  it('saves edited details and logs the activity', async () => {
    const onClose = vi.fn();
    render(<EditEventModal isOpen onClose={onClose} event={EVENT} />);

    fireEvent.change(screen.getByDisplayValue('Friday Gathering'), {
      target: { value: 'Friday Night Gathering' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Save changes/i }));

    await waitFor(() => expect(updateDoc).toHaveBeenCalled());
    expect(updateDoc).toHaveBeenCalledWith(
      expect.objectContaining({ path: 'events', id: 'e1' }),
      expect.objectContaining({
        name: 'Friday Night Gathering',
        type: 'Weekly',
        location: 'Lower Common Room',
        date: '2026-06-12',
      }),
    );
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ targetType: 'event', type: 'edit', targetId: 'e1' }),
    );
    expect(onClose).toHaveBeenCalled();
  });
});
