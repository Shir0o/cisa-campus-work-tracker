import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import HistoryMobile from '../views/HistoryMobile';

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
  staff: ['Sarah Chen', 'Tom Lee'],
  onOpenContact: vi.fn(),
  humanize,
  dayInfo,
  firstName,
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
    expect(screen.getByText('2 moments')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('shows the empty state when there are no rows', () => {
    render(<HistoryMobile {...baseProps} />);
    expect(screen.getByText('No logged moments match these filters.')).toBeInTheDocument();
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
    fireEvent.click(screen.getByText('Prayer'));
    expect(setKind).toHaveBeenCalledWith('prayer');
  });

  it('shows the active-filter count badge and chips, and clears them', () => {
    const setKind = vi.fn();
    render(<HistoryMobile {...baseProps} kind="prayer" setKind={setKind} />);
    expect(screen.getByText('Prayer')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Prayer'));
    expect(setKind).toHaveBeenCalledWith('all');
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

  it('clears the who-chip and closes the sheet from the close button, scrim, and Apply filters', () => {
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
    fireEvent.click(screen.getByText('Apply filters'));
    expect(screen.queryByText('Team member')).not.toBeInTheDocument();
  });
});
