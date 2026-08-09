// QueueScreen component test — locks down the "Later on the only remaining
// card" behavior. Deferring a 1-of-1 queue puts the card right back at the
// front (buildQueue sorts deferred cards to the back, and the back is the
// front when there's one card), so the press must say so instead of looking
// dead: the screen shows a "Moved to later." toast. When Later actually
// advances (2+ cards), the ghost affordance stays quiet.
//
// The data layer is a live Firestore subscription; this test pins the SCREEN's
// behavior, so the hook is stubbed with a fixture queue and the sheets/drawer
// (closed here) render as nothing.
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import type { QueueCard } from '@cisa/core';
import { useAuth } from '../../lib/AuthProvider';
import { useTraineeLandingData } from '../../lib/useTraineeLandingData';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { QueueScreen } from './QueueScreen';

jest.mock('../../lib/useTraineeLandingData', () => ({
  useTraineeLandingData: jest.fn(),
}));
jest.mock('../../lib/AuthProvider', () => ({
  useAuth: jest.fn(),
}));
// Firestore writes; the screen only reaches them from other cards' buttons.
jest.mock('../../lib/data/todos', () => ({ setTodoDone: jest.fn(), updateTodo: jest.fn() }));
jest.mock('../../lib/data/threads', () => ({ addThreadMessage: jest.fn(), toggleReaction: jest.fn() }));
jest.mock('../../lib/data/inboxReads', () => ({ InboxReads: { markRead: jest.fn(), markUnread: jest.fn() } }));
// The bottom sheets and the drawer pull in their own screens and state; all are
// closed in this test, so render them as nothing. DrawerButton (the ☰) is real.
jest.mock('../log/LogSheet', () => ({ LogSheet: () => null }));
jest.mock('./ReplySheet', () => ({ ReplySheet: () => null }));
jest.mock('./QueueDrawer', () => {
  const actual = jest.requireActual('./QueueDrawer');
  return { ...actual, QueueDrawer: () => null };
});

const mockUseAuth = useAuth as jest.Mock;
const mockUseTraineeLandingData = useTraineeLandingData as jest.Mock;

const card = (id: string): QueueCard => ({
  id,
  kind: 'follow',
  tone: 'follow',
  group: 2,
  label: "You said you'd follow up",
  ago: '',
  title: 'Check in with Rio',
  contact: {
    id: 'c1',
    name: 'Rio Alvarez',
    role: '',
    location: 'Hillcrest',
    email: '',
    phone: '',
    stage: '',
    lastSeen: '',
    initials: 'RA',
    createdBy: 'me',
    year: 'Sophomore',
    major: 'Biology',
    pronouns: 'she/her',
  },
  task: { id: 't1', title: 'Check in with Rio', priority: 'medium', status: 'pending', assigneeId: 'me', contactId: 'c1' },
  last: null,
});

const queueWith = (cards: QueueCard[]) => Object.assign(cards, { held: 0 });

const dataFixture = (queue: QueueCard[]) => ({
  loading: false,
  error: null,
  queue,
  queuePrefs: {
    prefs: {
      quietDays: 2,
      quietMax: 2,
      prayers: 3,
      dayCap: 8,
      onCampus: { days: [], from: 12, to: 15 },
    },
    set: jest.fn(),
    reset: jest.fn(),
  },
  queueState: {
    handled: {},
    later: {},
    handledCount: 0,
    handle: jest.fn(),
    pushLater: jest.fn(),
    reset: jest.fn(),
  },
  dates: [],
  week: [],
});

beforeEach(() => {
  jest.clearAllMocks();
  mockUseAuth.mockReturnValue({ uid: 'me', user: { displayName: 'Alex' }, role: 'trainee' });
});

const renderScreen = () =>
  render(
    <ThemeProvider>
      <QueueScreen />
    </ThemeProvider>,
  );

describe('QueueScreen — Later on the last card', () => {
  it('shows a toast when deferring the only card (1 of 1)', () => {
    mockUseTraineeLandingData.mockReturnValue(dataFixture(queueWith([card('task:t1')])));
    const { getByText, queryByText } = renderScreen();

    expect(queryByText('Moved to later.')).toBeNull();

    fireEvent.press(getByText('Later  →'));

    expect(getByText('Moved to later.')).toBeTruthy();
  });

  it('keeps the ghost affordance quiet when Later actually advances (2 of 2)', () => {
    mockUseTraineeLandingData.mockReturnValue(
      dataFixture(queueWith([card('task:t1'), card('task:t2')])),
    );
    const { getByText, queryByText } = renderScreen();

    fireEvent.press(getByText('Later  →'));

    expect(queryByText('Moved to later.')).toBeNull();
  });
});
