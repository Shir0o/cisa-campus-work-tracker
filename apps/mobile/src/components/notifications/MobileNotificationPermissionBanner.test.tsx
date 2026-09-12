import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { MobileNotificationPermissionBanner } from './MobileNotificationPermissionBanner';
import * as mobileNotifications from '../../lib/notifications';
import { NOTIFICATION_PROMPT_STORAGE_KEY } from '../../lib/notificationPrompt';
import { setPushToken } from '../../lib/data/users';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: 'user1', user: { uid: 'user1' }, role: 'admin' }),
}));

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
}));

jest.mock('../../lib/notifications', () => ({
  ensureNotificationPermission: jest.fn(),
  registerForPushToken: jest.fn(),
}));

jest.mock('../../lib/data/users', () => ({
  setPushToken: jest.fn(),
}));

const renderBanner = () =>
  render(
    <ThemeProvider>
      <MobileNotificationPermissionBanner />
    </ThemeProvider>,
  );

describe('MobileNotificationPermissionBanner', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  it('renders nothing if permission status is granted', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
      canAskAgain: true,
    });

    const { queryByText } = renderBanner();
    await waitFor(() => {
      expect(queryByText(/Enable notifications/i)).toBeNull();
    });
  });

  it('renders nothing if already dismissed in AsyncStorage', async () => {
    await AsyncStorage.setItem(NOTIFICATION_PROMPT_STORAGE_KEY, 'true');
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'undetermined',
      canAskAgain: true,
    });

    const { queryByText } = renderBanner();
    await waitFor(() => {
      expect(queryByText(/Enable notifications/i)).toBeNull();
    });
  });

  it('renders banner when undetermined, canAskAgain is true, and not dismissed', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'undetermined',
      canAskAgain: true,
    });

    const { getByText } = renderBanner();
    await waitFor(() => {
      expect(getByText(/Enable notifications/i)).toBeTruthy();
      expect(getByText(/CISA Campus Work Tracker is requesting notification permission/i)).toBeTruthy();
    });
  });

  it('dismisses banner and sets AsyncStorage when Later is clicked', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'undetermined',
      canAskAgain: true,
    });

    const { getByText, queryByText } = renderBanner();
    await waitFor(() => {
      expect(getByText('Later')).toBeTruthy();
    });

    fireEvent.press(getByText('Later'));

    await waitFor(() => {
      expect(queryByText(/Enable notifications/i)).toBeNull();
    });
    expect(await AsyncStorage.getItem(NOTIFICATION_PROMPT_STORAGE_KEY)).toBe('true');
  });

  it('calls ensureNotificationPermission and dismisses when Enable is clicked', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'undetermined',
      canAskAgain: true,
    });
    (mobileNotifications.ensureNotificationPermission as jest.Mock).mockResolvedValue(true);

    const { getByText, queryByText } = renderBanner();
    await waitFor(() => {
      expect(getByText('Enable')).toBeTruthy();
    });

    fireEvent.press(getByText('Enable'));

    // Two independent facts, waited on separately (#946). Sharing one waitFor
    // meant the dismissal raced whatever was left of the block's single 1s
    // budget after the call assertion, and the Enable path needs one more
    // async hop than Later does — it awaits ensureNotificationPermission AND
    // the storage write before three state updates flush. That margin held
    // until the suite grew and CI's runner got there slower. The component
    // dismisses from a `finally`, so this is never conditional; only the
    // flushing is.
    await waitFor(() => {
      expect(mobileNotifications.ensureNotificationPermission).toHaveBeenCalled();
    });
    await waitFor(
      () => {
        expect(queryByText(/Enable notifications/i)).toBeNull();
      },
      { timeout: 5000 },
    );
    expect(await AsyncStorage.getItem(NOTIFICATION_PROMPT_STORAGE_KEY)).toBe('true');
  });
  // #977 — background push on native. Granting permission from this banner has
  // to register the device's push token there and then: usePushRegistration
  // only syncs on mount and on AppState -> active, and neither happens while
  // the app stays in the foreground after the tap. Without this, the user says
  // yes and nothing ever buzzes until they background and reopen the app.
  it('registers the push token when permission is granted from the banner', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'undetermined',
      canAskAgain: true,
    });
    (mobileNotifications.ensureNotificationPermission as jest.Mock).mockResolvedValue(true);
    (mobileNotifications.registerForPushToken as jest.Mock).mockResolvedValue(
      'ExponentPushToken[granted977]',
    );

    const { getByText } = renderBanner();
    await waitFor(() => {
      expect(getByText('Enable')).toBeTruthy();
    });

    fireEvent.press(getByText('Enable'));

    await waitFor(
      () => {
        expect(setPushToken).toHaveBeenCalledWith('user1', 'ExponentPushToken[granted977]');
      },
      { timeout: 5000 },
    );
  });

  it('does not register a push token when permission is refused', async () => {
    (Notifications.getPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'undetermined',
      canAskAgain: true,
    });
    (mobileNotifications.ensureNotificationPermission as jest.Mock).mockResolvedValue(false);

    const { getByText, queryByText } = renderBanner();
    await waitFor(() => {
      expect(getByText('Enable')).toBeTruthy();
    });

    fireEvent.press(getByText('Enable'));

    await waitFor(
      () => {
        expect(queryByText(/Enable notifications/i)).toBeNull();
      },
      { timeout: 5000 },
    );
    expect(mobileNotifications.registerForPushToken).not.toHaveBeenCalled();
    expect(setPushToken).not.toHaveBeenCalled();
  });
});
