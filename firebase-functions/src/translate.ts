import crypto from "crypto";
import { detectLanguage, isAlreadySpanish, type LanguageSignal } from "./language";

export { isAlreadySpanish };

export type SupportedCollection =
  | "prayers"
  | "interactions"
  | "contacts"
  | "todos"
  | "coordinationNotes";

export type TargetLang = "en" | "es";

export const COLLECTION_ORDER: SupportedCollection[] = [
  "prayers",
  "interactions",
  "contacts",
  "todos",
  "coordinationNotes",
];

export interface TranslationCursor {
  currentCollection: SupportedCollection;
  lastDocId: string | null;
  updatedAt: string;
}

export interface DocItem {
  id: string;
  data: Record<string, any>;
}

export interface FetchBatchResult {
  docs: DocItem[];
  hasMore: boolean;
}

/** One string to translate, and the reader language it is being prepared for. */
export interface TranslatableItem {
  text: string;
  targetLang: TargetLang;
}

export interface TranslationCronDeps {
  getCursor(): Promise<TranslationCursor>;
  saveCursor(cursor: TranslationCursor): Promise<void>;
  fetchBatch(
    collection: SupportedCollection,
    lastDocId: string | null,
    limit: number,
  ): Promise<FetchBatchResult>;
  getCachedHashes(hashes: string[]): Promise<Set<string>>;
  /** Translates a batch of language-tagged strings in order. A `null` entry
   *  means that string failed and must be left uncached so a later sweep
   *  retries it (never write the original as its own translation). */
  translateTexts(items: TranslatableItem[]): Promise<Array<string | null>>;
  saveTranslations(
    items: Array<{
      hash: string;
      originalText: string;
      translatedText: string;
      targetLang: TargetLang;
    }>,
  ): Promise<void>;
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
  /** Strings Gemini rejected after retries. They stay uncached so the next
   *  full sweep picks them up. */
  failedCount: number;
}

export function translationHash(text: string, targetLang = "es"): string {
  const normalizedTargetLang = targetLang.trim().toLowerCase();
  const trimmed = text.trim();
  return crypto.createHash("sha256").update(`${normalizedTargetLang}:${trimmed}`).digest("hex");
}

/**
 * Extract the translatable strings a doc contributes, tagged with the reader
 * language each is needed for (ADR 0037). An English string is queued for `es`
 * only; a Spanish string for `en` only; mixed text for both. No-signal text
 * (names, emoji, short neutral phrases) is queued for `es` only, matching the
 * web/mobile asymmetry where an English reader sees it as written.
 */
export function extractTranslatableItems(
  collection: SupportedCollection,
  data: Record<string, any>,
): TranslatableItem[] {
  const candidates: string[] = [];

  switch (collection) {
    case "prayers":
      // Real stored fields on a PrayerRecord (src/types.ts). The retired
      // title/description/updateNotes/answeredNotes lists extracted nothing.
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

export async function advanceTranslationCron(
  deps: TranslationCronDeps,
  options: CronRunOptions = {},
): Promise<CronRunResult> {
  const maxItems = options.maxItemsPerRun ?? 200;
  const batchFetchLimit = options.batchFetchLimit ?? 50;

  const cursor = await deps.getCursor();
  let currentCollection = cursor.currentCollection;
  let lastDocId = cursor.lastDocId;

  const { docs, hasMore } = await deps.fetchBatch(
    currentCollection,
    lastDocId,
    batchFetchLimit,
  );

  // Deduplicate by cache hash so a string is never queued twice for the same
  // direction, while text queued for both directions keeps its two entries.
  const hashToItem = new Map<string, TranslatableItem>();
  for (const doc of docs) {
    const items = extractTranslatableItems(currentCollection, doc.data);
    for (const item of items) {
      const hash = translationHash(item.text, item.targetLang);
      if (!hashToItem.has(hash)) hashToItem.set(hash, item);
    }
  }

  const allHashes = Array.from(hashToItem.keys());
  const cachedHashes = await deps.getCachedHashes(allHashes);

  const uncachedEntries: Array<{ hash: string; text: string; targetLang: TargetLang }> = [];
  for (const [hash, item] of hashToItem.entries()) {
    if (!cachedHashes.has(hash)) {
      uncachedEntries.push({ hash, text: item.text, targetLang: item.targetLang });
      if (uncachedEntries.length >= maxItems) break;
    }
  }

  let translatedCount = 0;
  let failedCount = 0;
  if (uncachedEntries.length > 0) {
    const translatedTexts = await deps.translateTexts(
      uncachedEntries.map((e) => ({ text: e.text, targetLang: e.targetLang })),
    );

    const itemsToSave: Array<{
      hash: string;
      originalText: string;
      translatedText: string;
      targetLang: TargetLang;
    }> = [];
    for (let i = 0; i < uncachedEntries.length; i++) {
      const translated = translatedTexts[i];
      if (typeof translated === "string" && translated.length > 0) {
        itemsToSave.push({
          hash: uncachedEntries[i].hash,
          originalText: uncachedEntries[i].text,
          translatedText: translated,
          targetLang: uncachedEntries[i].targetLang,
        });
      } else {
        // A failed string is not written to the cache — writing the original
        // as its own translation would hide it from future sweeps.
        failedCount++;
      }
    }

    await deps.saveTranslations(itemsToSave);
    translatedCount = itemsToSave.length;
  }

  let nextCursor: TranslationCursor;
  if (!hasMore || docs.length === 0) {
    // Reached the end of this collection, cycle to next collection
    nextCursor = {
      currentCollection: getNextCollection(currentCollection),
      lastDocId: null,
      updatedAt: new Date().toISOString(),
    };
  } else {
    // Continue in current collection
    nextCursor = {
      currentCollection,
      lastDocId: docs[docs.length - 1].id,
      updatedAt: new Date().toISOString(),
    };
  }

  await deps.saveCursor(nextCursor);

  return {
    cursor: nextCursor,
    translatedCount,
    cachedCount: allHashes.length - uncachedEntries.length,
    scannedDocsCount: docs.length,
    failedCount,
  };
}
