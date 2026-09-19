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
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import AroundTheTeam from '../views/AroundTheTeam';
import { __resetUserEntityStateCache } from '../lib/userEntityState';
import { InboxState, __resetInboxState } from '../lib/inboxState';
import { applyTeams } from '../lib/teams';
import type { Contact, Interaction } from '../types';
import type { ThreadMessageWithContact } from '../lib/threads';

const h = vi.hoisted(() => ({
  layout: undefined as { setSelectedContact: (c: any) => void } | undefined,
  addThreadMessage: vi.fn(async () => 'new-msg-id'),
}));

vi.mock('../lib/threads', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    subscribeAllThreads: vi.fn(() => vi.fn()),
    addThreadMessage: h.addThreadMessage,
    closeFollowUpAsk: vi.fn(async () => {}),
    reopenFollowUpAsk: vi.fn(async () => {}),
  };
});

vi.mock('../App', () => ({
  useOptionalLayout: () => h.layout,
}));

vi.mock('../components/AuthProvider', () => ({
  useAuth: () => ({
    user: { uid: 'u1', email: 'ruth@cisa.org', displayName: 'Ruth' },
    effectiveUserId: 'u1',
    role: 'admin',
  }),
}));

vi.mock('firebase/firestore', async (importOriginal) => {
  const actual = (await importOriginal()) as Record<string, unknown>;
  return {
    ...actual,
    onSnapshot: vi.fn((q: any, cb: any) => {
      // If querying contacts collection, provide default contacts
      if (q && q.path === 'contacts') {
        cb({
          docs: [
            {
              id: 'kofi',
              data: () => ({
                name: 'Kofi Mensah',
                createdBy: 'mei',
                createdAt: new Date().toISOString(),
              }),
            },
          ],
        });
      }
      return vi.fn();
    }),
    collection: vi.fn((_db, path) => ({ path })),
    collectionGroup: vi.fn((_db, path) => ({ path })),
    query: vi.fn((ref) => ref),
    orderBy: vi.fn(),
    limit: vi.fn(),
  };
});

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
    createdAt: new Date().toISOString(),
    ...over,
  }) as Contact;

const contacts: Contact[] = [
  contact({}),
  contact({ id: 'aisha', name: 'Aisha Rahman', createdBy: 'grace' }),
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
      <div data-testid="pathname">{location.pathname}</div>
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

/** Simulates opening a contact's detail route from Around, then going back. */
function DetailProbe() {
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '';
  return (
    <>
      <button onClick={() => navigate(-1)}>Back to Around</button>
      <div data-testid="from">{from}</div>
    </>
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
            contact({ id: 'today', name: 'Today Person', createdBy: 'grace', createdAt: new Date().toISOString() }),
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

  // ── One state survives the move (#943, #1012) ────────────────────────────
  it('keeps a person in the box after you open them, and records nothing for the glance', () => {
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
    // A glance is not the same as having dealt with someone: opening the
    // person leaves the card exactly as it was (#1012).
    expect(InboxState.isSeen('u1', 'att:contact:kofi')).toBe(false);
    expect(InboxState.isCompleted('u1', 'att:contact:kofi')).toBe(false);

    // The box is an inbox: the person stays in view, still to work through.
    expect(screen.getByText('Kofi Mensah')).toBeInTheDocument();
    expect(screen.getByText('1 to work through')).toBeInTheDocument();
  });

  it('ignores an old seen stamp — it goes inert rather than counting as worked through', () => {
    // Stamps written before #1012 are abandoned, never migrated: promoting a
    // glance to "worked through" would claim on a teammate's behalf that they
    // had dealt with people they only scrolled past.
    InboxState.markSeen('u1', 'att:contact:kofi');
    render(
      <MemoryRouter initialEntries={['/around?new=1']}>
        <AroundTheTeam contacts={[contact({})]} interactions={[]} threads={[]} staffNameMap={{}} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Kofi Mensah')).toBeInTheDocument();
    expect(screen.queryByText(/opened, not finished/i)).not.toBeInTheDocument();
    expect(screen.getByText('1 to work through')).toBeInTheDocument();
  });

  it('keeps a seen person in New after opening contact detail and returning', () => {
    h.layout = undefined;
    render(
      <MemoryRouter initialEntries={['/around?new=1']}>
        <Routes>
          <Route
            path="/around"
            element={<AroundTheTeam contacts={[contact({})]} interactions={[]} threads={[]} staffNameMap={{}} />}
          />
          <Route path="/people/:id" element={<DetailProbe />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByText('Kofi Mensah')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Kofi Mensah'));
    expect(screen.getByText('Back to Around')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Back to Around'));
    expect(screen.getByText('Kofi Mensah')).toBeInTheDocument();
    expect(screen.getByText('1 to work through')).toBeInTheDocument();
  });

  it('keeps a completed person in All on a fresh visit - grey, not vanished', () => {
    InboxState.markCompleted('u1', 'att:contact:kofi');
    render(
      <MemoryRouter initialEntries={['/around']}>
        <AroundTheTeam contacts={[contact({})]} interactions={[]} threads={[]} staffNameMap={{}} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Kofi Mensah')).toBeInTheDocument();
    expect(screen.queryByText('1 to work through')).not.toBeInTheDocument();
  });

  it('hides a completed person from New on a later visit but keeps them in All', () => {
    InboxState.markCompleted('u1', 'att:contact:kofi');
    const first = render(
      <MemoryRouter initialEntries={['/around?new=1']}>
        <AroundTheTeam contacts={[contact({})]} interactions={[]} threads={[]} staffNameMap={{}} />
      </MemoryRouter>,
    );

    expect(screen.queryByText('Kofi Mensah')).not.toBeInTheDocument();
    first.unmount();

    render(
      <MemoryRouter initialEntries={['/around']}>
        <AroundTheTeam contacts={[contact({})]} interactions={[]} threads={[]} staffNameMap={{}} />
      </MemoryRouter>,
    );

    expect(screen.getByText('Kofi Mensah')).toBeInTheDocument();
    expect(screen.queryByText('1 to work through')).not.toBeInTheDocument();
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

  it('shows contact name and opens contact via layout.setSelectedContact when rendered with default props', () => {
    const setSelectedContact = vi.fn();
    h.layout = { setSelectedContact };

    render(
      <MemoryRouter initialEntries={['/around']}>
        <AroundTheTeam interactions={interactions} threads={[]} staffNameMap={staffNameMap} />
      </MemoryRouter>,
    );
    expect(screen.queryByRole('button', { name: 'Contact' })).not.toBeInTheDocument();
    const contactBtn = screen.getByRole('button', { name: 'Kofi Mensah' });
    expect(contactBtn).toBeInTheDocument();

    fireEvent.click(contactBtn);
    expect(setSelectedContact).toHaveBeenCalledWith(expect.objectContaining({ id: 'kofi', name: 'Kofi Mensah' }));
  });

  it('navigates to /people/:id when layout is not present and onOpenContact is not provided', () => {
    h.layout = undefined;

    render(
      <MemoryRouter initialEntries={['/around']}>
        <LocationProbe initialEntries={['/around']} />
      </MemoryRouter>,
    );
    const contactBtn = screen.getByRole('button', { name: 'Kofi Mensah' });
    fireEvent.click(contactBtn);
    expect(screen.getByTestId('pathname').textContent).toBe('/people/kofi');
  });
});



describe('Around the team — the signals that were never wired (#965, #966)', () => {
  beforeEach(() => {
    localStorage.clear();
    __resetUserEntityStateCache();
    __resetInboxState();
    h.addThreadMessage.mockClear();
    h.layout = undefined;
    applyTeams([
      { uid: 'mei', team: 'yp', displayName: 'Mei Tanaka' },
      { uid: 'grace', team: 'campus', displayName: 'Grace Lim' },
    ]);
  });

  function renderWithDetail(entry: string) {
    return render(
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route
            path="/around"
            element={<AroundTheTeam contacts={[contact({})]} interactions={[]} threads={[]} staffNameMap={{}} />}
          />
          <Route path="/people/:id" element={<DetailProbe />} />
        </Routes>
      </MemoryRouter>,
    );
  }

  it('hands the detail route the filters it was opened from, not a bare path', () => {
    renderWithDetail('/around?team=yp&who=mei&new=1');

    fireEvent.click(screen.getByText('Kofi Mensah'));

    expect(screen.getByTestId('from')).toHaveTextContent('/around?team=yp&who=mei&new=1');
  });

  it('carries no query when the reader had set no filters', () => {
    renderWithDetail('/around');

    fireEvent.click(screen.getByText('Kofi Mensah'));

    expect(screen.getByTestId('from')).toHaveTextContent('/around');
    expect(screen.getByTestId('from').textContent).not.toContain('?');
  });

  it('confirms a posted comment on the page itself — the toast used to go nowhere', async () => {
    render(
      <MemoryRouter initialEntries={['/around']}>
        <AroundTheTeam contacts={[contact({})]} interactions={[]} threads={[]} staffNameMap={{}} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /comment/i }));
    fireEvent.change(screen.getByPlaceholderText(/write something/i), {
      target: { value: 'I have the chapter on this.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^post$/i }));

    expect(h.addThreadMessage).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Posted')).toBeInTheDocument();
  });

  it('offers no Undo on that confirmation — a posted message is not a soft delete', async () => {
    render(
      <MemoryRouter initialEntries={['/around']}>
        <AroundTheTeam contacts={[contact({})]} interactions={[]} threads={[]} staffNameMap={{}} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: /comment/i }));
    fireEvent.change(screen.getByPlaceholderText(/write something/i), {
      target: { value: 'Dropping it in the shared folder.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^post$/i }));

    await screen.findByText('Posted');
    expect(screen.queryByRole('button', { name: /undo/i })).not.toBeInTheDocument();
  });
});


// ── The conversation, in place, and one worked-through state (#1012) ────────
// The page told a Full-timer *that* something happened and never *what was
// said*: it subscribed to every thread in the product and rendered none of
// them. A card now reads the person's conversation on the card itself — both
// staff threads, as tabs, with the composer at their foot — so a posted
// message appears directly above where it was typed, and that appearance is
// the confirmation #966 asked for. Alongside it, Seen and Completed merge into
// a single Reviewed, set by a deliberate act and by nothing else.
describe('Around the team — the conversation in place, and one state (#1012)', () => {
  const now = new Date().toISOString();

  const msg = (over: Partial<ThreadMessageWithContact>): ThreadMessageWithContact =>
    ({
      id: 'm1',
      contactId: 'kofi',
      interactionId: null,
      parentId: null,
      scope: null,
      from: 'mei',
      fromName: 'Mei Tanaka',
      kind: 'comment',
      body: 'She said she would come Thursday.',
      at: now,
      ...over,
    }) as ThreadMessageWithContact;

  beforeEach(() => {
    localStorage.clear();
    __resetUserEntityStateCache();
    __resetInboxState();
    h.addThreadMessage.mockClear();
    h.layout = undefined;
    applyTeams([
      { uid: 'mei', team: 'yp', displayName: 'Mei Tanaka' },
      { uid: 'grace', team: 'campus', displayName: 'Grace Lim' },
    ]);
  });

  function renderOne(threads: ThreadMessageWithContact[] = [], over: Partial<Contact> = {}) {
    return render(
      <MemoryRouter initialEntries={['/around']}>
        <AroundTheTeam
          contacts={[contact(over)]}
          interactions={[]}
          threads={threads}
          staffNameMap={staffNameMap}
        />
      </MemoryRouter>,
    );
  }

  // The action row's toggle, not the composer's "Comment" kind chip: the
  // toggle is the control that says, in ARIA, whether the strip is open.
  const stripToggle = (scope?: HTMLElement) =>
    (scope ? within(scope) : screen)
      .getAllByRole('button', { name: /^(Comment|Conversation · \d+)$/ })
      .find((b) => b.hasAttribute('aria-expanded'))!;
  const openStrip = (scope?: HTMLElement) => fireEvent.click(stripToggle(scope));

  // ── The toggle is the control that was already there ─────────────────────
  it('counts the conversation on the button that used to just say Comment', () => {
    renderOne([msg({}), msg({ id: 'm2', body: 'I can drive.' })]);
    expect(screen.getByRole('button', { name: /Conversation · 2/ })).toBeInTheDocument();
  });

  it('reads Comment with no number when nothing has been written — a zero is never a count', () => {
    renderOne([]);
    expect(screen.getByRole('button', { name: /^Comment$/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Conversation ·/ })).not.toBeInTheDocument();
  });

  it('opens the strip on that button and closes it again', () => {
    renderOne([msg({})]);
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();

    openStrip();
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getByText('She said she would come Thursday.')).toBeInTheDocument();

    openStrip();
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('adds no new row of buttons — the action row keeps the one control', () => {
    renderOne([msg({})]);
    openStrip();
    expect(screen.queryByRole('button', { name: /Write back/ })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Conversation · 1/ })).toHaveLength(1);
  });

  // ── Both threads, as tabs, in the contact page's order ───────────────────
  it('carries both staff threads as tabs, with Conversation open first', () => {
    renderOne([msg({}), msg({ id: 'm2', scope: 'team', body: 'Worth pairing Mei with him.' })]);
    openStrip();

    const tabs = screen.getAllByRole('tab');
    expect(tabs.map((el) => el.textContent?.replace(/\d+$/, '').trim())).toEqual([
      'Conversation',
      'Full-timers',
    ]);
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true');
    expect(tabs[1]).toHaveAttribute('aria-selected', 'false');
  });

  it('counts each tab separately', () => {
    renderOne([
      msg({}),
      msg({ id: 'm2', body: 'I can drive.' }),
      msg({ id: 'm3', scope: 'team', body: 'Worth pairing Mei with him.' }),
    ]);
    openStrip();

    const tabs = screen.getAllByRole('tab');
    expect(tabs[0].textContent).toContain('2');
    expect(tabs[1].textContent).toContain('1');
  });

  it('shows the Full-timers thread from the card, and only under its own tab', () => {
    renderOne([msg({}), msg({ id: 'm2', scope: 'team', body: 'Worth pairing Mei with him.' })]);
    openStrip();

    expect(screen.getByText('She said she would come Thursday.')).toBeInTheDocument();
    expect(screen.queryByText('Worth pairing Mei with him.')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Full-timers/ }));
    expect(screen.getByText('Worth pairing Mei with him.')).toBeInTheDocument();
    expect(screen.queryByText('She said she would come Thursday.')).not.toBeInTheDocument();
  });

  it('says whose eyes a message will reach before Post is pressed', () => {
    renderOne([msg({})]);
    openStrip();
    expect(screen.getByText('Everyone tied to Kofi sees this.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Full-timers/ }));
    expect(screen.getByText('Full-timers only.')).toBeInTheDocument();
  });

  it('opens an empty strip with the composer ready when nothing has been written', () => {
    renderOne([]);
    openStrip();
    expect(screen.getByRole('tablist')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/write something/i)).toBeInTheDocument();
  });

  // ── Posting, and seeing it land ──────────────────────────────────────────
  it('shows a posted message in the strip at once, above the box it was typed in', async () => {
    renderOne([]);
    openStrip();

    fireEvent.change(screen.getByPlaceholderText(/write something/i), {
      target: { value: 'I have the chapter on this.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^post$/i }));

    expect(h.addThreadMessage).toHaveBeenCalledTimes(1);
    const posted = await screen.findByText('I have the chapter on this.');
    const composer = screen.getByPlaceholderText(/write something/i);
    // The evidence is where the writer is already looking.
    expect(posted.compareDocumentPosition(composer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('leaves the composer open and empty, and ticks the count up', async () => {
    renderOne([]);
    openStrip();

    fireEvent.change(screen.getByPlaceholderText(/write something/i), {
      target: { value: 'Dropping it in the shared folder.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^post$/i }));

    await screen.findByText('Dropping it in the shared folder.');
    expect(screen.getByPlaceholderText(/write something/i)).toHaveValue('');
    expect(screen.getByRole('button', { name: /Conversation · 1/ })).toBeInTheDocument();
  });

  it('marks the just-posted message as new', async () => {
    renderOne([]);
    openStrip();
    fireEvent.change(screen.getByPlaceholderText(/write something/i), {
      target: { value: 'Texting him now.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^post$/i }));

    await screen.findByText('Texting him now.');
    expect(screen.getByText('Just posted')).toBeInTheDocument();
  });

  it('keeps the just-posted marker when the real message lands, not only until then', async () => {
    // The marker is keyed on the id. The optimistic twin takes on the real id
    // when the write returns, so the arriving document replaces it rather than
    // doubling it — and the marker survives the round trip instead of blinking
    // out on it.
    h.addThreadMessage.mockResolvedValueOnce('real-id-1');
    const { rerender } = render(
      <MemoryRouter initialEntries={['/around']}>
        <AroundTheTeam contacts={[contact({})]} interactions={[]} threads={[]} staffNameMap={staffNameMap} />
      </MemoryRouter>,
    );
    openStrip();
    fireEvent.change(screen.getByPlaceholderText(/write something/i), {
      target: { value: 'Texting him now.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^post$/i }));
    await screen.findByText('Texting him now.');

    // The subscription now delivers the real document.
    rerender(
      <MemoryRouter initialEntries={['/around']}>
        <AroundTheTeam
          contacts={[contact({})]}
          interactions={[]}
          threads={[msg({ id: 'real-id-1', from: 'u1', fromName: 'Ruth', body: 'Texting him now.' })]}
          staffNameMap={staffNameMap}
        />
      </MemoryRouter>,
    );

    // Once, not twice — and still marked.
    expect(screen.getAllByText('Texting him now.')).toHaveLength(1);
    expect(screen.getByText('Just posted')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Conversation · 1/ })).toBeInTheDocument();
  });

  it('shows both of two identical messages, rather than swallowing the second', async () => {
    // Matching on the words alone would confuse one message for the other.
    h.addThreadMessage.mockResolvedValueOnce('real-a').mockResolvedValueOnce('real-b');
    renderOne([]);
    openStrip();

    for (const _ of [1, 2]) {
      fireEvent.change(screen.getByPlaceholderText(/write something/i), { target: { value: 'ok' } });
      fireEvent.click(screen.getByRole('button', { name: /^post$/i }));
      await screen.findAllByText('ok');
    }

    expect(screen.getAllByText('ok')).toHaveLength(2);
    expect(screen.getByRole('button', { name: /Conversation · 2/ })).toBeInTheDocument();
  });

  it('keeps an encouragement summarised rather than padding the strip with hearts', () => {
    renderOne([
      msg({}),
      msg({
        id: 'heart',
        kind: 'encouragement',
        body: 'Praying for you both! Let me know if you need anything.',
      }),
    ]);

    // The heart is not a contribution to the conversation, so it is neither
    // listed nor counted: four hearts must not read as four things said.
    expect(screen.getByRole('button', { name: /Conversation · 1/ })).toBeInTheDocument();
    openStrip();
    expect(screen.getByText('She said she would come Thursday.')).toBeInTheDocument();
    expect(screen.queryByText(/Praying for you both/)).not.toBeInTheDocument();
  });

  it('sends the message to whichever tab is open', async () => {
    renderOne([]);
    openStrip();
    fireEvent.click(screen.getByRole('tab', { name: /Full-timers/ }));

    fireEvent.change(screen.getByPlaceholderText(/full-timers thread/i), {
      target: { value: 'Let us not pair him with a first-termer.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^post$/i }));

    expect(h.addThreadMessage).toHaveBeenCalledWith(
      'kofi',
      expect.objectContaining({ scope: 'team', body: 'Let us not pair him with a first-termer.' }),
      expect.anything(),
    );
  });

  it('does not re-date or re-sort a card when a comment is posted', async () => {
    const older = new Date(Date.now() - 2 * 86_400_000).toISOString();
    render(
      <MemoryRouter initialEntries={['/around']}>
        <AroundTheTeam
          contacts={[
            contact({ id: 'aisha', name: 'Aisha Rahman', createdBy: 'grace' }),
            contact({ id: 'old', name: 'Old Person', createdAt: older }),
          ]}
          interactions={[]}
          threads={[]}
          staffNameMap={staffNameMap}
        />
      </MemoryRouter>,
    );

    const namesNow = () =>
      screen.getAllByRole('heading').map((el) => el.textContent).concat(
        screen.getAllByRole('button', { name: /Aisha Rahman|Old Person/ }).map((el) => el.textContent),
      );
    const before = namesNow();

    // Comment on the older card, whose day heading is not Today.
    const oldCard = screen.getByText('Old Person').closest('div.rounded-2xl') as HTMLElement;
    openStrip(oldCard);
    fireEvent.change(screen.getByPlaceholderText(/write something/i), {
      target: { value: 'Still worth a text.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^post$/i }));
    await screen.findByText('Still worth a text.');

    // Day headings mean when the TEAM touched this person, so the card has not
    // moved and the page has not reshuffled under the reader.
    expect(namesNow()).toEqual(before);
  });

  // ── One card open at a time, and the clamp ───────────────────────────────
  it('closes the first card when a second one opens', () => {
    render(
      <MemoryRouter initialEntries={['/around']}>
        <AroundTheTeam contacts={contacts} interactions={[]} threads={[]} staffNameMap={staffNameMap} />
      </MemoryRouter>,
    );

    const kofiCard = screen.getByText('Kofi Mensah').closest('div.rounded-2xl') as HTMLElement;
    const aishaCard = screen.getByText('Aisha Rahman').closest('div.rounded-2xl') as HTMLElement;

    openStrip(kofiCard);
    expect(within(kofiCard).getByRole('tablist')).toBeInTheDocument();

    openStrip(aishaCard);
    expect(within(aishaCard).getByRole('tablist')).toBeInTheDocument();
    expect(within(kofiCard).queryByRole('tablist')).not.toBeInTheDocument();
  });

  it('releases the two-line clamp on the interaction body when the card opens, and keeps it when collapsed', () => {
    // The clamp has no accessible signal — a class is the only honest way to
    // observe it. It is the reason a long note used to cost the reader their
    // filters (#965), so it is worth pinning.
    const long = 'He talked for a long time about his family back home, and about why he stopped going.';
    render(
      <MemoryRouter initialEntries={['/around']}>
        <AroundTheTeam
          contacts={[contact({ notes: long })]}
          interactions={[]}
          threads={[]}
          staffNameMap={staffNameMap}
        />
      </MemoryRouter>,
    );

    const body = () => screen.getByText(long);
    expect(body().className).toContain('line-clamp-2');

    openStrip();
    expect(body().className).not.toContain('line-clamp-2');
  });

  // ── One state: Reviewed ──────────────────────────────────────────────────
  it('shows no accent dot — under one state it would mark every card', () => {
    const { container } = renderOne([]);
    expect(container.querySelector('.bg-accent.rounded-full')).toBeNull();
  });

  it('leaves the card un-reviewed when a comment is posted', async () => {
    renderOne([]);
    openStrip();
    fireEvent.change(screen.getByPlaceholderText(/write something/i), {
      target: { value: 'On it.' },
    });
    fireEvent.click(screen.getByRole('button', { name: /^post$/i }));
    await screen.findByText('On it.');

    // The card must not go quiet as a result of the reader's own action.
    expect(InboxState.isCompleted('u1', 'att:contact:kofi')).toBe(false);
    expect(screen.getByText('1 to work through')).toBeInTheDocument();
  });

  it('marks a card reviewed only from the Reviewed button, and drops its action row', () => {
    renderOne([msg({})]);
    expect(screen.getByText('1 to work through')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Reviewed/ }));

    expect(InboxState.isCompleted('u1', 'att:contact:kofi')).toBe(true);
    expect(screen.queryByText('1 to work through')).not.toBeInTheDocument();
    // A dimmed card reads as a result: it says so, and stops asking anything.
    expect(screen.getByText('Reviewed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Conversation · 1/ })).not.toBeInTheDocument();
  });

  // ── Mark all reviewed ────────────────────────────────────────────────────
  it('marks all reviewed within the current filter and nothing outside it', () => {
    render(
      <MemoryRouter initialEntries={['/around?team=yp']}>
        <AroundTheTeam contacts={contacts} interactions={[]} threads={[]} staffNameMap={staffNameMap} />
      </MemoryRouter>,
    );

    expect(screen.getByText('1 to work through')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Mark all reviewed' }));

    expect(InboxState.isCompleted('u1', 'att:contact:kofi')).toBe(true);
    // Working inside one team never silently clears another.
    expect(InboxState.isCompleted('u1', 'att:contact:aisha')).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'Everyone' }));
    expect(screen.getByText('1 to work through')).toBeInTheDocument();
  });

  it('undoes Mark all reviewed', () => {
    render(
      <MemoryRouter initialEntries={['/around']}>
        <AroundTheTeam contacts={contacts} interactions={[]} threads={[]} staffNameMap={staffNameMap} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Mark all reviewed' }));
    expect(screen.queryByText(/to work through/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
    expect(InboxState.isCompleted('u1', 'att:contact:kofi')).toBe(false);
    expect(screen.getByText('2 to work through')).toBeInTheDocument();
  });

  it('offers no Mark all reviewed when nothing is left to work through', () => {
    InboxState.markCompleted('u1', 'att:contact:kofi');
    renderOne([]);
    expect(screen.queryByRole('button', { name: 'Mark all reviewed' })).not.toBeInTheDocument();
  });
});
