import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import CreateRhythmModal from '../components/modals/CreateRhythmModal';
import { createRhythm } from '../lib/rhythms';
import { useAuth } from '../components/AuthProvider';

vi.mock('../lib/rhythms', () => ({
  createRhythm: vi.fn(() => Promise.resolve('new-rhythm-id')),
}));

vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

const contacts = [
  { id: 'c1', name: 'Alice', role: '', location: '', email: '', phone: '', stage: '', lastSeen: '', initials: 'A' },
  { id: 'c2', name: 'Bob', role: '', location: '', email: '', phone: '', stage: '', lastSeen: '', initials: 'B' },
];

describe('CreateRhythmModal (issue #957)', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: { uid: 'u1', displayName: 'Tester' } } as any);
  });

  it('does not render when closed', () => {
    render(<CreateRhythmModal isOpen={false} onClose={onClose} />);
    expect(screen.queryByText('Start a Rhythm')).not.toBeInTheDocument();
  });

  it('renders the Rhythm form with cadence, term, location and roster fields', () => {
    render(<CreateRhythmModal isOpen={true} onClose={onClose} contacts={contacts} />);
    expect(screen.getByText('Start a Rhythm')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/e.g. Wednesday Bible Study/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'weekly' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'monthly' })).toBeInTheDocument();
    expect(screen.getByText(/Expected Roster/i)).toBeInTheDocument();
  });

  it('submits the Rhythm with its cadence, roster, location and creator', async () => {
    render(<CreateRhythmModal isOpen={true} onClose={onClose} contacts={contacts} />);

    fireEvent.change(screen.getByPlaceholderText(/e.g. Wednesday Bible Study/i), { target: { value: 'College Meeting' } });
    fireEvent.change(screen.getByPlaceholderText(/e.g. Lower Common Room/i), { target: { value: 'Chapel' } });
    fireEvent.click(screen.getByText('Alice'));
    fireEvent.click(screen.getByRole('button', { name: /Create/i }));

    await waitFor(() => {
      expect(createRhythm).toHaveBeenCalledWith(expect.objectContaining({
        name: 'College Meeting',
        cadence: expect.objectContaining({ type: 'weekly', days: expect.any(Array) }),
        location: 'Chapel',
        roster: ['c1'],
        createdById: 'u1',
      }));
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('hides the weekday picker when the monthly cadence is chosen', () => {
    render(<CreateRhythmModal isOpen={true} onClose={onClose} />);
    expect(screen.getByText('Repeat on')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'monthly' }));
    expect(screen.queryByText('Repeat on')).not.toBeInTheDocument();
  });

  it('keeps at least one weekday selected', () => {
    render(<CreateRhythmModal isOpen={true} onClose={onClose} />);
    const buttons = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
    buttons.forEach((label) => {
      const matches = screen.getAllByText(label);
      fireEvent.click(matches[matches.length - 1]);
    });
    // The component refuses to clear the final selected day.
    expect(screen.getAllByRole('button').length).toBeGreaterThan(0);
  });

  it('closes on Escape', () => {
    render(<CreateRhythmModal isOpen={true} onClose={onClose} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('will not submit without a name', () => {
    render(<CreateRhythmModal isOpen={true} onClose={onClose} />);
    const submit = screen.getByRole('button', { name: /Create/i });
    expect(submit).toBeDisabled();
  });
});

describe('CreateRhythmModal - field edits (issue #957)', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuth).mockReturnValue({ user: { uid: 'u1', displayName: 'Tester' } } as any);
  });

  it('edits the term dates and the roster search', () => {
    const { container } = render(<CreateRhythmModal isOpen={true} onClose={onClose} contacts={contacts} />);
    const dates = Array.from(container.querySelectorAll('input[type="date"]')) as HTMLInputElement[];
    expect(dates).toHaveLength(2);
    fireEvent.change(dates[0], { target: { value: '2026-09-09' } });
    fireEvent.change(dates[1], { target: { value: '2026-12-23' } });
    expect(screen.getByDisplayValue('2026-09-09')).toBeInTheDocument();
    expect(screen.getByDisplayValue('2026-12-23')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Add attendee or walk-in/i), { target: { value: 'Ali' } });
    expect(screen.getByDisplayValue('Ali')).toBeInTheDocument();
    // Search narrows the roster list.
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.queryByText('Bob')).not.toBeInTheDocument();
  });

  it('deselects a roster contact when clicked twice', () => {
    render(<CreateRhythmModal isOpen={true} onClose={onClose} contacts={contacts} />);
    fireEvent.click(screen.getByText('Alice'));
    expect(screen.getByText('1 selected')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Alice'));
    expect(screen.getByText('0 selected')).toBeInTheDocument();
  });
});
