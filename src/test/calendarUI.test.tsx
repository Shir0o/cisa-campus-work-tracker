import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Icon, Btn, IconBtn, SegItem, CatDot, Kbd } from '../components/calendar/ui';
import { HoverPreview } from '../components/calendar/HoverPreview';
import { TweaksPanel, useTweaks } from '../components/calendar/TweaksPanel';

describe('Calendar UI Atoms', () => {
  it('renders Icon for all named glyphs', () => {
    const names = [
      'chevL',
      'chevR',
      'chevD',
      'chevU',
      'plus',
      'search',
      'close',
      'cal',
      'clock',
      'pin',
      'edit',
      'trash',
      'filter',
      'grid',
      'list',
      'bars',
      'year',
      'today',
      'drag',
      'check',
      'spark',
      'arrow',
      'bell',
      'repeat',
      'warn',
      'lock',
      'google',
      'logout',
      'shield',
    ] as const;

    for (const name of names) {
      const { unmount } = render(<Icon name={name} size={16} />);
      unmount();
    }
  });

  it('renders Btn with variant, leading icon, and onClick', () => {
    const onClick = vi.fn();
    render(
      <Btn variant="primary" leading="plus" onClick={onClick}>
        Click Me
      </Btn>
    );

    const btn = screen.getByRole('button', { name: /Click Me/i });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalled();
  });

  it('renders IconBtn and handles click', () => {
    const onClick = vi.fn();
    render(<IconBtn icon="close" label="Close Dialog" onClick={onClick} />);

    const btn = screen.getByRole('button', { name: /Close Dialog/i });
    expect(btn).toBeInTheDocument();
    fireEvent.click(btn);
    expect(onClick).toHaveBeenCalled();
  });

  it('renders SegItem active and inactive', () => {
    const onClick = vi.fn();
    const { rerender } = render(
      <SegItem active={true} onClick={onClick}>
        Month
      </SegItem>
    );

    const btn = screen.getByRole('button', { name: /Month/i });
    expect(btn).toHaveClass('is-active');

    rerender(
      <SegItem active={false} onClick={onClick}>
        Month
      </SegItem>
    );
    expect(btn).not.toHaveClass('is-active');
  });

  it('renders CatDot with category id and custom size', () => {
    const { container } = render(<CatDot cat="product" size={10} />);
    const dot = container.querySelector('.catdot');
    expect(dot).toBeInTheDocument();
  });

  it('renders Kbd element', () => {
    render(<Kbd>⌘K</Kbd>);
    expect(screen.getByText('⌘K')).toBeInTheDocument();
  });

  it('renders HoverPreview with conflicts, all-day multi-day dates, and notes', () => {
    const hoverPayload = {
      ev: {
        id: 'ev-test',
        title: 'Multi-day Offsite',
        cat: 'workshop' as const,
        start: new Date(2026, 7, 24),
        end: new Date(2026, 7, 27),
        allDay: true,
        loc: 'Mountain View',
        notes: 'Bring laptops',
        rrule: { freq: 'weekly' as const },
      },
      x: 100,
      y: 150,
      conflicts: 2,
    };

    const { rerender } = render(<HoverPreview hover={null} />);
    expect(screen.queryByText('Multi-day Offsite')).not.toBeInTheDocument();

    rerender(<HoverPreview hover={hoverPayload} feedMap={{}} />);
    expect(screen.getByText('Multi-day Offsite')).toBeInTheDocument();
    expect(screen.getByText(/WORKSHOP/i)).toBeInTheDocument();
    expect(screen.getByText(/REPEATS/i)).toBeInTheDocument();
    expect(screen.getByText(/Mountain View/i)).toBeInTheDocument();
    expect(screen.getByText(/Bring laptops/i)).toBeInTheDocument();
    expect(screen.getByText(/Conflicts with 2 other events/i)).toBeInTheDocument();
  });

  it('renders TweaksPanel and allows toggling settings', () => {
    const setTweak = vi.fn();
    const tweaks = {
      density: 'default' as const,
      theme: 'light' as const,
      accent: '#4f4cdb',
      defaultView: 'month' as const,
      showWeekends: true,
      showConflicts: true,
    };

    const { rerender } = render(<TweaksPanel tweaks={tweaks} setTweak={setTweak} />);

    // Open panel fab
    const fab = screen.getByRole('button', { name: /Settings/i });
    fireEvent.click(fab);

    // Switch theme
    fireEvent.click(screen.getByText('dark'));
    expect(setTweak).toHaveBeenCalledWith('theme', 'dark');

    // Switch density
    fireEvent.click(screen.getByText('compact'));
    expect(setTweak).toHaveBeenCalledWith('density', 'compact');

    // Toggle weekends
    const toggles = screen.getAllByRole('button');
    const weekendToggle = toggles.find((b) => b.classList.contains('toggle'));
    if (weekendToggle) {
      fireEvent.click(weekendToggle);
      expect(setTweak).toHaveBeenCalledWith('showWeekends', false);
    }

    // Select default view
    const select = screen.getByRole('combobox');
    fireEvent.change(select, { target: { value: 'week' } });
    expect(setTweak).toHaveBeenCalledWith('defaultView', 'week');

    // Close panel
    const closeBtn = screen.getByRole('button', { name: /Close settings/i });
    fireEvent.click(closeBtn);
  });
});
