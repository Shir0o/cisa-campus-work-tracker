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
});
