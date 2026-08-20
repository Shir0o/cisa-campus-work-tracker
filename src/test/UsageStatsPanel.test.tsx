import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import UsageStatsPanel from '../components/settings/UsageStatsPanel';
import { UsageStats } from '../lib/usageStats';

describe('UsageStatsPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('shows an empty state before any events have been recorded', () => {
    render(<UsageStatsPanel uid="u1" />);
    expect(screen.getByText('No readings yet')).toBeInTheDocument();
    expect(screen.getByText(/visible only to you/)).toBeInTheDocument();
  });

  it('shows the three readings and can clear local events', async () => {
    UsageStats.record('u1', { type: 'screen', path: '/directory', createdAt: 1000 });
    UsageStats.record('u1', { type: 'screen', path: '/prayer', createdAt: 2000 });
    UsageStats.record('u1', { type: 'search', path: '/directory', meta: 'abandoned', createdAt: 3000 });
    UsageStats.record('u1', { type: 'create', path: '/directory', meta: 'contact', createdAt: 4000 });

    render(<UsageStatsPanel uid="u1" />);

    expect(screen.getByText(/4 local events/)).toBeInTheDocument();
    expect(screen.getByText('The long walks')).toBeInTheDocument();
    expect(screen.getByText('The dead ends')).toBeInTheDocument();
    expect(screen.getByText('The slow finds')).toBeInTheDocument();
    expect(screen.getAllByText('People').length).toBeGreaterThan(0);

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    fireEvent.click(screen.getByText('Clear readings'));

    await waitFor(() => {
      expect(screen.getByText('No readings yet')).toBeInTheDocument();
    });
  });
});
