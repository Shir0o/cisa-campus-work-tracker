// CampusModeScreen tests — the trainee's home during the on-campus window
// (#1715, D5): three raised action cards, the window's chips, and the row back
// to Today.
import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { CampusModeScreen } from './CampusModeScreen';

// DrawerButton lives beside the drawer, whose module reaches Firebase.
jest.mock('../../lib/data/bibleStudy', () => ({
  subscribeEntryPoints: jest.fn(() => () => {}),
  subscribePublishedStudyMeetings: jest.fn(() => () => {}),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: 'u1', user: null, role: null }),
}));

const handlers = () => ({
  onMenu: jest.fn(),
  onSignUp: jest.fn(),
  onAddNew: jest.fn(),
  onLog: jest.fn(),
  onOpenToday: jest.fn(),
});

const renderScreen = async (
  overrides: Partial<React.ComponentProps<typeof CampusModeScreen>> = {},
) => {
  const h = handlers();
  const utils = await render(
    <ThemeProvider>
      <CampusModeScreen
        windowLabel="On campus until 3pm"
        recent={[]}
        todayCount={0}
        todayFaces={[]}
        {...h}
        {...overrides}
      />
    </ThemeProvider>,
  );
  return { ...utils, h };
};

describe('CampusModeScreen', () => {
  it('shows the window label and the three action titles', async () => {
    const { getByText } = await renderScreen();
    expect(getByText('On campus until 3pm')).toBeTruthy();
    expect(getByText('Sign-up form')).toBeTruthy();
    expect(getByText('Add someone new')).toBeTruthy();
    expect(getByText('Log an interaction')).toBeTruthy();
    expect(getByText('Someone new')).toBeTruthy();
    expect(getByText('Someone you already know')).toBeTruthy();
  });

  it('calls each action’s callback from its labelled button', async () => {
    const { getByLabelText, h } = await renderScreen({ todayCount: 2, todayFaces: [{ id: 'a', name: 'Jo Lee' }] });
    await fireEvent.press(getByLabelText('Sign-up form'));
    expect(h.onSignUp).toHaveBeenCalledTimes(1);
    await fireEvent.press(getByLabelText('Add someone new'));
    expect(h.onAddNew).toHaveBeenCalledTimes(1);
    await fireEvent.press(getByLabelText('Log an interaction'));
    expect(h.onLog).toHaveBeenCalledTimes(1);
    await fireEvent.press(getByLabelText('2 people to reach today'));
    expect(h.onOpenToday).toHaveBeenCalledTimes(1);
    await fireEvent.press(getByLabelText('Menu'));
    expect(h.onMenu).toHaveBeenCalledTimes(1);
  });

  it('shows titles only — no explanatory subtitles', async () => {
    const { queryByText } = await renderScreen();
    expect(queryByText(/fill (it|in)/i)).toBeNull();
    expect(queryByText(/hand (them|your)/i)).toBeNull();
    expect(queryByText(/type their/i)).toBeNull();
  });

  it('hides the window chips when nothing was added or logged', async () => {
    const { queryByText } = await renderScreen();
    expect(queryByText('Added or logged this window')).toBeNull();
  });

  it('lists who was added or logged this window, marking new people', async () => {
    const { getByText } = await renderScreen({
      recent: [
        { id: '1', name: 'Ana Ruiz', isNew: true },
        { id: '2', name: 'Sam Park', isNew: false },
      ],
    });
    expect(getByText('Added or logged this window')).toBeTruthy();
    expect(getByText('Ana Ruiz · new')).toBeTruthy();
    expect(getByText('Sam Park')).toBeTruthy();
  });

  it('hides the Today row when nobody is left to reach', async () => {
    const { queryByText } = await renderScreen({ todayCount: 0 });
    expect(queryByText(/people to reach today/)).toBeNull();
  });

  it('shows the Today row with the count when people are left', async () => {
    const { getByText } = await renderScreen({
      todayCount: 4,
      todayFaces: [
        { id: 'a', name: 'Jo Lee' },
        { id: 'b', name: 'Ana Ruiz' },
      ],
    });
    expect(getByText('4 people to reach today')).toBeTruthy();
  });
});
