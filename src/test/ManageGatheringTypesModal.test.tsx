import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ManageGatheringTypesModal from '../components/modals/ManageGatheringTypesModal';
import { addGatheringType, updateGatheringType, removeGatheringType } from '../lib/gatheringTypes';

vi.mock('motion/react', () => ({
  motion: { div: ({ children, ...props }: any) => <div {...props}>{children}</div> },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock('../lib/gatheringTypes', () => ({
  addGatheringType: vi.fn(() => Promise.resolve()),
  updateGatheringType: vi.fn(() => Promise.resolve()),
  removeGatheringType: vi.fn(() => Promise.resolve()),
}));

const TYPES = [
  { id: 't1', name: 'Weekly', blurb: 'Friday night', order: 0 },
  { id: 't2', name: 'Small Group', blurb: 'Around a table', order: 1 },
];

describe('ManageGatheringTypesModal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not render when closed', () => {
    render(<ManageGatheringTypesModal isOpen={false} onClose={vi.fn()} types={TYPES} />);
    expect(screen.queryByText('Kinds of gathering')).not.toBeInTheDocument();
  });

  it('renders the existing kinds as editable rows', () => {
    render(<ManageGatheringTypesModal isOpen onClose={vi.fn()} types={TYPES} />);
    expect(screen.getByDisplayValue('Weekly')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Small Group')).toBeInTheDocument();
  });

  it('adds a new kind and saves it', async () => {
    const onClose = vi.fn();
    render(<ManageGatheringTypesModal isOpen onClose={onClose} types={TYPES} />);

    fireEvent.change(screen.getByPlaceholderText(/New kind/i), { target: { value: 'Prayer Walk' } });
    fireEvent.click(screen.getByRole('button', { name: /Add/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(addGatheringType).toHaveBeenCalled());
    expect(addGatheringType).toHaveBeenCalledWith(expect.objectContaining({ name: 'Prayer Walk' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('renames a kind, passing the previous name for event migration', async () => {
    render(<ManageGatheringTypesModal isOpen onClose={vi.fn()} types={TYPES} />);

    fireEvent.change(screen.getByDisplayValue('Weekly'), { target: { value: 'Friday Gathering' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(updateGatheringType).toHaveBeenCalled());
    expect(updateGatheringType).toHaveBeenCalledWith(
      't1',
      { name: 'Friday Gathering', blurb: 'Friday night' },
      'Weekly',
    );
  });

  it('removes a kind on save', async () => {
    render(<ManageGatheringTypesModal isOpen onClose={vi.fn()} types={TYPES} />);

    // Two existing rows → remove the first one.
    const removeButtons = screen.getAllByTitle('Remove this kind');
    fireEvent.click(removeButtons[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(removeGatheringType).toHaveBeenCalledWith('t1'));
  });
});
