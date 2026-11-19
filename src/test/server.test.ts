import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { Express } from "express";
import { visibleToOf } from "../lib/contactTies";

// ── Hoisted test doubles (created before the vi.mock factories) ─────────────
const {
  mockDb,
  seedDoc,
  getCollection,
  resetDb,
  mockGenerateContent,
  mockVerifyIdToken,
  mockCreateCustomToken,
  fetchMock,
  getFirestoreDbIds,
} = vi.hoisted(() => {
  type Doc = Record<string, any>;

  const store: Record<string, Record<string, Doc>> = {};
  let seq = 0;

  const DELETE_SENTINEL = Symbol("DELETE");

  // `update` reads a dotted key as a path into nested maps, as Firestore
  // does, and returns a copy so earlier snapshots keep their values.
  const applyUpdate = (current: Doc | undefined, u: Doc): Doc => {
    const target: Doc = { ...(current ?? {}) };
    for (const [key, v] of Object.entries(u)) {
      const path = key.split(".");
      let node = target;
      for (const segment of path.slice(0, -1)) node = node[segment] = { ...(node[segment] ?? {}) };
      const leaf = path[path.length - 1];
      if (v === DELETE_SENTINEL || (v && (v as any).__mockDelete)) delete node[leaf];
      else node[leaf] = v;
    }
    return target;
  };

  const snapshot = (docs: Array<{ id: string; data: () => Doc }>) => ({
    empty: docs.length === 0,
    size: docs.length,
    docs,
    forEach: (cb: (d: any) => void) => docs.forEach(cb),
  });

  const collection = (name: string) => {
    const col = (store[name] ??= {});

    // A document handle that is its own `ref`, so `snap.ref.update(...)` and
    // `snap.ref.collection('replies')` work the way the real SDK does.
    const docHandle = (docId: string) => {
      const handle: any = {
        id: docId,
        _col: name,
        _id: docId,
        // A snapshot holds the data as it was read, as a real one does.
        get: async () => {
          const data = col[docId];
          return { exists: docId in col, data: () => data, id: docId, ref: handle };
        },
        set: async (d: Doc) => { col[docId] = { ...d }; },
        delete: async () => { delete col[docId]; },
        update: async (u: Doc) => {
          col[docId] = applyUpdate(col[docId], u);
        },
        collection: (sub: string) => collection(`${name}/${docId}/${sub}`),
      };
      handle.ref = handle;
      return handle;
    };

    const list = () =>
      Object.entries(col).map(([id, data]) => ({ id, ref: docHandle(id), data: () => data }));

    const filtered = (pred: (d: any) => boolean) => ({
      get: async () => snapshot(list().filter(pred)),
      limit: (n: number) => ({ get: async () => snapshot(list().filter(pred).slice(0, n)) }),
    });

    return {
      add: async (data: Doc) => {
        const id = `doc-${++seq}`;
        col[id] = { ...data };
        return docHandle(id);
      },
      doc: (id?: string) => docHandle(id || `doc-${++seq}`),
      where: (field: string, op: string, value: any) =>
        filtered((d) => {
          const v = d.data()[field];
          if (op === "array-contains") return Array.isArray(v) && v.includes(value);
          if (op === "in") return Array.isArray(value) && value.includes(v);
          return v === value;
        }),
      orderBy: () => ({
        limit: (n: number) => ({ get: async () => snapshot(list().slice(0, n)) }),
      }),
      limit: (n: number) => ({ get: async () => snapshot(list().slice(0, n)) }),
      get: async () => snapshot(list()),
    };
  };

  // Transactions run one at a time, as Firestore's optimistic retries make
  // them behave: each sees the writes of the one before it.
  let txQueue: Promise<unknown> = Promise.resolve();

  const db = {
    collection,
    runTransaction: <T>(fn: (tx: any) => Promise<T>): Promise<T> => {
      const run = async () => {
        const writes: Array<{ ref: any; data: Doc; kind: "set" | "merge" | "update" | "delete" }> = [];
        const tx = {
          get: (ref: any) => ref.get(),
          set: (ref: any, data: Doc, opts?: { merge?: boolean }) => {
            writes.push({ ref, data, kind: opts?.merge ? "merge" : "set" });
          },
          update: (ref: any, data: Doc) => {
            writes.push({ ref, data, kind: "update" });
          },
          delete: (ref: any) => {
            writes.push({ ref, data: {}, kind: "delete" });
          },
        };
        const result = await fn(tx);
        for (const w of writes) {
          const col = (store[w.ref._col] ??= {});
          if (w.kind === "delete") delete col[w.ref._id];
          else if (w.kind === "update") col[w.ref._id] = applyUpdate(col[w.ref._id], w.data);
          else col[w.ref._id] = w.kind === "merge" ? { ...(col[w.ref._id] ?? {}), ...w.data } : { ...w.data };
        }
        return result;
      };
      const next = txQueue.then(run, run);
      txQueue = next.catch(() => {});
      return next;
    },
    batch: () => {
      const pending: Array<{ _col: string; _id: string; data: Doc; _delete?: boolean; _replace?: boolean }> = [];
      return {
        set: (ref: any, data: Doc) => {
          const col = ref._col || ref.ref?._col || (ref._id && ref._id.includes("/") ? ref._id.split("/")[0] : "");
          const id = ref._id || ref.id || ref.ref?._id || "";
          pending.push({ _col: col, _id: id, data, _replace: true });
        },
        update: (ref: any, data: Doc) => {
          const col = ref._col || ref.ref?._col || "";
          const id = ref._id || ref.id || ref.ref?._id || "";
          pending.push({ _col: col, _id: id, data });
        },
        delete: (ref: any) => {
          const col = ref._col || ref.ref?._col || "";
          const id = ref._id || ref.id || ref.ref?._id || "";
          pending.push({ _col: col, _id: id, data: {}, _delete: true });
        },
        commit: async () => {
          for (const p of pending) {
            if (p._delete) {
              if (store[p._col]) delete store[p._col][p._id];
              continue;
            }
            // `set` replaces the whole document, as the real SDK does when
            // called without `{ merge: true }`; `update` merges fields.
            if (p._replace) {
              (store[p._col] ??= {})[p._id] = { ...p.data };
              continue;
            }
            (store[p._col] ??= {})[p._id] = applyUpdate(store[p._col][p._id], p.data);
          }
        },
      };
    },
  };

  return {
    mockDb: db,
    seedDoc: (col: string, id: string, data: Doc) => { (store[col] ??= {})[id] = { ...data }; },
    getCollection: (name: string) => store[name] ?? {},
    resetDb: () => { Object.keys(store).forEach((k) => delete store[k]); },
    mockGenerateContent: vi.fn(),
    mockVerifyIdToken: vi.fn(),
    mockCreateCustomToken: vi.fn(),
    fetchMock: vi.fn(),
    getFirestoreDbIds: [] as (string | undefined)[],
    DELETE_SENTINEL,
  };
});

// ── Module mocks ─────────────────────────────────────────────────────────────
vi.mock("firebase-admin", () => ({
  __esModule: true,
  initializeApp: vi.fn(() => ({})),
  getApps: () => [],
  getApp: () => ({}),
}));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: (_app: unknown, dbId?: string) => {
    getFirestoreDbIds.push(dbId);
    return mockDb;
  },
  FieldValue: {
    serverTimestamp: () => ({ __mockServerTimestamp: true }),
    delete: () => ({ __mockDelete: true }),
  },
}));

vi.mock("firebase-admin/auth", () => ({
  getAuth: () => ({
    verifyIdToken: mockVerifyIdToken,
    createCustomToken: mockCreateCustomToken,
  }),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: mockGenerateContent };
  },
  Type: { OBJECT: "object", STRING: "string", ARRAY: "array", BOOLEAN: "boolean" },
}));

vi.mock("vite", () => ({
  createServer: vi.fn().mockResolvedValue({ middlewares: () => {} }),
}));

// ── App under test (imported after mocks are registered) ────────────────────
import { createApp } from "../../server";
import { TestAccountPurgeEngine } from "../server/testAccountPurgeEngine";

let app: Express;

beforeEach(async () => {
  vi.stubEnv("GITHUB_TOKEN", "");
  vi.stubEnv("GITHUB_REPO", "a/b"); // the repo the test issue URLs live in
  vi.stubEnv("GITHUB_WEBHOOK_SECRET", "");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "");
  vi.stubEnv("GROUPME_GROUP_ID", "");
  vi.stubEnv("GROUPME_BOT_ID", "");
  vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
  vi.stubEnv("APP_URL", "https://example.test");
  vi.stubGlobal("fetch", fetchMock);

  resetDb();
  getFirestoreDbIds.length = 0;
  mockVerifyIdToken.mockResolvedValue({ uid: "u-123", email: "u@example.com", name: "Unit Tester" });
  mockCreateCustomToken.mockResolvedValue("minted-token");
  mockGenerateContent.mockReset();
  mockGenerateContent.mockResolvedValue({ text: '{"name":"Jane Doe","role":"Student","location":"Cafeteria"}' });
  fetchMock.mockReset();
  fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));

  app = await createApp();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

function sign(payload: unknown, secret: string) {
  const digest = crypto.createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex");
  return `sha256=${digest}`;
}

describe("getAdminDb database id resolution", () => {
  it("passes FIREBASE_FIRESTORE_DB_ID to getFirestore when set", async () => {
    vi.stubEnv("FIREBASE_FIRESTORE_DB_ID", "qa-db");
    await request(app).post("/api/feedback").send({ message: "QA smoke" });
    expect(getFirestoreDbIds).toContain("qa-db");
  });

  it("falls back to firebase-applet-config.json's database id when unset", async () => {
    await request(app).post("/api/feedback").send({ message: "prod smoke" });
    expect(getFirestoreDbIds).toContain("prod");
  });
});

describe("POST /api/feedback", () => {
  it("returns 400 when message is missing", async () => {
    const res = await request(app).post("/api/feedback").send({ type: "bug" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Missing required 'message'");
  });

  it("saves feedback to Firestore and returns new status without GitHub token", async () => {
    const res = await request(app)
      .post("/api/feedback")
      .send({ message: "  Nice app!  ", type: "enhancement", kind: "thought" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.githubIssueUrl).toBe("");
    expect(res.body.status).toBe("new");
    expect(res.body.id).toBeTruthy();

    const saved = Object.values(getCollection("feedback"));
    expect(saved).toHaveLength(1);
    expect(saved[0].message).toBe("Nice app!");
    expect(saved[0].status).toBe("new");
    expect(saved[0].archived).toBe(false);
  });

  it("creates a GitHub issue when GITHUB_TOKEN and GITHUB_REPO are set", async () => {
    vi.stubEnv("GITHUB_TOKEN", "gh-token");
    vi.stubEnv("GITHUB_REPO", "org/repo");
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ html_url: "https://github.com/org/repo/issues/42", number: 42 }), { status: 201 })
    );

    const res = await request(app).post("/api/feedback").send({ message: "Bug found", kind: "off", type: "bug" });
    expect(res.status).toBe(200);
    expect(res.body.githubIssueUrl).toBe("https://github.com/org/repo/issues/42");
    expect(res.body.status).toBe("in_progress");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.github.com/repos/org/repo/issues");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse((init as RequestInit).body as string).labels).toEqual(["bug", "feedback"]);

    const saved = Object.values(getCollection("feedback"))[0];
    expect(saved.githubIssueUrl).toBe("https://github.com/org/repo/issues/42");
    expect(saved.status).toBe("in_progress");
  });

  it("creates a reporter label and keeps email out of the GitHub issue", async () => {
    vi.stubEnv("GITHUB_TOKEN", "gh-token");
    vi.stubEnv("GITHUB_REPO", "org/repo");
    mockVerifyIdToken.mockResolvedValueOnce({ uid: "uid-sarah", email: "sarah@example.com", name: "Sarah Carvajal" });
    fetchMock.mockImplementation((input: any) => {
      const url = String(input);
      if (url.endsWith("/labels")) {
        return Promise.resolve(new Response(JSON.stringify({ name: "reporter:sarah-c" }), { status: 201 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ html_url: "https://github.com/org/repo/issues/42", number: 42 }), { status: 201 }));
    });

    const res = await request(app)
      .post("/api/feedback")
      .set("Authorization", "Bearer valid-token")
      .send({ message: "Bug found", kind: "off", type: "bug" });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const [labelUrl, labelInit] = fetchMock.mock.calls[0];
    expect(String(labelUrl)).toBe("https://api.github.com/repos/org/repo/labels");
    expect(JSON.parse((labelInit as RequestInit).body as string).name).toBe("reporter:sarah-c");

    const [issueUrl, issueInit] = fetchMock.mock.calls[1];
    expect(String(issueUrl)).toBe("https://api.github.com/repos/org/repo/issues");
    const issueBody = JSON.parse((issueInit as RequestInit).body as string);
    expect(issueBody.labels).toEqual(["bug", "feedback", "reporter:sarah-c"]);
    expect(issueBody.body).toContain("- **Submitted By:** Sarah");
    expect(issueBody.body).not.toContain("Sarah Carvajal");
    expect(issueBody.body).not.toContain("sarah@example.com");

    const saved = Object.values(getCollection("feedback"))[0];
    expect(saved.userEmail).toBeUndefined();
    expect(saved.reporterLabel).toBe("reporter:sarah-c");
  });

  it("still creates the issue when reporter label creation fails", async () => {
    vi.stubEnv("GITHUB_TOKEN", "gh-token");
    vi.stubEnv("GITHUB_REPO", "org/repo");
    mockVerifyIdToken.mockResolvedValueOnce({ uid: "uid-ada", email: "ada@example.com", name: "Ada Lovelace" });
    fetchMock.mockImplementation((input: any) => {
      const url = String(input);
      if (url.endsWith("/labels")) {
        return Promise.resolve(new Response("label failure", { status: 500 }));
      }
      return Promise.resolve(new Response(JSON.stringify({ html_url: "https://github.com/org/repo/issues/43", number: 43 }), { status: 201 }));
    });

    const res = await request(app)
      .post("/api/feedback")
      .set("Authorization", "Bearer valid-token")
      .send({ message: "Idea", kind: "idea" });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const issueInit = fetchMock.mock.calls[1][1] as RequestInit;
    const issueBody = JSON.parse(issueInit.body as string);
    expect(issueBody.labels).toEqual(["enhancement", "feedback"]);
  });

  it("keeps the full feedback message in the GitHub issue title", async () => {
    vi.stubEnv("GITHUB_TOKEN", "gh-token");
    vi.stubEnv("GITHUB_REPO", "org/repo");
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ html_url: "https://github.com/org/repo/issues/43", number: 43 }), { status: 201 })
    );

    const longMsg = "x".repeat(120);
    const res = await request(app).post("/api/feedback").send({ message: longMsg, kind: "bug" });
    expect(res.status).toBe(200);

    const [_, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.title).toBe(`[Feedback] bug: ${longMsg}`);
  });

  it("truncates the GitHub issue title only at the 512-character API limit", async () => {
    vi.stubEnv("GITHUB_TOKEN", "gh-token");
    vi.stubEnv("GITHUB_REPO", "org/repo");
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ html_url: "https://github.com/org/repo/issues/44", number: 44 }), { status: 201 })
    );

    const longMsg = "x".repeat(1000);
    const res = await request(app).post("/api/feedback").send({ message: longMsg, kind: "bug" });
    expect(res.status).toBe(200);

    const [_, init] = fetchMock.mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.title.length).toBe(512);
    expect(body.title.endsWith("…")).toBe(true);
  });

  it("uses the authenticated Firebase user when an Authorization header is present", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "uid-1", email: "sarah@example.com", name: "Sarah Carvajal" });
    const res = await request(app)
      .post("/api/feedback")
      .set("Authorization", "Bearer valid-token")
      .send({ message: "hello" });
    expect(res.status).toBe(200);
    const saved = Object.values(getCollection("feedback"))[0];
    expect(saved.userId).toBe("uid-1");
    expect(saved.userEmail).toBeUndefined();
    expect(saved.reporterLabel).toBe("reporter:sarah-c");
  });

  it("returns 401 when token verification fails", async () => {
    mockVerifyIdToken.mockRejectedValue(new Error("invalid token"));
    const res = await request(app)
      .post("/api/feedback")
      .set("Authorization", "Bearer bad-token")
      .send({ message: "hello" });
    expect(res.status).toBe(401);
    expect(res.body.error).toContain("Unauthorized");
  });

  // ── Screenshots: stored for admins, never published (ADR 0018 decision 7) ──
  describe("screenshots", () => {
    const JPEG = "data:image/jpeg;base64,";
    const SHOT = `${JPEG}abc123`;

    it("stores a valid screenshot on the feedback document", async () => {
      const res = await request(app).post("/api/feedback").send({ message: "with shot", screenshot: SHOT });
      expect(res.status).toBe(200);
      expect(Object.values(getCollection("feedback"))[0].screenshot).toBe(SHOT);
    });

    it("never puts the screenshot in the GitHub issue", async () => {
      vi.stubEnv("GITHUB_TOKEN", "gh-token");
      vi.stubEnv("GITHUB_REPO", "org/repo");
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ html_url: "https://github.com/org/repo/issues/50", number: 50 }), { status: 201 })
      );

      const res = await request(app).post("/api/feedback").send({ message: "with shot", kind: "bug", screenshot: SHOT });
      expect(res.status).toBe(200);

      // The screenshot reached Firestore...
      expect(Object.values(getCollection("feedback"))[0].screenshot).toBe(SHOT);

      // ...but appears nowhere in the outbound GitHub payload.
      const issuePayload = fetchMock.mock.calls[0][1] as RequestInit;
      const raw = issuePayload.body as string;
      expect(raw).not.toContain(SHOT);
      expect(raw).not.toContain("abc123");
      expect(raw).not.toContain("base64");
      // The body only says one was captured; no embed, link or image data.
      const body = JSON.parse(raw).body as string;
      expect(body.match(/screenshot/gi)).toHaveLength(1);
      expect(body).toContain("- **Screenshot:** Captured (see the admin feedback list)");
    });

    it.each([
      ["an oversized capture", JPEG + "x".repeat(200000)],
      ["a bare base64 string with no data URL prefix", "abc123"],
      ["an svg data URL", "data:image/svg+xml;base64,abc"],
      ["a non-string", 12345],
    ])("drops %s without failing the submission", async (_label, screenshot) => {
      const res = await request(app).post("/api/feedback").send({ message: "bad shot", screenshot });
      expect(res.status).toBe(200);
      const saved = Object.values(getCollection("feedback"))[0];
      expect(saved.screenshot).toBeUndefined();
      expect(saved.message).toBe("bad shot");
    });

    it("omits the field entirely when no screenshot is sent", async () => {
      const res = await request(app).post("/api/feedback").send({ message: "no shot" });
      expect(res.status).toBe(200);
      expect(Object.values(getCollection("feedback"))[0]).not.toHaveProperty("screenshot");
    });
  });

  // ── Page URL: stored whole, published redacted (issue #1143 (from #1120/#1121)) ──
  describe("page URL", () => {
    const PEOPLE_URL = "https://cisa-campus-work-tracker.pages.dev/people/EmjcTrASeiV11WaNhXCG";

    const publishIssue = () => {
      vi.stubEnv("GITHUB_TOKEN", "gh-token");
      vi.stubEnv("GITHUB_REPO", "org/repo");
      fetchMock.mockResolvedValue(
        new Response(JSON.stringify({ html_url: "https://github.com/org/repo/issues/51", number: 51 }), { status: 201 })
      );
    };

    it("keeps the whole URL on the Firestore doc, where admins need it", async () => {
      const res = await request(app).post("/api/feedback").send({ message: "broken", url: PEOPLE_URL });
      expect(res.status).toBe(200);
      expect(Object.values(getCollection("feedback"))[0].url).toBe(PEOPLE_URL);
    });

    it("never puts a contact id in the GitHub issue", async () => {
      publishIssue();

      const res = await request(app).post("/api/feedback").send({ message: "broken", kind: "bug", url: PEOPLE_URL });
      expect(res.status).toBe(200);

      const raw = (fetchMock.mock.calls[0][1] as RequestInit).body as string;
      expect(raw).not.toContain("EmjcTrASeiV11WaNhXCG");
      expect(JSON.parse(raw).body).toContain("/people/:id");
    });

    it("still publishes the route of a page that carries no id", async () => {
      publishIssue();

      const res = await request(app)
        .post("/api/feedback")
        .send({ message: "broken", kind: "bug", url: "https://cisa-campus-work-tracker.pages.dev/visits" });
      expect(res.status).toBe(200);

      const raw = (fetchMock.mock.calls[0][1] as RequestInit).body as string;
      expect(JSON.parse(raw).body).toContain("/visits");
    });
  });
});

describe("POST /api/webhook/github", () => {
  const issueUrl = "https://github.com/a/b/issues/7";
  const closedPayload = { action: "closed", issue: { html_url: issueUrl, state_reason: "completed" } };

  it("returns 401 when the signature header is missing", async () => {
    vi.stubEnv("GITHUB_WEBHOOK_SECRET", "sekret");
    const res = await request(app).post("/api/webhook/github").send(closedPayload);
    expect(res.status).toBe(401);
  });

  it("returns 403 when the signature does not match", async () => {
    vi.stubEnv("GITHUB_WEBHOOK_SECRET", "sekret");
    const res = await request(app)
      .post("/api/webhook/github")
      .set("x-hub-signature-256", "sha256=deadbeef")
      .send(closedPayload);
    expect(res.status).toBe(403);
  });

  it("returns 403, not 500, for a signature of a different length", async () => {
    vi.stubEnv("GITHUB_WEBHOOK_SECRET", "sekret");
    const res = await request(app)
      .post("/api/webhook/github")
      .set("x-hub-signature-256", "sha256=" + "0".repeat(64) + "00")
      .send(closedPayload);
    expect(res.status).toBe(403);
  });

  it("ignores non-issues events", async () => {
    vi.stubEnv("GITHUB_WEBHOOK_SECRET", "sekret");
    const res = await request(app)
      .post("/api/webhook/github")
      .set("x-github-event", "ping")
      .set("x-hub-signature-256", sign(closedPayload, "sekret"))
      .send(closedPayload);
    expect(res.status).toBe(200);
    expect(res.body.message).toContain("Ignored event type");
  });

  it("sets outcome to shipped, marks resolved, and writes a notification when closed normally", async () => {
    vi.stubEnv("GITHUB_WEBHOOK_SECRET", "sekret");
    seedDoc("feedback", "fb-9", { userId: "user-ada", status: "in_progress", githubIssueUrl: issueUrl });
    const res = await request(app)
      .post("/api/webhook/github")
      .set("x-github-event", "issues")
      .set("x-hub-signature-256", sign(closedPayload, "sekret"))
      .send(closedPayload);
    expect(res.status).toBe(200);
    expect(res.body.matchedDocsCount).toBe(1);
    expect(res.body.updates).toMatchObject({ status: "resolved", outcome: "shipped" });
    expect(getCollection("feedback")["fb-9"].status).toBe("resolved");
    expect(getCollection("feedback")["fb-9"].outcome).toBe("shipped");
    expect(getCollection("feedback")["fb-9"].archived).toBeFalsy();

    // Check notification was sent to user
    const notifications = Object.values(getCollection("notifications"));
    const userNotifs = notifications.filter((n: any) => n.userId === "user-ada");
    expect(userNotifs).toHaveLength(1);
    expect(userNotifs[0].message).toBe("This shipped! Thank you for helping shape the app.");
    expect(userNotifs[0].link).toBe("/feedback");
  });

  it("sets outcome to not-planned without archiving when closed with state_reason: not_planned", async () => {
    vi.stubEnv("GITHUB_WEBHOOK_SECRET", "sekret");
    seedDoc("feedback", "fb-10", { userId: "user-bob", status: "in_progress", githubIssueUrl: issueUrl });
    const payload = { action: "closed", issue: { html_url: issueUrl, state_reason: "not_planned" } };
    const res = await request(app)
      .post("/api/webhook/github")
      .set("x-github-event", "issues")
      .set("x-hub-signature-256", sign(payload, "sekret"))
      .send(payload);
    expect(res.status).toBe(200);
    expect(getCollection("feedback")["fb-10"].status).toBe("resolved");
    expect(getCollection("feedback")["fb-10"].outcome).toBe("not-planned");
    expect(getCollection("feedback")["fb-10"].archived).toBeFalsy();

    const notifications = Object.values(getCollection("notifications"));
    const userNotifs = notifications.filter((n: any) => n.userId === "user-bob");
    expect(userNotifs).toHaveLength(1);
    expect(userNotifs[0].message).toBe("We looked into this and aren't planning to build it right now, but thank you for speaking up.");
    expect(userNotifs[0].link).toBe("/feedback");
  });

  it("sets outcome to already-there when already-exists label is present (label beats state_reason)", async () => {
    vi.stubEnv("GITHUB_WEBHOOK_SECRET", "sekret");
    seedDoc("feedback", "fb-label", { userId: "user-clara", status: "in_progress", githubIssueUrl: issueUrl });
    const payload = {
      action: "closed",
      issue: {
        html_url: issueUrl,
        state_reason: "not_planned",
        labels: [{ name: "bug" }, { name: "already-exists" }],
      },
    };
    const res = await request(app)
      .post("/api/webhook/github")
      .set("x-github-event", "issues")
      .set("x-hub-signature-256", sign(payload, "sekret"))
      .send(payload);
    expect(res.status).toBe(200);
    expect(getCollection("feedback")["fb-label"].status).toBe("resolved");
    expect(getCollection("feedback")["fb-label"].outcome).toBe("already-there");
    expect(getCollection("feedback")["fb-label"].archived).toBeFalsy();

    const notifications = Object.values(getCollection("notifications"));
    const userNotifs = notifications.filter((n: any) => n.userId === "user-clara");
    expect(userNotifs).toHaveLength(1);
    expect(userNotifs[0].message).toBe("This is already in the app! Ask someone on the team and we'll show you where it lives.");
    expect(userNotifs[0].link).toBe("/feedback");
  });

  it("reopens feedback when the issue is reopened, clears outcome, and does not send notification", async () => {
    vi.stubEnv("GITHUB_WEBHOOK_SECRET", "sekret");
    seedDoc("feedback", "fb-11", { userId: "user-dan", status: "resolved", outcome: "shipped", githubIssueUrl: issueUrl });
    const payload = { action: "reopened", issue: { html_url: issueUrl } };
    const res = await request(app)
      .post("/api/webhook/github")
      .set("x-github-event", "issues")
      .set("x-hub-signature-256", sign(payload, "sekret"))
      .send(payload);
    expect(res.status).toBe(200);
    expect(getCollection("feedback")["fb-11"].status).toBe("in_progress");
    expect(getCollection("feedback")["fb-11"].archived).toBe(false);
    expect(getCollection("feedback")["fb-11"].outcome).toBeUndefined();

    const notifications = Object.values(getCollection("notifications"));
    const userNotifs = notifications.filter((n: any) => n.userId === "user-dan");
    expect(userNotifs).toHaveLength(0);
  });

  it("returns a no-match message when no feedback doc references the issue", async () => {
    const res = await request(app)
      .post("/api/webhook/github")
      .set("x-github-event", "issues")
      .send(closedPayload);
    expect(res.status).toBe(200);
    expect(res.body.message).toContain("No matching feedback document found");
  });
});

describe("Quick Add key and unconfigured webhooks (security decisions, Nov 2026)", () => {
  it("refuses the GitHub webhook in production when its secret is not set", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const res = await request(app)
      .post("/api/webhook/github")
      .set("x-github-event", "issues")
      .send({ action: "closed", issue: { html_url: "https://github.com/a/b/issues/7" } });
    expect(res.status).toBe(503);
  });
});

describe("POST /api/signup-notify", () => {
  const recentSignup = (overrides: Record<string, unknown> = {}) => ({
    name: "Naomi Park",
    tags: ["New Sign Up"],
    createdTime: new Date().toISOString(),
    ...overrides,
  });
  const alerts = () =>
    Object.values(getCollection("notifications")).filter((n: any) => n.userId === "ALL_ADMINS");

  it("writes one Full-timer alert for a fresh public sign-up, worded by the server", async () => {
    seedDoc("contacts", "c-new", recentSignup());
    const res = await request(app).post("/api/signup-notify").send({ contactId: "c-new" });
    expect(res.status).toBe(200);
    expect(alerts()).toHaveLength(1);
    expect(alerts()[0]).toMatchObject({
      title: "New Student Sign-up",
      message: "Naomi Park has signed up via the public form.",
      type: "event",
    });
  });

  it("sends the alert only once for the same sign-up", async () => {
    seedDoc("contacts", "c-new", recentSignup());
    await request(app).post("/api/signup-notify").send({ contactId: "c-new" });
    const again = await request(app).post("/api/signup-notify").send({ contactId: "c-new" });
    expect(again.status).toBe(200);
    expect(alerts()).toHaveLength(1);
  });

  it("refuses a contact that is not a public sign-up", async () => {
    seedDoc("contacts", "c-other", recentSignup({ tags: ["Friend"] }));
    const res = await request(app).post("/api/signup-notify").send({ contactId: "c-other" });
    expect(res.status).toBe(404);
    expect(alerts()).toHaveLength(0);
  });

  it("refuses an old sign-up, so past contacts cannot be replayed into alerts", async () => {
    seedDoc("contacts", "c-old", recentSignup({ createdTime: "2026-01-01T00:00:00.000Z" }));
    const res = await request(app).post("/api/signup-notify").send({ contactId: "c-old" });
    expect(res.status).toBe(404);
    expect(alerts()).toHaveLength(0);
  });

  it("refuses a missing or malformed id", async () => {
    expect((await request(app).post("/api/signup-notify").send({})).status).toBe(400);
    expect((await request(app).post("/api/signup-notify").send({ contactId: "../x" })).status).toBe(400);
  });
});

describe("POST /api/smart-import/commit", () => {
  it("successfully commits contacts to Firestore", async () => {
    const res = await request(app)
      .post("/api/smart-import/commit")
      .send({
        contacts: [{ tempId: "c1", name: "Alice", email: "alice@test.com" }],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.summary).toEqual({ contactsCount: 1 });
  });

  it("ignores a legacy interactions or discussions payload", async () => {
    const res = await request(app)
      .post("/api/smart-import/commit")
      .send({
        contacts: [],
        interactions: [{ tempId: "i1", content: "Met for coffee" }],
        discussions: [{ tempId: "d1", title: "Strategy", content: "Notes" }],
      });

    expect(res.status).toBe(200);
    expect(res.body.summary).toEqual({ contactsCount: 0 });
    expect(Object.keys(getCollection("board_docs"))).toHaveLength(0);
  });

  // #1024 phase 4: the import stamps `createdBy`, so it owes the same write a
  // derived `visibleTo` -- otherwise every imported contact is invisible to
  // the person who imported it.
  it("stamps visibleTo on the contacts it creates", async () => {
    const res = await request(app)
      .post("/api/smart-import/commit")
      .send({ contacts: [{ tempId: "c1", name: "Alice", email: "alice@test.com" }] });
    expect(res.status).toBe(200);

    const created = Object.values(getCollection("contacts"))[0] as Record<string, unknown>;
    expect(typeof created.createdBy).toBe("string");
    expect(created.visibleTo).toEqual(visibleToOf(created as Parameters<typeof visibleToOf>[0]));
  });

  // #1345: an import used to stamp 'Student' on anyone the model gave no role.
  it("writes no role on the contacts it creates", async () => {
    const res = await request(app)
      .post("/api/smart-import/commit")
      .send({ contacts: [{ tempId: "c1", name: "Alice", role: "Trainee" }] });
    expect(res.status).toBe(200);

    expect(Object.values(getCollection("contacts"))[0]).not.toHaveProperty("role");
  });
});

describe("POST /api/analyze-notes", () => {
  it("returns 400 when text is missing", async () => {
    const res = await request(app).post("/api/analyze-notes").send({});
    expect(res.status).toBe(400);
  });

  it("returns updated markdown and suggested tasks from Gemini", async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({ updatedMarkdown: "See [Jane](/contacts/c1)", suggestedTasks: [{ title: "Call Jane", priority: "high" }] }),
    });
    const res = await request(app).post("/api/analyze-notes").send({ text: "Talked with Jane about outreach." });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.updatedMarkdown).toContain("/contacts/c1");
    expect(res.body.suggestedTasks).toHaveLength(1);
  });

  it("returns 500 when Gemini returns no text", async () => {
    mockGenerateContent.mockResolvedValue({ text: "" });
    const res = await request(app).post("/api/analyze-notes").send({ text: "Notes here" });
    expect(res.status).toBe(500);
    expect(res.body.error).toContain("No response returned from the Gemini API");
  });

  it("returns 500 when Gemini returns invalid JSON", async () => {
    mockGenerateContent.mockResolvedValue({ text: "not json at all" });
    const res = await request(app).post("/api/analyze-notes").send({ text: "Notes here" });
    expect(res.status).toBe(500);
    expect(res.body.error).toContain("Failed to parse AI response");
  });
});

describe("POST /api/smart-import/parse", () => {
  it("returns 400 when text is missing", async () => {
    const res = await request(app).post("/api/smart-import/parse").send({});
    expect(res.status).toBe(400);
  });

  it("returns parsed contacts, interactions and discussions", async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({ contacts: [{ tempId: "c1", name: "Amy" }], interactions: [], discussions: [] }),
    });
    const res = await request(app).post("/api/smart-import/parse").send({ text: "Met Amy today." });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.contacts).toHaveLength(1);
  });

  it("returns 500 when Gemini returns no text", async () => {
    mockGenerateContent.mockResolvedValue({ text: "" });
    const res = await request(app).post("/api/smart-import/parse").send({ text: "Met Amy today." });
    expect(res.status).toBe(500);
    expect(res.body.error).toContain("No response returned from Gemini API");
  });
});

describe("POST /api/mint-custom-token", () => {
  it("returns 401 without an Authorization header", async () => {
    const res = await request(app).post("/api/mint-custom-token");
    expect(res.status).toBe(401);
  });

  it("mints a custom token for the authenticated user", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "uid-42" });
    const res = await request(app).post("/api/mint-custom-token").set("Authorization", "Bearer tok");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, token: "minted-token" });
    expect(mockCreateCustomToken).toHaveBeenCalledWith("uid-42");
  });

  it("returns 401 when minting the custom token fails", async () => {
    mockCreateCustomToken.mockRejectedValue(new Error("mint failed"));
    const res = await request(app).post("/api/mint-custom-token").set("Authorization", "Bearer tok");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
  });
});

describe("authorizeAdmin role enforcement", () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    process.env.NODE_ENV = "production";
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it("returns 403 when user does not exist in users collection", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "non-existent-user", email: "user@example.com" });
    const res = await request(app)
      .post("/api/smart-import/parse")
      .set("Authorization", "Bearer tok")
      .send({ text: "Met someone" });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("User does not exist");
  });

  it("refuses the test account purge to anyone but a Full-timer", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "trainee-1", email: "trainee@example.com" });
    seedDoc("users", "trainee-1", { role: "operator" });
    const res = await request(app)
      .post("/api/test-account-purge")
      .set("Authorization", "Bearer tok")
      .send({ dryRun: true });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("not an administrator");
  });

  it("purges only what the preview showed, refusing a changed scan (Nov 2026)", async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: "founder-1",
      email: "yilongwang05@gmail.com",
      email_verified: true,
      firebase: { sign_in_second_factor: "totp" },
    });
    const empty = { accounts: [], logins: [], invitations: [], personal: [], interactions: [], notes: [], chats: [], activity: [], asks: [], feedback: [], contacts: [], keptSelf: [] };
    const before = { ...empty, accounts: ["users/rev"], accountLabels: ["reviewer@gmail.com"] };
    const after = { ...empty, accounts: ["users/rev", "users/new"], accountLabels: ["reviewer@gmail.com", "cisa-new@gmail.com"] };
    const scan = vi.spyOn(TestAccountPurgeEngine.prototype, "scan").mockResolvedValue(before as any);
    const purge = vi
      .spyOn(TestAccountPurgeEngine.prototype, "purge")
      .mockResolvedValue({ deletedCount: 1, failed: [] } as any);
    try {
      const call = (body: Record<string, unknown>) =>
        request(app).post("/api/test-account-purge").set("Authorization", "Bearer tok").send(body);

      const preview = await call({ dryRun: true });
      expect(preview.status).toBe(200);
      expect(typeof preview.body.fingerprint).toBe("string");

      // No fingerprint, or a wrong one: nothing is deleted.
      expect((await call({})).status).toBe(409);
      expect((await call({ fingerprint: "nope" })).status).toBe(409);

      // Something new appeared after the preview.
      scan.mockResolvedValue(after as any);
      const stale = await call({ fingerprint: preview.body.fingerprint });
      expect(stale.status).toBe(409);
      expect(stale.body.plan.accountLabels).toContain("cisa-new@gmail.com");
      expect(purge).not.toHaveBeenCalled();

      const ok = await call({ fingerprint: stale.body.fingerprint });
      expect(ok.status).toBe(200);
      expect(purge).toHaveBeenCalledTimes(1);
    } finally {
      scan.mockRestore();
      purge.mockRestore();
    }
  });

  it("returns 403 when user has non-admin role", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "trainee-1", email: "trainee@example.com" });
    seedDoc("users", "trainee-1", { role: "trainee" });
    const res = await request(app)
      .post("/api/smart-import/parse")
      .set("Authorization", "Bearer tok")
      .send({ text: "Met someone" });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("not an administrator");
  });

  it("allows the founder email without a users doc", async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: "founder-1",
      email: "yilongwang05@gmail.com",
      email_verified: true,
      firebase: { sign_in_second_factor: "totp" },
    });
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify({ contacts: [] }) });
    const res = await request(app)
      .post("/api/smart-import/parse")
      .set("Authorization", "Bearer tok")
      .send({ text: "Met someone" });
    expect(res.status).toBe(200);
  });

  it("does not treat an unverified founder email as the owner", async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: "impostor-1",
      email: "yilongwang05@gmail.com",
      email_verified: false,
      firebase: { sign_in_second_factor: "totp" },
    });
    const res = await request(app)
      .post("/api/smart-import/parse")
      .set("Authorization", "Bearer tok")
      .send({ text: "Met someone" });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("User does not exist");
  });

  it("refuses Smart Import parsing to anyone but a Full-timer", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "student-1", email: "s@example.com" });
    seedDoc("users", "student-1", { role: "operator" });
    seedDoc("contacts", "c-secret", { name: "Private Person", phone: "5550001111" });
    const res = await request(app)
      .post("/api/smart-import/parse")
      .set("Authorization", "Bearer tok")
      .send({ text: "List everyone" });
    expect(res.status).toBe(403);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it("refuses Smart Import commits to anyone but a Full-timer", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "student-2", email: "s2@example.com" });
    seedDoc("users", "student-2", { role: "operator" });
    seedDoc("contacts", "c-other", { name: "Someone Else", visibleTo: ["other-user"] });
    const res = await request(app)
      .post("/api/smart-import/commit")
      .set("Authorization", "Bearer tok")
      .send({ interactions: [{ contactId: "c-other", content: "injected" }] });
    expect(res.status).toBe(403);
    expect(Object.keys(getCollection("contacts/c-other/interactions"))).toHaveLength(0);
  });

  it("allows a user whose users doc has role admin", async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: "admin-1",
      email: "admin@example.com",
      firebase: { sign_in_second_factor: "totp" },
    });
    seedDoc("users", "admin-1", { role: "admin" });
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify({ contacts: [] }) });
    const res = await request(app)
      .post("/api/smart-import/parse")
      .set("Authorization", "Bearer tok")
      .send({ text: "Met someone" });
    expect(res.status).toBe(200);
  });

  it("rejects an admin whose token did not complete a second factor", async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: "admin-2",
      email: "admin@example.com",
      firebase: { sign_in_provider: "password" },
    });
    seedDoc("users", "admin-2", { role: "admin" });
    const res = await request(app)
      .post("/api/smart-import/parse")
      .set("Authorization", "Bearer tok")
      .send({ text: "Met someone" });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Multi-factor authentication required");
  });
});

describe("POST /api/feedback — GitHub failure and auth paths", () => {
  it("logs and continues when the GitHub issue creation API fails", async () => {
    vi.stubEnv("GITHUB_TOKEN", "gh-token");
    vi.stubEnv("GITHUB_REPO", "org/repo");
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValue(new Response("rate limited", { status: 429 }));

    const res = await request(app).post("/api/feedback").send({ message: "Bug", kind: "bug" });
    expect(res.status).toBe(200);
    expect(res.body.githubIssueUrl).toBe("");
    expect(res.body.status).toBe("new");
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("GitHub API error creating issue"));
    errSpy.mockRestore();
  });

  it("logs when the GitHub issue creation fetch throws", async () => {
    vi.stubEnv("GITHUB_TOKEN", "gh-token");
    vi.stubEnv("GITHUB_REPO", "org/repo");
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockRejectedValue(new Error("network down"));

    const res = await request(app).post("/api/feedback").send({ message: "Bug", kind: "bug" });
    expect(res.status).toBe(200);
    expect(res.body.githubIssueUrl).toBe("");
    expect(errSpy).toHaveBeenCalledWith("Failed to auto-create GitHub issue:", expect.any(Error));
    errSpy.mockRestore();
  });

  it("returns 500 when Firebase Admin cannot initialize", async () => {
    const fsSpy = vi.spyOn(fs, "existsSync").mockReturnValue(false);
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const res = await request(app).post("/api/feedback").send({ message: "Boom" });
    expect(res.status).toBe(500);
    expect(res.body.error).toContain("Firebase Admin failed to start");
    fsSpy.mockRestore();
    errSpy.mockRestore();
  });

  it("returns 401 without an Authorization header outside test mode", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const res = await request(app).post("/api/feedback").send({ message: "hello" });
    expect(res.status).toBe(401);
    expect(res.body.error).toContain("Authorization header is required");
    process.env.NODE_ENV = originalEnv;
  });
});

describe("POST /api/webhook/github — payload edge cases", () => {
  const issueUrl = "https://github.com/a/b/issues/7";

  it("returns 500 when the raw body is unavailable for signature verification", async () => {
    vi.stubEnv("GITHUB_WEBHOOK_SECRET", "sekret");
    const res = await request(app)
      .post("/api/webhook/github")
      .set("x-hub-signature-256", "sha256=abc")
      .set("content-type", "text/plain")
      .send("not json");
    expect(res.status).toBe(500);
    expect(res.body.error).toContain("Raw body not available");
  });

  it("returns 400 when the issues payload has no html_url", async () => {
    vi.stubEnv("GITHUB_WEBHOOK_SECRET", "sekret");
    const payload = { action: "closed", issue: { state_reason: "completed" } };
    const res = await request(app)
      .post("/api/webhook/github")
      .set("x-github-event", "issues")
      .set("x-hub-signature-256", sign(payload, "sekret"))
      .send(payload);
    expect(res.status).toBe(400);
  });

  it("ignores unrecognized issue actions", async () => {
    vi.stubEnv("GITHUB_WEBHOOK_SECRET", "sekret");
    seedDoc("feedback", "fb-labeled", { status: "new", githubIssueUrl: issueUrl });
    const payload = { action: "labeled", issue: { html_url: issueUrl } };
    const res = await request(app)
      .post("/api/webhook/github")
      .set("x-github-event", "issues")
      .set("x-hub-signature-256", sign(payload, "sekret"))
      .send(payload);
    expect(res.status).toBe(200);
    expect(res.body.message).toContain("Ignored action: labeled");
  });
});

describe("POST /api/analyze-notes — prompt composition", () => {
  it("includes the contact directory and user roster in the Gemini prompt", async () => {
    seedDoc("contacts", "c-a", { name: "Zoe Pratt" });
    seedDoc("users", "u-a", { displayName: "Alex Admin" });
    seedDoc("users", "u-b", { email: "pending@example.com", approved: false });
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify({ updatedMarkdown: "", suggestedTasks: [] }) });

    const res = await request(app).post("/api/analyze-notes").send({ text: "Notes" });
    expect(res.status).toBe(200);
    const contents = mockGenerateContent.mock.calls[0][0].contents as string;
    expect(contents).toContain("Zoe Pratt");
    expect(contents).toContain("Alex Admin");
    expect(contents).not.toContain("pending@example.com");
  });
});

describe("POST /api/smart-import/parse — prompt composition", () => {
  it("includes contact emails and phones in the parse prompt and skips unnamed contacts", async () => {
    seedDoc("contacts", "c-x", { name: "Wren Hall", email: "wren@example.com", phone: "555-0101" });
    seedDoc("contacts", "c-y", { email: "no@name.example" });
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify({ contacts: [], interactions: [], discussions: [] }) });

    const res = await request(app).post("/api/smart-import/parse").send({ text: "Met Wren" });
    expect(res.status).toBe(200);
    const contents = mockGenerateContent.mock.calls[0][0].contents as string;
    expect(contents).toContain("wren@example.com");
    expect(contents).toContain("555-0101");
    expect(contents).not.toContain("no@name.example");
  });
});

describe("POST /api/smart-import/commit — matching paths", () => {
  it("trusts a matched contact and writes no duplicate", async () => {
    const res = await request(app).post("/api/smart-import/commit").send({
      contacts: [{ tempId: "c1", name: "Amy", matchedContactId: "existing-1", matchedContactName: "Amy" }],
    });
    expect(res.status).toBe(200);
    expect(res.body.summary.contactsCount).toBe(0);
    expect(Object.values(getCollection("contacts"))).toHaveLength(0);
  });
});

describe("production static serving", () => {
  it("serves the SPA index.html for unknown client routes", async () => {
    vi.stubEnv("NODE_ENV", "production");
    // CI checkouts have no `dist/` build artifact — drop a placeholder so the
    // static-serve branch is exercised regardless of build state.
    const indexPath = path.join(process.cwd(), "dist", "index.html");
    const hadIndex = fs.existsSync(indexPath);
    if (!hadIndex) {
      fs.mkdirSync(path.dirname(indexPath), { recursive: true });
      fs.writeFileSync(indexPath, "<!doctype html><html><body>ci placeholder</body></html>");
    }
    try {
      const prodApp = await createApp();
      const res = await request(prodApp).get("/some/client/route");
      expect(res.status).toBe(200);
      expect(res.headers["content-type"]).toContain("text/html");
    } finally {
      vi.stubEnv("NODE_ENV", "test");
      if (!hadIndex) {
        fs.rmSync(indexPath, { force: true });
        try {
          fs.rmdirSync(path.dirname(indexPath));
        } catch {
          // dist/ still contains other artifacts — leave them.
        }
      }
    }
  });
});

describe("POST /api/webhook/github — issue comments are ignored", () => {
  const issueUrl = "https://github.com/a/b/issues/7";

  it("does not import a GitHub comment into the app", async () => {
    vi.stubEnv("GITHUB_WEBHOOK_SECRET", "sekret");
    seedDoc("feedback", "fb-9", { userId: "user-ada", status: "in_progress", githubIssueUrl: issueUrl });

    const body = {
      action: "created",
      issue: { html_url: issueUrl },
      comment: { id: 99, body: "We investigated and found the fix.", author_association: "OWNER" },
    };
    const res = await request(app)
      .post("/api/webhook/github")
      .set("x-github-event", "issue_comment")
      .set("x-hub-signature-256", sign(body, "sekret"))
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.relayedCount).toBeUndefined();
    expect(Object.values(getCollection("feedback/fb-9/replies"))).toHaveLength(0);
    expect(Object.values(getCollection("notifications"))).toHaveLength(0);
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhook/github — the message written at close", () => {
  const issueUrl = "https://github.com/a/b/issues/7";
  const closed = { action: "closed", issue: { html_url: issueUrl, state_reason: "completed" } };

  const post = (body: any = closed) =>
    request(app)
      .post("/api/webhook/github")
      .set("x-github-event", "issues")
      .set("x-hub-signature-256", sign(body, "sekret"))
      .send(body);

  beforeEach(() => {
    vi.stubEnv("GITHUB_WEBHOOK_SECRET", "sekret");
    vi.stubEnv("GITHUB_TOKEN", "ghp_test");
  });

  it("writes the canned sentence and never calls the model", async () => {
    seedDoc("feedback", "fb-9", { userId: "user-ada", status: "in_progress", githubIssueUrl: issueUrl });

    await post();
    expect(getCollection("feedback")["fb-9"].outcomeMessage).toBeUndefined();
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(Object.values(getCollection("notifications"))).toEqual([
      expect.objectContaining({ message: expect.stringContaining("This shipped!") }),
    ]);
  });

  it("does not ping twice when a re-close reaches the same outcome", async () => {
    seedDoc("feedback", "fb-9", {
      userId: "user-ada",
      status: "in_progress",
      githubIssueUrl: issueUrl,
      notifiedOutcome: "shipped",
    });

    await post();
    expect(Object.values(getCollection("notifications"))).toHaveLength(0);
  });

  it("does ping when a re-close reaches a different outcome", async () => {
    seedDoc("feedback", "fb-9", {
      userId: "user-ada",
      status: "in_progress",
      githubIssueUrl: issueUrl,
      notifiedOutcome: "not-planned",
    });

    await post();
    expect(Object.values(getCollection("notifications"))).toHaveLength(1);
    expect(getCollection("feedback")["fb-9"].notifiedOutcome).toBe("shipped");
  });

  it("a reopen clears the outcome but remembers what was said", async () => {
    seedDoc("feedback", "fb-9", {
      userId: "user-ada",
      status: "resolved",
      githubIssueUrl: issueUrl,
      outcome: "shipped",
      notifiedOutcome: "shipped",
    });

    const reopened = { action: "reopened", issue: { html_url: issueUrl } };
    await post(reopened);

    const note = getCollection("feedback")["fb-9"];
    expect(note.outcome).toBeUndefined();
    expect(note.notifiedOutcome).toBe("shipped");
    expect(Object.values(getCollection("notifications"))).toHaveLength(0);
  });
});

describe('GET /api/guest-doc/:docId', () => {
  const live = (permission: 'view' | 'edit', key = 'sec_live_key') => ({
    date: '2026-09-14',
    title: 'Wednesday care',
    md: '# Agenda',
    audience: 'team',
    guestAccess: { enabled: true, key, permission, createdBy: 'u-admin' },
  });

  it('404s an unknown document with no detail', async () => {
    const res = await request(app).get('/api/guest-doc/missing?key=sec_live_key');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'unavailable' });
  });

  it('404s a doc that was never shared or was revoked', async () => {
    seedDoc('board_docs', 'doc-plain', { date: '2026-09-14', title: 'Private', md: '# x' });
    const noShare = await request(app).get('/api/guest-doc/doc-plain?key=sec_live_key');
    expect(noShare.status).toBe(404);

    seedDoc('board_docs', 'doc-off', { ...live('view'), guestAccess: { enabled: false, key: 'sec_live_key', permission: 'view' } });
    const off = await request(app).get('/api/guest-doc/doc-off?key=sec_live_key');
    expect(off.status).toBe(404);
  });

  it('404s a wrong, empty, or repeated key', async () => {
    seedDoc('board_docs', 'doc-v', live('view'));
    expect((await request(app).get('/api/guest-doc/doc-v?key=sec_wrong')).status).toBe(404);
    expect((await request(app).get('/api/guest-doc/doc-v')).status).toBe(404);
    expect((await request(app).get('/api/guest-doc/doc-v?key=sec_live_key&key=sec_other')).status).toBe(404);
  });

  it('serves only the public fields, and no collab token, for a view link', async () => {
    mockCreateCustomToken.mockClear();
    seedDoc('board_docs', 'doc-v2', { ...live('view'), facilitatorId: 'u-admin', createdByName: 'Admin' });
    const res = await request(app).get('/api/guest-doc/doc-v2?key=sec_live_key');
    expect(res.status).toBe(200);
    expect(res.body.permission).toBe('view');
    expect(res.body.collabToken).toBeUndefined();
    expect(res.body.doc).toEqual({ id: 'doc-v2', title: 'Wednesday care', date: '2026-09-14', audience: 'team', md: '# Agenda' });
    expect(res.body.doc.guestAccess).toBeUndefined();
    expect(res.body.doc.createdByName).toBeUndefined();
    expect(mockCreateCustomToken).not.toHaveBeenCalled();
  });

  it('coerces a missing audience to team and missing fields to safe defaults', async () => {
    seedDoc('board_docs', 'doc-bare', { guestAccess: { enabled: true, key: 'sec_bare', permission: 'view' } });
    const res = await request(app).get('/api/guest-doc/doc-bare?key=sec_bare');
    expect(res.body.doc).toEqual({ id: 'doc-bare', title: '', date: '', audience: 'team', md: '' });
  });

  it('returns a doc-scoped collab token for an edit link', async () => {
    seedDoc('board_docs', 'doc-e', live('edit'));
    const res = await request(app).get('/api/guest-doc/doc-e?key=sec_live_key');
    expect(res.status).toBe(200);
    expect(res.body.permission).toBe('edit');
    expect(res.body.collabToken).toBe('minted-token');
    expect(mockCreateCustomToken).toHaveBeenCalledWith(
      expect.stringMatching(/^guest_/),
      { guest: true, guestDoc: 'doc-e' },
    );
  });

  it('still serves an edit link when the collab token cannot be minted', async () => {
    seedDoc('board_docs', 'doc-e2', live('edit'));
    mockCreateCustomToken.mockRejectedValueOnce(new Error('no service account'));
    const res = await request(app).get('/api/guest-doc/doc-e2?key=sec_live_key');
    expect(res.status).toBe(200);
    expect(res.body.collabToken).toBeUndefined();
  });
});

describe('POST /api/guest-doc/:docId', () => {
  const editDoc = () => ({
    date: '2026-09-14',
    title: 'Wednesday care',
    md: '# Old',
    audience: 'team',
    guestAccess: { enabled: true, key: 'sec_edit_key', permission: 'edit' },
  });

  it('persists markdown for a valid edit key with attribution', async () => {
    seedDoc('board_docs', 'doc-w1', editDoc());
    const res = await request(app)
      .post('/api/guest-doc/doc-w1')
      .send({ key: 'sec_edit_key', md: '# New agenda', name: '  Pastor John  ' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });
    const saved = getCollection('board_docs')['doc-w1'];
    expect(saved.md).toBe('# New agenda');
    expect(saved.updatedBy).toBe('guest');
    expect(saved.updatedByName).toBe('Pastor John');
  });

  it('rejects a wrong key, a view-only link, and a missing doc', async () => {
    seedDoc('board_docs', 'doc-w2', editDoc());
    expect((await request(app).post('/api/guest-doc/doc-w2').send({ key: 'sec_nope', md: '# x' })).status).toBe(404);
    seedDoc('board_docs', 'doc-w3', { ...editDoc(), guestAccess: { enabled: true, key: 'sec_view_key', permission: 'view' } });
    expect((await request(app).post('/api/guest-doc/doc-w3').send({ key: 'sec_view_key', md: '# x' })).status).toBe(404);
    expect((await request(app).post('/api/guest-doc/doc-none').send({ key: 'sec_edit_key', md: '# x' })).status).toBe(404);
    expect(getCollection('board_docs')['doc-w2'].md).toBe('# Old');
  });

  it('rejects a missing or oversized markdown body', async () => {
    seedDoc('board_docs', 'doc-w4', editDoc());
    expect((await request(app).post('/api/guest-doc/doc-w4').send({ key: 'sec_edit_key' })).status).toBe(400);
    expect((await request(app).post('/api/guest-doc/doc-w4').send({ key: 'sec_edit_key', md: 'x'.repeat(100001) })).status).toBe(400);
    expect(getCollection('board_docs')['doc-w4'].md).toBe('# Old');
  });

  it('falls back to a generic guest name', async () => {
    seedDoc('board_docs', 'doc-w5', editDoc());
    await request(app).post('/api/guest-doc/doc-w5').send({ key: 'sec_edit_key', md: '# New' });
    expect(getCollection('board_docs')['doc-w5'].updatedByName).toBe('Guest');
  });
});

describe("POST /api/attendance-sync", () => {
  const sha256 = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

  const attdPayload = {
    attdEventId: "attd-event-1",
    eventName: "Wednesday Bible Study",
    frequency: "Weekly",
    repeatingDays: ["Wednesday"],
    eventTime: "19:00",
    sessionDate: "2026-09-16",
    records: [
      { memberId: "member-1", attendee: "Alex Chen", status: "present", isLate: false },
      { attendee: "New Person", status: "late", isLate: true },
    ],
  };

  it("rejects a missing or wrong x-sync-token", async () => {
    seedDoc("settings", "integrations", { attdSyncToken: "team-secret" });
    const missing = await request(app).post("/api/attendance-sync").send(attdPayload);
    expect(missing.status).toBe(401);
    const wrong = await request(app)
      .post("/api/attendance-sync")
      .set("x-sync-token", "wrong-secret")
      .send(attdPayload);
    expect(wrong.status).toBe(401);
  });

  it("accepts the token whose SHA-256 matches the stored hash (#1968)", async () => {
    seedDoc("settings", "integrations", { attdSyncTokenHash: sha256("team-secret") });
    const res = await request(app)
      .post("/api/attendance-sync")
      .set("x-sync-token", "team-secret")
      .send(attdPayload);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
  });

  it("rejects a token that does not match the stored hash (#1968)", async () => {
    seedDoc("settings", "integrations", { attdSyncTokenHash: sha256("team-secret") });
    const res = await request(app)
      .post("/api/attendance-sync")
      .set("x-sync-token", "wrong-secret")
      .send(attdPayload);
    expect(res.status).toBe(401);
  });

  it("rejects when the settings document holds neither a hash nor a legacy token (#1968)", async () => {
    seedDoc("settings", "integrations", { attdSyncUrl: "https://example.test/api/attendance-sync" });
    const res = await request(app)
      .post("/api/attendance-sync")
      .set("x-sync-token", "team-secret")
      .send(attdPayload);
    expect(res.status).toBe(401);
  });

  it("rejects a malformed header or stored hash without throwing (#1968)", async () => {
    seedDoc("settings", "integrations", { attdSyncTokenHash: sha256("team-secret") });
    for (const header of ["", "x", "!not-a-token!", "team-secret".repeat(10)]) {
      const res = await request(app)
        .post("/api/attendance-sync")
        .set("x-sync-token", header)
        .send(attdPayload);
      expect(res.status).toBe(401);
    }

    // A stored value that is not a digest must not reach timingSafeEqual with
    // a different length, which would throw instead of answering 401.
    seedDoc("settings", "integrations", { attdSyncTokenHash: "not-a-digest" });
    const res = await request(app)
      .post("/api/attendance-sync")
      .set("x-sync-token", "team-secret")
      .send(attdPayload);
    expect(res.status).toBe(401);
  });

  it("still accepts the legacy plaintext token while it is present (#1968)", async () => {
    seedDoc("settings", "integrations", { attdSyncToken: "team-secret" });
    const res = await request(app)
      .post("/api/attendance-sync")
      .set("x-sync-token", "team-secret")
      .send(attdPayload);
    expect(res.status).toBe(201);
  });

  it("validates required payload fields", async () => {
    seedDoc("settings", "integrations", { attdSyncToken: "team-secret" });
    const res = await request(app)
      .post("/api/attendance-sync")
      .set("x-sync-token", "team-secret")
      .send({ eventName: "Missing ids" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("attdEventId");
  });

  it("stages a pending import with the correlated preview", async () => {
    seedDoc("settings", "integrations", { attdSyncToken: "team-secret" });
    seedDoc("rhythms", "r1", {
      name: "Wednesday Bible Study",
      cadence: { type: "weekly", days: [3] },
      roster: [],
      termStart: "2026-09-01",
      termEnd: "2026-12-31",
      createdAt: "2026-09-01T00:00:00.000Z",
      createdById: "u1",
    });
    seedDoc("events", "e1", {
      name: "Wednesday Bible Study",
      date: "2026-09-16",
      order: 0,
      rhythmId: "r1",
      createdAt: "2026-09-01T00:00:00.000Z",
    });
    seedDoc("contacts", "c1", {
      name: "Alex Chen",
      role: "Student",
      location: "",
      email: "",
      phone: "",
      stage: "Lead",
      lastSeen: "",
      initials: "AC",
    });

    const res = await request(app)
      .post("/api/attendance-sync")
      .set("x-sync-token", "team-secret")
      .send(attdPayload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.preview.rhythmId).toBe("r1");
    expect(res.body.preview.gatheringId).toBe("e1");
    expect(res.body.preview.stats.total).toBe(2);
    expect(res.body.preview.stats.matched).toBe(1);

    const stored = Object.values(getCollection("pending_attendance_imports")) as Array<Record<string, unknown>>;
    expect(stored).toHaveLength(1);
    expect(stored[0].status).toBe("pending");
    expect(stored[0].attdEventId).toBe("attd-event-1");
  });
});

// The contacts seedCombine writes have no updatedAt.
const NO_STAMPS = { keptUpdatedAt: null, combinedInUpdatedAt: null };

// Runs `write` once, straight after the server first reads from `name`: a
// user (or another request) changing something between the server's read
// and its write.
const writeAfterFirstRead = (name: string, write: () => unknown) => {
  const original = mockDb.collection;
  let fired = false;
  const fire = async () => {
    if (fired) return;
    fired = true;
    await write();
  };
  return vi.spyOn(mockDb, "collection").mockImplementation(((col: string) => {
    const c = original(col);
    if (col !== name) return c;
    return {
      ...c,
      get: async () => {
        const snap = await c.get();
        await fire();
        return snap;
      },
      doc: (id?: string) => {
        const d = c.doc(id);
        return {
          ...d,
          get: async () => {
            const snap = await d.get();
            await fire();
            return snap;
          },
        };
      },
    };
  }) as typeof original);
};

const LONG_AGO = "2000-01-01T00:00:00.000Z";

describe("POST /api/combine-contacts", () => {
  const seedCombine = () => {
    seedDoc("contacts", "s1", {
      name: "Kept Name",
      email: "same@x.com",
      phone: "",
      stage: "Lead",
      tags: ["A"],
      location: "",
    });
    seedDoc("contacts", "d1", {
      name: "In Name",
      email: "same@x.com",
      phone: "",
      stage: "Contact",
      tags: ["A", "B"],
      location: "",
      createdAt: "2026-02-01",
    });
    seedDoc("contacts/d1/interactions", "i1", { content: "hi", authorId: "other" });
    seedDoc("contacts/d1/interactions", "i2", { content: "again", authorId: "other" });
    seedDoc("contacts/d1/threads", "t1", { body: "note", authorId: "someone" });
    seedDoc("contacts/d1/teamThreads", "tt1", { body: "team" });
    seedDoc("contacts/d1/comments", "c1", { text: "hey", userId: "other" });
    seedDoc("prayers", "p1", { contactId: "d1", updatedAt: "x" });
    seedDoc("tasks", "k1", { contactId: "d1", contactName: "In Name", text: "Call" });
    seedDoc("visits", "v1", {
      contactIds: ["d1", "s1"],
      contactNames: ["In Name", "Kept Name"],
    });
    seedDoc("events", "e1", {
      name: "Friday Gathering",
      roster: ["d1", "s1"],
      rosterOverride: ["d1"],
      rosterOverrideBase: ["d1"],
      attendance: { present: ["d1"], absent: ["d1"] },
    });
    seedDoc("rhythms", "r1", { name: "Wednesday", roster: ["d1", "other"] });
    seedDoc("homes", "h1", { label: "the Peinados", members: ["d1"] });
    seedDoc("outreach", "o1", {
      date: "2026-02-03",
      names: [{ id: "ON-1", name: "In Name", contactId: "d1" }],
    });
    seedDoc("attendee_aliases", "a1", { attdName: "In", contactId: "d1" });
    seedDoc("pending_attendance_imports", "pi1", {
      status: "pending",
      preview: {
        attendees: [{ contactId: "d1", contactName: "In Name" }],
        conflicts: [{ contactId: "d1" }],
      },
    });
    seedDoc("users", "u2", { role: "trainee", approved: true });
    seedDoc("users/u2/personalPrayers", "pp1", { contactId: "d1", title: "heal" });
    seedDoc("userPreferences", "u2", { personalContactIds: ["d1", "x"] });
    seedDoc("inboxState", "u2", {
      seen: { "att:contact:d1": "t1" },
      completed: { "att:contact:d1": "t2" },
    });
    seedDoc("notifications", "n1", {
      targetId: "d1",
      link: "/people/d1",
      message: "In Name was logged",
    });
    seedDoc("activities", "ac1", {
      targetId: "d1",
      targetName: "In Name",
      targetType: "contact",
      action: "logged an interaction with",
    });
  };

  it("re-points every reference kind, deletes the combined-in contact, and writes a done record", async () => {
    seedCombine();
    const res = await request(app)
      .post("/api/combine-contacts")
      .send({ keptId: "s1", combinedInId: "d1", reason: "Matching email", ...NO_STAMPS });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.combineRecordId).toBeTruthy();

    const contacts = getCollection("contacts");
    expect(contacts["d1"]).toBeUndefined();
    expect(contacts["s1"].tags).toEqual(["A", "B"]);

    // Authors and dates are preserved: the documents move untouched.
    const keptInteractions = getCollection("contacts/s1/interactions");
    expect(keptInteractions["i1"]).toMatchObject({ content: "hi", authorId: "other" });
    expect(keptInteractions["i2"]).toMatchObject({ content: "again", authorId: "other" });
    expect(getCollection("contacts/d1/interactions")["i1"]).toBeUndefined();
    expect(getCollection("contacts/s1/threads")["t1"]).toMatchObject({ authorId: "someone" });
    expect(getCollection("contacts/s1/teamThreads")["tt1"]).toMatchObject({ body: "team" });
    expect(getCollection("contacts/d1/threads")["t1"]).toBeUndefined();
    expect(getCollection("contacts/s1/comments")["c1"]).toMatchObject({ text: "hey" });
    expect(getCollection("contacts/d1/comments")["c1"]).toBeUndefined();

    expect(getCollection("prayers")["p1"].contactId).toBe("s1");
    expect(getCollection("tasks")["k1"].contactId).toBe("s1");
    expect(getCollection("tasks")["k1"].contactName).toBe("Kept Name");
    expect(getCollection("visits")["v1"].contactIds).toEqual(["s1"]);
    expect(getCollection("visits")["v1"].contactNames).toEqual(["Kept Name"]);

    // Gathering roster, overrides and attendance all drop the repeat.
    const event = getCollection("events")["e1"];
    expect(event.roster).toEqual(["s1"]);
    expect(event.rosterOverride).toEqual(["s1"]);
    expect(event.rosterOverrideBase).toEqual(["s1"]);
    expect(event.attendance).toEqual({ present: ["s1"], absent: ["s1"] });
    expect(getCollection("rhythms")["r1"].roster).toEqual(["s1", "other"]);
    expect(getCollection("homes")["h1"].members).toEqual(["s1"]);
    // The outing log is cut (cut-or-keep §2): a combine leaves it alone.
    expect(getCollection("outreach")["o1"].names[0]).toMatchObject({
      contactId: "d1",
      name: "In Name",
    });
    expect(getCollection("attendee_aliases")["a1"].contactId).toBe("s1");
    expect(getCollection("pending_attendance_imports")["pi1"].preview.attendees[0].contactId).toBe(
      "s1",
    );
    expect(getCollection("pending_attendance_imports")["pi1"].preview.conflicts[0].contactId).toBe(
      "s1",
    );
    expect(getCollection("users/u2/personalPrayers")["pp1"].contactId).toBe("s1");
    expect(getCollection("userPreferences")["u2"].personalContactIds).toEqual(["s1", "x"]);
    expect(getCollection("inboxState")["u2"].seen).toEqual({ "att:contact:s1": "t1" });
    expect(getCollection("inboxState")["u2"].completed).toEqual({ "att:contact:s1": "t2" });
    // The notification moves; its text does not.
    expect(getCollection("notifications")["n1"].targetId).toBe("s1");
    expect(getCollection("notifications")["n1"].link).toBe("/people/s1");
    expect(getCollection("notifications")["n1"].message).toBe("In Name was logged");
    expect(getCollection("activities")["ac1"].targetId).toBe("s1");
    expect(getCollection("activities")["ac1"].targetName).toBe("Kept Name");

    const record = Object.values(getCollection("combineRecords"))[0] as any;
    expect(record.status).toBe("done");
    expect(record.keptId).toBe("s1");
    expect(record.combinedInId).toBe("d1");
    expect(record.keptBefore.name).toBe("Kept Name");
    expect(record.combinedInBefore.name).toBe("In Name");
    expect(record.movedDocuments).toHaveLength(5);
    expect(record.rewrittenReferences.length).toBeGreaterThanOrEqual(4);
  });

  it("returns the What moves groups without writing when dryRun is set", async () => {
    seedCombine();
    const res = await request(app)
      .post("/api/combine-contacts")
      .send({ keptId: "s1", combinedInId: "d1", dryRun: true });
    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(true);
    const kinds = res.body.moves.map((m: any) => m.kind);
    expect(kinds).toEqual(
      expect.arrayContaining([
        "interactions",
        "threads",
        "teamThreads",
        "comments",
        "prayers",
        "tasks",
        "visits",
        "gatherings",
        "rhythms",
        "homes",
        "attendeeAliases",
        "pendingImports",
        "personalPrayers",
        "userPreferences",
        "inboxStates",
        "notifications",
        "activities",
      ]),
    );
    const gatherings = res.body.moves.find((m: any) => m.kind === "gatherings");
    expect(gatherings).toMatchObject({ count: 1 });
    expect(gatherings.items).toContainEqual({ id: "e1", label: "Friday Gathering" });
    // Nothing was written.
    expect(getCollection("contacts")["d1"]).toBeDefined();
    expect(getCollection("contacts")["s1"].tags).toEqual(["A"]);
    expect(Object.values(getCollection("combineRecords"))).toHaveLength(0);
  });

  it("writes the record as pending before applying the changes", async () => {
    seedCombine();
    const res = await request(app)
      .post("/api/combine-contacts")
      .send({ keptId: "s1", combinedInId: "d1", ...NO_STAMPS });
    expect(res.status).toBe(200);
    const record = getCollection("combineRecords")[res.body.combineRecordId];
    expect(record.status).toBe("done");
    expect(record.combinedAt).toBeTruthy();
    expect(record.completedAt).toBeTruthy();
  });

  it("records an Activity Log entry for the combine", async () => {
    seedCombine();
    await request(app).post("/api/combine-contacts").send({ keptId: "s1", combinedInId: "d1", ...NO_STAMPS });
    const activities = Object.values(getCollection("activities"));
    const entry = activities.find((a: any) => a.action === "combined contact into");
    expect(entry).toBeDefined();
    expect(entry).toMatchObject({ targetId: "s1", targetType: "contact" });
    expect(entry.description).toContain("In Name");
  });

  it("stamps the kept contact with a combined-from banner and clears it on undo (#1434)", async () => {
    seedCombine();
    const res = await request(app)
      .post("/api/combine-contacts")
      .send({ keptId: "s1", combinedInId: "d1", reason: "Matching email", ...NO_STAMPS });
    expect(res.status).toBe(200);

    const banner = getCollection("contacts")["s1"].combinedFrom;
    expect(banner).toMatchObject({
      name: "In Name",
      byName: "Test User",
      combineRecordId: res.body.combineRecordId,
    });
    expect(banner.at).toBeTruthy();
    expect(getCollection("combineRecords")[res.body.combineRecordId].keptAfter.combinedFrom).toEqual(
      banner,
    );

    await request(app)
      .post("/api/combine-contacts/undo")
      .send({ combineRecordId: res.body.combineRecordId });
    expect(getCollection("contacts")["s1"].combinedFrom).toBeUndefined();
  });

  it("applies the Full-timer's picks to the written profile and stores them", async () => {
    seedCombine();
    const res = await request(app).post("/api/combine-contacts").send({
      keptId: "s1",
      combinedInId: "d1",
      ...NO_STAMPS,
      picks: { fields: { name: "combined-in" }, notes: "combined-in" },
    });
    expect(res.status).toBe(200);
    expect(getCollection("contacts")["s1"].name).toBe("In Name");
    const record = getCollection("combineRecords")[res.body.combineRecordId];
    expect(record.picks).toEqual({ fields: { name: "combined-in" }, notes: "combined-in" });
  });

  it("refuses with a conflict and writes nothing when a contact changed since the preview", async () => {
    seedCombine();
    seedDoc("contacts", "d1", {
      name: "In Name",
      email: "same@x.com",
      phone: "",
      stage: "Contact",
      tags: ["A", "B"],
      location: "",
      createdAt: "2026-02-01",
      updatedAt: "2026-06-01T00:00:00.000Z",
    });
    const res = await request(app).post("/api/combine-contacts").send({
      keptId: "s1",
      combinedInId: "d1",
      keptUpdatedAt: null,
      combinedInUpdatedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(res.status).toBe(409);
    expect(res.body.conflict).toBe(true);
    expect(getCollection("contacts")["d1"]).toBeDefined();
    expect(Object.values(getCollection("combineRecords"))).toHaveLength(0);
  });

  it("proceeds when the last-updated stamps match what the browser saw", async () => {
    seedCombine();
    seedDoc("contacts", "s1", {
      name: "Kept Name",
      email: "same@x.com",
      phone: "",
      stage: "Lead",
      tags: ["A"],
      location: "",
      updatedAt: "2026-05-01T00:00:00.000Z",
    });
    const res = await request(app).post("/api/combine-contacts").send({
      keptId: "s1",
      combinedInId: "d1",
      keptUpdatedAt: "2026-05-01T00:00:00.000Z",
      combinedInUpdatedAt: null,
    });
    expect(res.status).toBe(200);
    expect(getCollection("contacts")["d1"]).toBeUndefined();
  });

  // A sign-up writes updatedAt as a server timestamp, so the Admin read keeps
  // its milliseconds while the browser's JSON form carries seconds/nanoseconds.
  const stampedKept = () =>
    seedDoc("contacts", "s1", {
      name: "Kept Name",
      email: "same@x.com",
      phone: "",
      stage: "Lead",
      tags: ["A"],
      location: "",
      updatedAt: { seconds: 1767225600, nanoseconds: 123000000, toDate: () => new Date(1767225600123) },
    });

  it("combines a contact whose updatedAt has milliseconds when the browser sends its JSON form", async () => {
    seedCombine();
    stampedKept();
    const res = await request(app).post("/api/combine-contacts").send({
      keptId: "s1",
      combinedInId: "d1",
      keptUpdatedAt: { seconds: 1767225600, nanoseconds: 123000000 },
      combinedInUpdatedAt: null,
    });
    expect(res.status).toBe(200);
    expect(getCollection("contacts")["d1"]).toBeUndefined();
  });

  it("still refuses with a conflict when the contact changed by a few milliseconds", async () => {
    seedCombine();
    stampedKept();
    const res = await request(app).post("/api/combine-contacts").send({
      keptId: "s1",
      combinedInId: "d1",
      keptUpdatedAt: { seconds: 1767225600, nanoseconds: 124000000 },
      combinedInUpdatedAt: null,
    });
    expect(res.status).toBe(409);
    expect(getCollection("contacts")["d1"]).toBeDefined();
  });

  it("returns 400 when the last-updated stamps are missing", async () => {
    seedCombine();
    for (const stamps of [{}, { keptUpdatedAt: null }, { combinedInUpdatedAt: null }]) {
      const res = await request(app)
        .post("/api/combine-contacts")
        .send({ keptId: "s1", combinedInId: "d1", ...stamps });
      expect(res.status).toBe(400);
    }
    expect(getCollection("contacts")["d1"]).toBeDefined();
  });

  it("returns 400 when an id is missing", async () => {
    const res = await request(app).post("/api/combine-contacts").send({ keptId: "s1" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when both ids are the same", async () => {
    const res = await request(app).post("/api/combine-contacts").send({ keptId: "s1", combinedInId: "s1" });
    expect(res.status).toBe(400);
  });

  it("returns 404 when a contact is missing", async () => {
    seedDoc("contacts", "s1", { name: "Kept", email: "", phone: "", stage: "Lead", location: "" });
    const res = await request(app).post("/api/combine-contacts").send({ keptId: "s1", combinedInId: "nope", ...NO_STAMPS });
    expect(res.status).toBe(404);
  });

  it("refuses a non-Full-timer with 403", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      mockVerifyIdToken.mockResolvedValue({ uid: "trainee-1", email: "t@example.com" });
      seedDoc("users", "trainee-1", { role: "trainee", approved: true });
      const res = await request(app)
        .post("/api/combine-contacts")
        .set("Authorization", "Bearer tok")
        .send({ keptId: "s1", combinedInId: "d1" });
      expect(res.status).toBe(403);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});

describe("POST /api/combine-contacts — concurrency", () => {
  const seedPair = () => {
    seedDoc("contacts", "s1", { name: "Kept Name", email: "same@x.com", phone: "", stage: "Lead", location: "" });
    seedDoc("contacts", "d1", { name: "In Name", email: "same@x.com", phone: "", stage: "Contact", location: "" });
    seedDoc("prayers", "p1", { contactId: "d1" });
  };

  it.each([
    { side: "kept", busy: { status: "pending", keptId: "s1", combinedInId: "x9" } },
    { side: "combined-in", busy: { status: "undoing", keptId: "x9", combinedInId: "d1" } },
  ])("refuses while the $side contact is part of an in-flight combine record", async ({ busy }) => {
    seedPair();
    seedDoc("combineRecords", "busy", { kind: "contacts", claimedAt: new Date().toISOString(), ...busy });

    const res = await request(app)
      .post("/api/combine-contacts")
      .send({ keptId: "s1", combinedInId: "d1", ...NO_STAMPS });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("busy");
    expect(getCollection("contacts")["d1"]).toBeDefined();
    expect(getCollection("prayers")["p1"].contactId).toBe("d1");
    expect(Object.keys(getCollection("combineRecords"))).toEqual(["busy"]);
  });

  it("refuses with a conflict when a contact changes while the combine is being built", async () => {
    seedPair();
    writeAfterFirstRead("contacts", () =>
      seedDoc("contacts", "s1", { ...getCollection("contacts")["s1"], updatedAt: "2026-10-10T12:00:00.000Z" }),
    );

    const res = await request(app)
      .post("/api/combine-contacts")
      .send({ keptId: "s1", combinedInId: "d1", ...NO_STAMPS });

    expect(res.status).toBe(409);
    expect(res.body.conflict).toBe(true);
    expect(getCollection("contacts")["d1"]).toBeDefined();
    expect(getCollection("prayers")["p1"].contactId).toBe("d1");
  });
});

describe("POST /api/combine-contacts/undo", () => {
  const seedCombine = () => {
    seedDoc("contacts", "s1", {
      name: "Kept Name",
      email: "same@x.com",
      phone: "",
      stage: "Lead",
      tags: ["A"],
      location: "",
    });
    seedDoc("contacts", "d1", {
      name: "In Name",
      email: "same@x.com",
      phone: "",
      stage: "Contact",
      tags: ["A", "B"],
      location: "Dorm B",
      createdAt: "2026-02-01",
    });
    seedDoc("contacts/d1/interactions", "i1", { content: "hi", authorId: "other" });
    seedDoc("contacts/d1/interactions", "i2", { content: "again", authorId: "other" });
    seedDoc("contacts/d1/threads", "t1", { body: "note", authorId: "someone" });
    seedDoc("contacts/d1/teamThreads", "tt1", { body: "team" });
    seedDoc("contacts/d1/comments", "c1", { text: "hey", userId: "other" });
    seedDoc("prayers", "p1", { contactId: "d1", updatedAt: "x" });
    seedDoc("tasks", "k1", { contactId: "d1", contactName: "In Name", text: "Call" });
    seedDoc("visits", "v1", {
      contactIds: ["d1", "s1"],
      contactNames: ["In Name", "Kept Name"],
    });
    seedDoc("events", "e1", {
      name: "Friday Gathering",
      roster: ["d1", "s1"],
      rosterOverride: ["d1"],
      rosterOverrideBase: ["d1"],
      attendance: { present: ["d1"], absent: ["d1"] },
    });
    seedDoc("rhythms", "r1", { name: "Wednesday", roster: ["d1", "other"] });
    seedDoc("homes", "h1", { label: "the Peinados", members: ["d1"] });
    seedDoc("attendee_aliases", "a1", { attdName: "In", contactId: "d1" });
    seedDoc("pending_attendance_imports", "pi1", {
      status: "pending",
      preview: {
        attendees: [{ contactId: "d1", contactName: "In Name" }],
        conflicts: [{ contactId: "d1" }],
      },
    });
    seedDoc("users", "u2", { role: "trainee", approved: true });
    seedDoc("users/u2/personalPrayers", "pp1", { contactId: "d1", title: "heal" });
    seedDoc("userPreferences", "u2", { personalContactIds: ["d1", "x"] });
    seedDoc("inboxState", "u2", {
      seen: { "att:contact:d1": "t1" },
      completed: { "att:contact:d1": "t2" },
    });
    seedDoc("notifications", "n1", {
      targetId: "d1",
      link: "/people/d1",
      message: "In Name was logged",
    });
    seedDoc("activities", "ac1", {
      targetId: "d1",
      targetName: "In Name",
      targetType: "contact",
      action: "logged an interaction with",
    });
  };

  // `extraPrayers` pushes the write set past one transaction's limit.
  const combineOnce = async (extraPrayers = 0): Promise<string> => {
    seedCombine();
    for (let i = 0; i < extraPrayers; i++) seedDoc("prayers", `px${i}`, { contactId: "d1" });
    const res = await request(app)
      .post("/api/combine-contacts")
      .send({ keptId: "s1", combinedInId: "d1", reason: "Matching email", ...NO_STAMPS });
    expect(res.status).toBe(200);
    expect(getCollection("combineRecords")[res.body.combineRecordId].status).toBe("done");
    return res.body.combineRecordId as string;
  };

  it("refuses a tag combine record, for the preview and the undo, and writes nothing", async () => {
    seedDoc("contacts", "a", { name: "Alice", tags: ["BFA table", "BFA"] });
    seedDoc("contacts", "b", { name: "Bob", tags: ["bfa-table"] });
    const tagRes = await request(app)
      .post("/api/combine-tags")
      .send({ combines: [{ variants: ["BFA table", "bfa-table"], target: "BFA" }] });
    expect(tagRes.status).toBe(200);
    const recordId = tagRes.body.combineRecordId as string;
    expect(getCollection("combineRecords")[recordId].kind).toBe("tags");
    const snapshot = () =>
      structuredClone({ contacts: getCollection("contacts"), records: getCollection("combineRecords") });
    const before = snapshot();

    for (const dryRun of [true, false]) {
      const res = await request(app)
        .post("/api/combine-contacts/undo")
        .send({ combineRecordId: recordId, dryRun });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/not a contact combine record/i);
    }
    expect(snapshot()).toEqual(before);
  });

  it("reverses a combine so the database matches its pre-combine state", async () => {
    seedCombine();
    const before = {
      s1: structuredClone(getCollection("contacts")["s1"]),
      d1: structuredClone(getCollection("contacts")["d1"]),
      interactions: structuredClone(getCollection("contacts/d1/interactions")),
      threads: structuredClone(getCollection("contacts/d1/threads")),
      teamThreads: structuredClone(getCollection("contacts/d1/teamThreads")),
      comments: structuredClone(getCollection("contacts/d1/comments")),
      prayers: structuredClone(getCollection("prayers")),
      tasks: structuredClone(getCollection("tasks")),
      visits: structuredClone(getCollection("visits")),
      events: structuredClone(getCollection("events")),
      rhythms: structuredClone(getCollection("rhythms")),
      homes: structuredClone(getCollection("homes")),
      aliases: structuredClone(getCollection("attendee_aliases")),
      imports: structuredClone(getCollection("pending_attendance_imports")),
      personalPrayers: structuredClone(getCollection("users/u2/personalPrayers")),
      prefs: structuredClone(getCollection("userPreferences")),
      inbox: structuredClone(getCollection("inboxState")),
      notifications: structuredClone(getCollection("notifications")),
    };

    const combineRes = await request(app)
      .post("/api/combine-contacts")
      .send({ keptId: "s1", combinedInId: "d1", reason: "Matching email", ...NO_STAMPS });
    const undoRes = await request(app)
      .post("/api/combine-contacts/undo")
      .send({ combineRecordId: combineRes.body.combineRecordId });

    expect(undoRes.status).toBe(200);
    expect(undoRes.body.success).toBe(true);

    expect(getCollection("contacts")["s1"]).toEqual(before.s1);
    expect(getCollection("contacts")["d1"]).toEqual(before.d1);
    expect(getCollection("contacts/d1/interactions")).toEqual(before.interactions);
    expect(getCollection("contacts/s1/interactions")).toEqual({});
    expect(getCollection("contacts/d1/threads")).toEqual(before.threads);
    expect(getCollection("contacts/s1/threads")).toEqual({});
    expect(getCollection("contacts/d1/teamThreads")).toEqual(before.teamThreads);
    expect(getCollection("contacts/d1/comments")).toEqual(before.comments);
    expect(getCollection("contacts/s1/comments")).toEqual({});
    expect(getCollection("prayers")).toEqual(before.prayers);
    expect(getCollection("tasks")).toEqual(before.tasks);
    expect(getCollection("visits")).toEqual(before.visits);
    expect(getCollection("events")).toEqual(before.events);
    expect(getCollection("rhythms")).toEqual(before.rhythms);
    expect(getCollection("homes")).toEqual(before.homes);
    expect(getCollection("attendee_aliases")).toEqual(before.aliases);
    expect(getCollection("pending_attendance_imports")).toEqual(before.imports);
    expect(getCollection("users/u2/personalPrayers")).toEqual(before.personalPrayers);
    expect(getCollection("userPreferences")).toEqual(before.prefs);
    expect(getCollection("inboxState")).toEqual(before.inbox);
    expect(getCollection("notifications")).toEqual(before.notifications);
    expect(getCollection("activities")["ac1"]).toMatchObject({
      targetId: "d1",
      targetName: "In Name",
    });
  });

  it("keeps the kept contact's visit mirror when both were on the visit, and undo restores both", async () => {
    seedCombine();
    seedDoc("contacts/s1/interactions", "visit_v1", { visitId: "v1", content: "kept mirror" });
    seedDoc("contacts/d1/interactions", "visit_v1", { visitId: "v1", content: "combined-in mirror" });
    const keptBefore = structuredClone(getCollection("contacts/s1/interactions"));
    const combinedInBefore = structuredClone(getCollection("contacts/d1/interactions"));

    const preview = await request(app)
      .post("/api/combine-contacts")
      .send({ keptId: "s1", combinedInId: "d1", dryRun: true });
    const interactionMoves = preview.body.moves.find((m: any) => m.kind === "interactions");
    expect(interactionMoves.items.map((i: any) => i.id)).toEqual(["i1", "i2"]);

    const combineRes = await request(app)
      .post("/api/combine-contacts")
      .send({ keptId: "s1", combinedInId: "d1", ...NO_STAMPS });
    expect(combineRes.status).toBe(200);
    expect(getCollection("contacts/s1/interactions")["visit_v1"]).toEqual(keptBefore["visit_v1"]);
    expect(getCollection("contacts/d1/interactions")["visit_v1"]).toBeUndefined();

    await request(app)
      .post("/api/combine-contacts/undo")
      .send({ combineRecordId: combineRes.body.combineRecordId });

    expect(getCollection("contacts/s1/interactions")).toEqual(keptBefore);
    expect(getCollection("contacts/d1/interactions")).toEqual(combinedInBefore);
  });

  it("round-trips a non-visit document whose id exists under both contacts with no data loss", async () => {
    seedCombine();
    seedDoc("contacts/s1/comments", "c1", { text: "kept's own comment", userId: "me" });
    const keptBefore = structuredClone(getCollection("contacts/s1/comments"));
    const combinedInBefore = structuredClone(getCollection("contacts/d1/comments"));

    const combineRes = await request(app)
      .post("/api/combine-contacts")
      .send({ keptId: "s1", combinedInId: "d1", ...NO_STAMPS });
    expect(getCollection("contacts/s1/comments")).toEqual(keptBefore);

    await request(app)
      .post("/api/combine-contacts/undo")
      .send({ combineRecordId: combineRes.body.combineRecordId });

    expect(getCollection("contacts/s1/comments")).toEqual(keptBefore);
    expect(getCollection("contacts/d1/comments")).toEqual(combinedInBefore);
  });

  it("recreates the combined-in contact under its original id", async () => {
    const recordId = await combineOnce();
    expect(getCollection("contacts")["d1"]).toBeUndefined();

    await request(app).post("/api/combine-contacts/undo").send({ combineRecordId: recordId });

    expect(getCollection("contacts")["d1"]).toMatchObject({ name: "In Name", createdAt: "2026-02-01" });
    expect(getCollection("contacts/d1/interactions")["i1"]).toMatchObject({ content: "hi" });
  });

  it("marks the record undone with who and when", async () => {
    const recordId = await combineOnce();
    const res = await request(app)
      .post("/api/combine-contacts/undo")
      .send({ combineRecordId: recordId });
    expect(res.status).toBe(200);

    const record = getCollection("combineRecords")[recordId] as any;
    expect(record.status).toBe("undone");
    expect(record.undoneAt).toBeTruthy();
    expect(record.undoneBy).toBe("test-user");
    expect(record.undoneByName).toBe("Test User");
  });

  it("refuses to undo the same combine twice", async () => {
    const recordId = await combineOnce();
    await request(app).post("/api/combine-contacts/undo").send({ combineRecordId: recordId });
    const second = await request(app)
      .post("/api/combine-contacts/undo")
      .send({ combineRecordId: recordId });
    expect(second.status).toBe(409);
  });

  it("returns 404 for a missing combine record", async () => {
    const res = await request(app)
      .post("/api/combine-contacts/undo")
      .send({ combineRecordId: "nope" });
    expect(res.status).toBe(404);
  });

  it("returns 400 when the record id is missing", async () => {
    const res = await request(app).post("/api/combine-contacts/undo").send({});
    expect(res.status).toBe(400);
  });

  it("records an Activity Log entry for the undo", async () => {
    const recordId = await combineOnce();
    await request(app).post("/api/combine-contacts/undo").send({ combineRecordId: recordId });
    const activities = Object.values(getCollection("activities"));
    const entry = activities.find((a: any) => a.action === "undid combine of");
    expect(entry).toBeDefined();
    expect(entry).toMatchObject({ targetId: "s1", targetType: "contact" });
    expect(entry.description).toContain("In Name");
  });

  it("refuses a non-Full-timer with 403", async () => {
    const recordId = await combineOnce();
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      mockVerifyIdToken.mockResolvedValue({ uid: "trainee-1", email: "t@example.com" });
      seedDoc("users", "trainee-1", { role: "trainee", approved: true });
      const res = await request(app)
        .post("/api/combine-contacts/undo")
        .set("Authorization", "Bearer tok")
        .send({ combineRecordId: recordId });
      expect(res.status).toBe(403);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it("returns the three undo lists without writing when dryRun is set", async () => {
    const recordId = await combineOnce();
    const afterCombine = structuredClone(getCollection("contacts")["s1"]);

    const res = await request(app)
      .post("/api/combine-contacts/undo")
      .send({ combineRecordId: recordId, dryRun: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.preview.goesBack.length).toBeGreaterThan(0);
    expect(res.body.preview.stays).toEqual([]);
    expect(res.body.preview.notRestored).toEqual([]);

    // Nothing was written.
    expect(getCollection("contacts")["s1"]).toEqual(afterCombine);
    expect(getCollection("contacts")["d1"]).toBeUndefined();
    expect(getCollection("combineRecords")[recordId].status).toBe("done");
  });

  it("leaves an interaction added to the kept contact after the combine", async () => {
    const recordId = await combineOnce();
    seedDoc("contacts/s1/interactions", "new1", { content: "later" });

    const res = await request(app)
      .post("/api/combine-contacts/undo")
      .send({ combineRecordId: recordId });

    expect(res.status).toBe(200);
    expect(getCollection("contacts/s1/interactions")["new1"]).toMatchObject({ content: "later" });
    expect(getCollection("contacts/d1/interactions")["new1"]).toBeUndefined();
    expect(res.body.preview.stays).toContainEqual({ kind: "interactions", id: "new1", label: "later" });
  });

  it("returns a moved interaction edited after the combine with its edit", async () => {
    const recordId = await combineOnce();
    seedDoc("contacts/s1/interactions", "i1", { content: "edited" });

    await request(app).post("/api/combine-contacts/undo").send({ combineRecordId: recordId });

    expect(getCollection("contacts/d1/interactions")["i1"]).toMatchObject({ content: "edited" });
    expect(getCollection("contacts/s1/interactions")["i1"]).toBeUndefined();
  });

  it("keeps a kept-contact field edited after the combine and lists it as not restored", async () => {
    const recordId = await combineOnce();
    seedDoc("contacts", "s1", { ...getCollection("contacts")["s1"], location: "Elsewhere" });

    const res = await request(app)
      .post("/api/combine-contacts/undo")
      .send({ combineRecordId: recordId });

    expect(res.status).toBe(200);
    expect(getCollection("contacts")["s1"].location).toBe("Elsewhere");
    expect(res.body.preview.notRestored).toContainEqual({ kind: "field", label: "location" });
  });

  it("removes only the list items the combine added, keeping later additions", async () => {
    const recordId = await combineOnce();
    seedDoc("contacts", "s1", { ...getCollection("contacts")["s1"], tags: ["A", "B", "C"] });

    await request(app).post("/api/combine-contacts/undo").send({ combineRecordId: recordId });

    expect(getCollection("contacts")["s1"].tags).toEqual(["A", "C"]);
  });

  it("restores the combined-in contact on a roster that gained a member since, keeping the new member", async () => {
    const recordId = await combineOnce();
    const event = getCollection("events")["e1"];
    seedDoc("events", "e1", { ...event, roster: [...event.roster, "new"] });

    await request(app).post("/api/combine-contacts/undo").send({ combineRecordId: recordId });

    expect(getCollection("events")["e1"].roster).toEqual(["d1", "s1", "new"]);
  });

  it("restores the combined-in contact's inbox keys after another key was marked seen", async () => {
    const recordId = await combineOnce();
    const state = getCollection("inboxState")["u2"];
    seedDoc("inboxState", "u2", { ...state, seen: { ...state.seen, "att:contact:zz": "t5" } });

    await request(app).post("/api/combine-contacts/undo").send({ combineRecordId: recordId });

    expect(getCollection("inboxState")["u2"]).toEqual({
      seen: { "att:contact:d1": "t1", "att:contact:zz": "t5" },
      completed: { "att:contact:d1": "t2" },
    });
  });

  it("puts both contacts back on a visit the combine collapsed", async () => {
    const recordId = await combineOnce();
    expect(getCollection("visits")["v1"].contactIds).toEqual(["s1"]);
    seedDoc("visits", "v1", { contactIds: ["s1", "v9"], contactNames: ["Kept Name", "Nine"] });

    await request(app).post("/api/combine-contacts/undo").send({ combineRecordId: recordId });

    expect(getCollection("visits")["v1"]).toEqual({
      contactIds: ["d1", "s1", "v9"],
      contactNames: ["In Name", "Kept Name", "Nine"],
    });
  });

  it("re-adds no one to a home the kept contact was removed from, and reports it as not restored", async () => {
    const recordId = await combineOnce();
    seedDoc("homes", "h1", { ...getCollection("homes")["h1"], members: ["other"] });

    const res = await request(app)
      .post("/api/combine-contacts/undo")
      .send({ combineRecordId: recordId });

    expect(getCollection("homes")["h1"].members).toEqual(["other"]);
    expect(res.body.preview.notRestored).toContainEqual({ kind: "reference", label: "homes.members" });
  });

  it("keeps an interest added after the combine and removes the one the combine added", async () => {
    seedCombine();
    seedDoc("contacts", "s1", { ...getCollection("contacts")["s1"], interests: ["music"] });
    seedDoc("contacts", "d1", { ...getCollection("contacts")["d1"], interests: ["art"] });
    const res = await request(app)
      .post("/api/combine-contacts")
      .send({ keptId: "s1", combinedInId: "d1", ...NO_STAMPS });
    const kept = getCollection("contacts")["s1"];
    expect(kept.interests).toEqual(["music", "art"]);
    seedDoc("contacts", "s1", { ...kept, interests: ["music", "art", "chess"] });

    await request(app)
      .post("/api/combine-contacts/undo")
      .send({ combineRecordId: res.body.combineRecordId });

    expect(getCollection("contacts")["s1"].interests).toEqual(["music", "chess"]);
  });

  it("refuses undo when the kept contact was later combined into someone else", async () => {
    const firstRecord = await combineOnce();
    seedDoc("contacts", "c1", {
      name: "Later Kept",
      email: "",
      phone: "",
      stage: "Lead",
      location: "",
    });
    const second = await request(app)
      .post("/api/combine-contacts")
      .send({
        keptId: "c1",
        combinedInId: "s1",
        keptUpdatedAt: null,
        // s1 was the first combine's kept contact, so it now carries a stamp.
        combinedInUpdatedAt: getCollection("contacts")["s1"].updatedAt,
      });
    expect(second.status).toBe(200);

    const res = await request(app)
      .post("/api/combine-contacts/undo")
      .send({ combineRecordId: firstRecord });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("c1");
    // The first combine is still undoable once the later one is undone.
    expect(getCollection("combineRecords")[firstRecord].status).toBe("done");
  });

  it.each([
    { path: "one transaction", extraPrayers: 0 },
    { path: "claim then batches", extraPrayers: 600 },
  ])("lets exactly one of two concurrent undos through ($path)", async ({ extraPrayers }) => {
    const recordId = await combineOnce(extraPrayers);
    // The second undo runs to completion after the first has read the record.
    let second: request.Response | undefined;
    writeAfterFirstRead("combineRecords", async () => {
      second = await request(app).post("/api/combine-contacts/undo").send({ combineRecordId: recordId });
    });

    const first = await request(app).post("/api/combine-contacts/undo").send({ combineRecordId: recordId });

    expect([first.status, second?.status].sort()).toEqual([200, 409]);
    const undoEntries = Object.values(getCollection("activities")).filter(
      (activity: any) => activity.action === "undid combine of",
    );
    expect(undoEntries).toHaveLength(1);
    expect(getCollection("combineRecords")[recordId].status).toBe("undone");
  });

  it("retries an undo left in undoing once its claim has expired", async () => {
    const recordId = await combineOnce(600);
    // The undo fails after its first batch of writes has landed.
    const realBatch = mockDb.batch;
    let commits = 0;
    const batchSpy = vi.spyOn(mockDb, "batch").mockImplementation(() => {
      const batch = realBatch();
      return {
        ...batch,
        commit: async () => {
          if (++commits === 2) throw new Error("network");
          return batch.commit();
        },
      };
    });
    const interrupted = await request(app)
      .post("/api/combine-contacts/undo")
      .send({ combineRecordId: recordId });
    batchSpy.mockRestore();
    expect(interrupted.status).toBe(500);
    expect(getCollection("combineRecords")[recordId].status).toBe("undoing");

    // While the claim is fresh another undo may still be running: refuse.
    const tooSoon = await request(app)
      .post("/api/combine-contacts/undo")
      .send({ combineRecordId: recordId });
    expect(tooSoon.status).toBe(409);

    seedDoc("combineRecords", recordId, {
      ...getCollection("combineRecords")[recordId],
      claimedAt: LONG_AGO,
    });
    const retried = await request(app)
      .post("/api/combine-contacts/undo")
      .send({ combineRecordId: recordId });

    expect(retried.status).toBe(200);
    expect(getCollection("combineRecords")[recordId].status).toBe("undone");
    expect(getCollection("contacts")["d1"]).toMatchObject({ name: "In Name" });
    expect(getCollection("contacts/d1/interactions")["i1"]).toMatchObject({ content: "hi" });
    const prayers = Object.values(getCollection("prayers")) as any[];
    expect(prayers.every((prayer) => prayer.contactId === "d1")).toBe(true);
  });

  it("keeps read-state a user marks while the combine and the undo are running", async () => {
    seedCombine();
    const markSeen = (key: string, stamp: string) => () => {
      const state = getCollection("inboxState")["u2"];
      seedDoc("inboxState", "u2", { ...state, seen: { ...state.seen, [key]: stamp } });
    };

    const combineSpy = writeAfterFirstRead("inboxState", markSeen("att:contact:zz", "t5"));
    const combineRes = await request(app)
      .post("/api/combine-contacts")
      .send({ keptId: "s1", combinedInId: "d1", ...NO_STAMPS });
    combineSpy.mockRestore();
    expect(combineRes.status).toBe(200);
    expect(getCollection("inboxState")["u2"].seen).toEqual({
      "att:contact:s1": "t1",
      "att:contact:zz": "t5",
    });

    writeAfterFirstRead("inboxState", markSeen("att:contact:yy", "t6"));
    const undoRes = await request(app)
      .post("/api/combine-contacts/undo")
      .send({ combineRecordId: combineRes.body.combineRecordId });

    expect(undoRes.status).toBe(200);
    expect(getCollection("inboxState")["u2"]).toEqual({
      seen: { "att:contact:d1": "t1", "att:contact:zz": "t5", "att:contact:yy": "t6" },
      completed: { "att:contact:d1": "t2" },
    });
  });
});

describe("POST /api/combine-tags", () => {
  const seedTags = () => {
    seedDoc("contacts", "a", { name: "Alice", tags: ["BFA table", "BFA"] });
    seedDoc("contacts", "b", { name: "Bob", tags: ["bfa-table"] });
    seedDoc("contacts", "c", { name: "Cara", tags: ["Saved"] });
  };

  it("rewrites affected tags, drops repeats, and writes a done tags record", async () => {
    seedTags();
    const res = await request(app)
      .post("/api/combine-tags")
      .send({ combines: [{ variants: ["BFA table", "bfa-table"], target: "BFA" }] });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.combineRecordId).toBeTruthy();
    expect(res.body.changedCount).toBe(2);

    const contacts = getCollection("contacts");
    expect(contacts["a"].tags).toEqual(["BFA"]);
    expect(contacts["b"].tags).toEqual(["BFA"]);
    expect(contacts["c"].tags).toEqual(["Saved"]);

    const record = getCollection("combineRecords")[res.body.combineRecordId];
    expect(record.kind).toBe("tags");
    expect(record.status).toBe("done");
    expect(record.combinedByName).toBe("Test User");
    expect(record.combines).toEqual([{ variants: ["BFA table", "bfa-table"], target: "BFA" }]);
    expect(record.contacts).toEqual([
      { contactId: "a", name: "Alice", before: ["BFA table", "BFA"], after: ["BFA"] },
      { contactId: "b", name: "Bob", before: ["bfa-table"], after: ["BFA"] },
    ]);
  });

  it("logs one Activity Log entry per changed contact", async () => {
    seedTags();
    await request(app)
      .post("/api/combine-tags")
      .send({ combines: [{ variants: ["BFA table", "bfa-table"], target: "BFA" }] });

    const activities = Object.values(getCollection("activities")).filter(
      (activity: any) => activity.action === "combined tags on",
    );
    expect(activities).toHaveLength(2);
    expect(activities[0]).toMatchObject({ targetType: "contact", type: "edit" });
  });

  it("previews without writing on a dry run", async () => {
    seedTags();
    const res = await request(app)
      .post("/api/combine-tags")
      .send({ combines: [{ variants: ["BFA table", "bfa-table"], target: "BFA" }], dryRun: true });

    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(true);
    expect(res.body.rows).toEqual([
      { contactId: "a", name: "Alice", from: ["BFA table", "BFA"], to: ["BFA"] },
      { contactId: "b", name: "Bob", from: ["bfa-table"], to: ["BFA"] },
    ]);
    expect(getCollection("contacts")["a"].tags).toEqual(["BFA table", "BFA"]);
    expect(Object.values(getCollection("combineRecords"))).toHaveLength(0);
  });

  it("adds a requested standard tag to the standard tags document and records it", async () => {
    seedTags();
    seedDoc("settings", "standard_tags", { tags: ["Saved", "BFA"] });
    const res = await request(app)
      .post("/api/combine-tags")
      .send({
        combines: [{ variants: ["BFA table", "bfa-table"], target: "Outreach" }],
        makeStandard: ["Outreach", "Saved", "Unrelated"],
      });

    expect(res.status).toBe(200);
    // Added once, after the existing ones; already-standard and non-target names are ignored.
    expect(getCollection("settings")["standard_tags"].tags).toEqual(["Saved", "BFA", "Outreach"]);
    const record = getCollection("combineRecords")[res.body.combineRecordId];
    expect(record.standardTagsAdded).toEqual(["Outreach"]);
  });

  it("starts from the seed list when no standard tags document exists yet", async () => {
    seedTags();
    const res = await request(app)
      .post("/api/combine-tags")
      .send({
        combines: [{ variants: ["BFA table", "bfa-table"], target: "Outreach" }],
        makeStandard: ["Outreach"],
      });

    expect(res.status).toBe(200);
    expect(getCollection("settings")["standard_tags"].tags).toEqual([
      "Saved", "Baptized", "Interested", "Open", "Club Rush", "BFA", "Outreach",
    ]);
  });

  it("records no standard tags and leaves the document alone when none are requested", async () => {
    seedTags();
    const res = await request(app)
      .post("/api/combine-tags")
      .send({ combines: [{ variants: ["BFA table", "bfa-table"], target: "BFA" }] });

    expect(getCollection("combineRecords")[res.body.combineRecordId].standardTagsAdded).toEqual([]);
    expect(getCollection("settings")["standard_tags"]).toBeUndefined();
  });

  it("does not add a standard tag on a dry run", async () => {
    seedTags();
    await request(app)
      .post("/api/combine-tags")
      .send({
        combines: [{ variants: ["BFA table", "bfa-table"], target: "Outreach" }],
        makeStandard: ["Outreach"],
        dryRun: true,
      });
    expect(getCollection("settings")["standard_tags"]).toBeUndefined();
  });

  it("returns 400 when no combines are given", async () => {
    const res = await request(app).post("/api/combine-tags").send({ combinations: [] });
    expect(res.status).toBe(400);
  });

  it("refuses a non-Full-timer with 403", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      mockVerifyIdToken.mockResolvedValue({ uid: "trainee-1", email: "t@example.com" });
      seedDoc("users", "trainee-1", { role: "trainee", approved: true });
      const res = await request(app)
        .post("/api/combine-tags")
        .set("Authorization", "Bearer tok")
        .send({ combines: [{ variants: ["BFA table"], target: "BFA" }] });
      expect(res.status).toBe(403);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});

describe("POST /api/combine-tags/undo", () => {
  const seedTags = () => {
    seedDoc("contacts", "a", { name: "Alice", tags: ["BFA table", "BFA"] });
    seedDoc("contacts", "b", { name: "Bob", tags: ["bfa-table"] });
    seedDoc("contacts", "c", { name: "Cara", tags: ["Saved"] });
  };

  const combineOnce = async (): Promise<string> => {
    seedTags();
    const res = await request(app)
      .post("/api/combine-tags")
      .send({ combines: [{ variants: ["BFA table", "bfa-table"], target: "BFA" }] });
    expect(res.status).toBe(200);
    return res.body.combineRecordId as string;
  };

  it("restores every contact's tags on an apply-then-undo round trip", async () => {
    const recordId = await combineOnce();
    expect(getCollection("contacts")["a"].tags).toEqual(["BFA"]);
    expect(getCollection("contacts")["b"].tags).toEqual(["BFA"]);

    const res = await request(app)
      .post("/api/combine-tags/undo")
      .send({ combineRecordId: recordId });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(getCollection("contacts")["a"].tags).toEqual(["BFA table", "BFA"]);
    expect(getCollection("contacts")["b"].tags).toEqual(["bfa-table"]);
    expect(getCollection("contacts")["c"].tags).toEqual(["Saved"]);
    expect(getCollection("combineRecords")[recordId].status).toBe("undone");
  });

  it("previews the undo without writing: restored, skipped and standard tags that remain", async () => {
    seedTags();
    const applied = await request(app)
      .post("/api/combine-tags")
      .send({
        combines: [{ variants: ["BFA table", "bfa-table"], target: "Outreach" }],
        makeStandard: ["Outreach"],
      });
    const recordId = applied.body.combineRecordId as string;
    seedDoc("contacts", "b", { name: "Bob", tags: ["Outreach", "Fall 2026"] });
    const contactsBefore = structuredClone(getCollection("contacts"));
    const activitiesBefore = Object.keys(getCollection("activities")).length;

    const res = await request(app)
      .post("/api/combine-tags/undo")
      .send({ combineRecordId: recordId, dryRun: true });

    expect(res.status).toBe(200);
    expect(res.body.dryRun).toBe(true);
    expect(res.body.preview.restored).toEqual([
      { contactId: "a", name: "Alice", current: ["Outreach", "BFA"], before: ["BFA table", "BFA"] },
    ]);
    expect(res.body.preview.skipped).toEqual([
      { contactId: "b", name: "Bob", current: ["Outreach", "Fall 2026"], after: ["Outreach"] },
    ]);
    expect(res.body.preview.standardTagsRemaining).toEqual(["Outreach"]);

    // Nothing was written.
    expect(getCollection("contacts")).toEqual(contactsBefore);
    expect(getCollection("combineRecords")[recordId].status).toBe("done");
    expect(Object.keys(getCollection("activities"))).toHaveLength(activitiesBefore);
    expect(getCollection("settings")["standard_tags"].tags).toContain("Outreach");
  });

  it("skips a contact re-tagged after the combine and reports it", async () => {
    const recordId = await combineOnce();
    seedDoc("contacts", "b", { name: "Bob", tags: ["BFA", "Fall 2026"] });

    const res = await request(app)
      .post("/api/combine-tags/undo")
      .send({ combineRecordId: recordId });

    expect(res.status).toBe(200);
    // Bob keeps his later tagging; Alice alone goes back.
    expect(getCollection("contacts")["b"].tags).toEqual(["BFA", "Fall 2026"]);
    expect(getCollection("contacts")["a"].tags).toEqual(["BFA table", "BFA"]);
    expect(res.body.preview.skipped).toEqual([
      { contactId: "b", name: "Bob", current: ["BFA", "Fall 2026"], after: ["BFA"] },
    ]);
  });

  it("marks the record undone with who and when", async () => {
    const recordId = await combineOnce();
    await request(app).post("/api/combine-tags/undo").send({ combineRecordId: recordId });

    const record = getCollection("combineRecords")[recordId] as any;
    expect(record.status).toBe("undone");
    expect(record.undoneAt).toBeTruthy();
    expect(record.undoneBy).toBe("test-user");
    expect(record.undoneByName).toBe("Test User");
  });

  it("refuses to undo the same combine twice", async () => {
    const recordId = await combineOnce();
    await request(app).post("/api/combine-tags/undo").send({ combineRecordId: recordId });
    const second = await request(app)
      .post("/api/combine-tags/undo")
      .send({ combineRecordId: recordId });
    expect(second.status).toBe(409);
  });

  it("lets exactly one of two concurrent undos through", async () => {
    const recordId = await combineOnce();
    // The second undo runs to completion after the first has read the record.
    let second: request.Response | undefined;
    writeAfterFirstRead("combineRecords", async () => {
      second = await request(app).post("/api/combine-tags/undo").send({ combineRecordId: recordId });
    });

    const first = await request(app).post("/api/combine-tags/undo").send({ combineRecordId: recordId });

    expect([first.status, second?.status].sort()).toEqual([200, 409]);
    const undoEntries = Object.values(getCollection("activities")).filter(
      (activity: any) => activity.action === "undid tag combine",
    );
    expect(undoEntries).toHaveLength(2);
  });

  it("refuses an undo whose claim is fresh and retries one whose claim has expired", async () => {
    const recordId = await combineOnce();
    const record = getCollection("combineRecords")[recordId];
    seedDoc("combineRecords", recordId, { ...record, status: "undoing", claimedAt: new Date().toISOString() });

    const tooSoon = await request(app).post("/api/combine-tags/undo").send({ combineRecordId: recordId });
    expect(tooSoon.status).toBe(409);

    seedDoc("combineRecords", recordId, { ...record, status: "undoing", claimedAt: LONG_AGO });
    const retried = await request(app).post("/api/combine-tags/undo").send({ combineRecordId: recordId });

    expect(retried.status).toBe(200);
    expect(getCollection("contacts")["a"].tags).toEqual(["BFA table", "BFA"]);
    expect(getCollection("combineRecords")[recordId].status).toBe("undone");
  });

  it("returns 404 for a missing combine record", async () => {
    const res = await request(app)
      .post("/api/combine-tags/undo")
      .send({ combineRecordId: "nope" });
    expect(res.status).toBe(404);
  });

  it("returns 400 when the record id is missing", async () => {
    const res = await request(app).post("/api/combine-tags/undo").send({});
    expect(res.status).toBe(400);
  });

  it("refuses a contact combine record", async () => {
    seedDoc("combineRecords", "contacts-1", {
      kind: "contacts",
      status: "done",
      keptId: "a",
      combinedInId: "b",
    });
    const res = await request(app)
      .post("/api/combine-tags/undo")
      .send({ combineRecordId: "contacts-1" });
    expect(res.status).toBe(400);
  });

  it("records an Activity Log entry for the undo", async () => {
    const recordId = await combineOnce();
    await request(app).post("/api/combine-tags/undo").send({ combineRecordId: recordId });

    const entries = Object.values(getCollection("activities")).filter(
      (activity: any) => activity.action === "undid tag combine",
    );
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({ targetType: "contact", type: "edit" });
  });

  it("returns the undo preview without writing when dryRun is set", async () => {
    const recordId = await combineOnce();
    const afterCombine = structuredClone(getCollection("contacts")["a"]);

    const res = await request(app)
      .post("/api/combine-tags/undo")
      .send({ combineRecordId: recordId, dryRun: true });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.preview.restored).toHaveLength(2);
    expect(res.body.preview.skipped).toEqual([]);
    expect(getCollection("contacts")["a"]).toEqual(afterCombine);
    expect(getCollection("combineRecords")[recordId].status).toBe("done");
  });

  it("refuses a non-Full-timer with 403", async () => {
    const recordId = await combineOnce();
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      mockVerifyIdToken.mockResolvedValue({ uid: "trainee-1", email: "t@example.com" });
      seedDoc("users", "trainee-1", { role: "trainee", approved: true });
      const res = await request(app)
        .post("/api/combine-tags/undo")
        .set("Authorization", "Bearer tok")
        .send({ combineRecordId: recordId });
      expect(res.status).toBe(403);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});

// Endpoints that served the cut channels (cut-or-keep §14, §15, §26). The
// Smart Import parse/commit pair stays, and so does the GitHub issue webhook
// (outcome sentences still ride the issue close). Everything here is gone.
describe("cut endpoints", () => {
  const gone = [
    ["post", "/api/quick-add"],
    ["get", "/api/quick-add/status"],
    ["post", "/api/webhook/sms"],
    ["post", "/api/webhook/groupme"],
    ["post", "/api/groupme-aliases"],
    ["post", "/api/groupme-aliases/repair"],
    ["get", "/api/webhook/logs"],
    ["post", "/api/feedback/reply"],
    ["post", "/api/feedback/reply/edit"],
    ["post", "/api/feedback/update"],
  ] as const;

  it.each(gone)("%s %s is no longer routed", async (method, path) => {
    const res = await request(app)[method](path).send({});
    expect(res.status).toBe(404);
  });
});
