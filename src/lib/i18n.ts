import enDictionary from "../locales/en.json";

export type Dictionary = typeof enDictionary;

/**
 * Resolves a nested key (e.g. "nav.my_day" or "actions.save") in the English
 * dictionary. The language argument is kept so a stale stored preference
 * (anything but "en") still resolves to English instead of breaking.
 * Falls back to the fallback parameter, then to the key.
 */
export function t(
  key: string,
  _lang: string = "en",
  fallback?: string,
): string {
  if (!key) return fallback ?? "";

  let current: any = enDictionary;
  for (const seg of key.split(".")) {
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

  return fallback ?? key;
}

export function getDictionary(_lang: string = "en"): Dictionary {
  return enDictionary;
}
