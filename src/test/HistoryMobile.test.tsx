import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import HistoryMobile from '../views/HistoryMobile';

// A row written by the webhook / batch ingest / tag engine: `createdAt` is a
// Firestore Timestamp, not the ISO string `logActivity` writes.
const TIMESTAMP_SHAPE = {
  seconds: 1_760_000_000,
  nanoseconds: 0,
  toDate: () => new Date(1_760_000_000_000),
  toMillis: () => 1_760_000_000_000,
};

const humanize = vi.fn((_a: any): any => ({
  bucket: 'talk',
  icon: () => <span>·</span>,
  lead: 'said hi to',
  showTarget: true,
  tail: 'at the cafe',
  detail: 'a nice chat',
}));
const dayInfo = vi.fn((_iso: string) => ({ label: 'Today', sub: 'Monday' }));
const firstName = vi.fn((name: string) => name.split(' ')[0]);

const baseProps = {
  activities: [],
  contacts: [],
  filteredActivities: [],
  rows: [] as any[],
  peopleRemembered: 0,
  kind: 'all',
  setKind: vi.fn(),
  who: 'all',
  setWho: vi.fn(),
  q: '',
  setQ: vi.fn(),
  onClearFilters: vi.fn(),
  staff: ['Sarah Chen', 'Tom Lee'],
  onOpenContact: vi.fn(),
  humanize,
  dayInfo,
  firstName,
  hasMore: false,
  onShowOlder: vi.fn(),
};

const itemRow = (over: any = {}) => ({
  type: 'item',
  key: 'k1',
  a: {
    id: 'a1',
    user: 'Sarah Chen',
    action: 'talk',
    target: 'Jane',
    contactId: 'c1',
    type: 'talk',
    createdAt: '2026-08-08T10:00:00',
    ...over,
  },
} as any);

describe('HistoryMobile', () => {
  it('renders the header with moment count and people remembered', () => {
    render(<HistoryMobile {...baseProps} activities={[{}, {}] as any} peopleRemembered={3} />);
    expect(screen.getByText('Looking back')).toBeInTheDocument();
    expect(screen.getByText(/2 moments across the team, touching 3 of the people in our care/)).toBeInTheDocument();
  });

  it('opens with the heading, not a today line above it (#1827)', () => {
    render(<HistoryMobile {...baseProps} activities={[{}, {}] as any} />);
    const heading = screen.getByRole('heading', { name: 'Looking back' });
    const header = heading.closest('header');
    // The eyebrow repeated the first date marker 20px below it; the stream's
    // own markers carry the date, and an empty record should not be stamped
    // with today (#1827, following #1851).
    expect(header?.firstElementChild).toBe(heading);
  });

  it('drops the prose clause and tightens the header band to the figures sentence (#1827)', () => {
    render(
      <HistoryMobile {...baseProps} activities={[{}, {}] as any} peopleRemembered={3} totalMoments={2} />,
    );
    const header = screen.getByRole('heading', { name: 'Looking back' }).closest('header')!;
    expect(header).not.toHaveTextContent(/A record of the small, faithful work/);
    expect(header).toHaveTextContent(/2 moments across the team, touching 3 of the people in our care\./);
    // The band's own budget: pt-8/pb-6 became pt-6/pb-5, the sentence mt-2 → mt-1.5.
    expect(header).toHaveClass('pt-6', 'pb-5');
    expect(header.querySelector('.hism-state')).toHaveClass('mt-1.5');
  });

  it('prints the record total, and scopes people to the shown page while the record is longer (#1828)', () => {
    render(
      <HistoryMobile
        {...baseProps}
        activities={[{}, {}] as any}
        peopleRemembered={3}
        totalMoments={3412}
      />,
    );
    const header = screen.getByRole('heading', { name: 'Looking back' }).closest('header');
    expect(header).toHaveTextContent(/3412 moments across the team\.$/);
    expect(header).not.toHaveTextContent(/touching/);
    expect(
      screen.getByText(/2 moments across the team, touching 3 of the people in our care/),
    ).toBeInTheDocument();
  });

  it('says nothing has been logged yet when the record itself is empty', () => {
    render(<HistoryMobile {...baseProps} />);
    expect(screen.getByText(/No moments yet/i)).toBeInTheDocument();
    // The filter sentence is the filter's, not the empty record's.
    expect(screen.queryByText(/match these filters/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Show everything/i })).not.toBeInTheDocument();
  });

  it('says the filter matched nothing, and offers a way back to everything', () => {
    const onClearFilters = vi.fn();
    render(
      <HistoryMobile
        {...baseProps}
        kind="prayer"
        who="Sarah Chen"
        onClearFilters={onClearFilters}
      />,
    );
    expect(screen.getByText('Nothing here yet for that filter')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Show everything/i }));
    expect(onClearFilters).toHaveBeenCalled();
  });

  it('announces that it is still gathering instead of claiming the record is empty', () => {
    render(<HistoryMobile {...baseProps} loading />);
    expect(screen.getByText('Gathering the last few days…')).toBeInTheDocument();
    expect(screen.queryByText(/No moments yet/i)).not.toBeInTheDocument();
  });

  it('shows a Show older control only when more may exist', () => {
    const onShowOlder = vi.fn();
    const { rerender } = render(<HistoryMobile {...baseProps} hasMore onShowOlder={onShowOlder} />);
    fireEvent.click(screen.getByText('Show older moments'));
    expect(onShowOlder).toHaveBeenCalled();
    rerender(<HistoryMobile {...baseProps} hasMore={false} />);
    expect(screen.queryByText('Show older moments')).not.toBeInTheDocument();
  });

  // #1827 — a missing button is not a statement. Once the whole record is
  // loaded, the stream ends the way the reader ends (a hairline rule over a
  // small centred line): where the record stops, and the line the phone never
  // showed. Gated on #1828's truth, so it can never promise an end that is not
  // there.
  const datedActivities = [
    { id: 'a2', user: 'Sarah Chen', createdAt: '2026-08-09T10:00:00' },
    { id: 'a1', user: 'Sarah Chen', createdAt: '2026-08-01T10:00:00' },
  ] as any;

  it('ends a whole record honestly: the span and the closing line (#1827)', () => {
    render(
      <HistoryMobile
        {...baseProps}
        activities={datedActivities}
        rows={[itemRow()]}
        totalMoments={2}
      />,
    );
    const end = screen.getByTestId('history-end');
    expect(end).toHaveTextContent("That's everything — this record goes back to August 2026.");
    expect(end).toHaveTextContent('We write it down so nothing — and no one — is forgotten.');
    // The critique's charge against the old deck was that it restated the
    // totals; a footer must not recreate that one screen lower.
    expect(end).not.toHaveTextContent(/\d+ moments/);
  });

  it('claims no span while a filter is narrowing the record (#1827)', () => {
    render(
      <HistoryMobile
        {...baseProps}
        activities={datedActivities}
        rows={[itemRow()]}
        kind="prayer"
        totalMoments={2}
      />,
    );
    const end = screen.getByTestId('history-end');
    expect(end).toHaveTextContent("That's every moment matching this filter.");
    expect(end).not.toHaveTextContent(/goes back to/);
  });

  it('never ends the record while more exists, when the total is unknown, or on nothing (#1827)', () => {
    const { rerender } = render(
      <HistoryMobile
        {...baseProps}
        activities={datedActivities}
        rows={[itemRow()]}
        totalMoments={2}
        hasMore
      />,
    );
    expect(screen.queryByTestId('history-end')).not.toBeInTheDocument();

    rerender(
      <HistoryMobile {...baseProps} activities={datedActivities} rows={[itemRow()]} totalMoments={null} />,
    );
    expect(screen.queryByTestId('history-end')).not.toBeInTheDocument();

    // A count that lags high (count says 250, a short page says 2) refuses to
    // claim an end rather than trusting the count.
    rerender(
      <HistoryMobile {...baseProps} activities={datedActivities} rows={[itemRow()]} totalMoments={250} />,
    );
    expect(screen.queryByTestId('history-end')).not.toBeInTheDocument();

    rerender(<HistoryMobile {...baseProps} />);
    expect(screen.queryByTestId('history-end')).not.toBeInTheDocument();
    expect(screen.getByText(/No moments yet/i)).toBeInTheDocument();
  });

  it('renders date marks and humanized items', () => {
    render(
      <HistoryMobile
        {...baseProps}
        rows={[
          { type: 'date', at: '2026-08-08', key: 'd1' },
          itemRow(),
        ]}
      />
    );
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.getByText(/said hi to/)).toBeInTheDocument();
    expect(screen.getByText('Jane')).toBeInTheDocument();
    expect(screen.getByText('a nice chat')).toBeInTheDocument();
    expect(screen.getByText('Sarah')).toBeInTheDocument();
    expect(dayInfo).toHaveBeenCalledWith('2026-08-08');
  });

  it('opens a contact when an item with a contactId is clicked', () => {
    const onOpenContact = vi.fn();
    render(<HistoryMobile {...baseProps} rows={[itemRow()]} onOpenContact={onOpenContact} />);
    fireEvent.click(screen.getByText('Jane'));
    expect(onOpenContact).toHaveBeenCalledWith('c1');
  });

  it('gives the person a real button, so a keyboard can open them (#1768)', () => {
    const onOpenContact = vi.fn();
    render(<HistoryMobile {...baseProps} rows={[itemRow()]} onOpenContact={onOpenContact} />);
    const name = screen.getByRole('button', { name: 'Jane' });
    fireEvent.click(name);
    // The row's own click must not fire a second time from the button.
    expect(onOpenContact).toHaveBeenCalledTimes(1);
    expect(onOpenContact).toHaveBeenCalledWith('c1');
  });

  it('renders a moment whose createdAt is a Firestore Timestamp instead of crashing', () => {
    const { container } = render(
      <HistoryMobile
        {...baseProps}
        rows={[itemRow({ createdAt: TIMESTAMP_SHAPE })]}
        dayInfo={(() => ({ label: 'Today', sub: 'October 24' })) as any}
      />,
    );
    expect(screen.getByText(/said hi to/)).toBeInTheDocument();
    expect(container.querySelector('.hist-time')?.textContent).toMatch(/\d/);
  });

  it('does not open a contact for items without a contactId', () => {
    const onOpenContact = vi.fn();
    render(<HistoryMobile {...baseProps} rows={[itemRow({ contactId: undefined })]} onOpenContact={onOpenContact} />);
    fireEvent.click(screen.getByText('Jane'));
    expect(onOpenContact).not.toHaveBeenCalled();
  });

  it('opens the filter sheet and selects a kind', () => {
    const setKind = vi.fn();
    render(<HistoryMobile {...baseProps} setKind={setKind} />);
    fireEvent.click(screen.getByText('Filter history'));
    expect(screen.getByText('Team member')).toBeInTheDocument();

    expect(screen.getByRole('button', { name: 'Everything' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Steps forward' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Prayer' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Conversations' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Gatherings' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Prayer' }));
    expect(setKind).toHaveBeenCalledWith('prayer');
  });

  it('shows the active-filter count badge and chips, and clears them', () => {
    const setKind = vi.fn();
    render(<HistoryMobile {...baseProps} kind="prayer" setKind={setKind} />);
    expect(screen.getByText('Prayer')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Prayer'));
    expect(setKind).toHaveBeenCalledWith('all');
  });

  it('renders Spanish localized labels in mobile filter sheet when language is es', async () => {
    const { LanguageProvider } = await import('../components/LanguageProvider');
    localStorage.setItem('cisa_language', 'es');
    try {
      render(
        <LanguageProvider defaultLanguage="es">
          <HistoryMobile {...baseProps} />
        </LanguageProvider>
      );
      fireEvent.click(screen.getByText('Filtrar historial'));
      expect(screen.getByRole('button', { name: 'Todo' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Pasos hacia adelante' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Oración' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Conversaciones' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Reuniones' })).toBeInTheDocument();
    } finally {
      localStorage.clear();
    }
  });

  it('resets all filters from the bottom sheet', () => {
    const setKind = vi.fn();
    const setWho = vi.fn();
    render(<HistoryMobile {...baseProps} kind="prayer" who="Sarah Chen" setKind={setKind} setWho={setWho} />);
    fireEvent.click(screen.getByText('Filter history'));
    fireEvent.click(screen.getByText('Reset all'));
    expect(setKind).toHaveBeenCalledWith('all');
    expect(setWho).toHaveBeenCalledWith('all');
    expect(screen.queryByText('Team member')).not.toBeInTheDocument();
  });

  it('selects a team member from the staff dropdown', () => {
    const setWho = vi.fn();
    render(<HistoryMobile {...baseProps} setWho={setWho} />);
    fireEvent.click(screen.getByText('Filter history'));
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'Tom Lee' } });
    expect(setWho).toHaveBeenCalledWith('Tom Lee');
  });

  it('closes the sheet from the close button, scrim, Done and Escape', () => {
    const setWho = vi.fn();
    render(<HistoryMobile {...baseProps} who="Sarah Chen" setWho={setWho} />);

    fireEvent.click(screen.getAllByText('Sarah')[0]);
    expect(setWho).toHaveBeenCalledWith('all');

    fireEvent.click(screen.getByText('Filter history'));
    fireEvent.click(screen.getByLabelText('Close'));
    expect(screen.queryByText('Team member')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Filter history'));
    const scrim = document.querySelector('.scrim')!;
    fireEvent.click(scrim);
    expect(screen.queryByText('Team member')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Filter history'));
    fireEvent.click(screen.getByText('Done'));
    expect(screen.queryByText('Team member')).not.toBeInTheDocument();

    fireEvent.click(screen.getByText('Filter history'));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByText('Team member')).not.toBeInTheDocument();
  });

  it('names the filter sheet as a dialog with a title', () => {
    render(<HistoryMobile {...baseProps} />);
    fireEvent.click(screen.getByText('Filter history'));
    const sheet = screen.getByRole('dialog');
    expect(sheet).toHaveAttribute('aria-modal', 'true');
    expect(sheet).toHaveAccessibleName('Filter history');
  });

  it('finds a moment by typing, so a long record is searchable on a phone', () => {
    const setQ = vi.fn();
    render(<HistoryMobile {...baseProps} setQ={setQ} />);
    fireEvent.click(screen.getByText('Filter history'));
    fireEvent.change(screen.getByPlaceholderText('Find a moment or a name…'), { target: { value: 'chaplaincy' } });
    expect(setQ).toHaveBeenCalledWith('chaplaincy');
  });
});
