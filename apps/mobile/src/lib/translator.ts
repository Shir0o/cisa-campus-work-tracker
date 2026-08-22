// Pure mobile client translation utility with multi-tier caching (L1 memory + L2 AsyncStorage)
// and batch request debouncing against POST /api/translate.
import AsyncStorage from '@react-native-async-storage/async-storage';

export type AppLanguage = 'en' | 'es';

// ── Pure SHA-256 implementation (synchronous, matches server hash) ──
function sha256Sync(ascii: string): string {
  function rightRotate(value: number, amount: number) {
    return (value >>> amount) | (value << (32 - amount));
  }

  let i = 0;
  let j = 0;
  let result = '';

  const words: number[] = [];
  const asciiBitLength = ascii.length * 8;

  let hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  // Encode string to UTF-8 bytes
  const utf8: number[] = [];
  for (let idx = 0; idx < ascii.length; idx++) {
    let charCode = ascii.charCodeAt(idx);
    if (charCode < 0x80) {
      utf8.push(charCode);
    } else if (charCode < 0x800) {
      utf8.push(0xc0 | (charCode >> 6), 0x80 | (charCode & 0x3f));
    } else if (charCode < 0xd800 || charCode >= 0xe000) {
      utf8.push(0xe0 | (charCode >> 12), 0x80 | ((charCode >> 6) & 0x3f), 0x80 | (charCode & 0x3f));
    } else {
      idx++;
      charCode = 0x10000 + (((charCode & 0x3ff) << 10) | (ascii.charCodeAt(idx) & 0x3ff));
      utf8.push(
        0xf0 | (charCode >> 18),
        0x80 | ((charCode >> 12) & 0x3f),
        0x80 | ((charCode >> 6) & 0x3f),
        0x80 | (charCode & 0x3f),
      );
    }
  }

  const utf8BitLength = utf8.length * 8;

  for (i = 0; i < utf8.length; i++) {
    words[i >> 2] |= utf8[i] << (24 - (i % 4) * 8);
  }
  words[utf8.length >> 2] |= 0x80 << (24 - (utf8.length % 4) * 8);
  words[(((utf8.length + 8) >> 6) << 4) + 15] = utf8BitLength;

  const w = new Array(64);
  for (i = 0; i < words.length; i += 16) {
    let [a, b, c, d, e, f, g, h] = hash;

    for (j = 0; j < 64; j++) {
      if (j < 16) {
        w[j] = words[i + j] | 0;
      } else {
        const gamma0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
        const gamma1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
        w[j] = (w[j - 16] + gamma0 + w[j - 7] + gamma1) | 0;
      }

      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + k[j] + w[j]) | 0;
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    hash[0] = (hash[0] + a) | 0;
    hash[1] = (hash[1] + b) | 0;
    hash[2] = (hash[2] + c) | 0;
    hash[3] = (hash[3] + d) | 0;
    hash[4] = (hash[4] + e) | 0;
    hash[5] = (hash[5] + f) | 0;
    hash[6] = (hash[6] + g) | 0;
    hash[7] = (hash[7] + h) | 0;
  }

  for (i = 0; i < 8; i++) {
    result += (hash[i] >>> 0).toString(16).padStart(8, '0');
  }

  return result;
}

export function computeTranslationHash(targetLang: string, text: string): string {
  const normalizedLang = (targetLang || 'es').trim().toLowerCase();
  const trimmedText = text.trim();
  return sha256Sync(`${normalizedLang}:${trimmedText}`);
}

// ── Multi-Tier Caching ────────────────────────────────────────────────────────

const L1_CACHE = new Map<string, string>(); // hash -> translatedText
const SUBSCRIBERS = new Map<string, Set<(translated: string) => void>>();
const IN_FLIGHT_PROMISES = new Map<string, Promise<string>>(); // hash -> in-flight translation promise
const STORAGE_PREFIX = 'cisa_tr_';

export function getCachedTranslation(text: string, targetLang: string = 'es'): string | null {
  if (!text || !text.trim()) return text;
  if (targetLang === 'en') return text;

  const hash = computeTranslationHash(targetLang, text);

  // Check in-memory L1 cache
  if (L1_CACHE.has(hash)) {
    return L1_CACHE.get(hash)!;
  }

  return null;
}

export async function getAsyncCachedTranslation(text: string, targetLang: string = 'es'): Promise<string | null> {
  if (!text || !text.trim()) return text;
  if (targetLang === 'en') return text;

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
  return 'https://cisa-campus-work-traker.pages.dev';
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
        console.warn('[Translator] Failed to get Firebase ID token:', tokenErr);
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
      console.warn('[Translator Mobile] Batch translation failed, falling back to original:', err);
      for (const req of requests) {
        req.resolve(req.text);
      }
    }
  }
}

export function translateText(text: string, targetLang: string = 'es'): Promise<string> {
  if (!text || !text.trim()) return Promise.resolve(text);
  if (targetLang === 'en') return Promise.resolve(text);

  const cached = getCachedTranslation(text, targetLang);
  if (cached !== null) {
    return Promise.resolve(cached);
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
  if (targetLang === 'en') return texts;

  return Promise.all(texts.map((t) => translateText(t, targetLang)));
}

export async function prefetchTranslations(
  texts: (string | null | undefined)[],
  targetLang: string = 'es',
): Promise<void> {
  if (!texts || texts.length === 0) return;
  if (targetLang === 'en') return;

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
