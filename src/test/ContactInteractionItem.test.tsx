import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ContactInteractionItem from '../components/contact/ContactInteractionItem';
import { interactionAdapter } from '../components/stream/interactionAdapter';
import type { Interaction } from '../types';
import type { ContactTeamMember } from '../components/contact/types';
import { emptyComposer } from '../lib/contactComposer';

const noop = () => {};

const team: ContactTeamMember[] = [
  { id: 'jae', name: 'Jae Park', role: 'Staff', initials: 'JP', fullTimer: false },
  { id: 'jae-photo', name: 'Jae Park', role: 'Staff', initials: 'JP', fullTimer: false, photoURL: 'https://example.com/jae.jpg' },
];

const renderItem = (interaction: Interaction, teamMembers: ContactTeamMember[] = team) =>
  render(
    <ContactInteractionItem
      interaction={interaction}
      canEdit={false}
      canRemove={false}
      editing={false}
      editData={emptyComposer()}
      onEditDataChange={vi.fn()}
      onStartEdit={noop}
      onCancelEdit={noop}
      onUpdate={noop}
      updating={false}
      onRemove={noop}
      adapterFor={(i) =>
        interactionAdapter({
          contactId: 'c1',
          contactName: 'John Doe',
          interaction: i,
          messages: [],
          me: { uid: 'me', name: 'Me' },
          teamMembers: [],
          t: (key: string) => key,
        })
      }
      viewer={{ uid: 'me', role: 'admin' }}
      threadOpen={false}
      onOpenThread={noop}
      teamMembers={teamMembers}
    />,
  );

const base: Interaction = {
  id: 'i1',
  userId: 'anna',
  userName: 'Anna',
  content: 'He messaged him',
  dateTime: '2026-08-08T10:00:00.000Z',
  createdAt: '2026-08-08T10:00:00.000Z',
};

describe('ContactInteractionItem — logged on behalf (#1288)', () => {
  it('names the reacher and shows the attribution line for who logged it', () => {
    renderItem({ ...base, reachedById: 'jae', reachedByName: 'Jae Park' });

    expect(screen.getByText('Jae Park')).toBeInTheDocument();
    expect(screen.getByText('logged by Anna')).toBeInTheDocument();
  });

  it('shows no attribution line when the logger is the reacher', () => {
    renderItem(base);

    expect(screen.getByText('Anna')).toBeInTheDocument();
    expect(screen.queryByText(/logged by/)).toBeNull();
  });
});

describe('ContactInteractionItem — the on-behalf avatar (#1669)', () => {
  it("shows the reacher's initials, never the logger's photo, when the reacher has no photo", () => {
    renderItem({
      ...base,
      userPhoto: 'https://example.com/anna.jpg',
      reachedById: 'jae',
      reachedByName: 'Jae Park',
    });

    const avatar = screen.getByTestId('story-avatar');
    expect(avatar).toHaveAttribute('data-avatar-name', 'Jae Park');
    expect(avatar).toHaveTextContent('JP');
    expect(screen.queryByAltText('Anna')).toBeNull();
    expect(document.querySelector('img[src="https://example.com/anna.jpg"]')).toBeNull();
  });

  it("prefers the reacher's photo from the users roster", () => {
    renderItem({
      ...base,
      userPhoto: 'https://example.com/anna.jpg',
      reachedById: 'jae-photo',
      reachedByName: 'Jae Park',
    });

    const avatar = screen.getByTestId('story-avatar');
    expect(avatar).toHaveAttribute('data-avatar-name', 'Jae Park');
    expect(avatar.querySelector('img')).toHaveAttribute('src', 'https://example.com/jae.jpg');
    expect(document.querySelector('img[src="https://example.com/anna.jpg"]')).toBeNull();
  });

  it('falls back to initials from the stored name when the reacher is no longer on the roster', () => {
    renderItem(
      {
        ...base,
        userPhoto: 'https://example.com/anna.jpg',
        reachedById: 'departed',
        reachedByName: 'Jae Park',
      },
      [],
    );

    const avatar = screen.getByTestId('story-avatar');
    expect(avatar).toHaveAttribute('data-avatar-name', 'Jae Park');
    expect(avatar).toHaveTextContent('JP');
    expect(document.querySelector('img[src="https://example.com/anna.jpg"]')).toBeNull();
  });

  it("still shows the logger's photo when nobody else was reached for", () => {
    renderItem({ ...base, userPhoto: 'https://example.com/anna.jpg' });

    const avatar = screen.getByTestId('story-avatar');
    expect(avatar).toHaveAttribute('data-avatar-name', 'Anna');
    expect(avatar.querySelector('img')).toHaveAttribute('src', 'https://example.com/anna.jpg');
  });
});
