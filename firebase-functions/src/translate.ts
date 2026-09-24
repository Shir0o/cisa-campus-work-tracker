import crypto from "crypto";

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

export interface TranslationCronDeps {
  getCursor(): Promise<TranslationCursor>;
  saveCursor(cursor: TranslationCursor): Promise<void>;
  fetchBatch(
    collection: SupportedCollection,
    lastDocId: string | null,
    limit: number,
  ): Promise<FetchBatchResult>;
  getCachedHashes(hashes: string[]): Promise<Set<string>>;
  translateTexts(texts: string[]): Promise<string[]>;
  saveTranslations(
    items: Array<{ hash: string; originalText: string; translatedText: string }>,
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
}

const SPANISH_MARKERS = new Set([
  "el", "la", "los", "las", "de", "que", "y", "en", "es", "un", "una",
  "por", "para", "con", "no", "se", "su", "lo", "al", "del",
  "más", "qué", "cómo", "está", "están", "pero", "como", "cuando", "donde", "también",
  "mi", "mí", "esta", "este", "ora", "oración", "orar", "favor",
  "dios", "iglesia", "estudio", "bíblico", "familia", "semana",
  "hermano", "hermana", "bueno", "buena", "gracias", "señor", "amor", "vida",
]);

const ENGLISH_MARKERS = new Set([
  "the", "and", "of", "to", "a", "in", "is", "that", "for", "it", "on", "with",
  "this", "we", "you", "are", "have", "has", "was", "were", "will", "would",
  "can", "could", "should", "please", "pray", "prayer", "thanks", "thank",
  "god", "church", "family", "week", "brother", "sister", "good", "morning",
  "study", "bible", "me", "and", "but", "so", "not",
]);

export function isAlreadySpanish(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;

  const words = trimmed.toLowerCase().match(/[a-zñáéíóúü]+/g) ?? [];
  let spanish = 0;
  let english = 0;
  for (const word of words) {
    if (SPANISH_MARKERS.has(word)) spanish++;
    if (ENGLISH_MARKERS.has(word)) english++;
  }

  const accentSignal = /[¿¡]|[áéíóúü]|ñ/.test(trimmed);

  if (spanish === 0 && english === 0) {
    return accentSignal && words.length >= 2;
  }

  return (spanish > english && spanish >= 2) || (accentSignal && spanish > 0);
}

export function translationHash(text: string, targetLang = "es"): string {
  const normalizedTargetLang = targetLang.trim().toLowerCase();
  const trimmed = text.trim();
  return crypto.createHash("sha256").update(`${normalizedTargetLang}:${trimmed}`).digest("hex");
}

export function extractTranslatableTexts(
  collection: SupportedCollection,
  data: Record<string, any>,
): string[] {
  const candidates: string[] = [];

  switch (collection) {
    case "prayers":
      if (typeof data.title === "string") candidates.push(data.title);
      if (typeof data.description === "string") candidates.push(data.description);
      if (typeof data.updateNotes === "string") candidates.push(data.updateNotes);
      if (typeof data.answeredNotes === "string") candidates.push(data.answeredNotes);
      break;
    case "contacts":
      if (typeof data.notes === "string") candidates.push(data.notes);
      if (typeof data.nextSteps === "string") candidates.push(data.nextSteps);
      if (typeof data.spiritualCondition === "string") candidates.push(data.spiritualCondition);
      break;
    case "interactions":
      if (typeof data.content === "string") candidates.push(data.content);
      if (typeof data.summary === "string") candidates.push(data.summary);
      break;
    case "todos":
      if (typeof data.title === "string") candidates.push(data.title);
      if (typeof data.description === "string") candidates.push(data.description);
      break;
    case "coordinationNotes":
      if (typeof data.title === "string") candidates.push(data.title);
      if (typeof data.content === "string") candidates.push(data.content);
      break;
  }

  return candidates.filter((str) => {
    const trimmed = str.trim();
    if (!trimmed) return false;
    // Skip if already Spanish per ADR 0027
    if (isAlreadySpanish(trimmed)) return false;
    return true;
  });
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
  const targetLang = "es";

  const cursor = await deps.getCursor();
  let currentCollection = cursor.currentCollection;
  let lastDocId = cursor.lastDocId;

  const { docs, hasMore } = await deps.fetchBatch(
    currentCollection,
    lastDocId,
    batchFetchLimit,
  );

  const textToHash = new Map<string, string>();
  for (const doc of docs) {
    const texts = extractTranslatableTexts(currentCollection, doc.data);
    for (const t of texts) {
      const trimmed = t.trim();
      const hash = translationHash(trimmed, targetLang);
      textToHash.set(hash, trimmed);
    }
  }

  const allHashes = Array.from(textToHash.keys());
  const cachedHashes = await deps.getCachedHashes(allHashes);

  const uncachedEntries: Array<{ hash: string; text: string }> = [];
  for (const [hash, text] of textToHash.entries()) {
    if (!cachedHashes.has(hash)) {
      uncachedEntries.push({ hash, text });
      if (uncachedEntries.length >= maxItems) break;
    }
  }

  let translatedCount = 0;
  if (uncachedEntries.length > 0) {
    const textsToTranslate = uncachedEntries.map((e) => e.text);
    const translatedTexts = await deps.translateTexts(textsToTranslate);

    const itemsToSave: Array<{ hash: string; originalText: string; translatedText: string }> = [];
    for (let i = 0; i < uncachedEntries.length; i++) {
      const translated = translatedTexts[i] ?? uncachedEntries[i].text;
      itemsToSave.push({
        hash: uncachedEntries[i].hash,
        originalText: uncachedEntries[i].text,
        translatedText: translated,
      });
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
  };
}
