import type { Firestore, QueryDocumentSnapshot } from "firebase-admin/firestore";
import {
  type TranslationCronDeps,
  type TranslationCursor,
  type SupportedCollection,
  COLLECTION_ORDER,
} from "./translate";

const DEFAULT_CURSOR: TranslationCursor = {
  currentCollection: COLLECTION_ORDER[0],
  lastDocId: null,
  updatedAt: new Date(0).toISOString(),
};

export const FIRESTORE_GET_ALL_CHUNK_SIZE = 50;
export const FIRESTORE_BATCH_WRITE_CHUNK_SIZE = 100;
export const GEMINI_TRANSLATE_CHUNK_SIZE = 15;

export interface MinimalFirestore {
  collection(name: string): any;
  getAll?(...docs: any[]): Promise<any[]>;
  batch(): any;
}

export function firestoreTranslationDeps(
  db: MinimalFirestore,
  translateTextsFn: (texts: string[]) => Promise<Array<string | null>>,
  serverTimestampFn: () => any = () => new Date().toISOString(),
): TranslationCronDeps {
  const cursorRef = db.collection("system").doc("translationCursor");

  return {
    async getCursor(): Promise<TranslationCursor> {
      try {
        const snap = await cursorRef.get();
        if (snap.exists) {
          const data = snap.data();
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
        console.warn("[TranslationCron] Failed to read cursor doc:", err);
      }
      return { ...DEFAULT_CURSOR };
    },

    async saveCursor(cursor: TranslationCursor): Promise<void> {
      await cursorRef.set(cursor, { merge: true });
    },

    async fetchBatch(
      collectionName: SupportedCollection,
      lastDocId: string | null,
      limit: number,
    ) {
      let q = db.collection(collectionName).orderBy("__name__");

      if (lastDocId) {
        // startAfter with document path ensures cursor advances even if the document was deleted
        q = q.startAfter(db.collection(collectionName).doc(lastDocId));
      }

      q = q.limit(limit);

      const snap = await q.get();
      const docs = snap.docs.map((d: QueryDocumentSnapshot) => ({ id: d.id, data: d.data() }));
      const hasMore = snap.docs.length === limit;

      return { docs, hasMore };
    },

    async getCachedHashes(hashes: string[]): Promise<Set<string>> {
      const cached = new Set<string>();
      if (hashes.length === 0) return cached;

      // Firestore getAll supports up to batch limit
      const refs = hashes.map((h) => db.collection("translations").doc(h));
      // Read in chunks of FIRESTORE_GET_ALL_CHUNK_SIZE
      for (let i = 0; i < refs.length; i += FIRESTORE_GET_ALL_CHUNK_SIZE) {
        const chunk = refs.slice(i, i + FIRESTORE_GET_ALL_CHUNK_SIZE);
        const docSnaps =
          typeof db.getAll === "function"
            ? await db.getAll(...chunk)
            : await Promise.all(chunk.map((r: any) => r.get()));
        for (const snap of docSnaps) {
          if (snap.exists) {
            cached.add(snap.id);
          }
        }
      }
      return cached;
    },

    async translateTexts(texts: string[]): Promise<Array<string | null>> {
      return translateTextsFn(texts);
    },

    async saveTranslations(
      items: Array<{ hash: string; originalText: string; translatedText: string }>,
    ): Promise<void> {
      if (items.length === 0) return;

      // Batch write in chunks of FIRESTORE_BATCH_WRITE_CHUNK_SIZE
      for (let i = 0; i < items.length; i += FIRESTORE_BATCH_WRITE_CHUNK_SIZE) {
        const chunk = items.slice(i, i + FIRESTORE_BATCH_WRITE_CHUNK_SIZE);
        const batch = db.batch();
        for (const item of chunk) {
          const docRef = db.collection("translations").doc(item.hash);
          batch.set(
            docRef,
            {
              originalText: item.originalText,
              translatedText: item.translatedText,
              targetLang: "es",
              updatedAt: serverTimestampFn(),
            },
            { merge: true },
          );
        }
        await batch.commit();
      }
    },
  };
}

/** Transient failures worth retrying. Anything else (bad key, bad request) is
 *  a configuration error and is surfaced instead of silently skipped. */
const RETRYABLE_STATUSES = new Set([429, 500, 502, 503, 504]);

export interface GeminiTranslatorOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function geminiTranslator(
  fetchImpl: typeof fetch,
  apiKey: string,
  options: GeminiTranslatorOptions = {},
) {
  const maxAttempts = options.maxAttempts ?? 3;
  const baseDelayMs = options.baseDelayMs ?? 500;
  const sleep = options.sleep ?? defaultSleep;
  const langName = "Spanish";

  return async (texts: string[]): Promise<Array<string | null>> => {
    if (texts.length === 0) return [];
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not configured.");
    }

    const results: Array<string | null> = [];

    for (let i = 0; i < texts.length; i += GEMINI_TRANSLATE_CHUNK_SIZE) {
      const chunk = texts.slice(i, i + GEMINI_TRANSLATE_CHUNK_SIZE);
      const chunkResults = await translateChunk(chunk);

      for (let j = 0; j < chunk.length; j++) {
        // A missing id is a failure, never a pass-through of the original.
        results.push(chunkResults.get(j) ?? null);
      }
    }

    return results;
  };

  async function translateChunk(chunk: string[]): Promise<Map<number, string>> {
    const items = chunk.map((text, idx) => ({ id: idx, text }));
    const prompt =
      `Translate the following ${chunk.length} text items into ${langName}:\n\n` +
      JSON.stringify(items);

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

    const body = JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      systemInstruction: {
        parts: [
          {
            text: `You are an expert translator for a campus ministry community web and mobile app. Translate each text item accurately, idiomatically, and naturally into the target language (${langName}).
CRITICAL RULES:
1. Preserve all Markdown formatting intact (*, **, #, -, 1., [text](url), etc.).
2. Preserve user mentions (@name or @User), emails, URLs, and phone numbers untouched.
3. Preserve emojis and special characters.
4. Return a JSON object with a 'translations' array matching the input 'id' and the 'translatedText'.`,
          },
        ],
      },
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

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const backoff = () => sleep(baseDelayMs * 2 ** (attempt - 1));

      let res: Response;
      try {
        res = await fetchImpl(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });
      } catch (err) {
        if (attempt < maxAttempts) {
          await backoff();
          continue;
        }
        console.warn(
          `[GeminiTranslator] chunk skipped after ${maxAttempts} attempts (network error):`,
          err,
        );
        return new Map();
      }

      if (!res.ok) {
        const errorText = await res.text();
        if (RETRYABLE_STATUSES.has(res.status)) {
          if (attempt < maxAttempts) {
            await backoff();
            continue;
          }
          console.warn(
            `[GeminiTranslator] chunk skipped after ${maxAttempts} attempts: HTTP ${res.status}: ${errorText}`,
          );
          return new Map();
        }
        throw new Error(`Gemini translation failed: HTTP ${res.status}: ${errorText}`);
      }

      const json = (await res.json()) as {
        candidates?: Array<{
          content?: {
            parts?: Array<{ text?: string }>;
          };
        }>;
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
          console.warn("[GeminiTranslator] Failed to parse translation response JSON:", e);
        }
      }

      return chunkResults;
    }

    return new Map();
  }
}
