import React from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { act, fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { QueueScreen } from './QueueScreen';
import { useTraineeLandingData } from '../../lib/useTraineeLandingData';
import { deleteTodo, setTodoDone } from '../../lib/data/todos';
import { deleteInteraction } from '../../lib/data/interactions';

jest.mock('../../lib/data/bibleStudy', () => ({
  subscribeEntryPoints: jest.fn(() => () => {}),
  subscribePublishedStudyMeetings: jest.fn(() => () => {}),
}));

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: 'user1', user: null, role: 'trainee' }),
}));

jest.mock('../../lib/useTraineeLandingData', () => ({ useTraineeLandingData: jest.fn() }));

jest.mock('../../lib/data/todos', () => ({
  setTodoDone: jest.fn(),
  updateTodo: jest.fn(),
  deleteTodo: jest.fn(),
}));

jest.mock('../../lib/data/interactions', () => ({
  deleteInteraction: jest.fn(),
}));

jest.mock('../../lib/useDayGoal', () => ({
  useDayGoal: () => ({ goal: { on: true, count: 5 }, setOn: jest.fn(), setCount: jest.fn() }),
}));

jest.mock('../../lib/data/threads', () => ({
  addThreadMessage: jest.fn(),
}));

jest.mock('../../lib/data/inboxReads', () => ({
  InboxReads: { markRead: jest.fn() },
}));

// The shared mock drops a sheet's pinned footer; this screen's sheet pins the
// card's actions there, so render it.
jest.mock('@gorhom/bottom-sheet', () => {
  const React = jest.requireActual('react');
  const { ScrollView, View } = jest.requireActual('react-native');
  const BottomSheetModal = React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({ present: jest.fn(), dismiss: jest.fn() }));
    return React.createElement(View, null, props.children, props.footerComponent?.({}));
  });
  return {
    BottomSheetModal,
    BottomSheetScrollView: ScrollView,
    BottomSheetFooter: ({ children }: { children: React.ReactNode }) => React.createElement(View, null, children),
    useBottomSheetTimingConfigs: () => ({}),
  };
});

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn(), setParams: jest.fn() }),
  useLocalSearchParams: () => ({}),
  usePathname: () => '/',
  useSegments: () => [],
}));

// Captures the props the screen hands the log sheet, so a test can "save" a log.
const mockLogSheet = jest.fn((_props: { onSaved: (message: string, cardId?: string | null) => void }) => null);
jest.mock('../log/LogSheet', () => ({ LogSheet: (props: never) => mockLogSheet(props) }));

const LONG_NOTES =
  'Met at the welcome fair. Studies biology, wants to be a doctor. Grew up near the coast and misses it. ' +
  'Asked about the retreat in spring and whether there is a ride from the dorms.';

const sam = { id: 'c1', name: 'Sam Lee', notes: LONG_NOTES, phone: '555-0100' };

const followCard = {
  id: 'task:t1',
  kind: 'follow',
  tone: 'follow',
  group: 2,
  label: "YOU SAID YOU'D FOLLOW UP",
  ago: '',
  title: 'Follow up with Sam',
  contact: sam,
  task: { id: 't1', title: 'Ask Sam about the retreat' },
  last: null,
};

const dueCard = {
  id: 'todo:t2',
  kind: 'due',
  tone: 'due',
  group: 0,
  label: 'DUE TODAY',
  ago: '',
  title: 'Book the room',
  task: { id: 't2', title: 'Book the room' },
};

const queueOf = (...cards: object[]) => Object.assign([...cards], { held: 0 });

describe('QueueScreen', () => {
  const baseData = {
    loading: true,
    contacts: [],
    queue: Object.assign([], { held: 0 }),
    queueState: { handled: {}, handledCount: 0, handle: jest.fn(), pushLater: jest.fn(), unhandle: jest.fn() },
    queuePrefs: { prefs: {} },
    week: [],
    dates: [],
    error: null,
  };

  // The default on-campus window is Tue/Wed 12–3, so an unpinned clock turned
  // every "off campus" test into campus mode for three hours each week (#1726).
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(new Date(2026, 9, 20, 10, 0).getTime());
  });

  afterEach(() => jest.restoreAllMocks());

  it('shows the queue skeleton while data is loading', async () => {
    (useTraineeLandingData as jest.Mock).mockReturnValue(baseData);
    const { getByTestId } = await render(
      <ThemeProvider>
        <QueueScreen />
      </ThemeProvider>,
    );
    expect(getByTestId('queue-skeleton')).toBeTruthy();
  });

  it('shows the queue instead of the skeleton once loaded', async () => {
    (useTraineeLandingData as jest.Mock).mockReturnValue({ ...baseData, loading: false });
    const { queryByTestId } = await render(
      <ThemeProvider>
        <QueueScreen />
      </ThemeProvider>,
    );
    expect(queryByTestId('queue-skeleton')).toBeNull();
  });

  describe('Today, off campus', () => {
    const renderToday = async (overrides: Record<string, unknown> = {}) => {
      const queueState = {
        handled: {},
        handledCount: 1,
        handle: jest.fn(),
        pushLater: jest.fn(),
        unhandle: jest.fn(),
      };
      (useTraineeLandingData as jest.Mock).mockReturnValue({
        ...baseData,
        loading: false,
        queue: queueOf(followCard, dueCard),
        queueState,
        interactions: [
          { id: 'i1', contactId: 'c1', content: 'Coffee after class, talked about home', dateTime: '2026-10-01T10:00:00Z', createdAt: '' },
        ],
        ...overrides,
      });
      const screen = await render(
        <ThemeProvider>
          <QueueScreen />
        </ThemeProvider>,
      );
      return { ...screen, queueState };
    };

    beforeEach(async () => {
      jest.clearAllMocks();
      await AsyncStorage.clear();
    });

    it('says how much of today is left and how much is done', async () => {
      const { getByText } = await renderToday();
      expect(getByText('Today · 2 left')).toBeTruthy();
      expect(getByText('1 done')).toBeTruthy();
    });

    it('shows the first-run hint inside the card until dismissed, and it stays dismissed', async () => {
      const first = await renderToday();
      expect(await first.findByText('2 people to reach today.')).toBeTruthy();
      await fireEvent.press(first.getByLabelText('Dismiss hint'));
      expect(first.queryByText('2 people to reach today.')).toBeNull();
      await first.unmount();

      const again = await renderToday();
      // Give the stored dismissal time to load before asserting it holds.
      await act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
      expect(again.getByText('Today · 2 left')).toBeTruthy();
      expect(again.queryByText('2 people to reach today.')).toBeNull();
    });

    it('sets a card aside with "Later today"', async () => {
      const { getByText, queueState } = await renderToday();
      await fireEvent.press(getByText('Later today'));
      expect(queueState.pushLater).toHaveBeenCalledWith('task:t1');
      expect(queueState.handle).not.toHaveBeenCalled();
    });

    it('clamps long notes with a "More about" link that opens the full sheet', async () => {
      const { getByText, queryByText, getAllByText } = await renderToday();
      // Recent history lives only in the sheet.
      expect(queryByText('Coffee after class, talked about home')).toBeNull();

      await fireEvent.press(getByText('More about Sam'));

      expect(getByText('Coffee after class, talked about home')).toBeTruthy();
      // The card's actions are pinned at the sheet's foot too.
      expect(getAllByText('Text Sam')).toHaveLength(2);
      expect(getAllByText('Later today')).toHaveLength(2);
    });

    it('opens the full sheet when the card body is tapped', async () => {
      const { getByLabelText, getByText } = await renderToday();
      await fireEvent.press(getByLabelText('Read all about Sam'));
      expect(getByText('Coffee after class, talked about home')).toBeTruthy();
    });

    it('after "Mark it done", says it is done for today and Undo brings the card back and the to-do with it', async () => {
      const { getByText, queueState } = await renderToday({ queue: queueOf(dueCard, followCard) });
      await fireEvent.press(getByText('Mark it done'));

      expect(setTodoDone).toHaveBeenCalledWith('t2', true);
      expect(queueState.handle).toHaveBeenCalledWith('todo:t2');
      expect(getByText('Book the room — done for today')).toBeTruthy();

      await fireEvent.press(getByText('Undo'));

      expect(queueState.unhandle).toHaveBeenCalledWith('todo:t2');
      expect(setTodoDone).toHaveBeenLastCalledWith('t2', false);
    });

    it('Undo after a saved log brings the card back, reopens its to-do, and never deletes what was logged', async () => {
      const { getByText, queueState } = await renderToday();
      // Logging from the card hands the sheet its to-do, which saving completes.
      await fireEvent.press(getByText('Log what happened'));
      const { onSaved } = mockLogSheet.mock.calls.at(-1)![0];
      await act(() => onSaved('Logged.', 'task:t1'));

      expect(queueState.handle).toHaveBeenCalledWith('task:t1');
      expect(getByText('Sam — done for today')).toBeTruthy();

      await fireEvent.press(getByText('Undo'));

      expect(queueState.unhandle).toHaveBeenCalledWith('task:t1');
      expect(deleteInteraction).not.toHaveBeenCalled();
      expect(deleteTodo).not.toHaveBeenCalled();
      expect(setTodoDone).toHaveBeenCalledWith('t1', false);
    });
  });

  describe('campus mode, on campus', () => {
    // Tuesday 1:30pm local — inside the default Tue/Wed 12pm–3pm window.
    const ON = new Date(2026, 9, 20, 13, 30).getTime();
    // Tuesday 4pm — the window has closed.
    const OFF = new Date(2026, 9, 20, 16, 0).getTime();
    const window = { days: [2, 3], from: 12, to: 15 };

    const renderAt = async (now: number) => {
      jest.spyOn(Date, 'now').mockReturnValue(now);
      (useTraineeLandingData as jest.Mock).mockReturnValue({
        ...baseData,
        loading: false,
        contacts: [{ id: 'c9', name: 'Ana Ruiz', createdBy: 'user1', createdAt: new Date(2026, 9, 20, 12, 15).toISOString() }],
        interactions: [],
        queue: queueOf(followCard, dueCard),
        queuePrefs: { prefs: { onCampus: window } },
      });
      return render(
        <ThemeProvider>
          <QueueScreen />
        </ThemeProvider>,
      );
    };

    const lastLogSheet = () =>
      mockLogSheet.mock.calls.at(-1)![0] as unknown as { visible: boolean; start?: string; onClose: () => void };

    beforeEach(async () => {
      jest.clearAllMocks();
      await AsyncStorage.clear();
    });
    afterEach(() => jest.restoreAllMocks());

    it('shows the three actions instead of Today', async () => {
      const { getByText, queryByText } = await renderAt(ON);
      expect(getByText('Sign-up form')).toBeTruthy();
      expect(getByText('Add someone new')).toBeTruthy();
      expect(getByText('Log a conversation')).toBeTruthy();
      expect(getByText("You're on campus until 3pm")).toBeTruthy();
      expect(queryByText('Today · 2 left')).toBeNull();
    });

    it('lists who I added this window', async () => {
      const { getByText } = await renderAt(ON);
      expect(getByText('Ana · new')).toBeTruthy();
    });

    it('opens the sign-up form', async () => {
      const { getByLabelText } = await renderAt(ON);
      await fireEvent.press(getByLabelText('Sign-up form'));
      expect(mockPush).toHaveBeenCalledWith('/signup');
    });

    it('"Add someone new" opens the log sheet in its new-person form', async () => {
      const { getByLabelText } = await renderAt(ON);
      await fireEvent.press(getByLabelText('Add someone new'));
      expect(lastLogSheet()).toMatchObject({ visible: true, start: 'new' });
    });

    it('"Log a conversation" opens the log sheet in its default flow, even after "Add someone new"', async () => {
      const { getByLabelText } = await renderAt(ON);
      await fireEvent.press(getByLabelText('Add someone new'));
      await act(() => lastLogSheet().onClose());
      await fireEvent.press(getByLabelText('Log a conversation'));
      expect(lastLogSheet().visible).toBe(true);
      expect(lastLogSheet().start).toBeUndefined();
    });

    it('the Today row opens Today', async () => {
      const { getByLabelText, getByText, queryByText } = await renderAt(ON);
      await fireEvent.press(getByLabelText('2 people to reach today'));
      expect(getByText('Today · 2 left')).toBeTruthy();
      expect(queryByText('Sign-up form')).toBeNull();
    });

    it('from Today, the Campus control brings the three actions back', async () => {
      const { getByLabelText, getByText, queryByText } = await renderAt(ON);
      await fireEvent.press(getByLabelText('2 people to reach today'));
      await fireEvent.press(getByLabelText('Campus'));
      expect(getByText('Sign-up form')).toBeTruthy();
      expect(queryByText('Today · 2 left')).toBeNull();
    });

    it('off campus, the home is still Today', async () => {
      const { getByText, queryByText, queryByLabelText } = await renderAt(OFF);
      expect(getByText('Today · 2 left')).toBeTruthy();
      expect(queryByText('Sign-up form')).toBeNull();
      expect(queryByLabelText('Campus')).toBeNull();
    });
  });
});
