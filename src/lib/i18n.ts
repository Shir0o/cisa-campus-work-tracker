import type { AppLanguage } from "./userPreferences";
import enDictionary from "../locales/en.json";
import esDictionary from "../locales/es.json";

export type Dictionary = typeof enDictionary;

const DICTIONARIES: Record<AppLanguage, any> = {
  en: enDictionary,
  es: esDictionary,
};

/**
 * Resolves a nested key (e.g. "nav.my_day" or "actions.save") in the specified language dictionary.
 * Falls back to English, then to fallback parameter, then to key.
 */
export function t(
  key: string,
  lang: AppLanguage = "en",
  fallback?: string,
): string {
  if (!key) return fallback ?? "";

  const segments = key.split(".");
  const dict = DICTIONARIES[lang] || DICTIONARIES.en;

  let current: any = dict;
  for (const seg of segments) {
    if (current && typeof current === "object" && seg in current) {
      current = current[seg];
    } else {
      current = undefined;
      break;
    }
  }

  if (typeof current === "string") {
    return current;
  }

  // Fallback to English if current lang was not English
  if (lang !== "en") {
    let enCurrent: any = DICTIONARIES.en;
    for (const seg of segments) {
      if (enCurrent && typeof enCurrent === "object" && seg in enCurrent) {
        enCurrent = enCurrent[seg];
      } else {
        enCurrent = undefined;
        break;
      }
    }
    if (typeof enCurrent === "string") {
      return enCurrent;
    }
  }

  return fallback ?? key;
}

export function getDictionary(lang: AppLanguage = "en"): Dictionary {
  return DICTIONARIES[lang] || DICTIONARIES.en;
}
