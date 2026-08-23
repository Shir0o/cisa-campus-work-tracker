import enDictionary from '../locales/en.json';
import esDictionary from '../locales/es.json';

export type MobileDictionary = typeof enDictionary;

const DICTIONARIES: Record<'en' | 'es', MobileDictionary> = {
  en: enDictionary,
  es: esDictionary,
};

/**
 * Resolves a nested key (e.g. "mobile.nav.today" or "actions.cancel") in the
 * mobile dictionary. Falls back to English, then to the supplied fallback, then
 * to the key itself.
 */
export function translate(key: string, lang: 'en' | 'es' = 'en', fallback?: string): string {
  if (!key) return fallback ?? '';

  const segments = key.split('.');
  const dict = DICTIONARIES[lang] || DICTIONARIES.en;

  let current: any = dict;
  for (const segment of segments) {
    if (current && typeof current === 'object' && segment in current) {
      current = current[segment];
    } else {
      current = undefined;
      break;
    }
  }

  if (typeof current === 'string') return current;

  if (lang !== 'en') {
    let enCurrent: any = DICTIONARIES.en;
    for (const segment of segments) {
      if (enCurrent && typeof enCurrent === 'object' && segment in enCurrent) {
        enCurrent = enCurrent[segment];
      } else {
        enCurrent = undefined;
        break;
      }
    }
    if (typeof enCurrent === 'string') return enCurrent;
  }

  return fallback ?? key;
}

export function getDictionary(lang: 'en' | 'es' = 'en'): MobileDictionary {
  return DICTIONARIES[lang] || DICTIONARIES.en;
}
