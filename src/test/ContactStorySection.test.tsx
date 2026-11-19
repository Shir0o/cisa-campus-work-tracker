// §21 + fix round 1: the team prayer footer on a person's prayer card follows
// the person — including the team's own removal. A contact carrying both
// `teamPrayer: true` and `prayerListRemoved` is off "On our hearts" for
// everyone, so the card must offer "Bring to team prayer", not the link and
// "Take off team prayer".
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ContactStorySection from '../components/contact/ContactStorySection';
import type { StoryEntry } from '../lib/contactStory';
import type { Contact, PrayerRecord } from '../types';

const prayer = {
  id: 'p1',
  contactId: 'c1',
  burden: 'For her interview',
  status: 'pending',
  date: new Date(Date.now() - 3 * 86_400_000).toISOString(),
} as PrayerRecord;

const contact = {
  id: 'c1',
  name: 'Alice Johnson',
  createdAt: '2026-01-01T00:00:00.000Z',
} as Contact;

const story: StoryEntry[] = [
  { kind: 'prayer', id: 'p1', at: prayer.date as string, prayer },
];

function renderSection(overrides: {
  currentContact?: Contact;
  onSetPrayerTeamPrayer?: (on: boolean) => void;
} = {}) {
  return render(
    <ContactStorySection
      story={story}
      fmtDate={() => 'Today'}
      composer={null}
      interactionsLoading={false}
      currentContact={overrides.currentContact ?? contact}
      user={{ uid: 'u-me' }}
      isAdmin
      canUpdatePrayers
      onOpenConversation={vi.fn()}
      onRemoveInteraction={vi.fn()}
      onUpdateInteraction={vi.fn()}
      onUpdatePrayerStatus={vi.fn()}
      onSetPrayerTeamPrayer={overrides.onSetPrayerTeamPrayer ?? vi.fn()}
      onUpdatePrayerBurden={vi.fn()}
      teamMembers={[]}
    />,
  );
}

describe('ContactStorySection — team prayer footer', () => {
  it('shows the team-prayer link for a person on the list', () => {
    renderSection({ currentContact: { ...contact, teamPrayer: true } });
    expect(screen.getByRole('link', { name: /On our hearts/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bring to team prayer' })).toBeNull();
  });

  it('offers "Bring to team prayer" for a person the team removed, even with the flag set', () => {
    const onSetTeamPrayer = vi.fn();
    renderSection({
      currentContact: {
        ...contact,
        teamPrayer: true,
        prayerListRemoved: { at: '2026-10-01T00:00:00.000Z', by: 'u-admin' },
      },
      onSetPrayerTeamPrayer: onSetTeamPrayer,
    });

    expect(screen.queryByRole('link', { name: /On our hearts/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Take off team prayer' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Bring to team prayer' }));
    expect(onSetTeamPrayer).toHaveBeenCalledWith(true);
  });

  // TRANSITIONAL (fix round 1): the migration has run, so an un-stamped
  // person is off the list and the card offers to bring them back.
  it('offers "Bring to team prayer" for an un-stamped person', () => {
    renderSection();
    expect(screen.queryByRole('link', { name: /On our hearts/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Bring to team prayer' })).toBeInTheDocument();
  });
});
