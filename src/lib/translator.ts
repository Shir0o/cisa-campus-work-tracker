// Pure client translation utility with multi-tier caching (L1 memory + L2 localStorage)
// and batch request debouncing against POST /api/translate.

import { splitMarkdownByH1, joinMarkdownSections } from "./markdown";

// ── Language judgment (ADR 0037) & canonical hashing ─────────────────────────
// Re-exported from @cisa/core (packages/core/src/translation.ts).
import {
  type LanguageSignal,
  detectLanguage,
  isAlreadySpanish,
  shouldShowAsIs,
  computeTranslationHash,
} from "../../packages/core/src/translation";

export {
  type LanguageSignal,
  detectLanguage,
  isAlreadySpanish,
  shouldShowAsIs,
  computeTranslationHash,
};

// ── Multi-Tier Caching ────────────────────────────────────────────────────────

const L1_CACHE = new Map<string, string>(); // hash -> translatedText
const SUBSCRIBERS = new Map<string, Set<(translated: string) => void>>();
const IN_FLIGHT_PROMISES = new Map<string, Promise<string>>(); // hash -> in-flight translation promise
const STORAGE_PREFIX = "cisa_tr_";

export function getCachedTranslation(text: string, targetLang: string = "es"): string | null {
  if (!text || !text.trim()) return text;

  const hash = computeTranslationHash(targetLang, text);

  // 1. Check L1 in-memory cache
  if (L1_CACHE.has(hash)) {
    return L1_CACHE.get(hash)!;
  }

  // 2. Check L2 localStorage cache
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const stored = localStorage.getItem(`${STORAGE_PREFIX}${hash}`);
      if (stored) {
        L1_CACHE.set(hash, stored);
        return stored;
      }
    } catch {
      // Ignore localStorage read errors
    }
  }

  return null;
}

export function setCachedTranslation(text: string, translated: string, targetLang: string = "es"): void {
  if (!text || !text.trim()) return;

  const hash = computeTranslationHash(targetLang, text);
  L1_CACHE.set(hash, translated);

  if (typeof window !== "undefined" && window.localStorage) {
    try {
      localStorage.setItem(`${STORAGE_PREFIX}${hash}`, translated);
    } catch {
      // Storage quota exceeded or disabled
    }
  }

  // Notify active subscribers
  const subs = SUBSCRIBERS.get(hash);
  if (subs) {
    subs.forEach((cb) => cb(translated));
  }
}

export function clearTranslationCache(): void {
  L1_CACHE.clear();
  SUBSCRIBERS.clear();
  IN_FLIGHT_PROMISES.clear();
  if (typeof window !== "undefined" && window.localStorage) {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(STORAGE_PREFIX)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    } catch {
      // Ignore errors
    }
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

import { auth } from "./firebase";

let batchQueue: PendingRequest[] = [];
let batchTimer: any = null;

async function flushBatch() {
  const currentBatch = batchQueue;
  batchQueue = [];
  batchTimer = null;

  if (currentBatch.length === 0) return;

  // Group by targetLang
  const byLang = new Map<string, PendingRequest[]>();
  for (const item of currentBatch) {
    const list = byLang.get(item.targetLang) ?? [];
    list.push(item);
    byLang.set(item.targetLang, list);
  }

  for (const [targetLang, requests] of byLang.entries()) {
    try {
      let token: string | null = null;
      try {
        if (auth.currentUser) {
          token = await auth.currentUser.getIdToken();
        }
      } catch (tokenErr) {
        console.warn("[Translator] Failed to get Firebase ID token:", tokenErr);
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const textsToTranslate = requests.map((r) => r.text);
      const res = await fetch("/api/translate", {
        method: "POST",
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
        throw new Error("Invalid response format from translation API");
      }

      for (let i = 0; i < requests.length; i++) {
        const req = requests[i];
        const translationItem = data.translations[i];
        const translated = translationItem?.translated ?? req.text;
        setCachedTranslation(req.text, translated, targetLang);
        req.resolve(translated);
      }
    } catch (err) {
      console.warn("[Translator] Batch translation failed, falling back to original text:", err);
      // Fall back gracefully to original text
      for (const req of requests) {
        req.resolve(req.text);
      }
    }
  }
}

export function translateText(text: string, targetLang: string = "es"): Promise<string> {
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

export async function translateBatch(texts: string[], targetLang: string = "es"): Promise<string[]> {
  if (!texts || texts.length === 0) return [];

  return Promise.all(texts.map((t) => translateText(t, targetLang)));
}

// Translate a markdown doc by h1 sections. Unchanged sections already sit in
// the translation cache (L1/L2 here, L3 on the server), so only the sections
// that changed since the last translation are actually sent to the model.
export async function translateMarkdown(markdown: string, targetLang: string = "es"): Promise<string> {
  if (!markdown || !markdown.trim()) return markdown;

  const sections = splitMarkdownByH1(markdown);
  const translated = await translateBatch(sections, targetLang);
  return joinMarkdownSections(translated);
}

export async function prefetchTranslations(
  texts: (string | null | undefined)[],
  targetLang: string = "es",
): Promise<void> {
  if (!texts || texts.length === 0) return;

  const validTexts = Array.from(
    new Set(
      texts
        .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
        .map((t) => t.trim()),
    ),
  );

  const uncached = validTexts.filter((t) => getCachedTranslation(t, targetLang) === null);
  if (uncached.length === 0) return;

  await translateBatch(uncached, targetLang);
}
