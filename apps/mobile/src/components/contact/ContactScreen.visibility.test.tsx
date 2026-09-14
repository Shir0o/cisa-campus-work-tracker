// A KNOWN-FAILING repro, kept skipped on purpose — see #1024.
//
// The mobile person screen has no per-contact visibility gate. A Trainee who
// reaches a person they have no tie to reads the whole screen, including the
// Alongside thread, including team-scope (Full-timer-only) discussion. A
// Full-timer hit this through "See it as they do", but impersonation is not
// load-bearing: the cases below are parameterised over both identities and
// fail identically either way.
//
// Every assertion here fails today. Un-skip this as the first move of #1024
// phase 1 (gate the screen on canSeeContact) and phase 2 (cut team scope on
// effective role) — it goes green when both land, and stays as the regression
// test. Do not "fix" it by weakening an assertion.
import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { ContactScreen } from './ContactScreen';
import { useContactDetailData } from '../../lib/useContactDetailData';
import { useAuth } from '../../lib/AuthProvider';
import type { Interaction, ThreadMessage } from '@cisa/core';

jest.mock('../../lib/AuthProvider', () => ({ useAuth: jest.fn() }));
jest.mock('../../lib/useFtHomeData', () => ({ prayerCardId: (id: string) => `pray:${id}` }));
jest.mock('../../lib/data/contacts', () => ({ moveContactStage: jest.fn() }));
jest.mock('../../lib/data/users', () => ({
  subscribeUsers: jest.fn((cb) => {
    cb([{ uid: 'enoch', displayName: 'Enoch', email: 'enoch@example.com', role: 'manager' }]);
    return () => {};
  }),
}));
jest.mock('../../lib/messaging', () => ({ openCall: jest.fn(), openEmail: jest.fn(), openMessage: jest.fn() }));
jest.mock('../../lib/useContactDetailData', () => ({ useContactDetailData: jest.fn() }));
jest.mock('../../lib/queueState', () => ({
  useQueueState: () => ({ handled: {}, handledCount: 0, handle: jest.fn(), pushLater: jest.fn() }),
}));
jest.mock('../log/LogSheet', () => ({ LogSheet: () => null }));
jest.mock('./ContactPrayerSheet', () => ({ ContactPrayerSheet: () => null }));
jest.mock('../journey/MoveStepSheet', () => ({ MoveStepSheet: () => null }));
jest.mock('./EditContactSheet', () => ({ EditContactSheet: () => null }));
jest.mock('./AddCollaboratorSheet', () => ({ AddCollaboratorSheet: () => null }));

// Amy: added by, owned by, and co-created with Full-timers only. Enoch the
// trainee has no tie to her at all — People already hides her from him.
const amy = {
  id: 'amy',
  name: 'Amy Nguyen',
  stage: 'Interested',
  createdAt: '2026-08-01T12:00:00.000Z',
  createdBy: 'tony',
  createdByName: 'Tony',
  addedBy: 'tony',
  owner: 'tony',
  coCreators: ['tony', 'grace'],
};

const threadMessages: ThreadMessage[] = [
  {
    id: 'm-team',
    interactionId: null,
    scope: 'team',
    from: 'tony',
    fromName: 'Tony Wang',
    kind: 'comment',
    body: 'FULLTIMER-ONLY-DISCUSSION',
    at: '2026-09-10T12:00:00.000Z',
    reactions: [],
  },
  {
    id: 'm-open',
    interactionId: null,
    from: 'grace',
    fromName: 'Grace Lee',
    kind: 'comment',
    body: 'ORDINARY-COMMENT',
    at: '2026-09-11T12:00:00.000Z',
    reactions: [],
  },
];

const data = {
  contact: amy,
  stages: [{ id: 'stage2', label: 'Interested' }],
  loading: false,
  error: null,
  interactions: [] as Interaction[],
  interactionsLoading: false,
  prayers: [],
  prayersLoading: false,
  threadMessages,
  walkLabel: 'Alongside',
  inYourCare: false,
  addInteraction: jest.fn(),
  addPrayer: jest.fn(),
  markPrayerAnswered: jest.fn(),
  postThreadMessage: jest.fn(),
  toggleReaction: jest.fn(),
  deleteInteraction: jest.fn(),
  addCollaborator: jest.fn(),
  removeCollaborator: jest.fn(),
};

function asTrainee(isImpersonating: boolean) {
  (useAuth as jest.Mock).mockReturnValue({
    uid: 'enoch',
    user: { displayName: 'Enoch' },
    role: 'manager',
    isImpersonating,
  });
  (useContactDetailData as jest.Mock).mockReturnValue(data);
}

describe.skip.each([
  ['a Full-timer using "See it as they do" on a trainee', true],
  ['a trainee signed in for real', false],
])('ContactScreen visibility — %s', (_label, isImpersonating) => {
  beforeEach(() => {
    jest.clearAllMocks();
    asTrainee(isImpersonating as boolean);
  });

  it('does not show a contact the impersonated trainee has no tie to', () => {
    const { queryByText } = render(
      <ThemeProvider>
        <ContactScreen contactId="amy" initialTab="alongside" />
      </ThemeProvider>,
    );
    expect(queryByText('Amy Nguyen')).toBeNull();
  });

  it('does not show comments on that contact, Full-timer discussion least of all', () => {
    const { queryByText } = render(
      <ThemeProvider>
        <ContactScreen contactId="amy" initialTab="alongside" />
      </ThemeProvider>,
    );
    expect(queryByText('ORDINARY-COMMENT')).toBeNull();
    expect(queryByText('FULLTIMER-ONLY-DISCUSSION')).toBeNull();
  });
});
