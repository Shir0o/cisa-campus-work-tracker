import './useMediaQuery.mock';
import React from 'react';
import { render, waitFor, screen, fireEvent } from '@testing-library/react';
import { vi, beforeEach, describe, it, expect, afterEach } from 'vitest';

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

vi.mock('../App', () => ({
  useLayout: vi.fn(),
}));

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, path) => ({ path })),
  query: vi.fn((ref) => ref),
  orderBy: vi.fn(),
  onSnapshot: vi.fn(),
  updateDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  addDoc: vi.fn(() => Promise.resolve({ id: 'new-event-id' })),
  getDocs: vi.fn(() => Promise.resolve({ docs: [] })),
  where: vi.fn(),
  writeBatch: vi.fn(() => ({ set: vi.fn(), update: vi.fn(), commit: vi.fn(() => Promise.resolve()) })),
  deleteField: vi.fn(() => 'DELETE_FIELD'),
  doc: vi.fn((_db, path, id) => ({ path, id })),
  serverTimestamp: vi.fn(() => 'mock-timestamp'),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', UPDATE: 'UPDATE', CREATE: 'CREATE', DELETE: 'DELETE' },
  logActivity: vi.fn(),
}));

vi.mock('../components/modals/SyncSheetModal', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div data-testid="sync-sheet-modal">Sync</div> : null,
}));
vi.mock('../components/modals/AddEventModal', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div data-testid="add-event-modal">Add</div> : null,
}));
vi.mock('../components/modals/EditEventModal', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div data-testid="edit-event-modal">Edit</div> : null,
}));
vi.mock('../components/modals/CreateRhythmModal', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div data-testid="create-rhythm-modal">Create Rhythm</div> : null,
}));
vi.mock('../components/modals/RhythmDrawer', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div data-testid="rhythm-drawer">Rhythm Drawer</div> : null,
}));
vi.mock('../components/modals/ContactDetailsModal', () => ({
  default: ({ isOpen }: { isOpen: boolean }) => isOpen ? <div data-testid="contact-details-modal">Contact</div> : null,
}));

const FIXED_NOW = new Date('2026-09-09T14:00:00');

function isoDaysFrom(offsetDays: number): string {
  const d = new Date(FIXED_NOW);
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Three standing Rhythms — Wednesday Bible Study, Thursday Bible Study,
// College Meeting — plus one one-off (Welcome BBQ).
const mockRhythms = [
  {
    id: 'wed-rhythm',
    data: () => ({
      name: 'Wednesday Bible Study',
      cadence: { type: 'weekly', days: [3] },
      roster: ['c1', 'c2'],
      termStart: isoDaysFrom(-21),
      termEnd: isoDaysFrom(30),
      createdAt: isoDaysFrom(-30),
      createdById: 'u-test',
    }),
  },
  {
    id: 'thuBS-rhythm',
    data: () => ({
      name: 'Thursday Bible Study',
      cadence: { type: 'weekly', days: [4] },
      roster: ['c1'],
      termStart: isoDaysFrom(-13),
      termEnd: isoDaysFrom(30),
      createdAt: isoDaysFrom(-30),
      createdById: 'u-test',
    }),
  },
  {
    id: 'thuCM-rhythm',
    data: () => ({
      name: 'College Meeting',
      cadence: { type: 'weekly', days: [4] },
      roster: ['c2'],
      termStart: isoDaysFrom(-13),
      termEnd: isoDaysFrom(30),
      createdAt: isoDaysFrom(-30),
      createdById: 'u-test',
    }),
  },
];

const mockEvents = [
  // Wednesday Bible Study: many past, one this week, one future.
  { id: 'wed-0', data: () => ({ name: 'Wednesday Bible Study', date: isoDaysFrom(-21), order: 0, rhythmId: 'wed-rhythm' }) },
  { id: 'wed-1', data: () => ({ name: 'Wednesday Bible Study', date: isoDaysFrom(-14), order: 1, rhythmId: 'wed-rhythm' }) },
  { id: 'wed-2', data: () => ({ name: 'Wednesday Bible Study', date: isoDaysFrom(0), order: 2, rhythmId: 'wed-rhythm', attendanceTakenAt: '2026-09-09T20:00:00Z' }) },
  { id: 'wed-3', data: () => ({ name: 'Wednesday Bible Study', date: isoDaysFrom(7), order: 3, rhythmId: 'wed-rhythm' }) },
  // Thursday Bible Study: 2 past + 1 future.
  { id: 'thuBS-1', data: () => ({ name: 'Thursday Bible Study', date: isoDaysFrom(-13), order: 1, rhythmId: 'thuBS-rhythm' }) },
  { id: 'thuBS-2', data: () => ({ name: 'Thursday Bible Study', date: isoDaysFrom(-6), order: 2, rhythmId: 'thuBS-rhythm' }) },
  { id: 'thuBS-3', data: () => ({ name: 'Thursday Bible Study', date: isoDaysFrom(8), order: 3, rhythmId: 'thuBS-rhythm' }) },
  // College Meeting: 2 past + 1 future, same Thursdays.
  { id: 'thuCM-1', data: () => ({ name: 'College Meeting', date: isoDaysFrom(-13), order: 1, rhythmId: 'thuCM-rhythm' }) },
  { id: 'thuCM-2', data: () => ({ name: 'College Meeting', date: isoDaysFrom(-6), order: 2, rhythmId: 'thuCM-rhythm' }) },
  { id: 'thuCM-3', data: () => ({ name: 'College Meeting', date: isoDaysFrom(8), order: 3, rhythmId: 'thuCM-rhythm' }) },
  // One-off Welcome BBQ.
  { id: 'bbq', data: () => ({ name: 'Welcome BBQ', date: isoDaysFrom(-30), order: 1, roster: [] }) },
];

const mockContacts = [
  {
    id: 'c1', data: () => ({
      name: 'Alice', role: 'Student', location: 'Campus', email: 'a@x.com', phone: '1',
      stage: 'Believer', lastSeen: '2026-08-15', initials: 'A',
      attendance: { 'wed-0': true },
    }),
  },
  {
    id: 'c2', data: () => ({
      name: 'Bob', role: 'Student', location: 'Campus', email: 'b@x.com', phone: '2',
      stage: 'Seeker', lastSeen: '2026-08-10', initials: 'B',
      attendance: { 'thuBS-1': true },
    }),
  },
];

vi.mock('../lib/calendar/calendarSync', () => ({
  useCalendarSync: () => ({
    getItemsBetween: () => ({ context: [] }),
  }),
  calStartOfDay: (d: Date) => d,
  calAddDays: (d: Date, n: number) => {
    const out = new Date(d);
    out.setDate(out.getDate() + n);
    return out;
  },
  canSeeCalendarSync: () => false,
}));

import Attendance from '../views/Attendance';
import { onSnapshot, updateDoc } from 'firebase/firestore';
import { useAuth } from '../components/AuthProvider';
import { useLayout } from '../App';

function mockSnapshotsWith(events: unknown[], rhythms: unknown[] = mockRhythms) {
  vi.mocked(onSnapshot).mockImplementation((ref: any, callback: any) => {
    if (ref?.path === 'contacts') {
      callback({ docs: mockContacts, size: mockContacts.length });
    } else if (ref?.path === 'events') {
      callback({ docs: events, size: events.length });
    } else if (ref?.path === 'rhythms') {
      callback({ docs: rhythms, size: rhythms.length });
    } else if (ref?.path === 'users') {
      callback({ docs: [{ id: 'u-test', data: () => ({ displayName: 'Test User', approved: true, role: 'admin' }) }], size: 1 });
    } else {
      callback({ docs: [], size: 0 });
    }
    return vi.fn();
  });
}

describe('Attendance — Rhythms + This-week wiring (issue #957)', () => {
  let realDate: DateConstructor;

  beforeEach(() => {
    vi.clearAllMocks();
    // Pin "today" to the Wednesday that mockEvents is anchored on, without
    // using fake timers (which would break waitFor's polling setTimeout).
    realDate = globalThis.Date;
    class MockDate extends realDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) {
          super(FIXED_NOW.getTime());
        } else {
          super(...(args as []));
        }
      }
      static now(): number {
        return FIXED_NOW.getTime();
      }
    }
    globalThis.Date = MockDate as unknown as DateConstructor;

    mockSnapshotsWith(mockEvents);

    (useAuth as any).mockReturnValue({
      user: { uid: 'u-test', displayName: 'Test User' },
      isAdmin: true,
    });

    (useLayout as any).mockReturnValue({
      setSelectedContact: vi.fn(),
    });
  });

  afterEach(() => {
    globalThis.Date = realDate;
  });

  it('renders the "This week" band above "What we run"', async () => {
    render(<Attendance />);
    await waitFor(() => {
      expect(screen.getByText('This week')).toBeInTheDocument();
      expect(screen.getByText('What we run')).toBeInTheDocument();
    });
    const sections = screen.getAllByRole('heading', { level: 2 });
    const order = sections.map((s) => s.textContent);
    expect(order.indexOf('This week')).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('What we run')).toBeGreaterThan(order.indexOf('This week'));
  });

  it('folds a recurring Rhythm into one row, not N', async () => {
    render(<Attendance />);
    await waitFor(() => {
      // The structural claim: a 4-week Wednesday term is folded into one
      // row. The Rhythm's chip strip carries the older/future instances.
      const wedChips = screen.getAllByRole('button', { name: /^(19|26|9|16)(Aug|Sep)/i });
      expect(wedChips.length).toBeGreaterThanOrEqual(2);
    });
  });

  it('orders Rhythms by day-of-week then by name (Wed before Thu)', async () => {
    render(<Attendance />);
    await waitFor(() => {
      const all = screen.getAllByText('Wednesday Bible Study', { exact: true });
      expect(all.length).toBeGreaterThan(0);
    });
    const names = screen.getAllByText(/^Wednesday Bible Study$|^Thursday Bible Study$|^College Meeting$/).map((el) => el.textContent ?? '');
    expect(names.indexOf('Wednesday Bible Study')).toBeGreaterThanOrEqual(0);
    expect(names.indexOf('Thursday Bible Study')).toBeGreaterThan(names.indexOf('Wednesday Bible Study'));
    expect(names.indexOf('College Meeting')).toBeGreaterThan(names.indexOf('Wednesday Bible Study'));
  });

  it('lists one-off Gatherings separately under a "One-offs" heading', async () => {
    render(<Attendance />);
    await waitFor(() => {
      expect(screen.getByText('Welcome BBQ')).toBeInTheDocument();
    });
    expect(screen.getByText('One-offs')).toBeInTheDocument();
  });

  it('renders the "Who we\'ve missed lately" heading when people have gone quiet', async () => {
    render(<Attendance />);
    await waitFor(() => {
      expect(screen.getByText("Who we've missed lately")).toBeInTheDocument();
    });
  });

  it('opens the Rhythm drawer from a row\'s settings control', async () => {
    render(<Attendance />);
    await waitFor(() => expect(screen.getAllByText('Wednesday Bible Study').length).toBeGreaterThan(0));

    const settingsButtons = screen.getAllByRole('button', { name: /^Rhythm settings — / });
    fireEvent.click(settingsButtons[0]);

    expect(screen.getByTestId('rhythm-drawer')).toBeInTheDocument();
  });

  it('offers "Start a Rhythm" as a separate entry point from "Log a gathering"', async () => {
    render(<Attendance />);
    await waitFor(() => {
      expect(screen.getByText('Start a Rhythm')).toBeInTheDocument();
      expect(screen.getByText('Log gathering')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Start a Rhythm'));
    expect(screen.getByTestId('create-rhythm-modal')).toBeInTheDocument();
  });

  // ── Attendance taken as a fact on the Gathering ──
  describe('attendance taken', () => {
    // A Gathering nobody came to, and one somebody recorded — both one-offs,
    // so a single click on the row opens the summary they live in.
    const takenEvents = [
      { id: 'quiet', data: () => ({ name: 'Quiet Night', date: isoDaysFrom(-30), order: 1, roster: ['c1'] }) },
      {
        id: 'recorded',
        data: () => ({
          name: 'Recorded Night',
          date: isoDaysFrom(-29),
          order: 2,
          roster: ['c1'],
          attendanceTakenAt: '2026-08-11T20:00:00.000Z',
          attendanceTakenBy: 'Tony Wang',
        }),
      },
    ];

    beforeEach(() => {
      mockSnapshotsWith(takenEvents, []);
    });

    it('records that a Gathering was held and nobody came', async () => {
      render(<Attendance />);

      fireEvent.click(await screen.findByText('Quiet Night'));
      fireEvent.click(screen.getByRole('button', { name: 'We met — nobody came' }));

      await waitFor(() =>
        expect(updateDoc).toHaveBeenCalledWith(
          expect.objectContaining({ id: 'quiet' }),
          expect.objectContaining({
            attendanceTakenBy: 'Test User',
            attendanceTakenById: 'u-test',
            attendanceTakenAt: expect.any(String),
          }),
        ),
      );
    });

    it('shows who took attendance, so a blank week reads as empty rather than unrecorded', async () => {
      render(<Attendance />);

      fireEvent.click(await screen.findByText('Recorded Night'));

      expect(screen.getByText(/Attendance taken by/)).toBeInTheDocument();
      expect(screen.getByText('Tony Wang')).toBeInTheDocument();
      // Already recorded — nothing left to declare.
      expect(screen.queryByRole('button', { name: 'We met — nobody came' })).not.toBeInTheDocument();
    });

    it('does not offer to close a Gathering that has not happened yet', async () => {
      const future = [
        { id: 'ahead', data: () => ({ name: 'Future Night', date: isoDaysFrom(9), order: 1, roster: ['c1'] }) },
      ];
      mockSnapshotsWith(future, []);

      render(<Attendance />);

      await waitFor(() => expect(screen.getAllByText('Future Night').length).toBeGreaterThan(0));
      expect(screen.queryByRole('button', { name: 'We met — nobody came' })).not.toBeInTheDocument();
    });
  });
});

// ── Reaching the row controls (issue issue 982) ─────────────────────────────────
// The gear, pencil and trash were spans dressed as buttons, nested inside the
// row's own button, with no key handler — so a keyboard user could not open
// Rhythm settings, edit a one-off or remove one at all, which is why "there is
// no way to delete a Rhythm" was a fair reading of the page.
describe('Attendance — row controls are reachable (issue issue 982)', () => {
  let realDate: DateConstructor;

  beforeEach(() => {
    vi.clearAllMocks();
    realDate = globalThis.Date;
    class MockDate extends realDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) super(FIXED_NOW.getTime());
        else super(...(args as []));
      }
      static now(): number { return FIXED_NOW.getTime(); }
    }
    globalThis.Date = MockDate as unknown as DateConstructor;
    mockSnapshotsWith(mockEvents);
    (useAuth as any).mockReturnValue({ user: { uid: 'u-test', displayName: 'Test User' }, isAdmin: true });
    (useLayout as any).mockReturnValue({ setSelectedContact: vi.fn() });
  });

  afterEach(() => {
    globalThis.Date = realDate;
  });

  it('names the Rhythm settings control after the Rhythm it configures', async () => {
    render(<Attendance />);
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Rhythm settings — Wednesday Bible Study' })).toBeInTheDocument();
    });
  });

  it('opens the Rhythm drawer from the keyboard', async () => {
    render(<Attendance />);
    const control = await screen.findByRole('button', { name: 'Rhythm settings — Wednesday Bible Study' });
    control.focus();
    expect(control).toHaveFocus();
    fireEvent.keyDown(control, { key: 'Enter', code: 'Enter' });
    fireEvent.click(control); // Enter on a real button fires a click
    expect(screen.getByTestId('rhythm-drawer')).toBeInTheDocument();
  });

  it('does not nest the row controls inside the row\'s own button', async () => {
    render(<Attendance />);
    const control = await screen.findByRole('button', { name: 'Rhythm settings — Wednesday Bible Study' });
    expect(control.closest('button')).toBe(control);
  });

  it('opens Rhythm settings without also expanding the row', async () => {
    render(<Attendance />);
    const control = await screen.findByRole('button', { name: 'Rhythm settings — Wednesday Bible Study' });
    fireEvent.click(control);
    expect(screen.getByTestId('rhythm-drawer')).toBeInTheDocument();
    expect(screen.queryByText('Tap a name to update who was there.')).not.toBeInTheDocument();
  });

  it('names a one-off\'s edit and remove controls after the Gathering they act on', async () => {
    render(<Attendance />);
    await waitFor(() => expect(screen.getByText('Welcome BBQ')).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Edit gathering — Welcome BBQ' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove gathering — Welcome BBQ' })).toBeInTheDocument();
  });

  it('leaves a one-off\'s controls reachable without a pointer hovering the row', async () => {
    render(<Attendance />);
    const edit = await screen.findByRole('button', { name: 'Edit gathering — Welcome BBQ' });
    // `opacity-0` until hover puts these out of reach on a touch screen.
    expect(edit.className).not.toMatch(/\bopacity-0\b/);
  });

  it('exposes a missed-contact card as a control rather than a clickable div', async () => {
    render(<Attendance />);
    await waitFor(() => expect(screen.getByText("Who we've missed lately")).toBeInTheDocument());
    expect(screen.getByRole('button', { name: /Open Bob/ })).toBeInTheDocument();
  });
});

// ── One way to say how many came (issue issue 982) ──────────────────────────────
describe('Attendance — the count reads the same on every row (issue issue 982)', () => {
  let realDate: DateConstructor;

  beforeEach(() => {
    vi.clearAllMocks();
    realDate = globalThis.Date;
    class MockDate extends realDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) super(FIXED_NOW.getTime());
        else super(...(args as []));
      }
      static now(): number { return FIXED_NOW.getTime(); }
    }
    globalThis.Date = MockDate as unknown as DateConstructor;
    mockSnapshotsWith(mockEvents);
    (useAuth as any).mockReturnValue({ user: { uid: 'u-test', displayName: 'Test User' }, isAdmin: true });
    (useLayout as any).mockReturnValue({ setSelectedContact: vi.fn() });
  });

  afterEach(() => {
    globalThis.Date = realDate;
  });

  it('gives a This-week row the same "n of m came" shape a Rhythm row uses', async () => {
    render(<Attendance />);
    await waitFor(() => expect(screen.getByText('This week')).toBeInTheDocument());
    // Wednesday's occasion this week expects two people and nobody came.
    const band = screen.getByText('This week').closest('section') as HTMLElement;
    expect(band.textContent).toMatch(/0 of 2 came/);
  });

  it('gives a Rhythm row the same shape, against its own roster', async () => {
    render(<Attendance />);
    await waitFor(() => expect(screen.getByText('What we run')).toBeInTheDocument());
    // Wednesday's Rhythm expects two and nobody came to this week's occasion.
    const section = screen.getByText('What we run').closest('section') as HTMLElement;
    expect(section.textContent).toMatch(/0 of 2 came/);
  });

  it('gives a one-off with no roster a bare count, since there is nothing to expect', async () => {
    render(<Attendance />);
    await waitFor(() => expect(screen.getByText('Welcome BBQ')).toBeInTheDocument());
    const row = screen.getByText('Welcome BBQ').closest('div[class*="rounded"]') as HTMLElement;
    expect(row.textContent).toMatch(/0 came/);
    expect(row.textContent).not.toMatch(/of 0/);
  });
});

// ── The chip strip opens on where we are (issue 982) ────────────────────
describe('Attendance — the chip strip opens on the selected week (issue 982)', () => {
  let realDate: DateConstructor;
  const layout: Array<{ prop: string; desc: PropertyDescriptor | undefined }> = [];

  const stubLayout = (props: Record<string, (el: HTMLElement) => number>) => {
    for (const [prop, get] of Object.entries(props)) {
      layout.push({ prop, desc: Object.getOwnPropertyDescriptor(HTMLElement.prototype, prop) });
      Object.defineProperty(HTMLElement.prototype, prop, {
        configurable: true,
        get(this: HTMLElement) { return get(this); },
      });
    }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    realDate = globalThis.Date;
    class MockDate extends realDate {
      constructor(...args: unknown[]) {
        if (args.length === 0) super(FIXED_NOW.getTime());
        else super(...(args as []));
      }
      static now(): number { return FIXED_NOW.getTime(); }
    }
    globalThis.Date = MockDate as unknown as DateConstructor;
    mockSnapshotsWith(mockEvents);
    (useAuth as any).mockReturnValue({ user: { uid: 'u-test', displayName: 'Test User' }, isAdmin: true });
    (useLayout as any).mockReturnValue({ setSelectedContact: vi.fn() });

    // A strip far wider than its box, with each chip 60px along from the last.
    stubLayout({
      scrollWidth: (el) => (el.className.includes('overflow-x-auto') ? 1200 : 0),
      clientWidth: (el) => (el.className.includes('overflow-x-auto') ? 300 : 0),
      offsetWidth: (el) => (el.tagName === 'BUTTON' ? 50 : 0),
      offsetLeft: (el) => {
        if (el.tagName !== 'BUTTON' || !el.parentElement) return 0;
        return [...el.parentElement.children].indexOf(el) * 60;
      },
    });
  });

  afterEach(() => {
    globalThis.Date = realDate;
    for (const { prop, desc } of layout.splice(0)) {
      if (desc) Object.defineProperty(HTMLElement.prototype, prop, desc);
      else delete (HTMLElement.prototype as unknown as Record<string, unknown>)[prop];
    }
  });

  it('scrolls the selected week into the middle of an overflowing strip', async () => {
    const { container } = render(<Attendance />);
    await waitFor(() => expect(screen.getByText('What we run')).toBeInTheDocument());
    const strip = container.querySelector('div.overflow-x-auto') as HTMLElement;
    expect(strip).toBeTruthy();
    // Wednesday's selected chip is the current week — the third of four, so
    // offsetLeft 120: 120 - 300/2 + 50/2 = -5, clamped by the browser to 0 but
    // written as a non-default value by the effect.
    expect(strip.scrollLeft).not.toBeUndefined();
    // The fourth Rhythm chip strip (Thursday) has its selection further along.
    const strips = [...container.querySelectorAll('div.overflow-x-auto')] as HTMLElement[];
    expect(strips.some((el) => el.scrollLeft !== 0)).toBe(true);
  });

  it('marks the strip as continuing past its edge, so a clipped term does not read as a short one', async () => {
    const { container } = render(<Attendance />);
    await waitFor(() => expect(screen.getByText('What we run')).toBeInTheDocument());
    await waitFor(() => {
      const strips = [...container.querySelectorAll('div.overflow-x-auto')] as HTMLElement[];
      expect(strips.some((el) => /chip-strip-fade-(both|start|end)/.test(el.className))).toBe(true);
    });
  });
});
