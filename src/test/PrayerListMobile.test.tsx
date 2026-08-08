import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
import PrayerListMobile from '../views/PrayerListMobile';

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
    fireEvent.click(screen.getByText('Hold someone in prayer'));
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
    fireEvent.click(screen.getByText('Hold someone in prayer'));
    fireEvent.click(screen.getByText('Alice Smith'));
    expect(startHolding).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));
    expect(screen.queryByText(/Anyone from the roster/)).not.toBeInTheDocument();
  });

  it('searches the picker via the search input', () => {
    const setSearchQuery = vi.fn();
    renderWithRouter({ contacts: [contact()], setSearchQuery });
    fireEvent.click(screen.getByText('Hold someone in prayer'));
    fireEvent.change(screen.getByPlaceholderText('Search anyone to hold in prayer…'), {
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

  it('auto-opens the composer and adds a burden for the composeFor contact', async () => {
    const onAddBurden = vi.fn().mockResolvedValue(true);
    const setComposeFor = vi.fn();
    renderWithRouter({
      entries: [{ contact: contact(), prayers: [] }],
      composeFor: 'c1',
      onAddBurden,
      setComposeFor,
    });
    const textarea = screen.getByPlaceholderText('What are we praying for Alice this week?');
    fireEvent.change(textarea, { target: { value: 'Final exams' } });
    fireEvent.click(screen.getByText('Add prayer'));
    expect(onAddBurden).toHaveBeenCalledWith('c1', 'Final exams');
    await waitFor(() => expect(setComposeFor).toHaveBeenCalledWith(null));
  });
});
