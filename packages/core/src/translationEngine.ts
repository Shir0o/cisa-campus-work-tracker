import {
  detectLanguage,
  computeTranslationHash,
  type LanguageSignal,
} from "./translation";

export type SupportedCollection =
  | "prayers"
  | "interactions"
  | "contacts"
  | "todos"
  | "coordinationNotes";

export const COLLECTION_ORDER: SupportedCollection[] = [
  "prayers",
  "interactions",
  "contacts",
  "todos",
  "coordinationNotes",
];

export type TargetLang = "en" | "es";

export interface TranslatableItem {
  text: string;
  targetLang: TargetLang;
}

export interface TranslationRecord {
  hash: string;
  sourceText: string;
  translatedText: string;
  targetLang: string;
  sourceLang?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TranslationCursor {
  currentCollection: SupportedCollection;
  lastDocId: string | null;
  updatedAt: string;
}

export interface FetchBatchResult {
  docs: Array<{ id: string; data: Record<string, any> }>;
  hasMore: boolean;
}

export interface CronRunOptions {
  maxItemsPerRun?: number;
  batchFetchLimit?: number;
}

export interface CronRunResult {
  cursor: TranslationCursor;
  translatedCount: number;
  cachedCount: number;
  scannedDocsCount: number;
  failedCount: number;
}

export interface TranslateTextInput {
  texts: string[];
  targetLang?: string;
  sourceLang?: string;
  dailyLimit?: number;
}

export interface TranslateTextItemResult {
  original: string;
  translated: string;
  hash: string;
  cached: boolean;
}

export interface TranslateTextResult {
  success: boolean;
  targetLang: string;
  translations: TranslateTextItemResult[];
}

// ── Ports ─────────────────────────────────────────────────────────────────────

export interface TranslationAIPort {
  translateChunk(
    chunk: Array<{ id: number; text: string }>,
    targetLang: string,
  ): Promise<Map<number, string>>;
  translateTexts?(items: TranslatableItem[]): Promise<Array<string | null>>;
}

export interface TranslationCachePort {
  getCachedTranslations(hashes: string[]): Promise<Map<string, string>>;
  saveTranslations(items: TranslationRecord[]): Promise<void>;
  reserveDailyQuota(count: number, dailyLimit?: number): Promise<number>;
  getCursor?(): Promise<TranslationCursor>;
  saveCursor?(cursor: TranslationCursor): Promise<void>;
  fetchBatch?(
    collection: SupportedCollection,
    lastDocId: string | null,
    limit: number,
  ): Promise<FetchBatchResult>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export const DEFAULT_DAILY_LIMIT = 2000;
export const GEMINI_CHUNK_SIZE = 15;
export const FIRESTORE_GET_ALL_CHUNK_SIZE = 50;
export const FIRESTORE_BATCH_WRITE_CHUNK_SIZE = 100;

export const KNOWN_LANGUAGES: Record<string, string> = {
  es: "Spanish",
  en: "English",
  zh: "Chinese",
  ko: "Korean",
  ja: "Japanese",
  fr: "French",
  de: "German",
  pt: "Portuguese",
  ru: "Russian",
  vi: "Vietnamese",
  tl: "Tagalog",
};

export const DEFAULT_CURSOR: TranslationCursor = {
  currentCollection: COLLECTION_ORDER[0],
  lastDocId: null,
  updatedAt: new Date(0).toISOString(),
};

/**
 * Extract translatable strings from document data according to ADR 0032 and ADR 0037.
 */
export function extractTranslatableItems(
  collection: SupportedCollection,
  data: Record<string, any>,
): TranslatableItem[] {
  const candidates: string[] = [];

  switch (collection) {
    case "prayers":
      if (typeof data.burden === "string") candidates.push(data.burden);
      if (typeof data.answer === "string") candidates.push(data.answer);
      if (typeof data.archiveReason === "string") candidates.push(data.archiveReason);
      break;
    case "contacts":
      if (typeof data.notes === "string") candidates.push(data.notes);
      if (typeof data.spiritualBackground === "string") candidates.push(data.spiritualBackground);
      if (typeof data.prayerRequest === "string") candidates.push(data.prayerRequest);
      break;
    case "interactions":
      if (typeof data.content === "string") candidates.push(data.content);
      break;
    case "todos":
      if (typeof data.title === "string") candidates.push(data.title);
      break;
    case "coordinationNotes":
      if (typeof data.title === "string") candidates.push(data.title);
      if (typeof data.content === "string") candidates.push(data.content);
      break;
  }

  const items: TranslatableItem[] = [];
  for (const candidate of candidates) {
    const text = candidate.trim();
    if (!text) continue;
    const signal: LanguageSignal = detectLanguage(text);
    if (signal !== "es") items.push({ text, targetLang: "es" });
    if (signal === "es" || signal === "mixed") items.push({ text, targetLang: "en" });
  }
  return items;
}

function getNextCollection(current: SupportedCollection): SupportedCollection {
  const idx = COLLECTION_ORDER.indexOf(current);
  if (idx === -1 || idx === COLLECTION_ORDER.length - 1) {
    return COLLECTION_ORDER[0];
  }
  return COLLECTION_ORDER[idx + 1];
}

// ── In-Memory Adapters for Testing ────────────────────────────────────────────

export class InMemoryTranslationAIPort implements TranslationAIPort {
  public calls: Array<{ chunk: Array<{ id: number; text: string }>; targetLang: string }> = [];
  public mockTranslations = new Map<string, string>(); // `${targetLang}:${text}` -> translated
  public failureError?: Error;

  setMockTranslation(targetLang: string, text: string, translated: string) {
    this.mockTranslations.set(`${targetLang.trim().toLowerCase()}:${text.trim()}`, translated);
  }

  async translateChunk(
    chunk: Array<{ id: number; text: string }>,
    targetLang: string,
  ): Promise<Map<number, string>> {
    this.calls.push({ chunk, targetLang });

    if (this.failureError) {
      throw this.failureError;
    }

    const normLang = targetLang.trim().toLowerCase();
    const result = new Map<number, string>();
    for (const item of chunk) {
      const key = `${normLang}:${item.text.trim()}`;
      if (this.mockTranslations.has(key)) {
        result.set(item.id, this.mockTranslations.get(key)!);
      } else if (this.mockTranslations.has(item.text.trim())) {
        result.set(item.id, this.mockTranslations.get(item.text.trim())!);
      } else {
        result.set(item.id, `[${normLang}] ${item.text}`);
      }
    }
    return result;
  }
}

export class InMemoryTranslationCachePort implements TranslationCachePort {
  public translations = new Map<string, TranslationRecord>();
  public dailyUsage = new Map<string, number>(); // "YYYY-MM-DD" -> count
  public dailyLimit: number;
  public cursor: TranslationCursor = { ...DEFAULT_CURSOR };
  public collections = new Map<SupportedCollection, Array<{ id: string; data: Record<string, any> }>>();

  constructor(dailyLimit = DEFAULT_DAILY_LIMIT) {
    this.dailyLimit = dailyLimit;
  }

  setCollectionDocs(col: SupportedCollection, docs: Array<{ id: string; data: Record<string, any> }>) {
    this.collections.set(col, docs);
  }

  async getCachedTranslations(hashes: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    for (const hash of hashes) {
      const rec = this.translations.get(hash);
      if (rec) {
        result.set(hash, rec.translatedText);
      }
    }
    return result;
  }

  async saveTranslations(items: TranslationRecord[]): Promise<void> {
    for (const item of items) {
      this.translations.set(item.hash, { ...item });
    }
  }

  async reserveDailyQuota(count: number, limit?: number): Promise<number> {
    const today = new Date().toISOString().slice(0, 10);
    const effectiveLimit = limit !== undefined ? Math.min(limit, this.dailyLimit) : this.dailyLimit;
    const used = this.dailyUsage.get(today) ?? 0;
    const allowed = Math.max(0, Math.min(count, effectiveLimit - used));
    this.dailyUsage.set(today, used + allowed);
    return allowed;
  }

  async getCursor(): Promise<TranslationCursor> {
    return { ...this.cursor };
  }

  async saveCursor(cursor: TranslationCursor): Promise<void> {
    this.cursor = { ...cursor };
  }

  async fetchBatch(
    collection: SupportedCollection,
    lastDocId: string | null,
    limit: number,
  ): Promise<FetchBatchResult> {
    const list = this.collections.get(collection) ?? [];
    let startIndex = 0;
    if (lastDocId) {
      const foundIdx = list.findIndex((d) => d.id === lastDocId);
      if (foundIdx !== -1) {
        startIndex = foundIdx + 1;
      }
    }
    const sliced = list.slice(startIndex, startIndex + limit);
    return {
      docs: sliced,
      hasMore: startIndex + limit < list.length,
    };
  }
}

// ── Production Adapters ───────────────────────────────────────────────────────

export interface GeminiAIPortOptions {
  apiKey?: string;
  fetchImpl?: typeof fetch;
  aiClient?: any;
  model?: string;
  maxAttempts?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);
const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class GeminiAIPort implements TranslationAIPort {
  private apiKey?: string;
  private fetchImpl: typeof fetch;
  private aiClient?: any;
  private model: string;
  private maxAttempts: number;
  private baseDelayMs: number;
  private sleep: (ms: number) => Promise<void>;

  constructor(options: GeminiAIPortOptions = {}) {
    this.apiKey = options.apiKey || (typeof process !== "undefined" ? process.env?.GEMINI_API_KEY : undefined);
    this.fetchImpl = options.fetchImpl || (typeof globalThis !== "undefined" ? globalThis.fetch : (fetch as any));
    this.aiClient = options.aiClient;
    this.model = options.model || "gemini-2.5-flash";
    this.maxAttempts = options.maxAttempts ?? 3;
    this.baseDelayMs = options.baseDelayMs ?? 500;
    this.sleep = options.sleep ?? defaultSleep;
  }

  async translateChunk(
    chunk: Array<{ id: number; text: string }>,
    targetLang: string,
  ): Promise<Map<number, string>> {
    if (chunk.length === 0) return new Map();

    const normLang = targetLang.trim().toLowerCase();
    const langName = KNOWN_LANGUAGES[normLang] || (normLang === "en" ? "English" : "Spanish");

    const prompt =
      `Translate the following ${chunk.length} text items into ${langName}:\n\n` +
      JSON.stringify(chunk.map((item) => ({ id: item.id, text: item.text })));

    const systemInstruction =
      `You are an expert translator for a campus ministry community web and mobile app. Translate each text item accurately, idiomatically, and naturally into the target language (${langName}).\n` +
      `CRITICAL RULES:\n` +
      `1. Preserve all Markdown formatting intact (*, **, #, -, 1., [text](url), etc.).\n` +
      `2. Preserve user mentions (@name or @User), emails, URLs, and phone numbers untouched.\n` +
      `3. Preserve emojis and special characters.\n` +
      `4. If a text item is already entirely in ${langName}, return it unchanged.\n` +
      `5. Return a JSON object with a 'translations' array matching the input 'id' and the 'translatedText'.`;

    // 1. If aiClient (@google/genai SDK) is available, use it (matches server.ts / server.test.ts)
    if (this.aiClient) {
      const AI_TIMEOUT_MS = 15000;
      const generatePromise = this.aiClient.models.generateContent({
        model: this.model === "gemini-2.5-flash" ? "gemini-3.5-flash" : this.model,
        contents: prompt,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              translations: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    id: { type: "INTEGER" },
                    translatedText: { type: "STRING" },
                  },
                  required: ["id", "translatedText"],
                },
              },
            },
            required: ["translations"],
          },
        },
      });

      const timeoutPromise = new Promise<never>((_, reject) => {
        const timer = setTimeout(() => reject(new Error("Translation AI timeout after 15s")), AI_TIMEOUT_MS);
        generatePromise.finally(() => clearTimeout(timer)).catch(() => {});
      });

      const response = await Promise.race([generatePromise, timeoutPromise]);
      const resultMap = new Map<number, string>();
      if (response?.text) {
        try {
          const parsed = JSON.parse(response.text.trim());
          if (parsed.translations && Array.isArray(parsed.translations)) {
            for (const item of parsed.translations) {
              if (typeof item.id === "number" && typeof item.translatedText === "string") {
                resultMap.set(item.id, item.translatedText);
              }
            }
          }
        } catch (e) {
          console.warn("[GeminiAIPort] Failed to parse translation JSON:", e);
        }
      }
      return resultMap;
    }

    // 2. Otherwise use REST fetch with retries (matches Cloud Functions)
    if (!this.apiKey) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: { parts: [{ text: systemInstruction }] },
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            translations: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  id: { type: "INTEGER" },
                  translatedText: { type: "STRING" },
                },
                required: ["id", "translatedText"],
              },
            },
          },
          required: ["translations"],
        },
      },
    });

    for (let attempt = 1; attempt <= this.maxAttempts; attempt++) {
      const backoff = () => this.sleep(this.baseDelayMs * 2 ** (attempt - 1));

      let res: Response;
      try {
        res = await this.fetchImpl(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
      } catch (err) {
        if (attempt < this.maxAttempts) {
          await backoff();
          continue;
        }
        console.warn(`[GeminiAIPort] chunk skipped after ${this.maxAttempts} attempts (network error):`, err);
        return new Map();
      }

      if (!res.ok) {
        const errorText = await res.text();
        if (RETRYABLE_STATUSES.has(res.status)) {
          if (attempt < this.maxAttempts) {
            await backoff();
            continue;
          }
          console.warn(`[GeminiAIPort] chunk skipped after ${this.maxAttempts} attempts: HTTP ${res.status}: ${errorText}`);
          return new Map();
        }
        throw new Error(`Gemini translation failed: HTTP ${res.status}: ${errorText}`);
      }

      const json = (await res.json()) as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      };
      const responseText = json.candidates?.[0]?.content?.parts?.[0]?.text;
      const chunkResults = new Map<number, string>();
      if (responseText) {
        try {
          const parsed = JSON.parse(responseText.trim());
          if (parsed.translations && Array.isArray(parsed.translations)) {
            for (const item of parsed.translations) {
              if (typeof item.id === "number" && typeof item.translatedText === "string") {
                chunkResults.set(item.id, item.translatedText);
              }
            }
          }
        } catch (e) {
          console.warn("[GeminiAIPort] Failed to parse translation JSON:", e);
        }
      }
      return chunkResults;
    }

    return new Map();
  }
}

export class FirestoreTranslationCachePort implements TranslationCachePort {
  private db: any;
  private serverTimestampFn: () => any;

  constructor(db: any, serverTimestampFn: () => any = () => new Date().toISOString()) {
    this.db = db;
    this.serverTimestampFn = serverTimestampFn;
  }

  async getCachedTranslations(hashes: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    if (hashes.length === 0) return result;

    const refs = hashes.map((h) => this.db.collection("translations").doc(h));
    for (let i = 0; i < refs.length; i += FIRESTORE_GET_ALL_CHUNK_SIZE) {
      const chunk = refs.slice(i, i + FIRESTORE_GET_ALL_CHUNK_SIZE);
      const docSnaps =
        typeof this.db.getAll === "function"
          ? await this.db.getAll(...chunk)
          : await Promise.all(chunk.map((r: any) => r.get()));

      for (const snap of docSnaps) {
        if (snap.exists) {
          const data = typeof snap.data === "function" ? snap.data() : snap.data;
          if (data && typeof data.translatedText === "string") {
            result.set(snap.id, data.translatedText);
          }
        }
      }
    }
    return result;
  }

  async saveTranslations(items: TranslationRecord[]): Promise<void> {
    if (items.length === 0) return;

    for (let i = 0; i < items.length; i += FIRESTORE_BATCH_WRITE_CHUNK_SIZE) {
      const chunk = items.slice(i, i + FIRESTORE_BATCH_WRITE_CHUNK_SIZE);
      const batch = this.db.batch();
      const now = this.serverTimestampFn();
      for (const item of chunk) {
        const docRef = this.db.collection("translations").doc(item.hash);
        batch.set(
          docRef,
          {
            hash: item.hash,
            sourceText: item.sourceText,
            translatedText: item.translatedText,
            targetLang: item.targetLang,
            sourceLang: item.sourceLang || "auto",
            createdAt: item.createdAt || now,
            updatedAt: now,
          },
          { merge: true },
        );
      }
      await batch.commit();
    }
  }

  async reserveDailyQuota(count: number, dailyLimit = DEFAULT_DAILY_LIMIT): Promise<number> {
    if (count <= 0) return 0;
    const today = new Date().toISOString().slice(0, 10);
    const usageRef = this.db.collection("system").doc("translationUsage");

    try {
      if (typeof this.db.runTransaction === "function") {
        return await this.db.runTransaction(async (tx: any) => {
          const snap = await tx.get(usageRef);
          const data = snap.exists ? (typeof snap.data === "function" ? snap.data() : snap.data) : null;
          const used = data && data.date === today && typeof data.count === "number" ? data.count : 0;
          const allowed = Math.max(0, Math.min(count, dailyLimit - used));
          tx.set(usageRef, { date: today, count: used + allowed }, { merge: true });
          return allowed;
        });
      }
    } catch (err) {
      console.warn("[FirestoreTranslationCachePort] Failed to reserve quota:", err);
    }
    return 0;
  }

  async getCursor(): Promise<TranslationCursor> {
    const cursorRef = this.db.collection("system").doc("translationCursor");
    try {
      const snap = await cursorRef.get();
      if (snap.exists) {
        const data = typeof snap.data === "function" ? snap.data() : snap.data;
        if (
          data &&
          typeof data.currentCollection === "string" &&
          COLLECTION_ORDER.includes(data.currentCollection as SupportedCollection)
        ) {
          return {
            currentCollection: data.currentCollection as SupportedCollection,
            lastDocId: typeof data.lastDocId === "string" ? data.lastDocId : null,
            updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : new Date().toISOString(),
          };
        }
      }
    } catch (err) {
      console.warn("[FirestoreTranslationCachePort] Failed to read cursor doc:", err);
    }
    return { ...DEFAULT_CURSOR };
  }

  async saveCursor(cursor: TranslationCursor): Promise<void> {
    const cursorRef = this.db.collection("system").doc("translationCursor");
    await cursorRef.set(cursor, { merge: true });
  }

  async fetchBatch(
    collection: SupportedCollection,
    lastDocId: string | null,
    limit: number,
  ): Promise<FetchBatchResult> {
    let q = this.db.collection(collection).orderBy("__name__");
    if (lastDocId) {
      q = q.startAfter(this.db.collection(collection).doc(lastDocId));
    }
    q = q.limit(limit);

    const snap = await q.get();
    const docs = snap.docs.map((d: any) => ({
      id: d.id,
      data: typeof d.data === "function" ? d.data() : d.data,
    }));
    return { docs, hasMore: snap.docs.length === limit };
  }
}

// ── Unified Translation Engine ────────────────────────────────────────────────

export interface TranslationEngineOptions {
  aiPort: TranslationAIPort;
  cachePort: TranslationCachePort;
  dailyLimit?: number;
}

export class TranslationEngine {
  private aiPort: TranslationAIPort;
  private cachePort: TranslationCachePort;
  private dailyLimit: number;

  constructor(options: TranslationEngineOptions) {
    this.aiPort = options.aiPort;
    this.cachePort = options.cachePort;
    this.dailyLimit = options.dailyLimit ?? DEFAULT_DAILY_LIMIT;
  }

  getDailyLimit(): number {
    if (typeof process !== "undefined" && process.env?.TRANSLATION_DAILY_LIMIT) {
      const parsed = parseInt(process.env.TRANSLATION_DAILY_LIMIT, 10);
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return this.dailyLimit;
  }

  /**
   * On-demand translation with caching and atomic daily quota enforcement.
   */
  async translateTexts(
    input: TranslateTextInput | string[],
    targetLangArg?: string,
    optionsOrSourceLang?: { sourceLang?: string; dailyLimit?: number } | string,
  ): Promise<TranslateTextResult> {
    const texts = Array.isArray(input) ? input : input.texts;
    const targetLang = Array.isArray(input) ? (targetLangArg || "es") : (input.targetLang || "es");
    let sourceLang = "en";
    let limit = this.getDailyLimit();

    if (!Array.isArray(input)) {
      sourceLang = input.sourceLang || "en";
      limit = input.dailyLimit ?? this.getDailyLimit();
    } else if (typeof optionsOrSourceLang === "string") {
      sourceLang = optionsOrSourceLang;
    } else if (optionsOrSourceLang && typeof optionsOrSourceLang === "object") {
      sourceLang = optionsOrSourceLang.sourceLang || "en";
      limit = optionsOrSourceLang.dailyLimit ?? this.getDailyLimit();
    }

    if (!texts || !Array.isArray(texts) || texts.length === 0) {
      throw new Error("Missing or invalid 'texts' parameter. Must be a non-empty array of strings.");
    }
    if (texts.length > 100) {
      throw new Error("Batch size exceeds maximum limit of 100 items.");
    }
    if (typeof targetLang !== "string" || !/^[a-z]{2,5}(-[a-zA-Z0-9]+)?$/i.test(targetLang.trim())) {
      throw new Error("Invalid 'targetLang' parameter.");
    }

    let totalChars = 0;
    for (const t of texts) {
      if (typeof t !== "string") {
        throw new Error("All elements in 'texts' must be strings.");
      }
      totalChars += t.length;
    }
    if (totalChars > 50000) {
      throw new Error("Total character length exceeds maximum limit of 50000 characters.");
    }

    const normLang = targetLang.trim().toLowerCase();

    // Map unique non-empty trimmed texts to hash
    const uniqueMap = new Map<string, string>(); // hash -> trimmedText
    for (const raw of texts) {
      const trimmed = raw.trim();
      if (trimmed) {
        const hash = computeTranslationHash(normLang, trimmed);
        uniqueMap.set(hash, trimmed);
      }
    }

    const hashList = Array.from(uniqueMap.keys());
    const cachedMap = await this.cachePort.getCachedTranslations(hashList);
    const existingCachedHashes = new Set(cachedMap.keys());

    const uncachedItems: Array<{ id: number; hash: string; text: string }> = [];
    let nextId = 0;
    for (const [hash, trimmedText] of uniqueMap.entries()) {
      if (!cachedMap.has(hash)) {
        uncachedItems.push({ id: nextId++, hash, text: trimmedText });
      }
    }

    // Reserve daily quota for uncached items
    let allowedCount = 0;
    if (uncachedItems.length > 0) {
      allowedCount = await this.cachePort.reserveDailyQuota(uncachedItems.length, limit);
    }
    const allowedItems = uncachedItems.slice(0, allowedCount);

    // Call AI in chunks of 15
    const toSave: TranslationRecord[] = [];
    if (allowedItems.length > 0) {
      for (let i = 0; i < allowedItems.length; i += GEMINI_CHUNK_SIZE) {
        const chunk = allowedItems.slice(i, i + GEMINI_CHUNK_SIZE);
        try {
          const chunkResults = await this.aiPort.translateChunk(
            chunk.map((item) => ({ id: item.id, text: item.text })),
            normLang,
          );
          for (const item of chunk) {
            const translated = chunkResults.get(item.id) ?? item.text;
            cachedMap.set(item.hash, translated);
            if (chunkResults.has(item.id)) {
              toSave.push({
                hash: item.hash,
                sourceText: item.text,
                translatedText: translated,
                targetLang: normLang,
                sourceLang: typeof sourceLang === "string" ? sourceLang.slice(0, 10) : "auto",
              });
            }
          }
        } catch (err) {
          console.warn("[TranslationEngine] AI chunk failed, falling back to original:", err);
          for (const item of chunk) {
            cachedMap.set(item.hash, item.text);
          }
        }
      }

      if (toSave.length > 0) {
        try {
          await this.cachePort.saveTranslations(toSave);
        } catch (dbErr) {
          console.warn("[TranslationEngine] Failed to save translations:", dbErr);
        }
      }
    }

    // Map back to output array preserving order
    const translations: TranslateTextItemResult[] = texts.map((original) => {
      const trimmed = original.trim();
      if (!trimmed) {
        return {
          original,
          translated: original,
          hash: "",
          cached: true,
        };
      }
      const hash = computeTranslationHash(normLang, trimmed);
      const translated = cachedMap.get(hash) ?? trimmed;
      const cached = existingCachedHashes.has(hash);
      return {
        original,
        translated,
        hash,
        cached,
      };
    });

    return {
      success: true,
      targetLang: normLang,
      translations,
    };
  }

  /**
   * Background sweep over user collections with cursor tracking and uniform daily quota enforcement.
   */
  async advanceSweep(options: CronRunOptions = {}): Promise<CronRunResult> {
    if (!this.cachePort.getCursor || !this.cachePort.saveCursor || !this.cachePort.fetchBatch) {
      throw new Error("Cache port does not implement background sweep operations (getCursor/saveCursor/fetchBatch).");
    }

    const maxItems = options.maxItemsPerRun ?? 200;
    const batchFetchLimit = options.batchFetchLimit ?? 50;
    const dailyLimit = this.getDailyLimit();

    const cursor = await this.cachePort.getCursor();
    const currentCollection = cursor.currentCollection;
    const lastDocId = cursor.lastDocId;

    const { docs, hasMore } = await this.cachePort.fetchBatch(
      currentCollection,
      lastDocId,
      batchFetchLimit,
    );

    const hashToItem = new Map<string, TranslatableItem>();
    const docHashes: string[][] = [];

    for (const doc of docs) {
      const hashes: string[] = [];
      for (const item of extractTranslatableItems(currentCollection, doc.data)) {
        const hash = computeTranslationHash(item.targetLang, item.text);
        if (!hashToItem.has(hash)) {
          hashToItem.set(hash, item);
          hashes.push(hash);
        }
      }
      docHashes.push(hashes);
    }

    const allHashes = Array.from(hashToItem.keys());
    const cachedMap = await this.cachePort.getCachedTranslations(allHashes);
    const cachedHashes = new Set(cachedMap.keys());

    // Queue uncached items doc-by-doc up to maxItems
    const uncachedEntries: Array<{ hash: string; text: string; targetLang: TargetLang }> = [];
    let completedDocs = docs.length;
    let cutOff = false;

    for (let i = 0; i < docs.length && !cutOff; i++) {
      const queuedBefore = uncachedEntries.length;
      for (const hash of docHashes[i]) {
        if (cachedHashes.has(hash)) continue;
        if (uncachedEntries.length >= maxItems) {
          cutOff = true;
          completedDocs = queuedBefore === 0 ? i + 1 : i;
          break;
        }
        const item = hashToItem.get(hash)!;
        uncachedEntries.push({ hash, text: item.text, targetLang: item.targetLang });
      }
    }

    // Enforce atomic daily quota on uncached sweep entries
    let allowedCount = uncachedEntries.length;
    if (uncachedEntries.length > 0) {
      allowedCount = await this.cachePort.reserveDailyQuota(uncachedEntries.length, dailyLimit);
      if (allowedCount < uncachedEntries.length) {
        cutOff = true;
        // Adjust completedDocs to only the docs whose items were completely within allowedCount
        let cumulative = 0;
        let quotaCompletedDocs = 0;
        for (let i = 0; i < completedDocs; i++) {
          const docUncached = docHashes[i].filter((h) => !cachedHashes.has(h)).length;
          if (cumulative + docUncached <= allowedCount) {
            cumulative += docUncached;
            quotaCompletedDocs = i + 1;
          } else {
            break;
          }
        }
        completedDocs = quotaCompletedDocs;
      }
    }

    const itemsToTranslate = uncachedEntries.slice(0, allowedCount);
    let translatedCount = 0;
    let failedCount = 0;

    if (itemsToTranslate.length > 0) {
      const toSave: TranslationRecord[] = [];

      if (typeof this.aiPort.translateTexts === "function") {
        const translatableItems = itemsToTranslate.map((e) => ({
          text: e.text,
          targetLang: e.targetLang,
        }));
        const results = await this.aiPort.translateTexts(translatableItems);
        for (let i = 0; i < itemsToTranslate.length; i++) {
          const tr = results[i];
          if (typeof tr === "string" && tr.length > 0) {
            toSave.push({
              hash: itemsToTranslate[i].hash,
              sourceText: itemsToTranslate[i].text,
              translatedText: tr,
              targetLang: itemsToTranslate[i].targetLang,
            });
          } else {
            failedCount++;
          }
        }
      } else {
        // Group by target language
        const byLang = new Map<string, Array<{ id: number; hash: string; text: string }>>();
        itemsToTranslate.forEach((entry, idx) => {
          const list = byLang.get(entry.targetLang) ?? [];
          list.push({ id: idx, hash: entry.hash, text: entry.text });
          byLang.set(entry.targetLang, list);
        });

        for (const [targetLang, entries] of byLang.entries()) {
          for (let i = 0; i < entries.length; i += GEMINI_CHUNK_SIZE) {
            const chunkEntries = entries.slice(i, i + GEMINI_CHUNK_SIZE);
            const chunk = chunkEntries.map((e, localId) => ({ id: localId, text: e.text }));
            try {
              const chunkResults = await this.aiPort.translateChunk(chunk, targetLang);
              chunkEntries.forEach((entry, localId) => {
                const translated = chunkResults.get(localId);
                if (typeof translated === "string" && translated.length > 0) {
                  toSave.push({
                    hash: entry.hash,
                    sourceText: entry.text,
                    translatedText: translated,
                    targetLang,
                  });
                } else {
                  failedCount++;
                }
              });
            } catch (chunkErr) {
              console.warn("[TranslationEngine] Sweep AI chunk failed:", chunkErr);
              failedCount += chunkEntries.length;
            }
          }
        }
      }

      await this.cachePort.saveTranslations(toSave);
      translatedCount = toSave.length;
    }

    let nextCursor: TranslationCursor;
    if (cutOff) {
      nextCursor = {
        currentCollection,
        lastDocId: completedDocs > 0 ? docs[completedDocs - 1].id : lastDocId,
        updatedAt: new Date().toISOString(),
      };
    } else if (!hasMore || docs.length === 0) {
      nextCursor = {
        currentCollection: getNextCollection(currentCollection),
        lastDocId: null,
        updatedAt: new Date().toISOString(),
      };
    } else {
      nextCursor = {
        currentCollection,
        lastDocId: docs[docs.length - 1].id,
        updatedAt: new Date().toISOString(),
      };
    }

    await this.cachePort.saveCursor(nextCursor);

    return {
      cursor: nextCursor,
      translatedCount,
      cachedCount: allHashes.length - uncachedEntries.length,
      scannedDocsCount: docs.length,
      failedCount,
    };
  }
}
