import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ThemeProvider } from '../../theme/ThemeProvider';
import { MobileNotificationPermissionBanner } from './MobileNotificationPermissionBanner';
import * as mobileNotifications from '../../lib/notifications';
import { NOTIFICATION_PROMPT_STORAGE_KEY } from '../../lib/notificationPrompt';

jest.mock('../../lib/AuthProvider', () => ({
  useAuth: () => ({ uid: 'user1', user: null, role: 'admin' }),
}));

jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
}));

jest.mock('../../lib/notifications', () => ({
  ensureNotificationPermission: jest.fn(),
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
});
