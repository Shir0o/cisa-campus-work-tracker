import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SeasonChip from '../components/layout/SeasonChip';

const h = vi.hoisted(() => ({
  setSeason: vi.fn(),
  resetSeason: vi.fn(),
  toggleClubRush: vi.fn(),
  season: {} as any,
  isManager: true,
}));

vi.mock('../lib/seasons', () => ({
  SEASON_ORDER: ['spring', 'summer', 'fall', 'winter'],
  SEASONS: {
    spring: { id: 'spring', label: 'Spring' },
    summer: { id: 'summer', label: 'Summer' },
    fall: { id: 'fall', label: 'Fall' },
    winter: { id: 'winter', label: 'Winter' },
  },
  useSeason: () => h.season,
}));

vi.mock('../components/AuthProvider', () => ({
  useAuth: () => ({ isManager: h.isManager }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  h.isManager = true;
  h.season = {
    autoId: 'fall',
    activeId: 'fall',
    active: { id: 'fall', label: 'Fall' },
    isAuto: true,
    clubRush: false,
    label: "Fall '26",
    tags: ["Fall '26"],
    setSeason: h.setSeason,
    resetSeason: h.resetSeason,
    toggleClubRush: h.toggleClubRush,
  };
});

describe('SeasonChip', () => {
  it('renders nothing when the sidebar is collapsed', () => {
    const { container } = render(<SeasonChip collapsed />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the active season label', () => {
    render(<SeasonChip />);
    expect(screen.getByText("Fall '26")).toBeInTheDocument();
  });

  it('is read-only (no popover trigger) for non-managers', () => {
    h.isManager = false;
    render(<SeasonChip />);
    expect(screen.getByText("Fall '26")).toBeInTheDocument();
    expect(screen.queryByTitle('Season & club rush')).not.toBeInTheDocument();
  });

  it('lets a manager override the season and toggle club rush', () => {
    render(<SeasonChip />);
    fireEvent.click(screen.getByTitle('Season & club rush'));

    // Popover with the season options + club-rush toggle.
    expect(screen.getByText('Tagging sign-ups for')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Winter'));
    expect(h.setSeason).toHaveBeenCalledWith('winter');

    fireEvent.click(screen.getByRole('button', { name: /Club rush/i }));
    expect(h.toggleClubRush).toHaveBeenCalled();
  });

  it('offers a reset back to the current term when overridden', () => {
    h.season.isAuto = false;
    render(<SeasonChip />);
    fireEvent.click(screen.getByTitle('Season & club rush'));
    fireEvent.click(screen.getByText(/Back to the current term/i));
    expect(h.resetSeason).toHaveBeenCalled();
  });
});
