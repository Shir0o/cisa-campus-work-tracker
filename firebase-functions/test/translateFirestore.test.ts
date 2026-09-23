import { describe, it, expect, vi } from "vitest";
import {
  firestoreTranslationDeps,
  geminiTranslator,
  FIRESTORE_GET_ALL_CHUNK_SIZE,
  FIRESTORE_BATCH_WRITE_CHUNK_SIZE,
  GEMINI_TRANSLATE_CHUNK_SIZE,
} from "../src/translateFirestore";

describe("firestoreTranslationDeps", () => {
  it("getCursor returns saved cursor when document exists and has valid collection", async () => {
    const mockDoc = {
      exists: true,
      data: () => ({
        currentCollection: "contacts",
        lastDocId: "c123",
        updatedAt: "2026-09-20T10:00:00.000Z",
      }),
    };
    const mockDb: any = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: vi.fn(async () => mockDoc),
        })),
      })),
    };

    const deps = firestoreTranslationDeps(mockDb, async () => []);
    const cursor = await deps.getCursor();

    expect(cursor).toEqual({
      currentCollection: "contacts",
      lastDocId: "c123",
      updatedAt: "2026-09-20T10:00:00.000Z",
    });
  });

  it("getCursor falls back to default cursor if document does not exist or collection is invalid", async () => {
    const mockDb: any = {
      collection: vi.fn(() => ({
        doc: vi.fn(() => ({
          get: vi.fn(async () => ({ exists: false })),
        })),
      })),
    };

    const deps = firestoreTranslationDeps(mockDb, async () => []);
    const cursor = await deps.getCursor();

    expect(cursor.currentCollection).toBe("prayers");
    expect(cursor.lastDocId).toBeNull();
  });

  it("saveCursor writes merged cursor data to system/translationCursor", async () => {
    const setMock = vi.fn(async () => {});
    const mockDb: any = {
      collection: vi.fn((col: string) => {
        expect(col).toBe("system");
        return {
          doc: vi.fn((id: string) => {
            expect(id).toBe("translationCursor");
            return { set: setMock };
          }),
        };
      }),
    };

    const deps = firestoreTranslationDeps(mockDb, async () => []);
    const cursor = {
      currentCollection: "todos" as const,
      lastDocId: "t1",
      updatedAt: "2026-09-22T00:00:00.000Z",
    };
    await deps.saveCursor(cursor);

    expect(setMock).toHaveBeenCalledWith(cursor, { merge: true });
  });

  it("fetchBatch queries collection ordered by __name__ with startAfter when lastDocId is set", async () => {
    const mockDocSnap1 = { id: "doc1", data: () => ({ title: "Item 1" }) };
    const mockDocSnap2 = { id: "doc2", data: () => ({ title: "Item 2" }) };
    const limitMock = vi.fn(() => ({
      get: vi.fn(async () => ({ docs: [mockDocSnap1, mockDocSnap2] })),
    }));
    const queryMock = {
      limit: limitMock,
      startAfter: vi.fn(() => ({
        limit: limitMock,
      })),
    };
    const orderByMock = vi.fn(() => queryMock);
    const docRefMock = { path: "prayers/lastDoc" };
    const mockDb: any = {
      collection: vi.fn((col: string) => {
        if (col === "system") {
          return { doc: () => ({ get: vi.fn(async () => ({ exists: false })) }) };
        }
        return {
          orderBy: orderByMock,
          doc: vi.fn(() => docRefMock),
        };
      }),
    };

    const deps = firestoreTranslationDeps(mockDb, async () => []);
    const result = await deps.fetchBatch("prayers", "lastDoc", 2);

    expect(orderByMock).toHaveBeenCalledWith("__name__");
    expect(queryMock.startAfter).toHaveBeenCalledWith(docRefMock);
    expect(result.docs).toHaveLength(2);
    expect(result.hasMore).toBe(true);
  });

  it("getCachedHashes batches lookups via db.getAll", async () => {
    const getAllMock = vi.fn(async (...refs: any[]) =>
      refs.map((r) => ({ id: r.id, exists: r.id === "hash1" })),
    );
    const mockDb: any = {
      collection: vi.fn((col: string) => {
        if (col === "system") {
          return { doc: () => ({ get: vi.fn(async () => ({ exists: false })) }) };
        }
        return {
          doc: (id: string) => ({ id, col }),
        };
      }),
      getAll: getAllMock,
    };

    const deps = firestoreTranslationDeps(mockDb, async () => []);
    const cached = await deps.getCachedHashes(["hash1", "hash2"]);

    expect(getAllMock).toHaveBeenCalled();
    expect(cached.has("hash1")).toBe(true);
    expect(cached.has("hash2")).toBe(false);
  });

  it("saveTranslations batches writes to translations collection", async () => {
    const setMock = vi.fn();
    const commitMock = vi.fn(async () => {});
    const batchMock = { set: setMock, commit: commitMock };
    const mockDb: any = {
      collection: vi.fn(() => ({
        doc: (id: string) => ({ id }),
      })),
      batch: vi.fn(() => batchMock),
    };

    const deps = firestoreTranslationDeps(mockDb, async () => []);
    await deps.saveTranslations([
      { hash: "h1", originalText: "Peace", translatedText: "Paz" },
    ]);

    expect(mockDb.batch).toHaveBeenCalled();
    expect(setMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        originalText: "Peace",
        translatedText: "Paz",
        targetLang: "es",
      }),
      { merge: true },
    );
    expect(commitMock).toHaveBeenCalled();
  });
});

describe("geminiTranslator", () => {
  it("translates texts using Generative Language REST API and parses response JSON", async () => {
    const mockFetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [
                {
                  text: JSON.stringify({
                    translations: [
                      { id: 0, translatedText: "Oración" },
                      { id: 1, translatedText: "Hermanos" },
                    ],
                  }),
                },
              ],
            },
          },
        ],
      }),
    })) as any;

    const translate = geminiTranslator(mockFetch, "test-api-key");
    const results = await translate(["Prayer", "Brothers"]);

    expect(results).toEqual(["Oración", "Hermanos"]);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("generativelanguage.googleapis.com"),
      expect.objectContaining({
        method: "POST",
      }),
    );
  });

  it("throws if GEMINI_API_KEY is missing", async () => {
    const translate = geminiTranslator(fetch, "");
    await expect(translate(["Hello"])).rejects.toThrow("GEMINI_API_KEY is not configured");
  });

  it("throws if API response is not ok", async () => {
    const mockFetch = vi.fn(async () => ({
      ok: false,
      status: 403,
      text: async () => "Forbidden",
    })) as any;

    const translate = geminiTranslator(mockFetch, "test-api-key");
    await expect(translate(["Hello"])).rejects.toThrow("Gemini translation failed: HTTP 403");
  });
});
