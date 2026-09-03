import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import PrayerListMobile from '../views/PrayerListMobile';

const mockOpenLogInteraction = vi.fn();
vi.mock('../App', () => ({
  useLayout: () => ({
    openLogInteraction: mockOpenLogInteraction,
  }),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  auth: { currentUser: null },
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST', UPDATE: 'UPDATE', CREATE: 'CREATE' },
  logActivity: vi.fn(),
}));

const contact = (over: any = {}) => ({
  id: 'c1',
  name: 'Alice Smith',
  role: 'Student',
  location: 'Miller Hall',
  ...over,
} as any);

const prayer = (over: any = {}) => ({
  id: 'p1',
  burden: 'Praying for peace',
  date: new Date().toISOString(),
  status: 'pending',
  ...over,
} as any);

const baseProps = {
  contacts: [] as any[],
  prayers: [] as any[],
  entries: [] as any[],
  suggestions: [] as any[],
  searchQuery: '',
  setSearchQuery: vi.fn(),
  startHolding: vi.fn(),
  onAddBurden: vi.fn().mockResolvedValue(true),
  onUpdateStatus: vi.fn(),
  onUpdateBurden: vi.fn().mockResolvedValue(true),
  onOpenContact: vi.fn(),
  answeredThisYear: 3,
  awaiting: 2,
  composeFor: null,
  setComposeFor: vi.fn(),
  onStopHolding: vi.fn(),
  isOperator: true,
  isManager: true,
};

function renderWithRouter(props: any = {}) {
  return render(
    <MemoryRouter>
      <PrayerListMobile {...baseProps} {...props} />
    </MemoryRouter>
  );
}

describe('PrayerListMobile', () => {
  it('renders header counts and prayer entries', () => {
    renderWithRouter({
      entries: [{ contact: contact(), prayers: [prayer({ status: 'ongoing' })] }],
    });
    expect(screen.getByText("Who we're carrying")).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Praying for peace')).toBeInTheDocument();
    expect(screen.getByText('1 ongoing')).toBeInTheDocument();
  });

  it('shows the empty state when nobody is held', () => {
    renderWithRouter();
    expect(screen.getByText(/No one here yet/)).toBeInTheDocument();
  });

  it('shows the Hold button only for operators and opens the picker', () => {
    const { rerender } = renderWithRouter({ isOperator: true, contacts: [contact()] });
    fireEvent.click(screen.getByText('Pray for someone'));
    expect(screen.getByText(/Anyone from the roster/)).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <PrayerListMobile {...baseProps} isOperator={false} />
      </MemoryRouter>
    );
    // The header button is gated by isOperator; the picker sheet (if open) keeps
    // its own h3 title, so scope the negative assertion to the button itself.
    expect(document.querySelector('.prm-choose')).toBeNull();
  });

  it('starts holding a contact chosen from the picker', () => {
    const startHolding = vi.fn();
    renderWithRouter({ contacts: [contact()], startHolding });
    fireEvent.click(screen.getByText('Pray for someone'));
    fireEvent.click(screen.getByText('Alice Smith'));
    expect(startHolding).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));
    expect(screen.queryByText(/Anyone from the roster/)).not.toBeInTheDocument();
  });

  it('searches the picker via the search input', () => {
    const setSearchQuery = vi.fn();
    renderWithRouter({ contacts: [contact()], setSearchQuery });
    fireEvent.click(screen.getByText('Pray for someone'));
    fireEvent.change(screen.getByPlaceholderText('Search anyone to pray for…'), {
      target: { value: 'Ali' },
    });
    expect(setSearchQuery).toHaveBeenCalledWith('Ali');
  });

  it('navigates to /answered when the Answered tab is tapped', () => {
    let path = '';
    function Probe() {
      path = useLocation().pathname;
      return null;
    }
    render(
      <MemoryRouter>
        <Probe />
        <PrayerListMobile {...baseProps} />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByText('Answered'));
    expect(path).toBe('/answered');
  });

  it('updates a prayer status from the mark select', () => {
    const onUpdateStatus = vi.fn();
    const p = prayer({ status: 'pending' });
    renderWithRouter({ entries: [{ contact: contact(), prayers: [p] }], onUpdateStatus });
    const select = screen.getAllByRole('combobox')[0];
    fireEvent.change(select, { target: { value: 'ongoing' } });
    expect(onUpdateStatus).toHaveBeenCalledWith(p, 'ongoing');
  });

  it('edits a burden and saves it', async () => {
    const onUpdateBurden = vi.fn().mockResolvedValue(true);
    const p = prayer({ status: 'pending' });
    renderWithRouter({ entries: [{ contact: contact(), prayers: [p] }], onUpdateBurden });
    fireEvent.click(screen.getByText('Edit'));
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'New burden text' } });
    fireEvent.click(screen.getByText('Save'));
    expect(onUpdateBurden).toHaveBeenCalledWith(p, 'New burden text');
  });

  it('removes a held contact after confirmation', () => {
    const onStopHolding = vi.fn();
    renderWithRouter({ entries: [{ contact: contact(), prayers: [prayer()] }], onStopHolding });
    fireEvent.click(screen.getByTitle('Remove Alice from prayer list'));
    fireEvent.click(screen.getByText('Remove'));
    expect(onStopHolding).toHaveBeenCalledWith('c1');
  });

  it('opens testimony composer when status is set to answered', async () => {
    const onUpdateStatus = vi.fn();
    const p = prayer({ status: 'pending' });
    renderWithRouter({ entries: [{ contact: contact(), prayers: [p] }], onUpdateStatus });
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'answered' } });
    expect(onUpdateStatus).toHaveBeenCalledWith(p, 'answered', undefined, expect.any(String));

    const textarea = await screen.findByPlaceholderText(/A sentence on how God answered/i);
    fireEvent.change(textarea, { target: { value: 'Healed and strong' } });
    fireEvent.click(screen.getAllByText('Save')[0]);
    expect(onUpdateStatus).toHaveBeenCalledWith(p, 'answered', 'Healed and strong', expect.any(String));
  });

  it('allows editing an existing testimony on answered prayer', async () => {
    const onUpdateStatus = vi.fn();
    const p = prayer({ status: 'answered', answer: 'Healed completely', answeredAt: 'Aug 1' });
    renderWithRouter({ entries: [{ contact: contact(), prayers: [p] }], onUpdateStatus });

    fireEvent.click(screen.getByText('Edit Testimony'));
    const textarea = await screen.findByPlaceholderText(/A sentence on how God answered/i);
    fireEvent.change(textarea, { target: { value: 'Updated testimony text' } });
    fireEvent.click(screen.getAllByText('Save')[0]);

    expect(onUpdateStatus).toHaveBeenCalledWith(p, 'answered', 'Updated testimony text', 'Aug 1');
  });

  it('opens archive reason composer when status is set to unanswered and saves reason', async () => {
    const onUpdateStatus = vi.fn();
    const p = prayer({ status: 'pending' });
    renderWithRouter({ entries: [{ contact: contact(), prayers: [p] }], onUpdateStatus });
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'unanswered' } });
    expect(onUpdateStatus).toHaveBeenCalledWith(p, 'unanswered', undefined, undefined, undefined, undefined);

    const textarea = await screen.findByPlaceholderText(/A note on why this is archived/i);
    fireEvent.change(textarea, { target: { value: 'Moved out of state' } });
    fireEvent.click(screen.getAllByText('Save')[0]);
    expect(onUpdateStatus).toHaveBeenCalledWith(p, 'unanswered', undefined, undefined, undefined, 'Moved out of state');
  });

  it('allows editing an existing archive reason on archived prayer', async () => {
    const onUpdateStatus = vi.fn();
    const p = prayer({ status: 'unanswered', archiveReason: 'Graduated' });
    renderWithRouter({ entries: [{ contact: contact(), prayers: [p] }], onUpdateStatus });

    expect(screen.getByText('Graduated')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Edit Reason'));
    const textarea = await screen.findByPlaceholderText(/A note on why this is archived/i);
    fireEvent.change(textarea, { target: { value: 'Graduated and relocated' } });
    fireEvent.click(screen.getAllByText('Save')[0]);

    expect(onUpdateStatus).toHaveBeenCalledWith(p, 'unanswered', undefined, undefined, undefined, 'Graduated and relocated');
  });

  it('renders the contact photo when an avatar is present', () => {
    renderWithRouter({
      entries: [{ contact: contact({ avatar: 'https://example.com/a.jpg' }), prayers: [prayer()] }],
    });
    const img = document.querySelector('img[src="https://example.com/a.jpg"]');
    expect(img).not.toBeNull();
  });

  it('filters by gender when the filter control is available', () => {
    const setGenderFilter = vi.fn();
    renderWithRouter({ setGenderFilter });
    fireEvent.click(screen.getByText('Brothers'));
    expect(setGenderFilter).toHaveBeenCalledWith('brothers');
    fireEvent.click(screen.getByText('Sisters'));
    expect(setGenderFilter).toHaveBeenCalledWith('sisters');
  });

  it('opens the contact profile from the thread card', () => {
    const onOpenContact = vi.fn();
    renderWithRouter({
      entries: [{ contact: contact(), prayers: [prayer()] }],
      onOpenContact,
    });
    fireEvent.click(screen.getByText('Alice Smith'));
    expect(onOpenContact).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));
  });

  it('closes the picker via the scrim and via the close button', () => {
    renderWithRouter({ contacts: [contact()] });
    fireEvent.click(screen.getByText('Pray for someone'));
    fireEvent.click(document.querySelector('.scrim')!);
    expect(screen.queryByText(/Anyone from the roster/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Pray for someone'));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByText(/Anyone from the roster/)).not.toBeInTheDocument();
  });

  it('keeps a contact after cancelling the remove confirmation', () => {
    const onStopHolding = vi.fn();
    renderWithRouter({ entries: [{ contact: contact(), prayers: [prayer()] }], onStopHolding });
    fireEvent.click(screen.getByTitle('Remove Alice from prayer list'));
    fireEvent.click(screen.getByText('Keep'));
    expect(onStopHolding).not.toHaveBeenCalled();
    expect(screen.getByTitle('Remove Alice from prayer list')).toBeInTheDocument();
  });

  it('shows a read-only line when there is no prayer recorded this week for a non-operator', () => {
    renderWithRouter({
      entries: [{ contact: contact(), prayers: [prayer({ date: '2020-01-01' })] }],
      isOperator: false,
    });
    expect(screen.getByText(/No prayer recorded for this week/)).toBeInTheDocument();
  });

  it('expands the earlier prayers fold and caps the count', () => {
    const many = Array.from({ length: 6 }, (_, i) => prayer({ id: `p${i}`, date: `2020-01-0${i + 1}` }));
    renderWithRouter({
      entries: [{ contact: contact(), prayers: [prayer(), ...many] }],
    });
    // newest earlier prayer shows as "Last week"; the fold covers the remaining 5
    expect(screen.getByText(/Earlier — 5 prayers/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Earlier — 5 prayers/));
    // 4 shown inline (EARLIER_CAP), the last older one noted
    expect(screen.getByText(/1 older prayer/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/1 older prayer/).querySelector('button')!);
  });

  it('cancels an in-progress burden edit without saving', () => {
    const onUpdateBurden = vi.fn();
    renderWithRouter({
      entries: [{ contact: contact(), prayers: [prayer()] }],
      onUpdateBurden,
    });
    fireEvent.click(screen.getByText('Edit'));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Changed' } });
    fireEvent.click(screen.getByText('Cancel'));
    expect(onUpdateBurden).not.toHaveBeenCalled();
    expect(screen.getByText('Praying for peace')).toBeInTheDocument();
  });

  it('resets an answered prayer back to pending from the mark select', () => {
    const onUpdateStatus = vi.fn();
    const p = prayer({ status: 'answered', answer: 'yes' });
    renderWithRouter({ entries: [{ contact: contact(), prayers: [p] }], onUpdateStatus });
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: '' } });
    expect(onUpdateStatus).toHaveBeenCalledWith(p, 'pending');
  });

  it('adds a burden for this week through the composer', async () => {
    const onAddBurden = vi.fn().mockResolvedValue(true);
    const setComposeFor = vi.fn();
    renderWithRouter({
      entries: [{ contact: contact(), prayers: [] }],
      onAddBurden,
      setComposeFor,
    });
    fireEvent.click(screen.getByText(/Write what we're praying for Alice this week/));
    fireEvent.change(
      screen.getByPlaceholderText('What are we praying for Alice this week?'),
      { target: { value: 'Peace for exams' } },
    );
    fireEvent.click(screen.getByText('Add prayer'));
    expect(onAddBurden).toHaveBeenCalledWith('c1', 'Peace for exams');
  });

  it('cancels the add-composer and keeps the empty card', () => {
    renderWithRouter({ entries: [{ contact: contact(), prayers: [] }] });
    fireEvent.click(screen.getByText(/Write what we're praying for Alice this week/));
    fireEvent.change(
      screen.getByPlaceholderText('What are we praying for Alice this week?'),
      { target: { value: 'Draft' } },
    );
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.getByText(/Write what we're praying for Alice this week/)).toBeInTheDocument();
  });

  it('shows "Everyone is already here" when no addable contacts remain', () => {
    renderWithRouter({ contacts: [], entries: [{ contact: contact(), prayers: [] }] });
    fireEvent.click(screen.getByText('Pray for someone'));
    expect(screen.getByText(/Everyone's already here/)).toBeInTheDocument();
  });

  it('renders stale badge and quick actions on mobile for stale contacts', () => {
    mockOpenLogInteraction.mockClear();
    const staleDate = new Date(Date.now() - 40 * 86_400_000).toISOString();
    const stalePerson = contact({ lastContactedDate: staleDate });
    const onStopHolding = vi.fn();

    renderWithRouter({
      entries: [{ contact: stalePerson, prayers: [prayer()] }],
      onStopHolding,
    });

    expect(screen.getByTestId('stale-badge')).toBeInTheDocument();
    expect(screen.getByTestId('stale-quick-actions')).toBeInTheDocument();

    // Click "Log Interaction"
    fireEvent.click(screen.getByRole('button', { name: /Log Interaction/i }));
    expect(mockOpenLogInteraction).toHaveBeenCalledWith('c1');

    // Click "Archive" button in quick actions -> triggers remove confirmation
    fireEvent.click(screen.getByRole('button', { name: /^Archive$/i }));
    expect(screen.getByRole('button', { name: /^Remove$/i })).toBeInTheDocument();

    // Confirm remove
    fireEvent.click(screen.getByRole('button', { name: /^Remove$/i }));
    expect(onStopHolding).toHaveBeenCalledWith('c1');
  });

  it('does not render stale badge or quick actions on mobile when contact is active', () => {
    const recentDate = new Date(Date.now() - 2 * 86_400_000).toISOString();
    const activePerson = contact({ lastContactedDate: recentDate });

    renderWithRouter({
      entries: [{ contact: activePerson, prayers: [prayer()] }],
    });

    expect(screen.queryByTestId('stale-badge')).not.toBeInTheDocument();
    expect(screen.queryByTestId('stale-quick-actions')).not.toBeInTheDocument();
  });

  it('displays Cared for by and Added by in contact header metadata (issue #716)', () => {
    const contactWithTeam = contact({
      name: 'Samuel Green',
      role: 'Student',
      year: 'Junior',
      owner: 'u-mei',
      createdByName: 'Tony Wang',
    });
    const team = [
      { uid: 'u-mei', name: 'Mei Tanaka' },
    ];

    renderWithRouter({
      entries: [{ contact: contactWithTeam, prayers: [prayer()] }],
      team,
    });

    expect(screen.getByText('Samuel Green')).toBeInTheDocument();
    expect(screen.getByText(/Cared for by Mei Tanaka/)).toBeInTheDocument();
    expect(screen.getByText(/Added by Tony Wang/)).toBeInTheDocument();
  });
});
