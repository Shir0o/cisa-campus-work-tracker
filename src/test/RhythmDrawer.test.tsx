import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import RhythmDrawer from '../components/modals/RhythmDrawer';
import { updateRhythm, deleteRhythm, extendRhythmTerm, uncancelGatheringDoc } from '../lib/rhythms';
import { addDoc } from 'firebase/firestore';
import type { Gathering, Rhythm } from '../types';

vi.mock('../lib/rhythms', () => ({
  updateRhythm: vi.fn(() => Promise.resolve()),
  deleteRhythm: vi.fn(() => Promise.resolve()),
  extendRhythmTerm: vi.fn(() => Promise.resolve()),
  uncancelGatheringDoc: vi.fn(() => Promise.resolve()),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db: unknown, path: string) => ({ path })),
  addDoc: vi.fn(() => Promise.resolve({ id: 'new-contact' })),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { CREATE: 'create', UPDATE: 'update' },
}));

vi.mock('motion/react', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

vi.mock('../components/UndoSnackbar', () => ({
  UndoSnackbar: ({ undoSnack, onClose }: any) => (undoSnack ? (
    <div data-testid="undo-snack">
      <button onClick={() => { undoSnack.onUndo(); onClose(); }}>Undo</button>
    </div>
  ) : null),
}));

const contacts = [
  { id: 'c1', name: 'Alice', role: '', location: '', email: '', phone: '', stage: '', lastSeen: '', initials: 'A' },
  { id: 'c2', name: 'Bob', role: '', location: '', email: '', phone: '', stage: '', lastSeen: '', initials: 'B' },
];

const rhythm: Rhythm = {
  id: 'r1',
  name: 'Wednesday Bible Study',
  cadence: { type: 'weekly', days: [3] },
  location: 'Lower Common Room',
  roster: ['c1'],
  termStart: '2026-09-09',
  termEnd: '2026-10-01',
  createdAt: '2026-09-01T00:00:00.000Z',
  createdById: 'u1',
};

const gatherings: Gathering[] = [
  { id: 'e1', name: 'Wednesday Bible Study', date: '2026-09-09', order: 0, createdAt: '2026-09-01T00:00:00.000Z', rhythmId: 'r1' },
  { id: 'e2', name: 'Wednesday Bible Study', date: '2026-09-16', order: 1, createdAt: '2026-09-01T00:00:00.000Z', rhythmId: 'r1', cancelled: true },
  { id: 'e3', name: 'Wednesday Bible Study', date: '2026-09-23', order: 2, createdAt: '2026-09-01T00:00:00.000Z', rhythmId: 'r1', cancelled: true },
];

describe('RhythmDrawer (issue #957)', () => {
  const onClose = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing without a Rhythm', () => {
    const { container } = render(<RhythmDrawer isOpen={true} onClose={onClose} rhythm={null} gatherings={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('opens with the Rhythm name, location and roster', () => {
    render(<RhythmDrawer isOpen={true} onClose={onClose} rhythm={rhythm} gatherings={gatherings} contacts={contacts} />);
    expect(screen.getByText('Rhythm settings')).toBeInTheDocument();
    expect(screen.getAllByDisplayValue('Wednesday Bible Study').length).toBeGreaterThan(0);
    expect(screen.getByDisplayValue('Lower Common Room')).toBeInTheDocument();
    expect(screen.getByText('1 on roster')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('adds a contact to the roster and saves it', async () => {
    render(<RhythmDrawer isOpen={true} onClose={onClose} rhythm={rhythm} gatherings={gatherings} contacts={contacts} />);
    fireEvent.click(screen.getByText('Bob'));
    expect(screen.getByText('2 on roster')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => {
      expect(updateRhythm).toHaveBeenCalledWith('r1', expect.objectContaining({
        name: 'Wednesday Bible Study',
        roster: ['c1', 'c2'],
      }));
    });
    expect(onClose).toHaveBeenCalled();
  });

  it('removes a roster member immediately and offers an undo that restores them', () => {
    render(<RhythmDrawer isOpen={true} onClose={onClose} rhythm={rhythm} gatherings={gatherings} contacts={contacts} />);
    fireEvent.click(screen.getByText('Alice'));
    expect(screen.getByText('0 on roster')).toBeInTheDocument();
    expect(screen.getByTestId('undo-snack')).toBeInTheDocument();
    fireEvent.click(within(screen.getByTestId('undo-snack')).getByRole('button', { name: 'Undo' }));
    expect(screen.getByText('1 on roster')).toBeInTheDocument();
  });

  it('clears the location when it is emptied', async () => {
    render(<RhythmDrawer isOpen={true} onClose={onClose} rhythm={rhythm} gatherings={gatherings} contacts={contacts} />);
    fireEvent.change(screen.getByDisplayValue('Lower Common Room'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => {
      expect(updateRhythm).toHaveBeenCalledWith('r1', expect.objectContaining({ location: null }));
    });
  });

  it('creates a contact from a typed name and adds it to the roster', async () => {
    render(<RhythmDrawer isOpen={true} onClose={onClose} rhythm={rhythm} gatherings={gatherings} contacts={contacts} />);
    fireEvent.change(screen.getByPlaceholderText(/Add attendee or walk-in/i), { target: { value: 'Zed' } });
    fireEvent.click(screen.getByRole('button', { name: /Create contact/ }));
    await waitFor(() => {
      expect(addDoc).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'contacts' }),
        expect.objectContaining({ name: 'Zed', initials: 'Z' }),
      );
    });
    expect(screen.getByText('2 on roster')).toBeInTheDocument();
  });

  it('extends the term with the chosen end date', async () => {
    render(<RhythmDrawer isOpen={true} onClose={onClose} rhythm={rhythm} gatherings={gatherings} contacts={contacts} />);
    const dateInput = screen.getByDisplayValue('2026-10-01');
    fireEvent.change(dateInput, { target: { value: '2026-12-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Extend' }));
    await waitFor(() => {
      expect(extendRhythmTerm).toHaveBeenCalledWith(rhythm, '2026-12-31', gatherings);
    });
  });

  it('lists cancelled weeks and undoes a cancellation', async () => {
    render(<RhythmDrawer isOpen={true} onClose={onClose} rhythm={rhythm} gatherings={gatherings} contacts={contacts} />);
    expect(screen.getByText('Cancelled weeks')).toBeInTheDocument();
    expect(screen.getByText('Sep 16, 2026')).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Undo' })[0]);
    await waitFor(() => {
      expect(uncancelGatheringDoc).toHaveBeenCalledWith('e2');
    });
  });

  it('removes the Rhythm after confirmation', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<RhythmDrawer isOpen={true} onClose={onClose} rhythm={rhythm} gatherings={gatherings} contacts={contacts} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove this Rhythm' }));
    await waitFor(() => {
      expect(deleteRhythm).toHaveBeenCalledWith(rhythm, gatherings);
    });
    expect(onClose).toHaveBeenCalled();
  });

  // issue 982 — the drawer said "6 on roster" while showing one of them, because
  // the list was the first N contacts in arbitrary order. A member you can see
  // counted must be a member you can remove.
  it('lists roster members before everyone else, so a counted member is always reachable', () => {
    const many = [
      ...Array.from({ length: 40 }, (_, i) => ({
        id: `filler${i}`, name: `Filler ${i}`, role: '', location: '', email: '', phone: '', stage: '', lastSeen: '', initials: 'F',
      })),
      { id: 'zed', name: 'Zed Zulu', role: '', location: '', email: '', phone: '', stage: '', lastSeen: '', initials: 'Z' },
    ];
    const rostered: Rhythm = { ...rhythm, roster: ['zed'] };
    render(<RhythmDrawer isOpen={true} onClose={onClose} rhythm={rostered} gatherings={gatherings} contacts={many} />);
    expect(screen.getByRole('button', { name: /Zed Zulu/ })).toBeInTheDocument();
  });

  it('says how many contacts it is not showing, so a missing name reads as elided rather than absent', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({
      id: `c${i}`, name: `Person ${i}`, role: '', location: '', email: '', phone: '', stage: '', lastSeen: '', initials: 'P',
    }));
    render(<RhythmDrawer isOpen={true} onClose={onClose} rhythm={rhythm} gatherings={gatherings} contacts={many} />);
    expect(screen.getByText(/10 more/)).toBeInTheDocument();
  });

  it('writes the term end as a date, not as a database value', () => {
    render(<RhythmDrawer isOpen={true} onClose={onClose} rhythm={rhythm} gatherings={gatherings} contacts={contacts} />);
    expect(screen.getByText('Oct 1, 2026')).toBeInTheDocument();
  });

  it('tells you what happens to past and to future weeks before removing', () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(<RhythmDrawer isOpen={true} onClose={onClose} rhythm={rhythm} gatherings={gatherings} contacts={contacts} />);
    fireEvent.click(screen.getByRole('button', { name: 'Remove this Rhythm' }));
    const message = confirmSpy.mock.calls[0][0] as string;
    expect(message).toMatch(/past/i);
    expect(message).toMatch(/one-offs/i);
    expect(message).toMatch(/upcoming|future/i);
    expect(deleteRhythm).not.toHaveBeenCalled();
  });

  it('closes on Escape', () => {
    render(<RhythmDrawer isOpen={true} onClose={onClose} rhythm={rhythm} gatherings={gatherings} contacts={contacts} />);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

describe('RhythmDrawer - rename (issue #957)', () => {
  const onClose = vi.fn();
  beforeEach(() => vi.clearAllMocks());

  it('saves an edited name', async () => {
    render(<RhythmDrawer isOpen={true} onClose={onClose} rhythm={rhythm} gatherings={gatherings} contacts={contacts} />);
    const nameInput = screen.getByDisplayValue('Wednesday Bible Study');
    fireEvent.change(nameInput, { target: { value: 'Wednesday Gathering' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => {
      expect(updateRhythm).toHaveBeenCalledWith('r1', expect.objectContaining({ name: 'Wednesday Gathering' }));
    });
  });
});
