import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ContactStory from '../components/contact/ContactStory';
import type { StoryEntry } from '../lib/contactStory';

const noop = () => {};

const renderStory = (story: StoryEntry[]) =>
  render(
    <ContactStory
      story={story}
      fmtDate={(v) => v ?? null}
      isLoggingInteraction={false}
      isAddingPrayer={false}
      onCancelCompose={noop}
      onStartLog={noop}
      onStartPrayer={noop}
      interactionsLoading={false}
      logInteractionForm={null}
      addPrayerForm={null}
      renderInteraction={() => null}
      renderPrayerCard={() => null}
    />,
  );

describe('ContactStory — changes and attendance (#1291)', () => {
  it('shows a change one-liner, and opens the folded run behind a count', () => {
    renderStory([
      {
        kind: 'change',
        id: 'c1',
        at: '2026-09-24T09:00:00.000Z',
        byId: 'anna',
        byName: 'Anna',
        changes: [
          { type: 'step', from: 'Met', to: 'Follow up' },
          { type: 'kind', from: 'Contact', to: 'Local saint' },
          { type: 'tags', added: ['Grad'], removed: ['Lead'] },
          { type: 'field', field: 'name', from: 'Mateo', to: 'Mateo Ruiz' },
          { type: 'notes' },
          { type: 'share', person: 'Priya', added: true },
          { type: 'share', person: 'Priya', added: false },
          { type: 'creator', from: 'Sarah Lee', to: 'Daniel Kim' },
        ],
      },
      { kind: 'added', id: 'added', at: null, byName: 'Sarah Lee' },
    ]);

    expect(screen.getByText('moved step Met → Follow up')).toBeInTheDocument();
    expect(screen.queryByText('added tag Grad')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: '8 more changes' }));

    expect(screen.getByText('changed kind from Contact to Local saint')).toBeInTheDocument();
    expect(screen.getByText('added tag Grad')).toBeInTheDocument();
    expect(screen.getByText('removed tag Lead')).toBeInTheDocument();
    expect(screen.getByText('changed name from Mateo to Mateo Ruiz')).toBeInTheDocument();
    expect(screen.getByText('updated notes')).toBeInTheDocument();
    expect(screen.getByText('shared with Priya')).toBeInTheDocument();
    expect(screen.getByText("removed Priya's access")).toBeInTheDocument();
    expect(screen.getByText('changed the creator from Sarah Lee to Daniel Kim')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'show less' })).toBeInTheDocument();
  });

  it('says how many weeks running at a Rhythm, and a single gathering plainly', () => {
    renderStory([
      { kind: 'attendance', id: 'r:1', at: '2026-09-17', name: 'College Meeting', count: 6 },
      { kind: 'attendance', id: 'bbq', at: '2026-09-05', name: 'Welcome BBQ', count: 1 },
    ]);

    expect(screen.getByText('came to College Meeting · 6 weeks running')).toBeInTheDocument();
    expect(screen.getByText('came to Welcome BBQ')).toBeInTheDocument();
  });
});
