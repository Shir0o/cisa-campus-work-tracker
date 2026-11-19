import React from 'react';
import { render } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { FtHomeScreen } from './FtHomeScreen';
import { useFtHomeData } from '../../lib/useFtHomeData';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: 'user1', user: null, role: 'full-timer' }),
}));

jest.mock('../../lib/useFtHomeData', () => ({ useFtHomeData: jest.fn() }));

jest.mock('../log/LogSheet', () => ({ LogSheet: () => null }));

// The panel owns its own subscription; this file only checks the home mounts it.
jest.mock('../announcements/AnnouncementsPanel', () => {
  const { Text } = jest.requireActual('react-native');
  const ReactActual = jest.requireActual('react');
  return { AnnouncementsPanel: (props: { isFullTimer: boolean }) => ReactActual.createElement(Text, null, `announcements:${props.isFullTimer}`) };
});

describe('FtHomeScreen', () => {
  it('shows the full-timer home skeleton while data is loading', async () => {
    (useFtHomeData as jest.Mock).mockReturnValue({ loading: true });
    const { getByTestId } = await render(
      <ThemeProvider>
        <FtHomeScreen />
      </ThemeProvider>,
    );
    expect(getByTestId('ft-home-skeleton')).toBeTruthy();
  });

  it('does not show the skeleton once data has loaded', async () => {
    (useFtHomeData as jest.Mock).mockReturnValue({
      loading: false,
      contacts: [],
      carrying: { count: 0, detail: '' },
      nextGathering: null,
      todos: { today: [], laterThisWeek: [], overdue: [] },
      inboxRows: [],
      quiet: [],
      carryRows: [],
      prayedToday: false,
      weekAhead: [],
      assignees: [],
      nameByUid: {},
      summary: '',
      error: null,
    });
    const { queryByTestId } = await render(
      <ThemeProvider>
        <FtHomeScreen />
      </ThemeProvider>,
    );
    expect(queryByTestId('ft-home-skeleton')).toBeNull();
  });

  it('shows the next gathering as a read-out, not a link to the cut Gatherings screen', async () => {
    (useFtHomeData as jest.Mock).mockReturnValue({
      loading: false,
      contacts: [],
      carrying: { count: 0, detail: '' },
      nextGathering: null,
      todos: { today: [], laterThisWeek: [], overdue: [] },
      inboxRows: [],
      quiet: [],
      carryRows: [],
      prayedToday: false,
      weekAhead: [],
      assignees: [],
      nameByUid: {},
      summary: '',
      error: null,
    });
    const { getByTestId } = await render(
      <ThemeProvider>
        <FtHomeScreen />
      </ThemeProvider>,
    );
    // §8 cut the phone Gatherings screen; /attendance is a redirect home, so
    // the tile no longer pretends to open anything.
    expect(getByTestId('glance-gathering').props.accessibilityState.disabled).toBe(true);
  });

  it('mounts the announcements panel (cut-or-keep §20)', async () => {
    (useFtHomeData as jest.Mock).mockReturnValue({
      loading: false,
      contacts: [],
      carrying: { count: 0, detail: '' },
      nextGathering: null,
      todos: { today: [], laterThisWeek: [], overdue: [] },
      inboxRows: [],
      quiet: [],
      carryRows: [],
      prayedToday: false,
      weekAhead: [],
      assignees: [],
      nameByUid: {},
      summary: '',
      error: null,
    });
    const { getByText } = await render(
      <ThemeProvider>
        <FtHomeScreen />
      </ThemeProvider>,
    );
    expect(getByText(/^announcements:/)).toBeTruthy();
  });
});
