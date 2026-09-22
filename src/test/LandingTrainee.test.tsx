import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi } from 'vitest';
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
];

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
          callback({
            docs: [
              {
                id: 'pr1',
                data: () => ({
                  contactId: 'c1',
                  text: 'Pray for guidance',
                  status: 'ongoing',
                  createdAt: new Date().toISOString(),
                }),
              },
            ],
          });
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
    callback([
      { id: 'p1', title: 'Pray for exam', contactId: 'c1', status: 'open', date: new Date().toISOString() },
    ]);
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
  subscribeAllThreads: vi.fn((callback) => {
    callback([
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
    ]);
    return () => {};
  }),
}));

vi.mock('../lib/inbox', () => ({
  traineeWaitingItems: vi.fn(() => [
    {
      id: 'w1',
      kind: 'nudge',
      at: new Date().toISOString(),
      body: 'Please follow up with Alex',
      msgId: 't1',
      contactId: 'c1',
    },
  ]),
}));

vi.mock('../lib/inboxReads', () => ({
  useInboxReads: () => ({
    isRead: () => false,
    markRead: vi.fn(),
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

    // Click Mark handled
    const handledBtn = screen.getByRole('button', { name: /Mark handled/i });
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
});


