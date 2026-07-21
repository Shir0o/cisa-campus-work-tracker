import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { UndoSnackbar } from '../components/UndoSnackbar';

describe('UndoSnackbar', () => {
  it('renders nothing when there is no snack', () => {
    render(<UndoSnackbar undoSnack={null} onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Undo' })).not.toBeInTheDocument();
  });

  it('renders the message and calls onUndo then onClose when Undo is clicked', () => {
    const onUndo = vi.fn();
    const onClose = vi.fn();
    render(<UndoSnackbar undoSnack={{ message: 'Page moved to Trash', onUndo }} onClose={onClose} />);

    expect(screen.getByText('Page moved to Trash')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));

    expect(onUndo).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('calls onClose (without onUndo) when the close button is clicked', () => {
    const onUndo = vi.fn();
    const onClose = vi.fn();
    render(<UndoSnackbar undoSnack={{ message: 'Deleted', onUndo }} onClose={onClose} />);

    fireEvent.click(screen.getByRole('button', { name: 'Close snackbar' }));

    expect(onClose).toHaveBeenCalled();
    expect(onUndo).not.toHaveBeenCalled();
  });
});
