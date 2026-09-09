// Around the team, as its own page (#943).
//
// The page is the destination the team column always deserved: full width,
// paged by day, with the team/teammate filters, the new-only filter, per-stack
// seen and completed state, and the reach affordance. Filters are URL state —
// read on load, written on change, never persisted per user. The page is
// rendered under a memory router with the data layer stubbed, exactly like the
// Questions page's tests (#646).
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import AroundTheTeam from '../views/AroundTheTeam';
import { __resetUserEntityStateCache } from '../lib/userEntityState';
import { InboxState, __resetInboxState } from '../lib/inboxState';
import { applyTeams } from '../lib/teams';
import type { Contact, Interaction } from '../types';
import type { ThreadMessageWithContact } from '../lib/threads';

vi.mock('../components/AuthProvider', () => ({
  useAuth: () => ({
    user: { uid: 'u1', email: 'ruth@cisa.org', displayName: 'Ruth' },
    effectiveUserId: 'u1',
    role: 'admin',
  }),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  auth: { currentUser: { uid: 'u1' } },
  handleFirestoreError: vi.fn(),
  OperationType: { READ: 'read', WRITE: 'write', LIST: 'list', CREATE: 'create', UPDATE: 'update' },
}));

// Mei is on YP, Grace on Campus.
const staffNameMap = { mei: 'Mei Tanaka', grace: 'Grace Lim' };

const contact = (over: Partial<Contact>): Contact =>
  ({
    id: 'kofi',
    name: 'Kofi Mensah',
    createdBy: 'mei',
    owner: 'mei',
    createdAt: new Date().toISOString(),
    ...over,
  }) as Contact;

const contacts: Contact[] = [
  contact({}),
  contact({ id: 'aisha', name: 'Aisha Rahman', createdBy: 'grace', owner: 'grace' }),
];

const interactions: Interaction[] = [
  {
    id: 'i1',
    contactId: 'kofi',
    userId: 'mei',
    content: 'Coffee after the lab',
    createdAt: new Date().toISOString(),
    dateTime: new Date().toISOString(),
    type: 'meetup',
    title: 'Coffee after the lab',
  } as unknown as Interaction,
];

function renderPage(initialEntries: string[] = ['/around']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <AroundTheTeam contacts={contacts} interactions={interactions} threads={[]} staffNameMap={staffNameMap} />
    </MemoryRouter>,
  );
}

/** Renders the page with a location spy so URL state is observable. */
function LocationProbe({ initialEntries = ['/around'] }: { initialEntries?: string[] }) {
  const location = useLocation();
  return (
    <>
      <AroundTheTeam contacts={contacts} interactions={interactions} threads={[]} staffNameMap={staffNameMap} />
      <div data-testid="location">{location.search}</div>
    </>
  );
}

function renderWithProbe(initialEntries: string[] = ['/around']) {
  return render(
    <MemoryRouter initialEntries={initialEntries}>
      <LocationProbe initialEntries={initialEntries} />
    </MemoryRouter>,
  );
}

describe('Around the team page (#943)', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetUserEntityStateCache();
    __resetInboxState();
    applyTeams([
      { uid: 'mei', team: 'yp', displayName: 'Mei Tanaka' },
      { uid: 'grace', team: 'campus', displayName: 'Grace Lim' },
    ]);
  });

  it('renders the page heading and the filter row', () => {
    renderPage();
    expect(screen.getByRole('heading', { name: 'Around the team' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Filter the news by team' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Filter the news by teammate' })).toBeInTheDocument();
  });

  it('shows every team\'s news at rest, grouped under day headings', () => {
    renderPage();
    expect(screen.getByText('Kofi Mensah')).toBeInTheDocument();
    expect(screen.getByText('Aisha Rahman')).toBeInTheDocument();
    // Day groups are real headings.
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument();
  });

  it('cuts on who did it when a team chip is pressed', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'YP team' }));
    expect(screen.getByText('Kofi Mensah')).toBeInTheDocument();
    expect(screen.queryByText('Aisha Rahman')).not.toBeInTheDocument();
  });

  it('narrows to one teammate through the select', () => {
    renderPage();
    fireEvent.change(screen.getByRole('combobox', { name: 'Filter the news by teammate' }), {
      target: { value: 'grace' },
    });
    expect(screen.getByText('Aisha Rahman')).toBeInTheDocument();
    expect(screen.queryByText('Kofi Mensah')).not.toBeInTheDocument();
  });

  it('scopes the select\'s options to the chosen team', () => {
    renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'YP team' }));
    const select = screen.getByRole('combobox', { name: 'Filter the news by teammate' });
    expect(within(select).getByRole('option', { name: 'Mei Tanaka' })).toBeInTheDocument();
    expect(within(select).queryByRole('option', { name: 'Grace Lim' })).not.toBeInTheDocument();
    expect(within(select).getByRole('option', { name: 'Whole YP team' })).toBeInTheDocument();
  });

  it('offers a rostered teammate who has done nothing, and says so when picked', () => {
    applyTeams([
      { uid: 'mei', team: 'yp', displayName: 'Mei Tanaka' },
      { uid: 'grace', team: 'campus', displayName: 'Grace Lim' },
      { uid: 'andre', team: 'campus', displayName: 'Andre Baptiste' },
    ]);
    renderPage();

    const select = screen.getByRole('combobox', { name: 'Filter the news by teammate' });
    expect(within(select).getByRole('option', { name: 'Andre Baptiste' })).toBeInTheDocument();

    fireEvent.change(select, { target: { value: 'andre' } });
    expect(screen.getByText('Nothing from Andre this week')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show everyone' }));
    expect(screen.getByText('Kofi Mensah')).toBeInTheDocument();
  });

  it('offers a way back out of an empty filter', () => {
    render(
      <MemoryRouter initialEntries={['/around']}>
        <AroundTheTeam contacts={[contacts[0]]} interactions={interactions} threads={[]} staffNameMap={staffNameMap} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Campus team' }));
    expect(screen.getByText('Nothing from the Campus team this week')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Show everyone' }));
    expect(screen.getByText('Kofi Mensah')).toBeInTheDocument();
  });

  it('recounts the page against the filter — the count is what is left to work through', () => {
    renderPage();
    expect(screen.getByText('2 to work through')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'YP team' }));
    expect(screen.getByText('1 to work through')).toBeInTheDocument();
  });

  it('marks a stack Talked when it holds a logged conversation', () => {
    renderPage();
    // Kofi has an interaction; Aisha is only a new face.
    expect(screen.getAllByText('Talked')).toHaveLength(1);
  });

  // ── Filters are URL state (#943) ─────────────────────────────────────────
  it('reads the filters from the URL on load', () => {
    renderPage(['/around?team=yp']);
    expect(screen.getByText('Kofi Mensah')).toBeInTheDocument();
    expect(screen.queryByText('Aisha Rahman')).not.toBeInTheDocument();
  });

  it('writes the filters to the URL on change', () => {
    renderWithProbe();
    fireEvent.click(screen.getByRole('button', { name: 'YP team' }));
    // The URL is the page's state: the chip press must have pushed it.
    expect(screen.getByTestId('location').textContent).toContain('team=yp');
    expect(screen.getByRole('button', { name: 'YP team' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('does not remember filters between visits — a fresh load is resting', () => {
    renderPage(['/around?team=yp']);
    expect(screen.getByText('Kofi Mensah')).toBeInTheDocument();
    // A second visit with no query string shows everything again.
    renderPage(['/around']);
    expect(screen.getByText('Aisha Rahman')).toBeInTheDocument();
  });

  // ── Paged by day (#943) ──────────────────────────────────────────────────
  it('groups rows under day headings, newest first', () => {
    const old = new Date(Date.now() - 2 * 86_400_000).toISOString();
    renderPage();
    render(
      <MemoryRouter initialEntries={['/around']}>
        <AroundTheTeam
          contacts={[contact({ id: 'old', name: 'Old Person', createdAt: old })]}
          interactions={[
            {
              id: 'i-old',
              contactId: 'old',
              userId: 'mei',
              content: 'A while ago',
              createdAt: old,
              dateTime: old,
              type: 'meetup',
              title: 'A while ago',
            } as unknown as Interaction,
          ]}
          threads={[]}
          staffNameMap={staffNameMap}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/ })).toBeInTheDocument();
  });

  it('a day the filters empty out reads as an empty day rather than vanishing', () => {
    const old = new Date(Date.now() - 2 * 86_400_000).toISOString();
    render(
      <MemoryRouter initialEntries={['/around?team=yp']}>
        <AroundTheTeam
          contacts={[
            contact({ id: 'old', name: 'Old Person', createdAt: old }),
            contact({ id: 'today', name: 'Today Person', createdBy: 'grace', owner: 'grace', createdAt: new Date().toISOString() }),
          ]}
          interactions={[
            {
              id: 'i-old',
              contactId: 'old',
              userId: 'mei',
              content: 'A while ago',
              createdAt: old,
              dateTime: old,
              type: 'meetup',
              title: 'A while ago',
            } as unknown as Interaction,
            {
              id: 'i-today',
              contactId: 'today',
              userId: 'grace',
              content: 'Just now',
              createdAt: new Date().toISOString(),
              dateTime: new Date().toISOString(),
              type: 'meetup',
              title: 'Just now',
            } as unknown as Interaction,
          ]}
          threads={[]}
          staffNameMap={staffNameMap}
        />
      </MemoryRouter>,
    );
    // The YP filter keeps the old day (Mei's) and empties today (Grace's).
    // Today's heading is still there, and the day reads as empty.
    expect(screen.getByRole('heading', { name: 'Today' })).toBeInTheDocument();
    expect(screen.getByText('No recent team touches.')).toBeInTheDocument();
    expect(screen.getByText('Old Person')).toBeInTheDocument();
  });

  it('says plainly how far back the page reaches', () => {
    renderPage();
    expect(screen.getByText(/Recent team activity/)).toBeInTheDocument();
  });

  // ── Seen and completed survive the move (#943) ───────────────────────────
  it('keeps a person in the box after you open them from the New view — seen dims, it does not clear', () => {
    const onOpenContact = vi.fn();
    render(
      <MemoryRouter initialEntries={['/around']}>
        <AroundTheTeam contacts={[contact({})]} interactions={[]} threads={[]} staffNameMap={{}} onOpenContact={onOpenContact} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'New' }));
    expect(screen.getByText('Kofi Mensah')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Kofi Mensah'));
    expect(onOpenContact).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'kofi' }),
      { tab: undefined },
    );
    expect(InboxState.isSeen('u1', 'att:contact:kofi')).toBe(true);
    expect(InboxState.isCompleted('u1', 'att:contact:kofi')).toBe(false);

    // The box is an inbox: the person stays in view, still to work through.
    expect(screen.getByText('Kofi Mensah')).toBeInTheDocument();
    expect(screen.getByText('1 to work through')).toBeInTheDocument();
  });

  it('only the completion verb clears a person — grey in place with an Undo, even under New', () => {
    render(
      <MemoryRouter initialEntries={['/around']}>
        <AroundTheTeam contacts={[contact({})]} interactions={[]} threads={[]} staffNameMap={{}} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'New' }));

    fireEvent.click(screen.getByRole('button', { name: /Reviewed/ }));
    expect(InboxState.isCompleted('u1', 'att:contact:kofi')).toBe(true);
    expect(screen.getByText('Kofi Mensah')).toBeInTheDocument();
    expect(screen.queryByText('1 to work through')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(InboxState.isCompleted('u1', 'att:contact:kofi')).toBe(false);
    expect(screen.getByText('1 to work through')).toBeInTheDocument();
  });

  it('seen and completed survive a filter change', () => {
    renderPage();
    // Open Kofi (marks seen) and complete Aisha.
    fireEvent.click(screen.getByText('Kofi Mensah'));
    const aishaCard = screen.getByText('Aisha Rahman').closest('div.rounded-2xl')!;
    fireEvent.click(within(aishaCard as HTMLElement).getByRole('button', { name: /Reviewed/ }));

    // Narrow to YP: Kofi is still listed (seen, not completed) and Aisha is gone.
    fireEvent.click(screen.getByRole('button', { name: 'YP team' }));
    expect(screen.getByText('Kofi Mensah')).toBeInTheDocument();
    expect(screen.queryByText('Aisha Rahman')).not.toBeInTheDocument();

    // Widen again: Aisha is still completed (greyed, not re-listed as new).
    fireEvent.click(screen.getByRole('button', { name: 'Everyone' }));
    expect(screen.getByText('Aisha Rahman')).toBeInTheDocument();
    expect(InboxState.isCompleted('u1', 'att:contact:aisha')).toBe(true);
  });

  // ── Reach affordance survives the move (#943) ───────────────────────────
  it('reaches a person with a phone by call, without opening their page', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
    const onOpenContact = vi.fn();
    render(
      <MemoryRouter initialEntries={['/around']}>
        <AroundTheTeam contacts={[contact({ phone: '+15551234567' })]} interactions={[]} threads={[]} staffNameMap={{}} onOpenContact={onOpenContact} />
      </MemoryRouter>,
    );
    const callBtn = screen.getByRole('button', { name: 'Call' });
    fireEvent.click(callBtn);
    expect(openSpy).toHaveBeenCalledWith('tel:+15551234567');
    expect(onOpenContact).not.toHaveBeenCalled();
  });

  it('reaches an email-only person by mailto', () => {
    render(
      <MemoryRouter initialEntries={['/around']}>
        <AroundTheTeam contacts={[contact({ email: 'kofi@campus.org' })]} interactions={[]} threads={[]} staffNameMap={{}} />
      </MemoryRouter>,
    );
    const link = screen.getByRole('link', { name: 'Email' });
    expect(link).toHaveAttribute('href', 'mailto:kofi@campus.org');
  });

  it('shows no reach affordance when the person has neither — empty string counts as absent', () => {
    render(
      <MemoryRouter initialEntries={['/around']}>
        <AroundTheTeam contacts={[contact({ phone: '', email: '' })]} interactions={[]} threads={[]} staffNameMap={{}} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: 'Call' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Email' })).not.toBeInTheDocument();
  });
});
