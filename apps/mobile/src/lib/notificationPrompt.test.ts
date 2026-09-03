import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import {
  NOTIFICATION_PROMPT_STORAGE_KEY,
  getNotificationPromptDismissed,
  setNotificationPromptDismissed,
  shouldShowMobileNotificationPrompt,
  getMobileNotificationPlatformName,
} from './notificationPrompt';

describe('mobile notificationPrompt', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  describe('dismissal persistence', () => {
    it('defaults to false when storage is empty', async () => {
      expect(await getNotificationPromptDismissed()).toBe(false);
    });

    it('persists true on dismissal', async () => {
      await setNotificationPromptDismissed(true);
      expect(await AsyncStorage.getItem(NOTIFICATION_PROMPT_STORAGE_KEY)).toBe('true');
      expect(await getNotificationPromptDismissed()).toBe(true);
    });
  });

  describe('shouldShowMobileNotificationPrompt', () => {
    it('returns true when undetermined, canAskAgain is true, and not dismissed', () => {
      expect(
        shouldShowMobileNotificationPrompt({
          status: 'undetermined',
          canAskAgain: true,
          dismissed: false,
        }),
      ).toBe(true);
    });

    it('returns false when dismissed', () => {
      expect(
        shouldShowMobileNotificationPrompt({
          status: 'undetermined',
          canAskAgain: true,
          dismissed: true,
        }),
      ).toBe(false);
    });

    it('returns false when canAskAgain is false', () => {
      expect(
        shouldShowMobileNotificationPrompt({
          status: 'undetermined',
          canAskAgain: false,
          dismissed: false,
        }),
      ).toBe(false);
    });

    it('returns false when already granted', () => {
      expect(
        shouldShowMobileNotificationPrompt({
          status: 'granted',
          canAskAgain: true,
          dismissed: false,
        }),
      ).toBe(false);
    });

    it('returns false when denied', () => {
      expect(
        shouldShowMobileNotificationPrompt({
          status: 'denied',
          canAskAgain: true,
          dismissed: false,
        }),
      ).toBe(false);
    });
  });

  describe('getMobileNotificationPlatformName', () => {
    it('returns iOS on iOS and Android on android', () => {
      const originalOS = Platform.OS;
      try {
        (Platform as any).OS = 'ios';
        expect(getMobileNotificationPlatformName()).toBe('iOS');

        (Platform as any).OS = 'android';
        expect(getMobileNotificationPlatformName()).toBe('Android');
      } finally {
        (Platform as any).OS = originalOS;
      }
    });
  });
});
