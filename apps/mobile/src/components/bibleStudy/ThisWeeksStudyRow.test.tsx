import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { ThisWeeksStudyRow } from './ThisWeeksStudyRow';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { subscribeEntryPoints } from '../../lib/data/bibleStudy';

jest.mock('../../lib/data/bibleStudy', () => ({
  subscribeEntryPoints: jest.fn(),
}));

// ThemeProvider reads the signed-in user's appearance preference, which reaches
// Firebase; the shell tests mock it the same way.
jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ user: { uid: 'u-1' }, uid: 'u-1', role: 'manager' }),
}));

const mockOpenBrowserAsync = jest.fn();
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowserAsync(...args),
}));

const mockSetStringAsync = jest.fn();
jest.mock('expo-clipboard', () => ({
  setStringAsync: (...args: unknown[]) => mockSetStringAsync(...args),
}));

jest.mock('react-native-qrcode-svg', () => {
  const { View } = require('react-native');
  return ({ value }: { value: string }) => <View testID="qr" accessibilityLabel={value} />;
});

const WEDNESDAY = {
  id: 'cisa-wednesday',
  slug: 'cisa-wednesday',
  name: 'Wednesday Bible Study',
  activeStudyId: 'romans-fall26',
};
const THURSDAY = {
  id: 'cisa-thursday',
  slug: 'cisa-thursday',
  name: 'Thursday 7pm',
  activeStudyId: 'romans-fall26',
};

const URL = 'https://cisa-campus-work-tracker.pages.dev/s/cisa-wednesday';

function mockEntryPoints(entryPoints: unknown[]) {
  (subscribeEntryPoints as jest.Mock).mockImplementation((cb: (eps: unknown[]) => void) => {
    cb(entryPoints);
    return () => {};
  });
}

const renderRow = (props = {}) =>
  render(
    <ThemeProvider>
      <ThisWeeksStudyRow {...props} />
    </ThemeProvider>,
  );

describe("This week's study — mobile row (#946)", () => {
  beforeEach(() => jest.clearAllMocks());

  it('opens the durable entry point URL in an in-app browser, not the system one', () => {
    // expo-linking would hand the person to Safari and make them app-switch
    // back; the browser sheet dismisses into the app.
    mockEntryPoints([WEDNESDAY]);
    const { getByLabelText } = renderRow();

    fireEvent.press(getByLabelText("This week's study"));
    expect(mockOpenBrowserAsync).toHaveBeenCalledWith(URL);
  });

  it('copies the same URL a student would scan', async () => {
    mockEntryPoints([WEDNESDAY]);
    const { getByLabelText } = renderRow();

    fireEvent.press(getByLabelText('Copy link'));
    await waitFor(() => expect(mockSetStringAsync).toHaveBeenCalledWith(URL));
  });

  it('shows a code built from the entry point, on a white ground', () => {
    mockEntryPoints([WEDNESDAY]);
    const { getByLabelText } = renderRow();

    fireEvent.press(getByLabelText('Show QR'));
    expect(getByLabelText(URL)).toBeTruthy();
  });

  it('names each room when a week is taught in two', () => {
    // A split week is two Entry points (ADR 0011 §4); the names are what tell
    // them apart, so each gets its own row rather than a remembered pick.
    mockEntryPoints([WEDNESDAY, THURSDAY]);
    const { getByLabelText } = renderRow();

    expect(getByLabelText("This week's study — Wednesday Bible Study")).toBeTruthy();
    expect(getByLabelText("This week's study — Thursday 7pm")).toBeTruthy();
  });

  it('renders nothing when no entry point has been seeded', () => {
    mockEntryPoints([]);
    const { queryByLabelText } = renderRow();
    expect(queryByLabelText("This week's study")).toBeNull();
  });

  it('closes the drawer before opening the browser', () => {
    // The trainee shell reaches this through its drawer, which must not still
    // be sitting open behind the browser sheet when it is dismissed.
    mockEntryPoints([WEDNESDAY]);
    const onNavigate = jest.fn();
    const { getByLabelText } = renderRow({ variant: 'drawer', onNavigate });

    fireEvent.press(getByLabelText("This week's study"));
    expect(onNavigate).toHaveBeenCalled();
  });
});
