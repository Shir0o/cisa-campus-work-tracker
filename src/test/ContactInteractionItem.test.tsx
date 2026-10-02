import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ContactInteractionItem from '../components/contact/ContactInteractionItem';
import { interactionAdapter } from '../components/stream/interactionAdapter';
import type { Interaction } from '../types';

const noop = () => {};

const renderItem = (interaction: Interaction) =>
  render(
    <ContactInteractionItem
      interaction={interaction}
      canEdit={false}
      canRemove={false}
      editing={false}
      editData={{ content: '', dateTime: '', type: 'interaction' }}
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
    renderItem({ ...base, reachedById: 'jae', reachedByName: 'Jae' });

    expect(screen.getByText('Jae')).toBeInTheDocument();
    expect(screen.getByText('logged by Anna')).toBeInTheDocument();
  });

  it('shows no attribution line when the logger is the reacher', () => {
    renderItem(base);

    expect(screen.getByText('Anna')).toBeInTheDocument();
    expect(screen.queryByText(/logged by/)).toBeNull();
  });
});
