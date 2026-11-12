import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ContactPrayerCard from '../components/contact/ContactPrayerCard';
import type { PrayerRecord } from '../types';

const prayer = {
  id: 'p1',
  contactId: 'c1',
  burden: 'For her interview\n\nShe asked us to pray she is not nervous.',
  status: 'pending',
  date: new Date(Date.now() - 3 * 86_400_000).toISOString(),
} as PrayerRecord;

describe('ContactPrayerCard — a prayer reads as a prayer (#1672)', () => {
  it('names itself a prayer request and splits the request from its context', () => {
    render(<ContactPrayerCard prayer={prayer} canUpdatePrayers onUpdateStatus={vi.fn()} />);

    const card = screen.getByRole('article', { name: 'Prayer request' });
    expect(card).toHaveTextContent('Prayer request');
    expect(screen.getByText('For her interview')).toHaveClass('cd-prayer-text');
    expect(screen.getByText('She asked us to pray she is not nervous.')).toHaveClass('cd-prayer-context');
    expect(card).toHaveTextContent(/held 3 days/i);
  });

  it('shows status as one control, Open pressed while pending', () => {
    const onUpdateStatus = vi.fn();
    render(<ContactPrayerCard prayer={prayer} canUpdatePrayers onUpdateStatus={onUpdateStatus} />);

    const group = screen.getByRole('group', { name: 'Prayer status' });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Answered' })).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(screen.getByRole('button', { name: 'Answered' }));
    expect(onUpdateStatus).toHaveBeenCalledWith(prayer, 'answered');
  });

  it('pressing the chosen status again returns the prayer to Open', () => {
    const onUpdateStatus = vi.fn();
    const answered = { ...prayer, status: 'answered' } as PrayerRecord;
    render(<ContactPrayerCard prayer={answered} canUpdatePrayers onUpdateStatus={onUpdateStatus} />);

    fireEvent.click(screen.getByRole('button', { name: 'Answered' }));
    expect(onUpdateStatus).toHaveBeenCalledWith(answered, 'pending');
  });

  it('offers Edit only to someone who can update prayers (#1674)', () => {
    const onEdit = vi.fn();
    const { rerender } = render(
      <ContactPrayerCard prayer={prayer} canUpdatePrayers onUpdateStatus={vi.fn()} onEdit={onEdit} />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Edit prayer' }));
    expect(onEdit).toHaveBeenCalled();

    rerender(
      <ContactPrayerCard prayer={prayer} canUpdatePrayers={false} onUpdateStatus={vi.fn()} onEdit={onEdit} />,
    );
    expect(screen.queryByRole('button', { name: 'Edit prayer' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Prayer status' })).toBeNull();
  });

  describe('team prayer footer', () => {
    const off = { ...prayer, teamPrayer: false } as PrayerRecord;
    const on = { ...prayer, teamPrayer: true } as PrayerRecord;

    it('off the team: offers only "Bring to team prayer", no label', () => {
      const onSetTeamPrayer = vi.fn();
      render(<ContactPrayerCard prayer={off} canUpdatePrayers onUpdateStatus={vi.fn()} onSetTeamPrayer={onSetTeamPrayer} />);
      fireEvent.click(screen.getByRole('button', { name: 'Bring to team prayer' }));
      expect(onSetTeamPrayer).toHaveBeenCalledWith(off, true);
      expect(screen.queryByText(/on our hearts/i)).toBeNull();
      expect(screen.queryByText(/not on team prayer|only you|private/i)).toBeNull();
    });

    it('on the team: shows the link and a quiet "Take off team prayer"', () => {
      const onSetTeamPrayer = vi.fn();
      render(<ContactPrayerCard prayer={on} canUpdatePrayers onUpdateStatus={vi.fn()} onSetTeamPrayer={onSetTeamPrayer} />);
      expect(screen.getByRole('link', { name: /On our hearts/ })).toHaveAttribute('href', '/prayer');
      expect(screen.getByText(/Team prayers/)).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Take off team prayer' }));
      expect(onSetTeamPrayer).toHaveBeenCalledWith(on, false);
    });

    it('an absent flag counts as the team (legacy)', () => {
      render(<ContactPrayerCard prayer={prayer} canUpdatePrayers onUpdateStatus={vi.fn()} onSetTeamPrayer={vi.fn()} />);
      expect(screen.getByRole('button', { name: 'Take off team prayer' })).toBeInTheDocument();
    });

    it('without permission: read-only line when shared, nothing when not', () => {
      const { unmount } = render(<ContactPrayerCard prayer={on} canUpdatePrayers={false} onUpdateStatus={vi.fn()} onSetTeamPrayer={vi.fn()} />);
      expect(screen.getByRole('link', { name: /On our hearts/ })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Take off team prayer' })).toBeNull();
      unmount();
      render(<ContactPrayerCard prayer={off} canUpdatePrayers={false} onUpdateStatus={vi.fn()} onSetTeamPrayer={vi.fn()} />);
      expect(screen.queryByRole('button', { name: 'Bring to team prayer' })).toBeNull();
      expect(screen.queryByText(/on our hearts/i)).toBeNull();
    });
  });
});
