import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export const NOTIFICATION_PROMPT_STORAGE_KEY = 'cisa.mobile_notification_prompt_dismissed.v1';

export async function getNotificationPromptDismissed(): Promise<boolean> {
  try {
    const val = await AsyncStorage.getItem(NOTIFICATION_PROMPT_STORAGE_KEY);
    return val === 'true';
  } catch {
    return false;
  }
}

export async function setNotificationPromptDismissed(dismissed: boolean): Promise<void> {
  try {
    if (dismissed) {
      await AsyncStorage.setItem(NOTIFICATION_PROMPT_STORAGE_KEY, 'true');
    } else {
      await AsyncStorage.removeItem(NOTIFICATION_PROMPT_STORAGE_KEY);
    }
  } catch (err) {
    console.error('Failed to set notification prompt dismissal:', err);
  }
}

export function shouldShowMobileNotificationPrompt(opts: {
  status: string;
  canAskAgain: boolean;
  dismissed: boolean;
}): boolean {
  if (opts.status !== 'undetermined') return false;
  if (!opts.canAskAgain) return false;
  return !opts.dismissed;
}

export function getMobileNotificationPlatformName(): string {
  if (Platform.OS === 'ios') return 'iOS';
  if (Platform.OS === 'android') return 'Android';
  return 'device';
}
