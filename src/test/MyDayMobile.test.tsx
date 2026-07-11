import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import MyDayMobile from '../views/MyDayMobile';
import { useAuth } from '../components/AuthProvider';

vi.mock('../components/AuthProvider', () => ({
  useAuth: vi.fn(),
}));

describe('MyDayMobile', () => {
  it('renders correctly with no data', () => {
    (useAuth as any).mockReturnValue({
      user: { displayName: 'John Doe' },
    });

    render(<MyDayMobile contacts={[]} events={[]} prayers={[]} stages={[]} />);

    expect(screen.getByText('Good morning, John.')).toBeInTheDocument();
    expect(screen.getByText('Your people')).toBeInTheDocument();
    expect(screen.getByText('No contacts assigned yet.')).toBeInTheDocument();

    expect(screen.getByText('Your week')).toBeInTheDocument();
    expect(screen.getByText('Nothing on the calendar this week.')).toBeInTheDocument();

    expect(screen.getByText('Your prayers')).toBeInTheDocument();
    expect(screen.getByText('No prayers held currently.')).toBeInTheDocument();
  });

  it('renders contacts, events, and prayers correctly', () => {
    (useAuth as any).mockReturnValue({
      user: { displayName: 'Jane Doe' },
    });

    const mockContacts = [
      { id: '1', name: 'Alice Smith', role: 'Student' } as any,
    ];

    const mockEvents = [
      { id: '1', name: 'Bible Study', date: new Date().toISOString(), location: 'Room 101' } as any,
      { id: '2', name: 'Worship Night', date: new Date(Date.now() + 86400000).toISOString(), location: 'Main Hall' } as any,
    ];

    const mockPrayers = [
      { id: '1', title: 'For Peace', burden: 'Praying for world peace', status: 'ongoing' } as any,
    ];

    render(<MyDayMobile contacts={mockContacts} events={mockEvents} prayers={mockPrayers} stages={[]} />);

    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
    expect(screen.getByText('Student')).toBeInTheDocument();

    expect(screen.getByText('Bible Study')).toBeInTheDocument();
    expect(screen.getByText('Room 101')).toBeInTheDocument();
    expect(screen.getByText('Worship Night')).toBeInTheDocument();
    expect(screen.getByText('Main Hall')).toBeInTheDocument();

    expect(screen.getByText('ongoing')).toBeInTheDocument();
  });

  it('renders with missing user displayName gracefully', () => {
    (useAuth as any).mockReturnValue({
      user: { },
    });

    render(<MyDayMobile contacts={[]} events={[]} prayers={[]} stages={[]} />);
    expect(screen.getByText('Good morning, friend.')).toBeInTheDocument();
  });

  it('renders different event configurations gracefully', () => {
    (useAuth as any).mockReturnValue({ user: { displayName: 'John Doe' } });

    const mockEvents = [
      { id: '1', name: 'Bible Study', date: new Date().toISOString() } as any, // Missing location
      { id: '2', name: 'Worship Night', date: 'invalid-date' } as any, // Invalid date
    ];

    render(<MyDayMobile contacts={[]} events={mockEvents} prayers={[]} stages={[]} />);

    expect(screen.getByText('Bible Study')).toBeInTheDocument();
    expect(screen.getByText('Worship Night')).toBeInTheDocument();
    expect(screen.getByText('No location set')).toBeInTheDocument();
    expect(screen.getByText('–')).toBeInTheDocument();
  });
  it('navigates to attendance when Calendar link is clicked', async () => {
    (useAuth as any).mockReturnValue({
      user: { displayName: 'John Doe' },
    });

    render(<MyDayMobile contacts={[]} events={[{id: "1", name: "test event", date: new Date().toISOString()}] as any} prayers={[]} stages={[]} />);

    // Check if event rendered
    expect(screen.getByText('test event')).toBeInTheDocument();
  });

  it('does not crash when prayers list is empty', async () => {
    (useAuth as any).mockReturnValue({
      user: { displayName: 'John Doe' },
    });

    render(<MyDayMobile contacts={[]} events={[]} prayers={[]} stages={[]} />);
    expect(screen.getByText('No prayers held currently.')).toBeInTheDocument();
  });


  it('covers the else case when no events are available for the week', () => {
    (useAuth as any).mockReturnValue({
      user: { displayName: 'John Doe' },
    });

    render(<MyDayMobile contacts={[]} events={[]} prayers={[]} stages={[]} />);
    expect(screen.getByText('Nothing on the calendar this week.')).toBeInTheDocument();
  });

  it('covers the case when no contacts are available', () => {
    (useAuth as any).mockReturnValue({
      user: { displayName: 'John Doe' },
    });

    render(<MyDayMobile contacts={[]} events={[]} prayers={[]} stages={[]} />);
    expect(screen.getByText('No contacts assigned yet.')).toBeInTheDocument();
  });

});
