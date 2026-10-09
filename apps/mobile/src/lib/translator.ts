// Pure mobile client translation utility with multi-tier caching (L1 memory + L2 AsyncStorage)
// and batch request debouncing against POST /api/translate.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { splitMarkdownByH1, joinMarkdownSections } from '@cisa/core';
import {
  detectLanguage,
  isAlreadySpanish,
  shouldShowAsIs,
  computeTranslationHash,
} from '@cisa/core';

// Reading translation runs in both directions (ADR 0037): content confidently
// in the reader's language is shown as-is with no Gemini call, anything else is
// translated whole. The judgment and hash come from the shared @cisa/core copy.
export { isAlreadySpanish, shouldShowAsIs, detectLanguage, computeTranslationHash };

export type AppLanguage = 'en' | 'es';

// ── Multi-Tier Caching ────────────────────────────────────────────────────────

const L1_CACHE = new Map<string, string>(); // hash -> translatedText
const SUBSCRIBERS = new Map<string, Set<(translated: string) => void>>();
const IN_FLIGHT_PROMISES = new Map<string, Promise<string>>(); // hash -> in-flight translation promise
const STORAGE_PREFIX = 'cisa_tr_';

export function getCachedTranslation(text: string, targetLang: string = 'es'): string | null {
  if (!text || !text.trim()) return text;

  const hash = computeTranslationHash(targetLang, text);

  // Check in-memory L1 cache
  if (L1_CACHE.has(hash)) {
    return L1_CACHE.get(hash)!;
  }

  return null;
}

export async function getAsyncCachedTranslation(text: string, targetLang: string = 'es'): Promise<string | null> {
  if (!text || !text.trim()) return text;

  const hash = computeTranslationHash(targetLang, text);
  if (L1_CACHE.has(hash)) {
    return L1_CACHE.get(hash)!;
  }

  try {
    const stored = await AsyncStorage.getItem(`${STORAGE_PREFIX}${hash}`);
    if (stored) {
      L1_CACHE.set(hash, stored);
      return stored;
    }
  } catch {
    // Ignore AsyncStorage read errors
  }

  return null;
}

export function setCachedTranslation(text: string, translated: string, targetLang: string = 'es'): void {
  if (!text || !text.trim()) return;

  const hash = computeTranslationHash(targetLang, text);
  L1_CACHE.set(hash, translated);

  AsyncStorage.setItem(`${STORAGE_PREFIX}${hash}`, translated).catch(() => {});

  // Notify active subscribers
  const subs = SUBSCRIBERS.get(hash);
  if (subs) {
    subs.forEach((cb) => cb(translated));
  }
}

export async function clearTranslationCache(): Promise<void> {
  if (batchTimer) {
    clearTimeout(batchTimer);
    batchTimer = null;
  }
  for (const req of batchQueue) {
    req.resolve(req.text);
  }
  batchQueue = [];
  L1_CACHE.clear();
  SUBSCRIBERS.clear();
  IN_FLIGHT_PROMISES.clear();
  try {
    const allKeys = await AsyncStorage.getAllKeys();
    const translationKeys = allKeys.filter((k) => k.startsWith(STORAGE_PREFIX));
    if (translationKeys.length > 0) {
      await AsyncStorage.multiRemove(translationKeys);
    }
  } catch {
    // Ignore clear errors
  }
}

export function subscribeTranslation(
  hash: string,
  callback: (translated: string) => void,
): () => void {
  if (!SUBSCRIBERS.has(hash)) {
    SUBSCRIBERS.set(hash, new Set());
  }
  SUBSCRIBERS.get(hash)!.add(callback);

  return () => {
    const subs = SUBSCRIBERS.get(hash);
    if (subs) {
      subs.delete(callback);
      if (subs.size === 0) {
        SUBSCRIBERS.delete(hash);
      }
    }
  };
}

// ── Batch Translation Dispatcher ──────────────────────────────────────────────

interface PendingRequest {
  text: string;
  targetLang: string;
  resolve: (value: string) => void;
  reject: (reason?: any) => void;
}

let batchQueue: PendingRequest[] = [];
let batchTimer: any = null;

const getApiUrl = () => {
  if (typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_API_URL) {
    return process.env.EXPO_PUBLIC_API_URL.replace(/\/+$/, '');
  }
  return 'https://cisa-campus-work-tracker.pages.dev';
};

async function flushBatch() {
  const currentBatch = batchQueue;
  batchQueue = [];
  batchTimer = null;

  if (currentBatch.length === 0) return;

  const byLang = new Map<string, PendingRequest[]>();
  for (const item of currentBatch) {
    const list = byLang.get(item.targetLang) ?? [];
    list.push(item);
    byLang.set(item.targetLang, list);
  }

  const baseUrl = getApiUrl();

  for (const [targetLang, requests] of byLang.entries()) {
    try {
      let token: string | null = null;
      try {
        const { auth } = await import('./firebase');
        if (auth?.currentUser) {
          token = await auth.currentUser.getIdToken();
        }
      } catch (tokenErr) {
        if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
          console.warn('[Translator] Failed to get Firebase ID token:', tokenErr);
        }
      }

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const textsToTranslate = requests.map((r) => r.text);
      const res = await fetch(`${baseUrl}/api/translate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          targetLang,
          texts: textsToTranslate,
        }),
      });

      if (!res.ok) {
        throw new Error(`Translation API error: ${res.status}`);
      }

      const data = await res.json();
      if (!data.success || !Array.isArray(data.translations)) {
        throw new Error('Invalid response format from translation API');
      }

      for (let i = 0; i < requests.length; i++) {
        const req = requests[i];
        const translationItem = data.translations[i];
        const translated = translationItem?.translated ?? req.text;
        setCachedTranslation(req.text, translated, targetLang);
        req.resolve(translated);
      }
    } catch (err) {
      if (typeof process === 'undefined' || process.env.NODE_ENV !== 'test') {
        console.warn('[Translator Mobile] Batch translation failed, falling back to original:', err);
      }
      for (const req of requests) {
        req.resolve(req.text);
      }
    }
  }
}

export function translateText(text: string, targetLang: string = 'es'): Promise<string> {
  if (!text || !text.trim()) return Promise.resolve(text);

  const cached = getCachedTranslation(text, targetLang);
  if (cached !== null) {
    return Promise.resolve(cached);
  }

  if (shouldShowAsIs(text, targetLang)) {
    setCachedTranslation(text, text, targetLang);
    return Promise.resolve(text);
  }

  const hash = computeTranslationHash(targetLang, text);
  const inFlight = IN_FLIGHT_PROMISES.get(hash);
  if (inFlight) {
    return inFlight;
  }

  const promise = new Promise<string>((resolve, reject) => {
    batchQueue.push({ text, targetLang, resolve, reject });

    if (!batchTimer) {
      batchTimer = setTimeout(flushBatch, 50);
    }
  }).finally(() => {
    IN_FLIGHT_PROMISES.delete(hash);
  });

  IN_FLIGHT_PROMISES.set(hash, promise);
  return promise;
}

export async function translateBatch(texts: string[], targetLang: string = 'es'): Promise<string[]> {
  if (!texts || texts.length === 0) return [];

  return Promise.all(texts.map((t) => translateText(t, targetLang)));
}

// Translate a markdown doc by h1 sections. Unchanged sections already sit in
// the translation cache (L1/L2 here, L3 on the server), so only the sections
// that changed since the last translation are actually sent to the model.
export async function translateMarkdown(markdown: string, targetLang: string = 'es'): Promise<string> {
  if (!markdown || !markdown.trim()) return markdown;

  const sections = splitMarkdownByH1(markdown);
  const translated = await translateBatch(sections, targetLang);
  return joinMarkdownSections(translated);
}

export async function prefetchTranslations(
  texts: (string | null | undefined)[],
  targetLang: string = 'es',
): Promise<void> {
  if (!texts || texts.length === 0) return;

  const validTexts = Array.from(
    new Set(
      texts
        .filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
        .map((t) => t.trim()),
    ),
  );

  const uncached: string[] = [];
  for (const text of validTexts) {
    if (getCachedTranslation(text, targetLang) !== null) continue;
    const asyncCached = await getAsyncCachedTranslation(text, targetLang);
    if (asyncCached === null) uncached.push(text);
  }
  if (uncached.length === 0) return;

  await translateBatch(uncached, targetLang);
}
