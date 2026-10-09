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

// The popup frame turns into a bottom sheet below 768px (spec #1444/#1447); the
// phone picker test flips this to true to assert the sheet, and back afterwards.
const mediaQuery = vi.hoisted(() => ({ phone: false }));
vi.mock('../lib/useMediaQuery', () => ({
  useMediaQuery: () => mediaQuery.phone,
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
  startHolding: vi.fn(),
  onAddBurden: vi.fn().mockResolvedValue(true),
  onUpdateStatus: vi.fn(),
  onUpdateBurden: vi.fn().mockResolvedValue(true),
  onOpenContact: vi.fn(),
  answeredThisYear: 3,
  awaiting: 2,
  composeFor: null,
  setComposeFor: vi.fn(),
  onRemoveFromPrayerList: vi.fn(),
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
    expect(
      screen.getByRole('dialog', { name: 'Who are we praying for?' }),
    ).toBeInTheDocument();

    rerender(
      <MemoryRouter>
        <PrayerListMobile {...baseProps} isOperator={false} />
      </MemoryRouter>
    );
    // The header button is gated by isOperator; the picker sheet (if open) keeps
    // its own h3 title, so scope the negative assertion to the button itself.
    expect(document.querySelector('.prm-choose')).toBeNull();
  });

  it('starts holding a contact chosen from the picker', async () => {
    const startHolding = vi.fn();
    renderWithRouter({ contacts: [contact()], startHolding });
    fireEvent.click(screen.getByText('Pray for someone'));
    fireEvent.click(screen.getByText('Alice Smith'));
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(startHolding).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Who are we praying for?' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('searches the picker', () => {
    renderWithRouter({
      contacts: [contact({ id: 'c1', name: 'Alice Smith' }), contact({ id: 'c2', name: 'Bob Jones' })],
    });
    fireEvent.click(screen.getByText('Pray for someone'));
    fireEvent.change(screen.getByPlaceholderText('Search the people you know…'), {
      target: { value: 'Bob' },
    });
    expect(screen.getByText('Bob Jones')).toBeInTheDocument();
    expect(screen.queryByText('Alice Smith')).not.toBeInTheDocument();
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

  it('removes a held contact at once, with no confirm step (#715)', () => {
    const onRemoveFromPrayerList = vi.fn();
    const alice = contact();
    renderWithRouter({ entries: [{ contact: alice, prayers: [prayer()] }], onRemoveFromPrayerList });
    fireEvent.click(screen.getByTitle('Remove Alice from prayer list'));
    // The way back is the page's Undo snackbar, not an inline Remove / Keep.
    expect(screen.queryByText('Keep')).not.toBeInTheDocument();
    expect(onRemoveFromPrayerList).toHaveBeenCalledWith(alice);
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

  it('closes the picker via the close button and Escape', async () => {
    renderWithRouter({ contacts: [contact()] });
    fireEvent.click(screen.getByText('Pray for someone'));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Who are we praying for?' }),
      ).not.toBeInTheDocument(),
    );

    fireEvent.click(screen.getByText('Pray for someone'));
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Who are we praying for?' }),
      ).not.toBeInTheDocument(),
    );
  });

  it('renders the picker as a bottom sheet on a phone', () => {
    mediaQuery.phone = true;
    try {
      renderWithRouter({ contacts: [contact()] });
      fireEvent.click(screen.getByText('Pray for someone'));
      expect(
        screen.getByRole('dialog', { name: 'Who are we praying for?' }),
      ).toBeInTheDocument();
      expect(screen.getByTestId('popup-sheet-grabber')).toBeInTheDocument();
    } finally {
      mediaQuery.phone = false;
    }
  });

  it('leaves the removal alone until the × is pressed', () => {
    const onRemoveFromPrayerList = vi.fn();
    renderWithRouter({ entries: [{ contact: contact(), prayers: [prayer()] }], onRemoveFromPrayerList });
    expect(screen.getByTitle('Remove Alice from prayer list')).toBeInTheDocument();
    expect(onRemoveFromPrayerList).not.toHaveBeenCalled();
  });

  it('shows a read-only line when there is no prayer recorded this week for a non-operator', () => {
    renderWithRouter({
      entries: [{ contact: contact(), prayers: [prayer({ date: '2020-01-01' })] }],
      isOperator: false,
    });
    expect(screen.getByText(/No prayer recorded for this week/)).toBeInTheDocument();
  });

  // #709 — the mobile card carried the same rail bug as the desktop one: the
  // colour said both where-you-are and how-it-landed, so it ran from --primary
  // down to an undrawn --outline-variant. Structure is one spine now; state is
  // a dot on it.
  it('draws one neutral spine instead of a per-entry coloured rail', () => {
    const { container } = renderWithRouter({
      entries: [{ contact: contact(), prayers: [prayer(), prayer({ id: 'p2', date: '2020-01-01', status: 'answered' })] }],
    });
    expect(container.querySelector('.border-l-primary')).toBeNull();
    expect(container.querySelector('.border-l-success\\/50')).toBeNull();
    expect(container.querySelectorAll('[data-testid="prayer-spine"]')).toHaveLength(1);
  });

  it('expands the earlier prayers fold and caps the count', () => {
    const many = Array.from({ length: 6 }, (_, i) => prayer({ id: `p${i}`, date: `2020-01-0${i + 1}` }));
    renderWithRouter({
      entries: [{ contact: contact(), prayers: [prayer(), ...many] }],
    });
    // The newest older prayer is surfaced for context, but it is not last
    // week's, so it is labelled "Earlier"; the fold covers the remaining 5.
    expect(screen.queryByText('Last week')).not.toBeInTheDocument();
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

  it('submits the mobile week composer with ⌘+Enter (#1402)', async () => {
    const onAddBurden = vi.fn().mockResolvedValue(true);
    renderWithRouter({ entries: [{ contact: contact(), prayers: [] }], onAddBurden });
    fireEvent.click(screen.getByText(/Write what we're praying for Alice this week/));
    const textarea = screen.getByPlaceholderText('What are we praying for Alice this week?');
    fireEvent.change(textarea, { target: { value: 'Peace for exams' } });

    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });

    await waitFor(() => expect(onAddBurden).toHaveBeenCalledWith('c1', 'Peace for exams'));
    expect(screen.queryByPlaceholderText('What are we praying for Alice this week?')).not.toBeInTheDocument();
  });

  it('treats Ctrl+Enter like ⌘+Enter in the mobile week composer (#1402)', async () => {
    const onAddBurden = vi.fn().mockResolvedValue(true);
    renderWithRouter({ entries: [{ contact: contact(), prayers: [] }], onAddBurden });
    fireEvent.click(screen.getByText(/Write what we're praying for Alice this week/));
    const textarea = screen.getByPlaceholderText('What are we praying for Alice this week?');
    fireEvent.change(textarea, { target: { value: 'Peace for exams' } });

    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });

    await waitFor(() => expect(onAddBurden).toHaveBeenCalledWith('c1', 'Peace for exams'));
  });

  it('does not submit the mobile week composer on plain Enter (#1402)', () => {
    const onAddBurden = vi.fn().mockResolvedValue(true);
    renderWithRouter({ entries: [{ contact: contact(), prayers: [] }], onAddBurden });
    fireEvent.click(screen.getByText(/Write what we're praying for Alice this week/));
    const textarea = screen.getByPlaceholderText('What are we praying for Alice this week?');
    fireEvent.change(textarea, { target: { value: 'Peace for exams' } });

    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(onAddBurden).not.toHaveBeenCalled();
  });

  it('ignores ⌘+Enter in the mobile week composer when empty or whitespace-only (#1402)', () => {
    const onAddBurden = vi.fn().mockResolvedValue(true);
    renderWithRouter({ entries: [{ contact: contact(), prayers: [] }], onAddBurden });
    fireEvent.click(screen.getByText(/Write what we're praying for Alice this week/));
    const textarea = screen.getByPlaceholderText('What are we praying for Alice this week?');
    fireEvent.change(textarea, { target: { value: '   ' } });

    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });

    expect(onAddBurden).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText('What are we praying for Alice this week?')).toBeInTheDocument();
  });

  it('does not fire a second save while the mobile week composer is saving (#1402)', () => {
    let resolveAdd!: (value: boolean) => void;
    const onAddBurden = vi.fn(
      () =>
        new Promise<boolean>((resolve) => {
          resolveAdd = resolve;
        }),
    );
    renderWithRouter({ entries: [{ contact: contact(), prayers: [] }], onAddBurden });
    fireEvent.click(screen.getByText(/Write what we're praying for Alice this week/));
    const textarea = screen.getByPlaceholderText('What are we praying for Alice this week?');
    fireEvent.change(textarea, { target: { value: 'Peace for exams' } });

    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });
    fireEvent.keyDown(textarea, { key: 'Enter', metaKey: true });

    expect(onAddBurden).toHaveBeenCalledTimes(1);
    resolveAdd(true);
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
    const onRemoveFromPrayerList = vi.fn();

    renderWithRouter({
      entries: [{ contact: stalePerson, prayers: [prayer()] }],
      onRemoveFromPrayerList,
    });

    expect(screen.getByTestId('stale-badge')).toBeInTheDocument();
    expect(screen.getByTestId('stale-quick-actions')).toBeInTheDocument();

    // Click "Log Interaction"
    fireEvent.click(screen.getByRole('button', { name: /Log Interaction/i }));
    expect(mockOpenLogInteraction).toHaveBeenCalledWith('c1');

    // Removal is the card's × now, not a second spelling on the strip (#714).
    expect(screen.queryByRole('button', { name: /^Archive$/i })).not.toBeInTheDocument();
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
      carers: ['u-mei'],
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
