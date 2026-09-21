import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { QueueScreen } from './QueueScreen';
import { useTraineeLandingData } from '../../lib/useTraineeLandingData';

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

jest.mock('../log/LogSheet', () => ({ LogSheet: () => null }));

describe('QueueScreen', () => {
  const baseData = {
    loading: true,
    contacts: [],
    queue: Object.assign([], { held: 0 }),
    queueState: { handled: {}, handledCount: 0, handle: jest.fn(), pushLater: jest.fn() },
    queuePrefs: { prefs: {} },
    week: [],
    dates: [],
    error: null,
  };

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
});
