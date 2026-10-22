import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { afterEach, describe, it, expect, vi } from 'vitest';
import LandingTrainee from '../views/landings/LandingTrainee';

let mockAuthValue: any = {
  user: { uid: 'u-trainee', displayName: 'Trainee Sam' },
  role: 'manager',
  effectiveUserId: 'u-trainee',
  effectiveUserName: 'Trainee Sam',
};

vi.mock('../components/AuthProvider', () => ({
  useAuth: () => mockAuthValue,
}));

vi.mock('../lib/seasons', () => ({
  SEASONS: { fall: { label: 'Fall 2026' } },
  useSeason: () => ({ activeId: 'fall', active: { label: 'Fall 2026' } }),
}));

// The contacts the database holds. The mock honours the reader scope the page
// queries with (`visibleTo array-contains uid`), so a test can prove whose
// people the page is actually looking at (#1039).
const ALL_CONTACTS = [
  {
    id: 'c1',
    name: 'Alex Student',
    stage: 'Regular',
    createdBy: 'u-trainee',
    visibleTo: ['u-trainee'],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'c2',
    name: 'Bobs Person',
    stage: 'Regular',
    createdBy: 'u-trainee-bob',
    visibleTo: ['u-trainee-bob'],
    createdAt: new Date().toISOString(),
  },
  {
    id: 'c3',
    name: 'Untied Person',
    stage: 'Regular',
    createdBy: 'u-someone-else',
    visibleTo: ['u-trainee'],
    createdAt: new Date().toISOString(),
  },
  // A Trainee whose one contact carries a `notes` field but who has logged
  // nothing: the first-run checklist must not read that as a conversation.
  {
    id: 'noted',
    name: 'Noted Person',
    stage: 'Regular',
    createdBy: 'u-trainee-noted',
    visibleTo: ['u-trainee-noted'],
    notes: 'Met at orientation',
    createdAt: new Date().toISOString(),
  },
  // Seven people in one Trainee's care, connected 1..7 days ago, for the
  // home's cap of five (longest-since-connected first).
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => ({
    id: `many-${n}`,
    name: `Person ${n}d`,
    stage: 'Regular',
    createdBy: 'u-trainee-many',
    visibleTo: ['u-trainee-many'],
    createdAt: new Date(Date.now() - 30 * 86_400_000).toISOString(),
    lastContactedDate: new Date(Date.now() - n * 86_400_000).toISOString(),
  })),
];

// What the first-run checklist reads, seeded per test. Defaults match the
// fixtures every other test in this file relies on.
const DEFAULT_TEAM_PRAYERS = [
  { id: 'pr1', contactId: 'c1', text: 'Pray for guidance', status: 'ongoing', createdAt: new Date().toISOString() },
];
const DEFAULT_PERSONAL_PRAYERS = [
  { id: 'p1', title: 'Pray for exam', contactId: 'c1', status: 'open', date: new Date().toISOString() },
];
const DEFAULT_TIED_THREADS = [
  {
    id: 't1',
    contactId: 'c1',
    interactionId: null,
    from: 'u-ft',
    fromName: 'Admin Tony',
    kind: 'nudge',
    body: 'Please follow up',
    at: new Date().toISOString(),
  },
];
let teamPrayers: any[] = DEFAULT_TEAM_PRAYERS;
let personalPrayers: any[] = DEFAULT_PERSONAL_PRAYERS;
let tiedThreads: any[] = DEFAULT_TIED_THREADS;
let tiedInteractions: { id: string; userId: string }[] = [];
const DEFAULT_WAITING = [
  {
    id: 'w1',
    kind: 'nudge',
    at: new Date().toISOString(),
    body: 'Please follow up with Alex',
    msgId: 't1',
    contactId: 'c1',
  },
];
let waitingItems: any[] = DEFAULT_WAITING;
let readIds = new Set<string>();
const markRead = vi.fn((_uid: string, id: string) => readIds.add(id));
const markUnread = vi.fn((_uid: string, id: string) => readIds.delete(id));

// Readers whose contacts query is refused, so a test can drive the error path.
const DENIED_READERS = new Set<string>();

vi.mock('firebase/firestore', () => ({
  collection: vi.fn((_db, ...parts) => ({ path: parts.join('/') })),
  doc: vi.fn((_db, ...parts) => ({ path: parts.join('/'), id: parts[parts.length - 1] })),
  query: vi.fn((ref, ...constraints) => ({ ...ref, constraints: constraints.filter(Boolean) })),
  orderBy: vi.fn(),
  where: vi.fn((field, op, value) => ({ field, op, value })),
  limit: vi.fn(),
  onSnapshot: vi.fn((q, callback, onError) => {
    if (typeof callback === 'function') {
      try {
        const path = q?.path || '';
        if (path.includes('prayers')) {
          callback({ docs: teamPrayers.map(({ id, ...data }) => ({ id, data: () => data })) });
        } else if (path.includes('contacts')) {
          const reader = (q.constraints || []).find((c: any) => c?.field === 'visibleTo')?.value;
          if (DENIED_READERS.has(reader)) {
            if (typeof onError === 'function') onError(new Error('permission-denied'));
            return () => {};
          }
          callback({
            docs: ALL_CONTACTS.filter((c) => c.visibleTo.includes(reader)).map(({ id, ...data }) => ({
              id,
              data: () => data,
            })),
          });
        } else {
          callback({ docs: [] });
        }
      } catch (e) {}
    }
    return () => {};
  }),
}));

vi.mock('../lib/firebase', () => ({
  db: {},
  handleFirestoreError: vi.fn(),
  OperationType: { LIST: 'LIST' },
}));

vi.mock('../lib/personalPrayers', () => ({
  subscribePersonalPrayers: vi.fn((_uid, callback) => {
    callback(personalPrayers);
    return () => {};
  }),
  addPersonalPrayer: vi.fn().mockResolvedValue(true),
  updatePersonalPrayer: vi.fn().mockResolvedValue(true),
  deletePersonalPrayer: vi.fn().mockResolvedValue(true),
}));

vi.mock('../lib/prayers', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    updatePrayerStatus: vi.fn().mockResolvedValue(true),
  };
});

const mockLayout = { openLogInteraction: vi.fn(), openNewContact: vi.fn() };
vi.mock('../App', () => ({
  useLayout: () => mockLayout,
}));

vi.mock('../lib/messaging', () => ({
  openMessage: vi.fn(),
}));

vi.mock('../lib/walking', () => ({
  isFullTimer: vi.fn(() => false),
  isTrainee: vi.fn(() => true),
  fullTimerIds: vi.fn(() => ['u-ft']),
  walkingRecipient: vi.fn(() => null),
}));

vi.mock('../lib/threads', () => ({
  useThreads: () => [],
  threadsFor: (msgs: any[]) => msgs,
  countFor: (msgs: any[]) => msgs.length,
  contactStakeholdersOf: vi.fn((c) => c || {}),
  subscribeAllThreads: vi.fn(() => () => {}),
  subscribeTiedThreads: vi.fn((_staffId, callback) => {
    callback(tiedThreads);
    return () => {};
  }),
}));

// A Trainee lists interactions one visible contact at a time; the shared
// fan-out is what the page reuses for "have I logged a conversation".
vi.mock('../lib/contactQueries', () => ({
  subscribeTiedSubcollection: vi.fn((_staffId, _sub, callback) => {
    callback(tiedInteractions.map(({ id, ...data }) => ({ id, data: () => data })));
    return () => {};
  }),
}));

vi.mock('../lib/inbox', () => ({
  traineeWaitingItems: vi.fn(() => waitingItems),
}));

vi.mock('../lib/inboxReads', () => ({
  useInboxReads: () => ({
    isRead: (_uid: string, id: string) => readIds.has(id),
    markRead,
    markUnread,
  }),
}));

vi.mock('../lib/asks', () => ({
  subscribeStaffAsks: vi.fn((_uid, callback) => {
    callback([]);
    return () => {};
  }),
  askQuestions: vi.fn(() => []),
  askRepliesOf: vi.fn(() => []),
  askWaitedDays: vi.fn(() => 0),
  addAsk: vi.fn().mockResolvedValue(true),
}));

describe('LandingTrainee component', () => {
  afterEach(() => {
    readIds = new Set();
  });

  it('renders trainee dashboard with waiting items, contacts, and personal prayers', async () => {
    render(
      <MemoryRouter>
        <LandingTrainee />
      </MemoryRouter>
    );

    expect(await screen.findByText('Alex Student')).toBeInTheDocument();
    expect(screen.getByText('Pray for exam')).toBeInTheDocument();
    expect(screen.getByText(/nudged a follow-up about Alex Student/i)).toBeInTheDocument();

    // Click Open button on WaitingRow
    const openBtns = screen.getAllByRole('button', { name: /Open/i });
    fireEvent.click(openBtns[0]);

    // The person detail is now a full page (not a popup) — go back to the
    // dashboard before continuing with the row's other actions.
    const closePageBtn = screen.getByRole('button', { name: /^Close$/i });
    fireEvent.click(closePageBtn);

    // Opening it marked it handled, so the toggle now offers to reopen it
    const handledBtn = screen.getByRole('button', { name: 'Reopen' });
    fireEvent.click(handledBtn);

    // Click See all
    const seeAllBtn = screen.getByRole('button', { name: /See all/i });
    fireEvent.click(seeAllBtn);

    // Click Add a personal prayer button and commit input
    const addPrayerBtn = screen.getByRole('button', { name: /Add a personal prayer/i });
    fireEvent.click(addPrayerBtn);
    const prayerInput = screen.getByPlaceholderText(/What would you like to pray for/i);
    fireEvent.change(prayerInput, { target: { value: 'New exam prayer' } });
    const commitBtn = screen.getByRole('button', { name: /^Add$/ });
    fireEvent.click(commitBtn);
    // Click for Alex Student linked button
    const linkedBtn = screen.getAllByRole('button', { name: /for Alex Student/i })[0];
    fireEvent.click(linkedBtn);

    // That opens the person page again — go back to the dashboard.
    const closePageBtn2 = screen.getByRole('button', { name: /^Close$/i });
    fireEvent.click(closePageBtn2);

    // Click status pill on team prayer
    const teamPrayerPill = screen.getAllByRole('button', { name: /^ongoing$/i })[0];
    fireEvent.click(teamPrayerPill);

    // Click Open button on ReachCard
    if (openBtns[1]) fireEvent.click(openBtns[1]);

    // Click Message button on ReachCard if present
    const messageBtns = screen.queryAllByRole('button', { name: /Message/i });
    if (messageBtns.length > 0) fireEvent.click(messageBtns[0]);

    // Click See all on On our hearts section
    const seeAllOnOurHearts = screen.queryAllByRole('button', { name: /See all/i })[1];
    if (seeAllOnOurHearts) fireEvent.click(seeAllOnOurHearts);

    // Click Close button on modal to trigger onClose (line 420)
    const closeBtns = screen.queryAllByRole('button', { name: /Close|Cancel/i });
    if (closeBtns.length > 0) fireEvent.click(closeBtns[0]);

    // Click answered button on personal prayer row to trigger onUpdate callback
    const answeredBtns = screen.getAllByRole('button', { name: /^answered$/i });
    if (answeredBtns.length > 0) fireEvent.click(answeredBtns[0]);

    // Click prayer title to edit and then click Delete
    const prayerTitle = screen.getByText('Pray for exam');
    fireEvent.click(prayerTitle);
    const deleteBtn = screen.getAllByRole('button', { name: /^Delete$/i })[0];
    if (deleteBtn) fireEvent.click(deleteBtn);
  });

  // The rules deny a Trainee the threads collection group (it spans people
  // outside their visibleTo), so "What's waiting" reads each visible person's.
  it('puts Ask the team last, after the people and the prayers', async () => {
    render(
      <MemoryRouter>
        <LandingTrainee />
      </MemoryRouter>
    );
    await screen.findByText('Alex Student');
    const order = [
      "What's waiting on you",
      'Your people',
      "Prayers we're praying for",
      'Ask the team',
    ].map((name) => screen.getByRole('heading', { name }));
    for (let i = 1; i < order.length; i++) {
      expect(order[i - 1].compareDocumentPosition(order[i]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('Log interaction on a person opens the log popup for that person', async () => {
    mockAuthValue = {
      user: { uid: 'u-trainee', displayName: 'Trainee Sam' },
      role: 'manager',
      effectiveUserId: 'u-trainee',
      effectiveUserName: 'Trainee Sam',
    };
    mockLayout.openLogInteraction.mockClear();
    render(<MemoryRouter><LandingTrainee /></MemoryRouter>);
    await screen.findByText('Alex Student');
    fireEvent.click(screen.getByRole('button', { name: /^Log interaction$/i }));
    expect(mockLayout.openLogInteraction).toHaveBeenCalledWith('c1');
    // Straight to logging — the person page does not open first.
    expect(screen.queryByRole('button', { name: /^Close$/i })).not.toBeInTheDocument();
  });

  it('caps Your people at five, longest-since-connected first, with See all to People', async () => {
    mockAuthValue = {
      user: { uid: 'u-trainee-many', displayName: 'Many Trainee' },
      role: 'manager',
      effectiveUserId: 'u-trainee-many',
      effectiveUserName: 'Many Trainee',
    };
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<LandingTrainee />} />
          <Route path="/directory" element={<div>People route</div>} />
        </Routes>
      </MemoryRouter>
    );
    await screen.findByText('Person 7d');
    for (const n of [7, 6, 5, 4, 3]) expect(screen.getByText(`Person ${n}d`)).toBeInTheDocument();
    expect(screen.queryByText('Person 2d')).not.toBeInTheDocument();
    expect(screen.queryByText('Person 1d')).not.toBeInTheDocument();
    // The count still reflects everyone in their care.
    expect(screen.getByText('7 students')).toBeInTheDocument();

    const section = screen.getByRole('heading', { name: 'Your people' }).closest('section')!;
    fireEvent.click(within(section).getByRole('button', { name: /See all/i }));
    expect(await screen.findByText('People route')).toBeInTheDocument();
  });

  it('the empty Your people offers add a contact through the shared new-contact entry', async () => {
    mockAuthValue = {
      user: { uid: 'u-trainee-empty', displayName: 'Empty Trainee' },
      role: 'manager',
      effectiveUserId: 'u-trainee-empty',
      effectiveUserName: 'Empty Trainee',
    };
    mockLayout.openNewContact.mockClear();
    render(<MemoryRouter><LandingTrainee /></MemoryRouter>);
    fireEvent.click(await screen.findByRole('button', { name: /^add a contact$/i }));
    expect(mockLayout.openNewContact).toHaveBeenCalledTimes(1);
  });

  it('reads the Trainee\'s threads through their visible contacts, never the collection group', async () => {
    const threads = await import('../lib/threads');
    vi.mocked(threads.subscribeAllThreads).mockClear();
    vi.mocked(threads.subscribeTiedThreads).mockClear();
    mockAuthValue = {
      user: { uid: 'u-trainee', displayName: 'Trainee Sam' },
      role: 'manager',
      effectiveUserId: 'u-trainee',
      effectiveUserName: 'Trainee Sam',
    };
    render(<MemoryRouter><LandingTrainee /></MemoryRouter>);
    await waitFor(() => expect(threads.subscribeTiedThreads).toHaveBeenCalledWith('u-trainee', expect.any(Function), expect.any(Function)));
    expect(threads.subscribeAllThreads).not.toHaveBeenCalled();
  });

  it('renders impersonated persona name and scopes data by effectiveUserId when impersonating', async () => {
    mockAuthValue = {
      user: { uid: 'u-owner-admin', displayName: 'Admin Owner' },
      role: 'manager',
      effectiveUserId: 'u-trainee-bob',
      effectiveUserName: 'Bob Trainee',
    };

    render(
      <MemoryRouter>
        <LandingTrainee />
      </MemoryRouter>
    );

    // Impersonated name is Bob Trainee -> greeting uses Bob
    expect(screen.getByText(/Bob\./i)).toBeInTheDocument();
  });

  it('cards only the people the reader has a tie to', async () => {
    mockAuthValue = {
      user: { uid: 'u-trainee', displayName: 'Trainee Sam' },
      role: 'manager',
      effectiveUserId: 'u-trainee',
      effectiveUserName: 'Trainee Sam',
    };

    render(
      <MemoryRouter>
        <LandingTrainee />
      </MemoryRouter>
    );

    expect(await screen.findByText('Alex Student')).toBeInTheDocument();
    // Readable but untied — the page cards what is yours to carry, not
    // everything the rules let you read (#1039).
    expect(screen.queryByText('Untied Person')).not.toBeInTheDocument();
    expect(screen.queryByText('Bobs Person')).not.toBeInTheDocument();
  });

  it('re-reads when the effective identity changes, so the preview shows this persona', async () => {
    mockAuthValue = {
      user: { uid: 'u-owner-admin', displayName: 'Admin Owner' },
      role: 'manager',
      effectiveUserId: 'u-trainee',
      effectiveUserName: 'Trainee Sam',
    };

    const { rerender } = render(
      <MemoryRouter>
        <LandingTrainee />
      </MemoryRouter>
    );
    expect(await screen.findByText('Alex Student')).toBeInTheDocument();

    // "See it as they do" steps to the next persona.
    mockAuthValue = {
      user: { uid: 'u-owner-admin', displayName: 'Admin Owner' },
      role: 'manager',
      effectiveUserId: 'u-trainee-bob',
      effectiveUserName: 'Bob Trainee',
    };
    rerender(
      <MemoryRouter>
        <LandingTrainee />
      </MemoryRouter>
    );

    expect(await screen.findByText('Bobs Person')).toBeInTheDocument();
    expect(screen.queryByText('Alex Student')).not.toBeInTheDocument();
  });

  it('clears a previous persona\'s load error when the identity changes', async () => {
    DENIED_READERS.add('u-trainee-denied');
    mockAuthValue = {
      user: { uid: 'u-owner-admin', displayName: 'Admin Owner' },
      role: 'manager',
      effectiveUserId: 'u-trainee-denied',
      effectiveUserName: 'Denied Trainee',
    };

    const { rerender } = render(
      <MemoryRouter>
        <LandingTrainee />
      </MemoryRouter>
    );
    expect(await screen.findByText(/your home/i)).toBeInTheDocument();

    mockAuthValue = {
      user: { uid: 'u-owner-admin', displayName: 'Admin Owner' },
      role: 'manager',
      effectiveUserId: 'u-trainee',
      effectiveUserName: 'Trainee Sam',
    };
    rerender(
      <MemoryRouter>
        <LandingTrainee />
      </MemoryRouter>
    );

    // One persona's refused read must not pin the error screen over the next.
    expect(await screen.findByText('Alex Student')).toBeInTheDocument();
    DENIED_READERS.delete('u-trainee-denied');
  });

  it('closes an open person when the identity changes', async () => {
    mockAuthValue = {
      user: { uid: 'u-owner-admin', displayName: 'Admin Owner' },
      role: 'manager',
      effectiveUserId: 'u-trainee',
      effectiveUserName: 'Trainee Sam',
    };

    const { rerender } = render(
      <MemoryRouter>
        <LandingTrainee />
      </MemoryRouter>
    );
    fireEvent.click(await screen.findByText('Alex Student'));
    expect(screen.getByRole('button', { name: /^Close$/i })).toBeInTheDocument();

    mockAuthValue = {
      user: { uid: 'u-owner-admin', displayName: 'Admin Owner' },
      role: 'manager',
      effectiveUserId: 'u-trainee-bob',
      effectiveUserName: 'Bob Trainee',
    };
    rerender(
      <MemoryRouter>
        <LandingTrainee />
      </MemoryRouter>
    );

    // The previous persona's person does not outlive the preview of them.
    expect(await screen.findByText('Bobs Person')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Close$/i })).not.toBeInTheDocument();
  });

  it('passes myIds to traineeWaitingItems to scope waiting items to contacts in care', async () => {
    mockAuthValue = {
      user: { uid: 'u-trainee', displayName: 'Trainee Sam' },
      role: 'manager',
      effectiveUserId: 'u-trainee',
      effectiveUserName: 'Trainee Sam',
    };
    const { traineeWaitingItems } = await import('../lib/inbox');
    render(
      <MemoryRouter>
        <LandingTrainee />
      </MemoryRouter>
    );

    expect(traineeWaitingItems).toHaveBeenCalledWith(
      'u-trainee',
      expect.any(Array),
      expect.any(Set)
    );
    const lastCall = vi.mocked(traineeWaitingItems).mock.calls.at(-1);
    const passedSet = lastCall?.[2] as Set<string>;
    expect(passedSet.has('c1')).toBe(true);
  });

  describe('first-run checklist reads the Trainee\'s own work', () => {
    const asNoted = () => {
      mockAuthValue = {
        user: { uid: 'u-trainee-noted', displayName: 'Noted Trainee' },
        role: 'manager',
        effectiveUserId: 'u-trainee-noted',
        effectiveUserName: 'Noted Trainee',
      };
    };
    const progress = () => screen.getByRole('progressbar', { name: /getting started progress/i });

    afterEach(() => {
      teamPrayers = DEFAULT_TEAM_PRAYERS;
      personalPrayers = DEFAULT_PERSONAL_PRAYERS;
      tiedThreads = DEFAULT_TIED_THREADS;
      tiedInteractions = [];
      localStorage.clear();
    });

    it('does not tick conversation, prayer or follow-up from contact notes or other people\'s records', async () => {
      asNoted();
      personalPrayers = [];
      teamPrayers = [
        { id: 'pr-other', contactId: 'noted', burden: 'Their prayer', status: 'pending', updatedBy: 'u-someone-else' },
      ];
      tiedThreads = [
        {
          id: 'ask1',
          contactId: 'noted',
          interactionId: null,
          from: 'u-ft',
          fromName: 'Admin Tony',
          kind: 'nudge',
          body: 'Please follow up',
          at: new Date().toISOString(),
          closedBy: 'u-someone-else',
        },
      ];
      tiedInteractions = [{ id: 'i-other', userId: 'u-someone-else' }];

      render(<MemoryRouter><LandingTrainee /></MemoryRouter>);
      await screen.findByText('Noted Person');

      // Only "Add someone you've met" is real.
      expect(progress()).toHaveAttribute('aria-valuenow', '1');
      expect(screen.getByText(/In your own words/)).toBeInTheDocument();
      expect(screen.getByText(/Your queue hands you one at a time/)).toBeInTheDocument();
      expect(screen.getByText(/The only done in the app/)).toBeInTheDocument();
    });

    it('ticks conversation, prayer and follow-up from what this Trainee did', async () => {
      asNoted();
      personalPrayers = [];
      teamPrayers = [
        { id: 'pr-mine', contactId: 'noted', burden: 'My prayer', status: 'pending', updatedBy: 'u-trainee-noted' },
      ];
      tiedThreads = [
        {
          id: 'ask1',
          contactId: 'noted',
          interactionId: null,
          from: 'u-ft',
          fromName: 'Admin Tony',
          kind: 'nudge',
          body: 'Please follow up',
          at: new Date().toISOString(),
          closedBy: 'u-trainee-noted',
        },
      ];
      tiedInteractions = [{ id: 'i-mine', userId: 'u-trainee-noted' }];

      render(<MemoryRouter><LandingTrainee /></MemoryRouter>);
      await screen.findByText('Noted Person');

      // person + conversation + prayer + follow-up (the team question is still open).
      expect(progress()).toHaveAttribute('aria-valuenow', '4');
      expect(screen.queryByText(/In your own words/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Your queue hands you one at a time/)).not.toBeInTheDocument();
      expect(screen.queryByText(/The only done in the app/)).not.toBeInTheDocument();
    });

    it('does not tick follow-up when the asker retracted their own ask', async () => {
      asNoted();
      personalPrayers = [];
      tiedThreads = [
        {
          id: 'ask1',
          contactId: 'noted',
          interactionId: null,
          from: 'u-trainee-noted',
          fromName: 'Noted Trainee',
          kind: 'nudge',
          body: 'Never mind',
          at: new Date().toISOString(),
          closedBy: 'u-trainee-noted',
        },
      ];

      render(<MemoryRouter><LandingTrainee /></MemoryRouter>);
      await screen.findByText('Noted Person');

      expect(screen.getByText(/The only done in the app/)).toBeInTheDocument();
    });
  });
  describe("What's waiting on you states", () => {
    const asTrainee = () => {
      mockAuthValue = {
        user: { uid: 'u-trainee', displayName: 'Trainee Sam' },
        role: 'manager',
        effectiveUserId: 'u-trainee',
        effectiveUserName: 'Trainee Sam',
      };
    };
    afterEach(async () => {
      waitingItems = DEFAULT_WAITING;
      readIds = new Set();
      markRead.mockClear();
      markUnread.mockClear();
      const threads = await import('../lib/threads');
      vi.mocked(threads.subscribeTiedThreads).mockImplementation((_staffId, callback) => {
        callback(tiedThreads);
        return () => {};
      });
    });

    it('names the action the handled toggle performs', async () => {
      asTrainee();
      const { rerender } = render(<MemoryRouter><LandingTrainee /></MemoryRouter>);
      await screen.findByText('Alex Student');
      fireEvent.click(screen.getByRole('button', { name: 'Mark handled' }));
      expect(markRead).toHaveBeenCalledWith('u-trainee', 'w1');

      rerender(<MemoryRouter><LandingTrainee /></MemoryRouter>);
      expect(screen.queryByRole('button', { name: 'Mark handled' })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Reopen' }));
      expect(markUnread).toHaveBeenCalledWith('u-trainee', 'w1');
    });

    it('labels the unread count and the unread dot for assistive tech', async () => {
      asTrainee();
      render(<MemoryRouter><LandingTrainee /></MemoryRouter>);
      await screen.findByText('Alex Student');
      expect(screen.getByText('1 unread')).toHaveClass('sr-only');
      expect(screen.getByRole('img', { name: 'Unread' })).toBeInTheDocument();
    });

    it('says plainly when nothing is waiting, rather than hiding the section', async () => {
      asTrainee();
      waitingItems = [];
      render(<MemoryRouter><LandingTrainee /></MemoryRouter>);
      await screen.findByText('Alex Student');
      expect(screen.getByText("Nothing's waiting on you.")).toBeInTheDocument();
    });

    it('shows a failed thread read inline with a Retry that resubscribes, keeping the page', async () => {
      asTrainee();
      waitingItems = [];
      const threads = await import('../lib/threads');
      const sub = vi.mocked(threads.subscribeTiedThreads);
      sub.mockClear();
      sub.mockImplementation((_staffId, _callback, onError) => {
        onError?.(new Error('permission-denied'));
        return () => {};
      });
      render(<MemoryRouter><LandingTrainee /></MemoryRouter>);
      await screen.findByText('Alex Student');
      expect(screen.getByText("Couldn't load what's waiting on you.")).toBeInTheDocument();
      expect(screen.queryByText("Nothing's waiting on you.")).not.toBeInTheDocument();
      expect(screen.getByRole('heading', { name: 'Your people' })).toBeInTheDocument();

      const calls = sub.mock.calls.length;
      sub.mockImplementation((_staffId, callback) => {
        callback([]);
        return () => {};
      });
      fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
      await waitFor(() => expect(sub.mock.calls.length).toBeGreaterThan(calls));
      expect(screen.queryByText("Couldn't load what's waiting on you.")).not.toBeInTheDocument();
      expect(screen.getByText("Nothing's waiting on you.")).toBeInTheDocument();
    });
  });
});
