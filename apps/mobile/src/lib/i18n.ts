import enDictionary from '../locales/en.json';

export type MobileDictionary = typeof enDictionary;

/**
 * Resolves a nested key (e.g. "mobile.nav.today" or "actions.cancel") in the
 * mobile English dictionary. The language argument is kept so a stale stored
 * preference (anything but 'en') still resolves to English instead of
 * breaking. Falls back to the supplied fallback, then to the key itself.
 */
export function translate(key: string, _lang: string = 'en', fallback?: string): string {
  if (!key) return fallback ?? '';

  let current: any = enDictionary;
  for (const segment of key.split('.')) {
    if (current && typeof current === 'object' && segment in current) {
      current = current[segment];
    } else {
      current = undefined;
      break;
    }
  }

  if (typeof current === 'string') return current;

  return fallback ?? key;
}

export function getDictionary(_lang: string = 'en'): MobileDictionary {
  return enDictionary;
}
