// The API base URL for mobile server calls. Falls back to the production
// Workers domain so a native build without EXPO_PUBLIC_API_URL still works.
import { Platform } from 'react-native';

export const getApiUrl = (): string => {
  if (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/+$/, '');
  }
  return Platform.OS === 'web' ? '' : 'https://cisa-campus-work-tracker.pages.dev';
};