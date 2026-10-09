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
      { hash: "h1", originalText: "Peace", translatedText: "Paz", targetLang: "en" },
    ]);

    expect(mockDb.batch).toHaveBeenCalled();
    expect(setMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        originalText: "Peace",
        translatedText: "Paz",
        targetLang: "en",
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
    const results = await translate([
      { text: "Prayer", targetLang: "es" },
      { text: "Brothers", targetLang: "es" },
    ]);

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
    await expect(translate([{ text: "Hello", targetLang: "en" }])).rejects.toThrow("GEMINI_API_KEY is not configured");
  });

  it("throws if API response is not ok", async () => {
    const mockFetch = vi.fn(async () => ({
      ok: false,
      status: 403,
      text: async () => "Forbidden",
    })) as any;

    const translate = geminiTranslator(mockFetch, "test-api-key");
    await expect(translate([{ text: "Hello", targetLang: "en" }])).rejects.toThrow("Gemini translation failed: HTTP 403");
  });

  const okResponse = (translations: Array<{ id: number; translatedText: string }>) => ({
    ok: true,
    json: async () => ({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ translations }) }] } }],
    }),
  });

  it("retries a transient 503 and succeeds (retry works)", async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => "high demand" })
      .mockResolvedValueOnce(okResponse([{ id: 0, translatedText: "Oración" }])) as any;
    const sleep = vi.fn(async () => {});

    const translate = geminiTranslator(mockFetch, "test-api-key", { maxAttempts: 3, sleep });
    const results = await translate([{ text: "Prayer", targetLang: "es" }]);

    expect(results).toEqual(["Oración"]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("retries a network error and succeeds", async () => {
    const mockFetch = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce(okResponse([{ id: 0, translatedText: "Hermanos" }])) as any;

    const translate = geminiTranslator(mockFetch, "test-api-key", {
      maxAttempts: 3,
      sleep: async () => {},
    });
    await expect(translate([{ text: "Brothers", targetLang: "es" }])).resolves.toEqual(["Hermanos"]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("skips a chunk that keeps failing and keeps translating later chunks", async () => {
    const firstChunk = Array.from({ length: GEMINI_TRANSLATE_CHUNK_SIZE }, (_, i) => `text ${i}`);
    const mockFetch = vi
      .fn()
      // First chunk fails every attempt.
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => "high demand" })
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => "high demand" })
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => "high demand" })
      // Second chunk succeeds.
      .mockResolvedValueOnce(okResponse([{ id: 0, translatedText: "Siguiente" }])) as any;

    const translate = geminiTranslator(mockFetch, "test-api-key", {
      maxAttempts: 3,
      sleep: async () => {},
    });
    const results = await translate([
      ...firstChunk.map((text) => ({ text, targetLang: "es" as const })),
      { text: "later string", targetLang: "es" },
    ]);

    expect(results.slice(0, GEMINI_TRANSLATE_CHUNK_SIZE)).toEqual(firstChunk.map(() => null));
    expect(results[GEMINI_TRANSLATE_CHUNK_SIZE]).toBe("Siguiente");
  });

  it("counts ids missing from a parsed response as failed, not as the original text", async () => {
    const mockFetch = vi.fn(async () =>
      okResponse([{ id: 0, translatedText: "Oración" }]),
    ) as any;

    const translate = geminiTranslator(mockFetch, "test-api-key");
    const results = await translate([
      { text: "Prayer", targetLang: "es" },
      { text: "Missing", targetLang: "es" },
    ]);

    expect(results).toEqual(["Oración", null]);
  });

  it("groups mixed-language requests into one call per target and preserves order", async () => {
    const prompts: string[] = [];
    const mockFetch = vi.fn(async (_url: string, init: any) => {
      const body = JSON.parse(init.body);
      prompts.push(body.contents[0].parts[0].text);
      const items = JSON.parse(body.contents[0].parts[0].text.split("\n\n")[1]);
      return okResponse(
        items.map((i: { id: number }) => ({ id: i.id, translatedText: `t-${i.text}` })),
      );
    }) as any;

    const translate = geminiTranslator(mockFetch, "test-api-key");
    const results = await translate([
      { text: "Prayer", targetLang: "es" },
      { text: "Oración", targetLang: "en" },
      { text: "Brothers", targetLang: "es" },
    ]);

    expect(results).toEqual(["t-Prayer", "t-Oración", "t-Brothers"]);
    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(prompts.some((p) => p.includes("into Spanish"))).toBe(true);
    expect(prompts.some((p) => p.includes("into English"))).toBe(true);
  });
});
