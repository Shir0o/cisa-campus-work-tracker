import {
  type LanguageSignal,
  detectLanguage,
  isAlreadySpanish,
  shouldShowAsIs,
  computeTranslationHash,
} from "../../packages/core/src/translation";

import {
  type SupportedCollection,
  COLLECTION_ORDER,
  type TranslationCursor,
  type FetchBatchResult,
  type TranslatableItem,
  type CronRunOptions,
  type CronRunResult,
  type TranslationRecord,
  type TranslationAIPort,
  type TranslationCachePort,
  TranslationEngine,
  extractTranslatableItems,
} from "../../packages/core/src/translationEngine";

export {
  isAlreadySpanish,
  detectLanguage,
  shouldShowAsIs,
  computeTranslationHash,
  extractTranslatableItems,
  COLLECTION_ORDER,
  type SupportedCollection,
  type TranslationCursor,
  type FetchBatchResult,
  type TranslatableItem,
  type CronRunOptions,
  type CronRunResult,
  type LanguageSignal,
};

export type TargetLang = "en" | "es";
export type DocItem = { id: string; data: Record<string, any> };

export function translationHash(text: string, targetLang = "es"): string {
  return computeTranslationHash(targetLang, text);
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
  reserveDailyQuota?(count: number, limit?: number): Promise<number>;
}

export async function advanceTranslationCron(
  deps: TranslationCronDeps,
  options: CronRunOptions = {},
): Promise<CronRunResult> {
  const aiPort: TranslationAIPort = {
    async translateChunk(chunk, targetLang) {
      const items = chunk.map((c) => ({ text: c.text, targetLang: targetLang as TargetLang }));
      const results = await deps.translateTexts(items);
      const resultMap = new Map<number, string>();
      chunk.forEach((item, idx) => {
        const tr = results[idx];
        if (typeof tr === "string" && tr.length > 0) {
          resultMap.set(item.id, tr);
        }
      });
      return resultMap;
    },
    async translateTexts(items) {
      return deps.translateTexts(items as Array<{ text: string; targetLang: TargetLang }>);
    },
  };

  const cachePort: TranslationCachePort = {
    async getCachedTranslations(hashes) {
      const cachedSet = await deps.getCachedHashes(hashes);
      const map = new Map<string, string>();
      for (const h of cachedSet) {
        map.set(h, "");
      }
      return map;
    },
    async saveTranslations(items) {
      await deps.saveTranslations(
        items.map((i) => ({
          hash: i.hash,
          originalText: i.sourceText,
          translatedText: i.translatedText,
          targetLang: i.targetLang as TargetLang,
        })),
      );
    },
    async reserveDailyQuota(count, limit) {
      if (typeof deps.reserveDailyQuota === "function") {
        return await deps.reserveDailyQuota(count, limit);
      }
      return count;
    },
    getCursor: () => deps.getCursor(),
    saveCursor: (c) => deps.saveCursor(c),
    fetchBatch: (col, lastId, limit) => deps.fetchBatch(col, lastId, limit),
  };

  const engine = new TranslationEngine({ aiPort, cachePort });
  return engine.advanceSweep(options);
}
