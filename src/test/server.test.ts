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
  mockVerifyTwilio,
  mockVerifyIdToken,
  mockCreateCustomToken,
  fetchMock,
  getFirestoreDbIds,
} = vi.hoisted(() => {
  type Doc = Record<string, any>;

  const store: Record<string, Record<string, Doc>> = {};
  let seq = 0;

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
        get: async () => ({ exists: docId in col, data: () => col[docId], id: docId, ref: handle }),
        set: async (d: Doc) => { col[docId] = { ...d }; },
        delete: async () => { delete col[docId]; },
        // Copy rather than mutate: a snapshot taken before this update must
        // keep the values it was read with, as a real one does.
        update: async (u: Doc) => {
          const target = { ...(col[docId] ?? {}) };
          for (const [k, v] of Object.entries(u)) {
            if (v && (v as any).__mockDelete) delete target[k];
            else target[k] = v;
          }
          col[docId] = target;
        },
        collection: (sub: string) => collection(`${name}/${docId}/${sub}`),
      };
      handle.ref = handle;
      return handle;
    };

    const list = () => Object.keys(col).map((id) => ({ id, ref: docHandle(id), data: () => col[id] }));

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
          return v === value;
        }),
      orderBy: () => ({
        limit: (n: number) => ({ get: async () => snapshot(list().slice(0, n)) }),
      }),
      limit: (n: number) => ({ get: async () => snapshot(list().slice(0, n)) }),
      get: async () => snapshot(list()),
    };
  };

  const DELETE_SENTINEL = Symbol("DELETE");

  const db = {
    collection,
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
            const target = (store[p._col] ??= {})[p._id] ?? {};
            for (const [k, v] of Object.entries(p.data)) {
              if (v === DELETE_SENTINEL || (v && (v as any).__mockDelete)) {
                delete target[k];
              } else {
                target[k] = v;
              }
            }
            store[p._col][p._id] = target;
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
    mockVerifyTwilio: vi.fn(),
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

vi.mock("../lib/twilioVerify", () => ({
  verifyTwilioRequest: mockVerifyTwilio,
}));

// ── App under test (imported after mocks are registered) ────────────────────
import { createApp } from "../../server";

let app: Express;

beforeEach(async () => {
  vi.stubEnv("GITHUB_TOKEN", "");
  vi.stubEnv("GITHUB_REPO", "");
  vi.stubEnv("GITHUB_WEBHOOK_SECRET", "");
  vi.stubEnv("TWILIO_AUTH_TOKEN", "");
  vi.stubEnv("GROUPME_GROUP_ID", "");
  vi.stubEnv("GROUPME_BOT_ID", "");
  vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
  vi.stubEnv("APP_URL", "https://example.test");
  vi.stubGlobal("fetch", fetchMock);

  resetDb();
  getFirestoreDbIds.length = 0;
  mockVerifyTwilio.mockReturnValue(true);
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

describe("GET /api/quick-add/status", () => {
  it("reports Gemini configuration status and endpoint URLs", async () => {
    const res = await request(app).get("/api/quick-add/status");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      geminiConfigured: true,
      endpointUrl: "/api/quick-add",
      webhookUrl: "/api/webhook/sms",
      groupmeWebhookUrl: "/api/webhook/groupme",
      appUrl: "https://example.test",
    });
  });

  it("reports geminiConfigured false when GEMINI_API_KEY is absent", async () => {
    vi.stubEnv("GEMINI_API_KEY", "");
    const res = await request(app).get("/api/quick-add/status");
    expect(res.body.geminiConfigured).toBe(false);
  });
});

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
      expect(JSON.parse(raw).body).not.toMatch(/screenshot/i);
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

describe("POST /api/feedback/update", () => {
  it("returns 400 when id is missing", async () => {
    const res = await request(app).post("/api/feedback/update").send({ status: "resolved" });
    expect(res.status).toBe(400);
  });

  it("returns 404 when the feedback doc does not exist", async () => {
    const res = await request(app).post("/api/feedback/update").send({ id: "nope" });
    expect(res.status).toBe(404);
  });

  it("updates status and archived without touching GitHub when no issue URL", async () => {
    seedDoc("feedback", "fb-1", { status: "new", archived: false });
    const res = await request(app).post("/api/feedback/update").send({ id: "fb-1", status: "resolved", archived: true });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(getCollection("feedback")["fb-1"].status).toBe("resolved");
    expect(getCollection("feedback")["fb-1"].archived).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("closes the GitHub issue as completed when status becomes resolved", async () => {
    vi.stubEnv("GITHUB_TOKEN", "gh-token");
    seedDoc("feedback", "fb-2", { status: "new", archived: false, githubIssueUrl: "https://github.com/a/b/issues/9" });
    const res = await request(app).post("/api/feedback/update").send({ id: "fb-2", status: "resolved" });
    expect(res.status).toBe(200);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.github.com/repos/a/b/issues/9");
    expect((init as RequestInit).method).toBe("PATCH");
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ state: "closed", state_reason: "completed" });
  });

  it("skips GitHub sync when the issue URL is not a valid GitHub URL", async () => {
    vi.stubEnv("GITHUB_TOKEN", "gh-token");
    seedDoc("feedback", "fb-3", { status: "new", githubIssueUrl: "not-a-github-url" });
    const res = await request(app).post("/api/feedback/update").send({ id: "fb-3", status: "resolved" });
    expect(res.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
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

describe("GET /api/webhook/logs", () => {
  it("returns recent webhook logs", async () => {
    seedDoc("webhook_logs", "l1", { source: "SMS", status: "success" });
    seedDoc("webhook_logs", "l2", { source: "GroupMe", status: "error" });
    const res = await request(app).get("/api/webhook/logs");
    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(2);
    expect(res.body.logs.map((l: any) => l.dbId).sort()).toEqual(["l1", "l2"]);
  });

  it("caps the limit at 50", async () => {
    for (let i = 0; i < 60; i++) seedDoc("webhook_logs", `l${i}`, { source: "SMS" });
    const res = await request(app).get("/api/webhook/logs?limit=999");
    expect(res.status).toBe(200);
    expect(res.body.logs).toHaveLength(50);
  });
});

describe("POST /api/quick-add", () => {
  it("returns 400 when text is missing and logs the error", async () => {
    const res = await request(app).post("/api/quick-add").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("No text description provided");
    expect(Object.values(getCollection("webhook_logs"))).toHaveLength(1);
  });

  it("creates a new contact from parsed text", async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({ name: "Jane Doe", role: "Student", location: "Cafeteria", notes: "Met at lunch" }),
    });
    const res = await request(app).post("/api/quick-add").send({ text: "Met Jane Doe at the cafeteria" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.contact).toMatchObject({ isExisting: false, name: "Jane Doe" });
    // #1345: the model's guess at a group is ignored; nothing is stored for it.
    expect(res.body.contact).not.toHaveProperty("role");

    const contacts = Object.values(getCollection("contacts"));
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({ name: "Jane Doe", stage: "First Contact" });
    expect(contacts[0]).not.toHaveProperty("role");
    expect(Object.values(getCollection("activities")).length).toBeGreaterThan(0);
    expect(Object.values(getCollection("notifications")).length).toBeGreaterThan(0);
  });

  // #1024 phase 4: every server-side create stamps a tie, so it must stamp the
  // derived `visibleTo` in the same write or the rules hide the new contact
  // from the very person recorded as its creator/owner. `visibleTo` is defined
  // as visibleToOf() over the ties actually persisted, so these assert that
  // invariant rather than a hard-coded uid -- that is what the backfill and the
  // rules both read.
  it("stamps visibleTo on a contact a signed-in teammate creates from parsed text", async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: "uid-ada", email: "ada@example.com", name: "Ada" });
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({ name: "Vee Quinn", role: "Student" }),
    });
    const res = await request(app)
      .post("/api/quick-add")
      .set("Authorization", "Bearer token")
      .send({ text: "Met Vee Quinn" });
    expect(res.status).toBe(200);

    const created = Object.values(getCollection("contacts"))[0] as Record<string, unknown>;
    expect(created.createdBy).toBe("uid-ada");
    expect(created.visibleTo).toEqual(["uid-ada"]);
  });

  it("stamps visibleTo from the persisted ties on an unauthenticated automation create", async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({ name: "Vee Quinn", role: "Student" }),
    });
    const res = await request(app).post("/api/quick-add").send({ text: "Met Vee Quinn" });
    expect(res.status).toBe(200);

    const created = Object.values(getCollection("contacts"))[0] as Record<string, unknown>;
    // No real teammate is tied to it, so the access list is just the recorded
    // creator label -- it must still match visibleToOf() over what was written,
    // or the backfill will keep re-planning this row.
    expect(created.visibleTo).toEqual(visibleToOf(created as Parameters<typeof visibleToOf>[0]));
  });

  it("stamps visibleTo on a contact auto-created by the interaction subcommand", async () => {
    mockVerifyIdToken.mockResolvedValueOnce({ uid: "uid-ada", email: "ada@example.com", name: "Ada" });
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({ contactName: "Nia Fox", content: "Coffee chat", type: "Coffee" }),
    });
    const res = await request(app)
      .post("/api/quick-add")
      .set("Authorization", "Bearer token")
      .send({ text: "!add interaction Coffee with Nia Fox" });
    expect(res.status).toBe(200);

    const created = Object.values(getCollection("contacts"))[0] as Record<string, unknown>;
    expect(created.createdBy).toBe("uid-ada");
    expect(created.visibleTo).toEqual(["uid-ada"]);
  });

  it("merges into an existing contact matched by email", async () => {
    seedDoc("contacts", "c-1", { name: "Jane Doe", email: "jane@example.com", phone: "", role: "Student", tags: ["Gospel"] });
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({ name: "Jane Doe", email: "jane@example.com", role: "Student", tags: ["New"], notes: "Follow up" }),
    });
    const res = await request(app).post("/api/quick-add").send({ text: "Follow up with Jane" });
    expect(res.status).toBe(200);
    expect(res.body.contact.isExisting).toBe(true);
    expect(res.body.contact.id).toBe("c-1");
    expect(getCollection("contacts")["c-1"].tags).toEqual(["Gospel", "New"]);
    expect(getCollection("contacts")["c-1"].lastSeen).toBe("Just now");
  });

  it("logs an interaction for existing contacts when using the interaction subcommand", async () => {
    seedDoc("contacts", "c-2", { name: "Bob Smith", email: "bob@example.com" });
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({ contactName: "Bob Smith", content: "Coffee chat", type: "Coffee" }),
    });
    const res = await request(app).post("/api/quick-add").send({ text: "!add interaction Had coffee with Bob Smith" });
    expect(res.status).toBe(200);
    expect(res.body.contact.isExisting).toBe(true);

    const interactions = Object.values(getCollection("contacts/c-2/interactions"));
    expect(interactions).toHaveLength(1);
    expect(interactions[0].type).toBe("Coffee");
    expect(interactions[0].contactName).toBe("Bob Smith");
    // An interaction was logged, so the person is reached (#1335).
    expect(getCollection("contacts")["c-2"].reachedAt).toBe(interactions[0].dateTime);
  });

  it("attributes to the authenticated user when an Authorization header is present", async () => {
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify({ name: "New Person" }) });
    const res = await request(app)
      .post("/api/quick-add")
      .set("Authorization", "Bearer tok")
      .send({ text: "Met New Person" });
    expect(res.status).toBe(200);
    expect(Object.values(getCollection("contacts"))[0].createdBy).toBe("u-123");
    // Adding someone logs no interaction, so it reaches nobody (#1335).
    expect(Object.values(getCollection("contacts"))[0]).not.toHaveProperty("reachedAt");
  });

  it("matches an existing contact via fuzzy name containment", async () => {
    seedDoc("contacts", "c-3", { name: "Jonathan Doe", email: "", phone: "" });
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({ name: "Jonathan", email: "", phone: "" }),
    });
    const res = await request(app).post("/api/quick-add").send({ text: "Met Jonathan" });
    expect(res.status).toBe(200);
    expect(res.body.contact.isExisting).toBe(true);
    expect(res.body.contact.id).toBe("c-3");
    // The merge logs an interaction with them, so they are reached (#1335).
    const [logged] = Object.values(getCollection("contacts/c-3/interactions"));
    expect(getCollection("contacts")["c-3"].reachedAt).toBe(logged.dateTime);
    // ...which is bookkeeping, not a detail the merge filled in.
    const [activity] = Object.values(getCollection("activities"));
    expect(activity.description).toContain("No additional empty fields were present to fill.");
  });

  it("does not collapse 'Bob' onto an existing 'Bobby' contact (#731)", async () => {
    // Regression for: typing "Bob" (a substring of "Bobby") was matching the
    // existing contact via substring containment. Word-boundary matching prevents it.
    seedDoc("contacts", "c-bobby", { name: "Bobby Smith", email: "", phone: "" });
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({ name: "Bob", email: "", phone: "" }),
    });
    const res = await request(app).post("/api/quick-add").send({ text: "Met Bob" });
    expect(res.status).toBe(200);
    expect(res.body.contact.isExisting).toBe(false);
    expect(res.body.contact.name).toBe("Bob");
  });

  it("does not collapse 'Robert' onto an existing 'Roberto' contact (#731)", async () => {
    // GroupMe !add: typing "Robert" must not fold into existing "Roberto".
    seedDoc("contacts", "c-rob", { name: "Roberto Garcia", email: "", phone: "" });
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({ name: "Robert", email: "", phone: "" }),
    });
    const res = await request(app)
      .post("/api/webhook/groupme")
      .send({ text: "!add Robert", name: "Sam", sender_id: "s-1" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.contact.name).toBe("Robert");

    const contacts = Object.values(getCollection("contacts"));
    const nameOf = (c: unknown): string => {
      if (c && typeof c === "object" && "name" in c) {
        const name = c.name; // unknown until validated
        return typeof name === "string" ? name : "";
      }
      return "";
    };
    const robertos = contacts.filter((c) => nameOf(c) === "Roberto Garcia");
    const roberts = contacts.filter((c) => nameOf(c) === "Robert");
    expect(robertos).toHaveLength(1);
    expect(roberts).toHaveLength(1);
  });

  it("creates a minimal contact when logging an interaction for an unknown contact", async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({ contactName: "New Kid", content: "Bible study", type: "Bible Study" }),
    });
    const res = await request(app).post("/api/quick-add").send({ text: "!add interaction Bible study with New Kid" });
    expect(res.status).toBe(200);
    expect(res.body.contact.isExisting).toBe(false);
    expect(res.body.contact.name).toBe("New Kid");

    const contacts = Object.values(getCollection("contacts"));
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({ name: "New Kid", stage: "First Contact" });
    expect(contacts[0]).not.toHaveProperty("role");
    const id = res.body.contact.id;
    const logged = Object.values(getCollection(`contacts/${id}/interactions`));
    expect(logged).toHaveLength(1);
    expect(contacts[0].reachedAt).toBe(logged[0].dateTime);
  });

  it("returns 500 when Gemini cannot extract a name", async () => {
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify({ notes: "no name here" }) });
    const res = await request(app).post("/api/quick-add").send({ text: "some text" });
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it("returns 500 when Gemini returns no text", async () => {
    mockGenerateContent.mockResolvedValue({ text: "" });
    const res = await request(app).post("/api/quick-add").send({ text: "some text" });
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });
});

describe("POST /api/webhook/sms", () => {
  it("rejects requests with an invalid Twilio signature", async () => {
    vi.stubEnv("TWILIO_AUTH_TOKEN", "twilio-token");
    mockVerifyTwilio.mockReturnValue(false);
    const res = await request(app).post("/api/webhook/sms").type("form").send({ Body: "hello" });
    expect(res.status).toBe(403);
    expect(res.text).toContain("Forbidden");
  });

  it("returns 400 when the SMS body is empty", async () => {
    const res = await request(app).post("/api/webhook/sms").type("form").send({ From: "+123" });
    expect(res.status).toBe(400);
    expect(res.text).toContain("provide a valid text description");
  });

  it("quick-adds a contact and responds with TwiML", async () => {
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify({ name: "Ava Rose", role: "Student" }) });
    const res = await request(app).post("/api/webhook/sms").type("form").send({ Body: "Met Ava Rose", From: "+15550001111" });
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/xml");
    expect(res.text).toContain("Ava Rose");
    expect(Object.values(getCollection("contacts"))).toHaveLength(1);
  });

  it("returns a 500 TwiML error when quick-add fails", async () => {
    mockGenerateContent.mockResolvedValue({ text: "" });
    const res = await request(app).post("/api/webhook/sms").type("form").send({ Body: "Met Ava Rose" });
    expect(res.status).toBe(500);
    expect(res.headers["content-type"]).toContain("text/xml");
    expect(res.text).toContain("Failed to parse/quick-add contact");
  });
});

describe("POST /api/webhook/groupme", () => {
  it("rejects callbacks from an unexpected group", async () => {
    vi.stubEnv("GROUPME_GROUP_ID", "expected-group");
    const res = await request(app).post("/api/webhook/groupme").send({ text: "!add Jane", group_id: "other-group" });
    expect(res.status).toBe(403);
  });

  it("ignores messages from bots", async () => {
    const res = await request(app).post("/api/webhook/groupme").send({ text: "!add Jane", sender_type: "bot" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ignored_bot_sender");
  });

  it("ignores messages without a trigger prefix", async () => {
    const res = await request(app).post("/api/webhook/groupme").send({ text: "Jane Doe", name: "Sam" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ignored_no_trigger_prefix");
  });

  it("quick-adds a contact from a prefixed message", async () => {
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify({ name: "Leo King", role: "Student" }) });
    const res = await request(app).post("/api/webhook/groupme").send({ text: "!add Leo King", name: "Sam", sender_id: "s-1" });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.contact.name).toBe("Leo King");
  });

  it("posts a GroupMe bot confirmation when GROUPME_BOT_ID is set", async () => {
    vi.stubEnv("GROUPME_BOT_ID", "bot-123");
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify({ name: "Leo King", role: "Student" }) });
    const res = await request(app).post("/api/webhook/groupme").send({ text: "!add Leo King", name: "Sam", sender_id: "s-1" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.groupme.com/v3/bots/post");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.bot_id).toBe("bot-123");
    expect(body.text).toContain("Leo King");
  });

  it("does not post a GroupMe bot confirmation when GROUPME_BOT_ID is unset", async () => {
    vi.stubEnv("GROUPME_BOT_ID", "");
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify({ name: "Leo King", role: "Student" }) });
    const res = await request(app).post("/api/webhook/groupme").send({ text: "!add Leo King", name: "Sam", sender_id: "s-1" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });


  it("attributes createdBy and createdByName to matching user if GroupMe sender matches a team user", async () => {
    seedDoc("users", "user-sam-uid", {
      displayName: "Sam Wilson",
      email: "sam@campus.edu",
    });

    mockGenerateContent.mockResolvedValue({ text: JSON.stringify({ name: "Leo King", role: "Student" }) });
    const res = await request(app).post("/api/webhook/groupme").send({ text: "!add Leo King", name: "Sam Wilson", sender_id: "s-1" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const savedContacts = Object.values(getCollection("contacts"));
    const createdContact = savedContacts.find((c) => c.name === "Leo King");
    expect(createdContact).toBeDefined();
    expect(createdContact.createdBy).toBe("user-sam-uid");
    expect(createdContact.createdByName).toBe("Sam Wilson");
  });

  it("attributes creator via groupme_aliases if sender_id is mapped (#1103)", async () => {
    seedDoc("users", "user-tony-uid", {
      displayName: "Tony Stark",
      email: "tony@campus.edu",
    });
    seedDoc("groupme_aliases", "gm-tony-id", {
      senderId: "gm-tony-id",
      userId: "user-tony-uid",
      name: "Tony Stark",
    });

    mockGenerateContent.mockResolvedValue({ text: JSON.stringify({ name: "Peter Parker", role: "Student" }) });
    const res = await request(app).post("/api/webhook/groupme").send({
      text: "!add Peter Parker",
      name: "Iron Man", // Nickname does not match user name
      sender_id: "gm-tony-id",
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const savedContacts = Object.values(getCollection("contacts"));
    const createdContact = savedContacts.find((c) => c.name === "Peter Parker");
    expect(createdContact).toBeDefined();
    expect(createdContact.createdBy).toBe("user-tony-uid");
    expect(createdContact.createdByName).toBe("Tony Stark");
  });

  it("stamps gospel partner coCreators when creator has active pairing (#1103)", async () => {
    seedDoc("users", "user-trainee-1", {
      displayName: "Trainee One",
      email: "t1@campus.edu",
    });
    seedDoc("settings", "partners", {
      pairings: [
        { id: "pair-1", members: ["user-trainee-1", "user-trainee-2"], startDate: "2020-01-01" },
      ],
    });

    mockGenerateContent.mockResolvedValue({ text: JSON.stringify({ name: "Ned Leeds", role: "Student" }) });
    const res = await request(app).post("/api/webhook/groupme").send({
      text: "!add Ned Leeds",
      name: "Trainee One",
      sender_id: "s-t1",
    });

    expect(res.status).toBe(200);
    const savedContacts = Object.values(getCollection("contacts"));
    const created = savedContacts.find((c) => c.name === "Ned Leeds");
    expect(created).toBeDefined();
    expect(created.createdBy).toBe("user-trainee-1");
    expect(created.coCreators).toEqual(["user-trainee-2"]);
    expect(created.visibleTo).toContain("user-trainee-1");
    expect(created.visibleTo).toContain("user-trainee-2");
  });

  it("saves a GroupMe alias via POST /api/groupme-aliases (#1103)", async () => {
    seedDoc("users", "admin-1", { role: "admin", email: "admin@example.com" });
    seedDoc("users", "user-member-1", { displayName: "Bruce Banner", email: "bruce@campus.edu" });
    mockVerifyIdToken.mockResolvedValue({ uid: "admin-1", email: "admin@example.com" });

    const res = await request(app)
      .post("/api/groupme-aliases")
      .set("Authorization", "Bearer valid-token")
      .send({ senderId: "gm-hulk", userId: "user-member-1" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const aliases = getCollection("groupme_aliases");
    expect(aliases["gm-hulk"]).toBeDefined();
    expect(aliases["gm-hulk"].userId).toBe("user-member-1");
    expect(aliases["gm-hulk"].name).toBe("Bruce Banner");
  });

  it("retroactively repairs contacts via POST /api/groupme-aliases/repair (#1103)", async () => {
    seedDoc("users", "admin-1", { role: "admin", email: "admin@example.com" });
    seedDoc("users", "user-steve", { displayName: "Steve Rogers", email: "steve@campus.edu" });
    seedDoc("settings", "partners", {
      pairings: [
        { id: "pair-steve", members: ["user-steve", "user-bucky"], startDate: "2020-01-01" },
      ],
    });
    seedDoc("contacts", "contact-legacy", {
      name: "Bucky Barnes",
      createdBy: "groupme-gm-steve",
      createdByName: "Steve (GroupMe)",
      visibleTo: [],
    });
    mockVerifyIdToken.mockResolvedValue({ uid: "admin-1", email: "admin@example.com" });

    const res = await request(app)
      .post("/api/groupme-aliases/repair")
      .set("Authorization", "Bearer valid-token")
      .send({ senderId: "gm-steve", userId: "user-steve" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.repairedCount).toBe(1);

    const contact = getCollection("contacts")["contact-legacy"];
    expect(contact.createdBy).toBe("user-steve");
    expect(contact.createdByName).toBe("Steve Rogers");
    expect(contact.coCreators).toEqual(["user-bucky"]);
    expect(contact.visibleTo).toContain("user-steve");
    expect(contact.visibleTo).toContain("user-bucky");
  });

  it("tags a new GroupMe-added contact with the current semester", async () => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const semesterTag = month >= 8 ? `Fall ${year}` : month >= 5 ? `Summer ${year}` : `Spring ${year}`;

    mockGenerateContent.mockResolvedValue({ text: JSON.stringify({ name: "Leo King", role: "Student" }) });
    const res = await request(app).post("/api/webhook/groupme").send({ text: "!add Leo King", name: "Sam", sender_id: "s-1" });

    expect(res.status).toBe(200);
    const savedContacts = Object.values(getCollection("contacts"));
    expect(savedContacts.some((c) => c.name === "Leo King" && (c.tags || []).includes(semesterTag))).toBe(true);
  });

  it("adds the semester tag to an existing GroupMe-matched contact", async () => {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    const semesterTag = month >= 8 ? `Fall ${year}` : month >= 5 ? `Summer ${year}` : `Spring ${year}`;

    seedDoc("contacts", "existing-leo", {
      name: "Leo King",
      role: "Student",
      stage: "First Contact",
      tags: ["Gospel"],
    });

    mockGenerateContent.mockResolvedValue({ text: JSON.stringify({ name: "Leo King", role: "Student" }) });
    const res = await request(app).post("/api/webhook/groupme").send({ text: "!add Leo King", name: "Sam", sender_id: "s-1" });

    expect(res.status).toBe(200);
    const saved = getCollection("contacts")["existing-leo"];
    expect(saved.tags).toContain("Gospel");
    expect(saved.tags).toContain(semesterTag);
  });

  it("handles the /add prefix trigger", async () => {
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify({ name: "Mia Lane", role: "Student" }) });
    const res = await request(app).post("/api/webhook/groupme").send({ text: "/add Mia Lane", name: "Sam" });
    expect(res.status).toBe(200);
    expect(res.body.contact.name).toBe("Mia Lane");
  });

  it("treats a bare trigger as no-prefix since the trailing space is trimmed", async () => {
    // text.trim() strips the trailing space, so "!add " no longer matches the
    // "!add " prefix and falls through to ignored_no_trigger_prefix.
    const res = await request(app).post("/api/webhook/groupme").send({ text: "!add ", name: "Sam" });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ignored_no_trigger_prefix");
  });
});

describe("POST /api/smart-import/commit", () => {
  it("successfully commits contacts, interactions, and discussions to Firestore", async () => {
    const res = await request(app)
      .post("/api/smart-import/commit")
      .send({
        contacts: [{ tempId: "c1", name: "Alice", email: "alice@test.com" }],
        interactions: [{ tempId: "i1", contactRef: "c1", content: "Met for coffee", type: "coffee" }],
        discussions: [{ tempId: "d1", title: "Strategy", content: "Notes", audience: "team" }],
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.summary).toEqual({
      contactsCount: 1,
      interactionsCount: 1,
      discussionsCount: 1,
    });
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

describe("GET /api/quick-add/status", () => {
  it("returns server configuration status", async () => {
    const res = await request(app).get("/api/quick-add/status");
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      geminiConfigured: true,
      endpointUrl: "/api/quick-add",
      webhookUrl: "/api/webhook/sms",
      groupmeWebhookUrl: "/api/webhook/groupme",
    });
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
      .post("/api/feedback/update")
      .set("Authorization", "Bearer tok")
      .send({ id: "f-1", status: "resolved" });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("User does not exist");
  });

  it("returns 403 when user has non-admin role", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "trainee-1", email: "trainee@example.com" });
    seedDoc("users", "trainee-1", { role: "trainee" });
    const res = await request(app)
      .post("/api/feedback/update")
      .set("Authorization", "Bearer tok")
      .send({ id: "f-1", status: "resolved" });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain("not an administrator");
  });

  it("allows the founder email without a users doc", async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: "founder-1",
      email: "yilongwang05@gmail.com",
      firebase: { sign_in_second_factor: "totp" },
    });
    seedDoc("feedback", "f-2", { status: "new" });
    const res = await request(app)
      .post("/api/feedback/update")
      .set("Authorization", "Bearer tok")
      .send({ id: "f-2", status: "resolved" });
    expect(res.status).toBe(200);
  });

  it("allows a user whose users doc has role admin", async () => {
    mockVerifyIdToken.mockResolvedValue({
      uid: "admin-1",
      email: "admin@example.com",
      firebase: { sign_in_second_factor: "totp" },
    });
    seedDoc("users", "admin-1", { role: "admin" });
    seedDoc("feedback", "f-3", { status: "new" });
    const res = await request(app)
      .post("/api/feedback/update")
      .set("Authorization", "Bearer tok")
      .send({ id: "f-3", status: "resolved" });
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
      .post("/api/feedback/update")
      .set("Authorization", "Bearer tok")
      .send({ id: "f-4", status: "resolved" });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain("Multi-factor authentication required");
  });

  it("forbids non-admin access to webhook logs", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "trainee-2", email: "t2@example.com" });
    seedDoc("users", "trainee-2", { role: "trainee" });
    const res = await request(app).get("/api/webhook/logs").set("Authorization", "Bearer tok");
    expect(res.status).toBe(403);
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

describe("POST /api/feedback/update — GitHub sync branches", () => {
  it("closes the GitHub issue as not_planned when archived without resolved status", async () => {
    vi.stubEnv("GITHUB_TOKEN", "gh-token");
    seedDoc("feedback", "fb-arch", { status: "new", archived: false, githubIssueUrl: "https://github.com/a/b/issues/10" });
    const res = await request(app).post("/api/feedback/update").send({ id: "fb-arch", archived: true });
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.github.com/repos/a/b/issues/10");
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ state: "closed", state_reason: "not_planned" });
  });

  it("reopens the GitHub issue when status moves back from resolved", async () => {
    vi.stubEnv("GITHUB_TOKEN", "gh-token");
    seedDoc("feedback", "fb-re", { status: "resolved", archived: false, githubIssueUrl: "https://github.com/a/b/issues/11" });
    const res = await request(app).post("/api/feedback/update").send({ id: "fb-re", status: "in_progress" });
    expect(res.status).toBe(200);
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toMatchObject({ state: "open" });
  });

  it("reopens the GitHub issue when feedback is unarchived", async () => {
    vi.stubEnv("GITHUB_TOKEN", "gh-token");
    seedDoc("feedback", "fb-un", { status: "new", archived: true, githubIssueUrl: "https://github.com/a/b/issues/12" });
    const res = await request(app).post("/api/feedback/update").send({ id: "fb-un", archived: false });
    expect(res.status).toBe(200);
    expect(JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)).toMatchObject({ state: "open" });
  });

  it("warns and skips GitHub sync when GITHUB_TOKEN is not configured", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    seedDoc("feedback", "fb-nt", { status: "new", githubIssueUrl: "https://github.com/a/b/issues/13" });
    const res = await request(app).post("/api/feedback/update").send({ id: "fb-nt", status: "resolved" });
    expect(res.status).toBe(200);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("GITHUB_TOKEN not configured"));
    expect(fetchMock).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("logs GitHub API errors during issue state sync", async () => {
    vi.stubEnv("GITHUB_TOKEN", "gh-token");
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValue(new Response("bad", { status: 500 }));
    seedDoc("feedback", "fb-err", { status: "new", githubIssueUrl: "https://github.com/a/b/issues/14" });
    const res = await request(app).post("/api/feedback/update").send({ id: "fb-err", status: "resolved" });
    expect(res.status).toBe(200);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("GitHub API error updating issue"), 500, expect.any(String));
    errSpy.mockRestore();
  });

  it("logs when the GitHub sync fetch throws", async () => {
    vi.stubEnv("GITHUB_TOKEN", "gh-token");
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockRejectedValue(new Error("network"));
    seedDoc("feedback", "fb-fetch", { status: "new", githubIssueUrl: "https://github.com/a/b/issues/15" });
    const res = await request(app).post("/api/feedback/update").send({ id: "fb-fetch", status: "resolved" });
    expect(res.status).toBe(200);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("Failed to update GitHub issue state for"), expect.any(String), expect.any(Error));
    errSpy.mockRestore();
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

describe("POST /api/quick-add — merge and subcommand paths", () => {
  it("merges missing contact fields on quick-add and leaves the stored role alone (#1345)", async () => {
    seedDoc("contacts", "c-merge", { name: "Kim Lee", email: "", phone: "", location: "", role: "Student", tags: [] });
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({
        name: "Kim Lee",
        email: "kim@example.com",
        phone: "+1 (555) 010-2222",
        location: "Library",
        role: "Trainee",
        spiritualBackground: "Christian family",
        tags: ["New"],
      }),
    });
    const res = await request(app).post("/api/quick-add").send({ text: "Met Kim Lee" });
    expect(res.status).toBe(200);
    expect(res.body.contact.isExisting).toBe(true);
    const updated = getCollection("contacts")["c-merge"];
    expect(updated.email).toBe("kim@example.com");
    expect(updated.phone).toBe("+1 (555) 010-2222");
    // #730: the location field is no longer merged on quick-add — it has
    // been retired from the form, so quick-add shouldn't carry it either.
    expect(updated.spiritualBackground).toBe("Christian family");
    // The model offered "Trainee"; the stored role is neither upgraded nor dropped.
    expect(updated.role).toBe("Student");
    expect(updated.tags).toEqual(["New"]);
  });

  it("returns 500 when Gemini returns no text for interaction parsing", async () => {
    mockGenerateContent.mockResolvedValue({ text: "" });
    const res = await request(app).post("/api/quick-add").send({ text: "!add interaction Coffee with Bob" });
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
  });

  it("returns 401 when token verification fails on quick-add", async () => {
    mockVerifyIdToken.mockRejectedValue(new Error("bad token"));
    const res = await request(app)
      .post("/api/quick-add")
      .set("Authorization", "Bearer nope")
      .send({ text: "Met someone" });
    expect(res.status).toBe(401);
    expect(res.body.error).toContain("Unauthorized");
  });
});

describe("POST /api/webhook/groupme — prefix and error paths", () => {
  it("handles the add: prefix trigger", async () => {
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify({ name: "Nia Cole", role: "Student" }) });
    const res = await request(app).post("/api/webhook/groupme").send({ text: "add: Nia Cole", name: "Sam" });
    expect(res.status).toBe(200);
    expect(res.body.contact.name).toBe("Nia Cole");
  });

  it("returns 400 when the message has no text", async () => {
    const res = await request(app).post("/api/webhook/groupme").send({ name: "Sam", group_id: "g1" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("No message text provided");
  });

  it("returns 500 when quick-add fails inside groupme", async () => {
    mockGenerateContent.mockResolvedValue({ text: "not json" });
    const res = await request(app).post("/api/webhook/groupme").send({ text: "!add bad data", name: "Sam" });
    expect(res.status).toBe(500);
    expect(res.body.error).toBeTruthy();
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
  it("maps matched contacts and links interactions by contact name", async () => {
    const res = await request(app).post("/api/smart-import/commit").send({
      contacts: [{ tempId: "c1", name: "Amy", matchedContactId: "existing-1", matchedContactName: "Amy" }],
      interactions: [{ tempId: "i1", contactName: "Amy", content: "Chat", type: "coffee" }],
    });
    expect(res.status).toBe(200);
    expect(res.body.summary.contactsCount).toBe(0);
    expect(res.body.summary.interactionsCount).toBe(1);
    expect(Object.values(getCollection("contacts/existing-1/interactions"))).toHaveLength(1);
    const storedContact = getCollection("contacts")["existing-1"];
    expect(storedContact.name).toBeUndefined();
    expect(storedContact.lastSeen).toBeTruthy();
    // The imported interaction reaches them (#1335).
    expect(storedContact.reachedAt).toBe(storedContact.lastContactedDate);
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

describe("POST /api/translate — batch translation & smart caching", () => {
  let app: Express;

  beforeEach(async () => {
    resetDb();
    mockGenerateContent.mockReset();
    app = await createApp();
  });

  it("returns 400 when texts is missing or not an array", async () => {
    const res = await request(app).post("/api/translate").send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Missing or invalid 'texts' parameter");
  });

  it("returns 400 when texts is empty", async () => {
    const res = await request(app).post("/api/translate").send({ texts: [] });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Missing or invalid 'texts' parameter");
  });

  it("returns 400 when any text in array is not a string", async () => {
    const res = await request(app).post("/api/translate").send({ texts: ["valid", 123 as any] });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("must be strings");
  });

  it("returns 400 when targetLang is invalid format", async () => {
    const res = await request(app).post("/api/translate").send({ texts: ["hello"], targetLang: "invalid_lang_code!@#" });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid 'targetLang' parameter");
  });

  it("returns 400 when batch size exceeds 100", async () => {
    const texts = Array.from({ length: 101 }, (_, i) => `Text ${i}`);
    const res = await request(app).post("/api/translate").send({ texts });
    expect(res.status).toBe(400);
    expect(res.body.error).toContain("exceeds maximum limit of 100");
  });

  it("translates uncached strings with Gemini and caches them in Firestore", async () => {
    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        translations: [
          { id: 0, translatedText: "Orad por los estudiantes durante los exámenes finales" },
          { id: 1, translatedText: "Reunión de compañerismo" }
        ]
      })
    });

    const res = await request(app).post("/api/translate").send({
      targetLang: "es",
      texts: [
        "Pray for students during finals week",
        "Fellowship Gathering",
        "   "
      ]
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.targetLang).toBe("es");
    expect(res.body.translations).toHaveLength(3);

    expect(res.body.translations[0]).toEqual({
      original: "Pray for students during finals week",
      translated: "Orad por los estudiantes durante los exámenes finales",
      hash: expect.any(String),
      cached: false
    });

    expect(res.body.translations[1]).toEqual({
      original: "Fellowship Gathering",
      translated: "Reunión de compañerismo",
      hash: expect.any(String),
      cached: false
    });

    // Whitespace-only string returns unchanged and cached
    expect(res.body.translations[2]).toEqual({
      original: "   ",
      translated: "   ",
      hash: "",
      cached: true
    });

    // Verify stored in Firestore translations collection
    const translationsCol = getCollection("translations");
    const storedKeys = Object.keys(translationsCol);
    expect(storedKeys.length).toBe(2);
    expect(translationsCol[storedKeys[0]].targetLang).toBe("es");
  });

  it("returns cached translations directly without calling Gemini when already present", async () => {
    const hash1 = crypto.createHash("sha256").update("es:Welcome to Campus Hub").digest("hex");
    seedDoc("translations", hash1, {
      hash: hash1,
      sourceText: "Welcome to Campus Hub",
      translatedText: "Bienvenido a Campus Hub",
      targetLang: "es",
      createdAt: new Date().toISOString()
    });

    const res = await request(app).post("/api/translate").send({
      targetLang: "es",
      texts: ["Welcome to Campus Hub"]
    });

    expect(res.status).toBe(200);
    expect(res.body.translations[0]).toEqual({
      original: "Welcome to Campus Hub",
      translated: "Bienvenido a Campus Hub",
      hash: hash1,
      cached: true
    });
    expect(mockGenerateContent).not.toHaveBeenCalled();
  });

  it("handles a mix of cached and uncached texts correctly in exact order", async () => {
    const hashCached = crypto.createHash("sha256").update("es:Hello").digest("hex");
    seedDoc("translations", hashCached, {
      hash: hashCached,
      sourceText: "Hello",
      translatedText: "Hola",
      targetLang: "es",
      createdAt: new Date().toISOString()
    });

    mockGenerateContent.mockResolvedValueOnce({
      text: JSON.stringify({
        translations: [
          { id: 0, translatedText: "Mundo" }
        ]
      })
    });

    const res = await request(app).post("/api/translate").send({
      targetLang: "es",
      texts: ["Hello", "World"]
    });

    expect(res.status).toBe(200);
    expect(res.body.translations[0]).toEqual({
      original: "Hello",
      translated: "Hola",
      hash: hashCached,
      cached: true
    });
    expect(res.body.translations[1]).toEqual({
      original: "World",
      translated: "Mundo",
      hash: expect.any(String),
      cached: false
    });
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it("falls back gracefully to original text when Gemini API fails without crashing", async () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    mockGenerateContent.mockRejectedValueOnce(new Error("Gemini quota exceeded"));

    const res = await request(app).post("/api/translate").send({
      texts: ["Some new text"]
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.translations).toHaveLength(1);
    expect(res.body.translations[0].translated).toBe("Some new text");
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it("chunks large batches of uncached items (>15) into multiple Gemini calls", async () => {
    mockGenerateContent
      .mockResolvedValueOnce({
        text: JSON.stringify({
          translations: Array.from({ length: 15 }, (_, i) => ({ id: i, translatedText: `Traducido ${i}` }))
        })
      })
      .mockResolvedValueOnce({
        text: JSON.stringify({
          translations: Array.from({ length: 5 }, (_, i) => ({ id: 15 + i, translatedText: `Traducido ${15 + i}` }))
        })
      });

    const texts = Array.from({ length: 20 }, (_, i) => `Uncached text ${i}`);
    const res = await request(app).post("/api/translate").send({
      targetLang: "es",
      texts
    });

    expect(res.status).toBe(200);
    expect(res.body.translations).toHaveLength(20);
    expect(res.body.translations[0].translated).toBe("Traducido 0");
    expect(res.body.translations[19].translated).toBe("Traducido 19");
    expect(mockGenerateContent).toHaveBeenCalledTimes(2);
  });
});



// ── Feedback Follow-ups and submitter-facing copy (ADR 0019) ────────────────

describe("POST /api/feedback/reply", () => {
  const issueUrl = "https://github.com/a/b/issues/7";

  const seedNote = (over: Record<string, any> = {}) =>
    seedDoc("feedback", "fb-1", {
      userId: "user-ada",
      userName: "Ada Student",
      status: "in_progress",
      githubIssueUrl: issueUrl,
      ...over,
    });

  it("refuses a request with no Firebase token", async () => {
    seedNote();
    const res = await request(app).post("/api/feedback/reply").send({ id: "fb-1", body: "Any news?" });
    expect(res.status).toBe(401);
  });

  it("requires both an id and a body", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "user-ada", email: "ada@test.com", name: "Ada Student" });
    const res = await request(app)
      .post("/api/feedback/reply")
      .set("Authorization", "Bearer t")
      .send({ id: "fb-1", body: "   " });
    expect(res.status).toBe(400);
  });

  it("404s on a note that does not exist", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "user-ada", email: "ada@test.com", name: "Ada Student" });
    const res = await request(app)
      .post("/api/feedback/reply")
      .set("Authorization", "Bearer t")
      .send({ id: "nope", body: "Any news?" });
    expect(res.status).toBe(404);
  });

  it("refuses a stranger — neither the author nor a Full-timer", async () => {
    seedNote();
    seedDoc("users", "user-bob", { role: "viewer", approved: true, email: "bob@test.com" });
    mockVerifyIdToken.mockResolvedValue({ uid: "user-bob", email: "bob@test.com", name: "Bob" });
    const res = await request(app)
      .post("/api/feedback/reply")
      .set("Authorization", "Bearer t")
      .send({ id: "fb-1", body: "Nosy question" });
    expect(res.status).toBe(403);
  });

  it("stores the author's follow-up, flags the note, and tells the Full-timers", async () => {
    seedNote();
    seedDoc("users", "user-ada", { role: "viewer", approved: true, email: "ada@test.com" });
    seedDoc("users", "ft-1", { role: "admin", approved: true, email: "ft1@test.com" });
    seedDoc("users", "ft-2", { role: "admin", approved: true, email: "ft2@test.com" });
    mockVerifyIdToken.mockResolvedValue({ uid: "user-ada", email: "ada@test.com", name: "Ada Student" });

    const res = await request(app)
      .post("/api/feedback/reply")
      .set("Authorization", "Bearer t")
      .send({ id: "fb-1", body: "Which screen is it on?" });

    expect(res.status).toBe(200);
    const replies = Object.values(getCollection("feedback/fb-1/replies"));
    expect(replies).toHaveLength(1);
    expect(replies[0]).toMatchObject({ authorRole: "submitter", authorId: "user-ada", body: "Which screen is it on?" });
    expect(getCollection("feedback")["fb-1"].awaitingReply).toBe(true);

    const notified = Object.values(getCollection("notifications")).map((n: any) => n.userId);
    expect(notified).toEqual(expect.arrayContaining(["ft-1", "ft-2"]));
    expect(notified).not.toContain("user-ada");
  });

  it("a Full-timer's reply clears the flag and notifies the submitter instead", async () => {
    seedNote({ awaitingReply: true });
    seedDoc("users", "ft-1", { role: "admin", approved: true, email: "ft1@test.com" });
    mockVerifyIdToken.mockResolvedValue({ uid: "ft-1", email: "ft1@test.com", name: "Tony Wang" });

    const res = await request(app)
      .post("/api/feedback/reply")
      .set("Authorization", "Bearer t")
      .send({ id: "fb-1", body: "It's on the roster screen." });

    expect(res.status).toBe(200);
    const replies: any[] = Object.values(getCollection("feedback/fb-1/replies"));
    expect(replies[0]).toMatchObject({ authorRole: "team", authorName: "Tony Wang" });
    expect(getCollection("feedback")["fb-1"].awaitingReply).toBe(false);
    expect(Object.values(getCollection("notifications"))).toEqual([
      expect.objectContaining({ userId: "user-ada", message: "It's on the roster screen." }),
    ]);
  });

  it("never touches status or outcome — a follow-up is not a reopen", async () => {
    seedNote({ status: "resolved", outcome: "shipped" });
    seedDoc("users", "user-ada", { role: "viewer", approved: true, email: "ada@test.com" });
    mockVerifyIdToken.mockResolvedValue({ uid: "user-ada", email: "ada@test.com", name: "Ada Student" });

    await request(app)
      .post("/api/feedback/reply")
      .set("Authorization", "Bearer t")
      .send({ id: "fb-1", body: "One more thing" });

    expect(getCollection("feedback")["fb-1"].status).toBe("resolved");
    expect(getCollection("feedback")["fb-1"].outcome).toBe("shipped");
  });

  it("mirrors the follow-up onto the issue without naming the reporter", async () => {
    vi.stubEnv("GITHUB_TOKEN", "ghp_test");
    seedNote();
    seedDoc("users", "user-ada", { role: "viewer", approved: true, email: "ada@test.com" });
    mockVerifyIdToken.mockResolvedValue({ uid: "user-ada", email: "ada@test.com", name: "Ada Student" });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 4242 }), { status: 201 }));

    const res = await request(app)
      .post("/api/feedback/reply")
      .set("Authorization", "Bearer t")
      .send({ id: "fb-1", body: "Which screen is it on?" });

    expect(res.body.mirroredToGitHub).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.github.com/repos/a/b/issues/7/comments");
    const posted = JSON.parse((init as RequestInit).body as string).body;
    expect(posted).toContain("**Reporter replied:**");
    expect(posted).toContain("Which screen is it on?");
    expect(posted).not.toContain("Ada Student");
    expect(posted).not.toContain("ada@test.com");

    const replies: any[] = Object.values(getCollection("feedback/fb-1/replies"));
    expect(replies[0].githubCommentId).toBe(4242);
  });

  it("still stores and notifies when GitHub is unreachable", async () => {
    vi.stubEnv("GITHUB_TOKEN", "ghp_test");
    seedNote();
    seedDoc("users", "user-ada", { role: "viewer", approved: true, email: "ada@test.com" });
    mockVerifyIdToken.mockResolvedValue({ uid: "user-ada", email: "ada@test.com", name: "Ada Student" });
    fetchMock.mockRejectedValue(new Error("network down"));

    const res = await request(app)
      .post("/api/feedback/reply")
      .set("Authorization", "Bearer t")
      .send({ id: "fb-1", body: "Any news?" });

    expect(res.status).toBe(200);
    expect(res.body.mirroredToGitHub).toBe(false);
    expect(Object.values(getCollection("feedback/fb-1/replies"))).toHaveLength(1);
  });
});

describe("POST /api/feedback/reply/edit", () => {
  const issueUrl = "https://github.com/a/b/issues/7";

  const seedReply = (over: Record<string, any> = {}) => {
    seedDoc("feedback", "fb-1", {
      userId: "user-ada",
      userName: "Ada Student",
      status: "in_progress",
      githubIssueUrl: issueUrl,
    });
    seedDoc("feedback/fb-1/replies", "r1", {
      authorRole: "submitter",
      authorId: "user-ada",
      authorName: "Ada Student",
      body: "Which screen is it on?",
      createdAt: { __mockServerTimestamp: true },
      ...over,
    });
  };

  const edit = (body: Record<string, any>) =>
    request(app).post("/api/feedback/reply/edit").set("Authorization", "Bearer t").send(body);

  it("refuses a request with no Firebase token", async () => {
    seedReply();
    const res = await request(app)
      .post("/api/feedback/reply/edit")
      .send({ id: "fb-1", replyId: "r1", body: "Changed" });
    expect(res.status).toBe(401);
  });

  it("requires a reply id and a body", async () => {
    seedReply();
    mockVerifyIdToken.mockResolvedValue({ uid: "user-ada", email: "ada@test.com", name: "Ada Student" });
    const res = await edit({ id: "fb-1", replyId: "r1", body: "   " });
    expect(res.status).toBe(400);
    const noReplyId = await edit({ id: "fb-1", body: "Changed" });
    expect(noReplyId.status).toBe(400);
  });

  it("404s when the reply does not exist", async () => {
    seedReply();
    mockVerifyIdToken.mockResolvedValue({ uid: "user-ada", email: "ada@test.com", name: "Ada Student" });
    const res = await edit({ id: "fb-1", replyId: "nope", body: "Changed" });
    expect(res.status).toBe(404);
  });

  it("refuses anyone who is not the reply's author, Full-timers included", async () => {
    seedReply();
    seedDoc("users", "user-bob", { role: "viewer", approved: true, email: "bob@test.com" });
    seedDoc("users", "ft-1", { role: "admin", approved: true, email: "ft1@test.com" });
    mockVerifyIdToken.mockResolvedValue({ uid: "user-bob", email: "bob@test.com", name: "Bob" });
    const stranger = await edit({ id: "fb-1", replyId: "r1", body: "Nosy edit" });
    expect(stranger.status).toBe(403);

    mockVerifyIdToken.mockResolvedValue({ uid: "ft-1", email: "ft1@test.com", name: "Tony Wang" });
    const fullTimer = await edit({ id: "fb-1", replyId: "r1", body: "Admin edit" });
    expect(fullTimer.status).toBe(403);
  });

  it("refuses to edit a relayed reply — it belongs to the issue, not the app", async () => {
    seedReply({ relayed: true, authorId: undefined });
    mockVerifyIdToken.mockResolvedValue({ uid: "user-ada", email: "ada@test.com", name: "Ada Student" });
    const res = await edit({ id: "fb-1", replyId: "r1", body: "Changed" });
    expect(res.status).toBe(403);
  });

  it("refuses to edit a team reply, even the one the Full-timer wrote in-app", async () => {
    seedReply({ authorRole: "team", authorId: "ft-1", authorName: "Tony Wang" });
    mockVerifyIdToken.mockResolvedValue({ uid: "ft-1", email: "ft1@test.com", name: "Tony Wang" });
    const res = await edit({ id: "fb-1", replyId: "r1", body: "Admin edit" });
    expect(res.status).toBe(403);
  });

  it("lets the author replace their follow-up's text in place, preserving the rest", async () => {
    seedReply({ githubCommentId: 4242 });
    mockVerifyIdToken.mockResolvedValue({ uid: "user-ada", email: "ada@test.com", name: "Ada Student" });

    const res = await edit({ id: "fb-1", replyId: "r1", body: "Which screen — the roster?" });

    expect(res.status).toBe(200);
    expect(res.body.mirroredToGitHub).toBe(false);
    const reply: any = getCollection("feedback/fb-1/replies")["r1"];
    expect(reply.body).toBe("Which screen — the roster?");
    // Marks it so Your notes can say "Edited"; an untouched reply has none.
    expect(reply.editedAt).toEqual({ __mockServerTimestamp: true });
    expect(reply).toMatchObject({
      authorRole: "submitter",
      authorId: "user-ada",
      authorName: "Ada Student",
      githubCommentId: 4242,
    });
  });

  it("mirrors the edit onto the GitHub comment, keeping the reporter prefix", async () => {
    vi.stubEnv("GITHUB_TOKEN", "ghp_test");
    seedReply({ githubCommentId: 4242 });
    mockVerifyIdToken.mockResolvedValue({ uid: "user-ada", email: "ada@test.com", name: "Ada Student" });
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));

    const res = await edit({ id: "fb-1", replyId: "r1", body: "Changed my question" });

    expect(res.status).toBe(200);
    expect(res.body.mirroredToGitHub).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe("https://api.github.com/repos/a/b/issues/comments/4242");
    expect((init as RequestInit).method).toBe("PATCH");
    const posted = JSON.parse((init as RequestInit).body as string).body;
    expect(posted).toContain("**Reporter replied:**");
    expect(posted).toContain("Changed my question");
    expect(posted).not.toContain("Which screen is it on?");
    expect(getCollection("feedback/fb-1/replies")["r1"].body).toBe("Changed my question");
  });

  it("updates in place, without touching GitHub, when the reply was never mirrored", async () => {
    vi.stubEnv("GITHUB_TOKEN", "ghp_test");
    seedReply();
    mockVerifyIdToken.mockResolvedValue({ uid: "user-ada", email: "ada@test.com", name: "Ada Student" });

    const res = await edit({ id: "fb-1", replyId: "r1", body: "Local edit" });

    expect(res.status).toBe(200);
    expect(res.body.mirroredToGitHub).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getCollection("feedback/fb-1/replies")["r1"].body).toBe("Local edit");
  });

  it("still updates the note when GitHub is unreachable", async () => {
    vi.stubEnv("GITHUB_TOKEN", "ghp_test");
    seedReply({ githubCommentId: 4242 });
    mockVerifyIdToken.mockResolvedValue({ uid: "user-ada", email: "ada@test.com", name: "Ada Student" });
    fetchMock.mockRejectedValue(new Error("network down"));

    const res = await edit({ id: "fb-1", replyId: "r1", body: "Optimistic edit" });

    expect(res.status).toBe(200);
    expect(res.body.mirroredToGitHub).toBe(false);
    expect(getCollection("feedback/fb-1/replies")["r1"].body).toBe("Optimistic edit");
  });

  it("never touches status, outcome, or awaitingReply — an edit is not a reopen", async () => {
    seedReply({ githubCommentId: 4242 });
    seedDoc("feedback", "fb-1", {
      userId: "user-ada",
      status: "resolved",
      outcome: "shipped",
      awaitingReply: false,
      githubIssueUrl: issueUrl,
    });
    mockVerifyIdToken.mockResolvedValue({ uid: "user-ada", email: "ada@test.com", name: "Ada Student" });

    await edit({ id: "fb-1", replyId: "r1", body: "Reworded" });

    expect(getCollection("feedback")["fb-1"].status).toBe("resolved");
    expect(getCollection("feedback")["fb-1"].outcome).toBe("shipped");
    expect(getCollection("feedback")["fb-1"].awaitingReply).toBe(false);
  });

  it("caps the new body at 5000 characters", async () => {
    seedReply();
    mockVerifyIdToken.mockResolvedValue({ uid: "user-ada", email: "ada@test.com", name: "Ada Student" });

    const res = await edit({ id: "fb-1", replyId: "r1", body: "x".repeat(6000) });

    expect(res.status).toBe(200);
    expect(getCollection("feedback/fb-1/replies")["r1"].body).toHaveLength(5000);
  });
});

describe("POST /api/webhook/github — issue_comment relay", () => {
  const issueUrl = "https://github.com/a/b/issues/7";
  const payload = (over: Record<string, any> = {}) => ({
    action: "created",
    issue: { html_url: issueUrl },
    comment: { id: 99, body: "Specced as #910. Confirmed as the textarea rather than the preview.", user: { login: "Shir0o", type: "User" } },
    ...over,
  });

  const post = (body: any) =>
    request(app)
      .post("/api/webhook/github")
      .set("x-github-event", "issue_comment")
      .set("x-hub-signature-256", sign(body, "sekret"))
      .send(body);

  beforeEach(() => {
    vi.stubEnv("GITHUB_WEBHOOK_SECRET", "sekret");
    seedDoc("feedback", "fb-9", { userId: "user-ada", status: "in_progress", githubIssueUrl: issueUrl });
  });

  it("relays a laundered restatement, never the raw comment", async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({ relay: true, text: "We've traced this to the text box and a fix is on the way." }),
    });

    const res = await post(payload());
    expect(res.status).toBe(200);
    expect(res.body.relayedCount).toBe(1);

    const replies: any[] = Object.values(getCollection("feedback/fb-9/replies"));
    expect(replies[0]).toMatchObject({
      authorRole: "team",
      relayed: true,
      githubCommentId: 99,
      body: "We've traced this to the text box and a fix is on the way.",
    });
    expect(replies[0].body).not.toContain("#910");
    expect(replies[0].launderedBody).toBeUndefined();
  });

  it("drops an AI triage brief without asking the model at all", async () => {
    const body = payload({
      comment: {
        id: 100,
        body: "> *This was generated by AI during triage.*\n\n## Agent Brief\n\n**Category:** bug\n**Summary:** the toolbar steals focus",
        user: { login: "Shir0o", type: "User" },
      },
    });

    const res = await post(body);
    expect(res.status).toBe(200);
    expect(res.body.relayedCount).toBe(0);
    expect(mockGenerateContent).not.toHaveBeenCalled();
    expect(Object.values(getCollection("feedback/fb-9/replies"))).toHaveLength(0);
  });

  it("drops a comment the model judges to be internal bookkeeping", async () => {
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify({ relay: false, text: "" }) });
    const res = await post(payload());
    expect(res.body.relayedCount).toBe(0);
    expect(Object.values(getCollection("feedback/fb-9/replies"))).toHaveLength(0);
  });

  it("does not relay a comment it already stored — the mirror does not echo", async () => {
    seedDoc("feedback/fb-9/replies", "r1", { authorRole: "submitter", body: "Any news?", githubCommentId: 99 });
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify({ relay: true, text: "restated" }) });

    const res = await post(payload());
    expect(res.body.relayedCount).toBe(0);
    expect(Object.values(getCollection("feedback/fb-9/replies"))).toHaveLength(1);
  });

  it("gives the owner the comment raw, with the restatement stored beside it", async () => {
    seedDoc("users", "user-ada", { role: "admin", approved: true, email: "yilongwang05@gmail.com" });
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify({ relay: true, text: "We're on it." }) });

    await post(payload());
    const replies: any[] = Object.values(getCollection("feedback/fb-9/replies"));
    expect(replies[0].body).toContain("#910");
    expect(replies[0].launderedBody).toBe("We're on it.");
  });

  it("ignores an edited or deleted comment", async () => {
    const body = payload({ action: "edited" });
    const res = await post(body);
    expect(res.status).toBe(200);
    expect(res.body.message).toContain("Ignored issue_comment action");
  });

  it("tells the submitter a reply landed", async () => {
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify({ relay: true, text: "We're on it." }) });
    await post(payload());
    expect(Object.values(getCollection("notifications"))).toEqual([
      expect.objectContaining({ userId: "user-ada", title: "A reply on your note", message: "We're on it." }),
    ]);
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

  // A PR that says "Closes #7" appears on the timeline as a cross-reference,
  // never as an issue comment — which is why the close summary reads the PR.
  const withLinkedPr = (prBody: string) => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("/timeline")) {
        return new Response(
          JSON.stringify([
            { event: "cross-referenced", source: { issue: { pull_request: { url: "https://api.github.com/repos/a/b/pulls/12", merged_at: "2026-09-01T00:00:00Z" } } } },
          ]),
          { status: 200 },
        );
      }
      if (String(url).includes("/pulls/12")) {
        return new Response(JSON.stringify({ title: "Keep walk-ins on the roster", body: prBody }), { status: 200 });
      }
      return new Response("{}", { status: 200 });
    });
  };

  beforeEach(() => {
    vi.stubEnv("GITHUB_WEBHOOK_SECRET", "sekret");
    vi.stubEnv("GITHUB_TOKEN", "ghp_test");
  });

  it("draws the submitter's sentence from the PR that closed the issue", async () => {
    seedDoc("feedback", "fb-9", { userId: "user-ada", status: "in_progress", githubIssueUrl: issueUrl });
    withLinkedPr("Walk-ins added during a gathering now persist when the roster closes.");
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({ usable: true, text: "The roster now keeps walk-ins after you close it." }),
    });

    await post();
    expect(getCollection("feedback")["fb-9"].outcomeMessage).toBe("The roster now keeps walk-ins after you close it.");
    expect(Object.values(getCollection("notifications"))).toEqual([
      expect.objectContaining({ message: "The roster now keeps walk-ins after you close it." }),
    ]);
  });

  it("falls back to the canned sentence when there is no linked PR", async () => {
    seedDoc("feedback", "fb-9", { userId: "user-ada", status: "in_progress", githubIssueUrl: issueUrl });
    fetchMock.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));

    await post();
    expect(getCollection("feedback")["fb-9"].outcomeMessage).toBeUndefined();
    expect(Object.values(getCollection("notifications"))).toEqual([
      expect.objectContaining({ message: expect.stringContaining("This shipped!") }),
    ]);
  });

  it("falls back to the canned sentence when the model gives nothing usable", async () => {
    seedDoc("feedback", "fb-9", { userId: "user-ada", status: "in_progress", githubIssueUrl: issueUrl });
    withLinkedPr("chore: bump deps");
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify({ usable: false, text: "" }) });

    await post();
    expect(Object.values(getCollection("notifications"))).toEqual([
      expect.objectContaining({ message: expect.stringContaining("This shipped!") }),
    ]);
  });

  it("gives the owner the canned sentence, not the written one", async () => {
    seedDoc("feedback", "fb-9", { userId: "owner-uid", status: "in_progress", githubIssueUrl: issueUrl });
    seedDoc("users", "owner-uid", { role: "admin", approved: true, email: "yilongwang05@gmail.com" });
    withLinkedPr("Walk-ins now persist.");
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify({ usable: true, text: "The roster now keeps walk-ins." }) });

    await post();
    // Stored either way, so "see it as they do" has something to show.
    expect(getCollection("feedback")["fb-9"].outcomeMessage).toBe("The roster now keeps walk-ins.");
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
    fetchMock.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));

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
    fetchMock.mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));

    await post();
    expect(Object.values(getCollection("notifications"))).toHaveLength(1);
    expect(getCollection("feedback")["fb-9"].notifiedOutcome).toBe("shipped");
  });

  it("a reopen clears the outcome and its message but remembers what was said", async () => {
    seedDoc("feedback", "fb-9", {
      userId: "user-ada",
      status: "resolved",
      githubIssueUrl: issueUrl,
      outcome: "shipped",
      outcomeMessage: "The roster now keeps walk-ins.",
      notifiedOutcome: "shipped",
    });

    const reopened = { action: "reopened", issue: { html_url: issueUrl } };
    await post(reopened);

    const note = getCollection("feedback")["fb-9"];
    expect(note.outcome).toBeUndefined();
    expect(note.outcomeMessage).toBeUndefined();
    expect(note.notifiedOutcome).toBe("shipped");
    expect(Object.values(getCollection("notifications"))).toHaveLength(0);
  });
});

describe("Feedback GitHub URLs are not a request-forgery surface", () => {
  beforeEach(() => {
    vi.stubEnv("GITHUB_TOKEN", "ghp_test");
    vi.stubEnv("GITHUB_WEBHOOK_SECRET", "sekret");
    mockVerifyIdToken.mockResolvedValue({ uid: "user-ada", email: "ada@test.com", name: "Ada Student" });
    seedDoc("users", "user-ada", { role: "viewer", approved: true, email: "ada@test.com" });
  });

  // `githubIssueUrl` is free text a Full-timer types into the admin list, so a
  // substring match on "github.com" would have been enough to aim a request.
  it.each([
    ["a host that merely mentions github.com", "https://evil.test/?x=github.com/a/b/issues/1"],
    ["a lookalike host", "https://github.com.evil.test/a/b/issues/1"],
    ["plain http", "http://github.com/a/b/issues/1"],
    ["a traversal in the repo segment", "https://github.com/a/../../issues/1"],
    ["a query smuggled into the owner", "https://github.com/a?x=/b/issues/1"],
    ["not an issue URL at all", "https://github.com/a/b/pulls/1"],
  ])("stores a follow-up but makes no request for %s", async (_label, githubIssueUrl) => {
    seedDoc("feedback", "fb-1", { userId: "user-ada", userName: "Ada Student", status: "new", githubIssueUrl });

    const res = await request(app)
      .post("/api/feedback/reply")
      .set("Authorization", "Bearer t")
      .send({ id: "fb-1", body: "Any news?" });

    expect(res.status).toBe(200);
    expect(res.body.mirroredToGitHub).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    // The Follow-up is still stored and still notified — failing to mirror
    // never costs the submitter their message.
    expect(Object.values(getCollection("feedback/fb-1/replies"))).toHaveLength(1);
  });

  it("mirrors normally to a real issue URL", async () => {
    seedDoc("feedback", "fb-1", {
      userId: "user-ada",
      status: "new",
      githubIssueUrl: "https://github.com/Shir0o/cisa-campus-work-tracker/issues/988",
    });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ id: 7 }), { status: 201 }));

    const res = await request(app)
      .post("/api/feedback/reply")
      .set("Authorization", "Bearer t")
      .send({ id: "fb-1", body: "Any news?" });

    expect(res.body.mirroredToGitHub).toBe(true);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://api.github.com/repos/Shir0o/cisa-campus-work-tracker/issues/988/comments",
    );
  });

  it("refuses to follow a PR link off api.github.com when summarising a close", async () => {
    const issueUrl = "https://github.com/a/b/issues/7";
    seedDoc("feedback", "fb-9", { userId: "user-ada", status: "in_progress", githubIssueUrl: issueUrl });

    // The timeline is a response we read, not a URL we built — so what it
    // points at is checked before it becomes a request.
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("/timeline")) {
        return new Response(
          JSON.stringify([
            { event: "cross-referenced", source: { issue: { pull_request: { url: "https://evil.test/pulls/12", merged_at: "2026-09-01T00:00:00Z" } } } },
          ]),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 200 });
    });

    const closed = { action: "closed", issue: { html_url: issueUrl, state_reason: "completed" } };
    await request(app)
      .post("/api/webhook/github")
      .set("x-github-event", "issues")
      .set("x-hub-signature-256", sign(closed, "sekret"))
      .send(closed);

    expect(fetchMock.mock.calls.map((c: any[]) => String(c[0]))).not.toContain("https://evil.test/pulls/12");
    // Falls back to the canned sentence rather than going silent.
    expect(Object.values(getCollection("notifications"))).toEqual([
      expect.objectContaining({ message: expect.stringContaining("This shipped!") }),
    ]);
  });

  it("refuses an api.github.com URL whose path is not one this server asks for", async () => {
    const issueUrl = "https://github.com/a/b/issues/7";
    seedDoc("feedback", "fb-9", { userId: "user-ada", status: "in_progress", githubIssueUrl: issueUrl });

    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("/timeline")) {
        return new Response(
          JSON.stringify([
            { event: "cross-referenced", source: { issue: { pull_request: { url: "https://api.github.com/user/repos", merged_at: "2026-09-01T00:00:00Z" } } } },
          ]),
          { status: 200 },
        );
      }
      return new Response("{}", { status: 200 });
    });

    const closed = { action: "closed", issue: { html_url: issueUrl, state_reason: "completed" } };
    await request(app)
      .post("/api/webhook/github")
      .set("x-github-event", "issues")
      .set("x-hub-signature-256", sign(closed, "sekret"))
      .send(closed);

    expect(fetchMock.mock.calls.map((c: any[]) => String(c[0]))).not.toContain("https://api.github.com/user/repos");
    expect(Object.values(getCollection("notifications"))).toEqual([
      expect.objectContaining({ message: expect.stringContaining("This shipped!") }),
    ]);
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

describe("BNPB personal sync tokens and intake (#1420)", () => {
  const OWNER_UID = "owner-1";
  const OWNER_EMAIL = "yilongwang05@gmail.com";
  const sha = (value: string) => crypto.createHash("sha256").update(value).digest("hex");

  const signInOwner = () =>
    mockVerifyIdToken.mockResolvedValue({ uid: OWNER_UID, email: OWNER_EMAIL, name: "Owner" });

  const seedOwner = () =>
    seedDoc("users", OWNER_UID, { email: OWNER_EMAIL, role: "admin", approved: true });

  const seedToken = (plaintext: string, uid = OWNER_UID) =>
    seedDoc("bnpb_sync_tokens", uid, {
      uid,
      tokenHash: sha(plaintext),
      createdAt: "2026-09-01T00:00:00.000Z",
      lastPushAt: null,
    });

  const ownedSuggestions = () =>
    Object.values(getCollection(`users/${OWNER_UID}/interactionSuggestions`)) as Array<Record<string, any>>;

  const payload = (overrides: Record<string, unknown> = {}) => ({
    interactions: [
      {
        syncId: "s1",
        occurredAt: "2026-09-10T15:00:00.000Z",
        durationMinutes: 45,
        summary: "Coffee downtown",
        medium: "coffee",
        updatedAt: "2026-09-10T15:30:00.000Z",
        participants: [
          { bnpbContactId: "p-1", firstName: "Alex", lastName: "Chen", nickname: "Al" },
          { bnpbContactId: "p-2", firstName: "Beth", lastName: "Doe" },
        ],
      },
    ],
    ...overrides,
  });

  const sync = (token: string | undefined, body: unknown) => {
    const req = request(app).post("/api/bnpb/sync");
    return (token === undefined ? req : req.set("x-sync-token", token)).send(body as object);
  };

  describe("token endpoints", () => {
    it("generates a token for the owner and stores only its hash", async () => {
      signInOwner();
      const res = await request(app)
        .post("/api/bnpb/token")
        .set("Authorization", "Bearer owner-token");

      expect(res.status).toBe(200);
      expect(typeof res.body.token).toBe("string");
      expect(res.body.token.length).toBeGreaterThan(10);
      const stored = getCollection("bnpb_sync_tokens")[OWNER_UID] as Record<string, any>;
      expect(stored.tokenHash).toBe(sha(res.body.token));
      expect(stored.tokenHash).not.toBe(res.body.token);
    });

    it("refuses to generate a token for a non-owner with 403", async () => {
      mockVerifyIdToken.mockResolvedValue({ uid: "other-1", email: "other@example.com" });
      const res = await request(app)
        .post("/api/bnpb/token")
        .set("Authorization", "Bearer other");
      expect(res.status).toBe(403);
      expect(getCollection("bnpb_sync_tokens")).toEqual({});
    });

    it("rejects an unauthenticated token request with 401", async () => {
      mockVerifyIdToken.mockRejectedValue(new Error("bad token"));
      const res = await request(app).post("/api/bnpb/token");
      expect(res.status).toBe(401);
    });

    it("revoking deletes the token and refuses a non-owner", async () => {
      signInOwner();
      seedToken("old-secret");
      const revoked = await request(app)
        .post("/api/bnpb/token/revoke")
        .set("Authorization", "Bearer owner-token");
      expect(revoked.status).toBe(200);
      expect(getCollection("bnpb_sync_tokens")[OWNER_UID]).toBeUndefined();

      mockVerifyIdToken.mockResolvedValue({ uid: "other-1", email: "other@example.com" });
      const denied = await request(app)
        .post("/api/bnpb/token/revoke")
        .set("Authorization", "Bearer other");
      expect(denied.status).toBe(403);
    });

    it("reports status for the owner", async () => {
      signInOwner();
      seedToken("live-secret");
      const res = await request(app)
        .get("/api/bnpb/token")
        .set("Authorization", "Bearer owner-token");
      expect(res.status).toBe(200);
      expect(res.body.active).toBe(true);
      expect(res.body.createdAt).toBe("2026-09-01T00:00:00.000Z");
      expect(res.body.lastPushAt).toBeNull();
    });
  });

  describe("intake", () => {
    it("rejects a missing, wrong or revoked token with 401", async () => {
      seedOwner();
      seedToken("live-secret");
      expect((await sync(undefined, payload())).status).toBe(401);
      expect((await sync("wrong-secret", payload())).status).toBe(401);
      const revoked = await request(app)
        .post("/api/bnpb/sync")
        .set("x-sync-token", "live-secret")
        .send(payload());
      expect(revoked.status).toBe(200);
      seedDoc("bnpb_sync_tokens", OWNER_UID, { uid: OWNER_UID, tokenHash: sha("dead"), createdAt: "x", lastPushAt: null });
      expect((await sync("live-secret", payload())).status).toBe(401);
    });

    it("rejects a token whose uid is not the owner with 401", async () => {
      seedDoc("users", "other-1", { email: "other@example.com", role: "admin" });
      seedToken("live-secret", "other-1");
      const res = await sync("live-secret", payload());
      expect(res.status).toBe(401);
    });

    it("rejects a malformed body with 400", async () => {
      seedOwner();
      seedToken("live-secret");
      expect((await sync("live-secret", { nope: true })).status).toBe(400);
      expect((await sync("live-secret", { interactions: [{ syncId: "s1" }] })).status).toBe(400);
    });

    it("refuses a body over the per-request cap", async () => {
      seedOwner();
      seedToken("live-secret");
      const many = {
        interactions: Array.from({ length: 201 }, (_, i) => ({
          syncId: `s-${i}`,
          occurredAt: "2026-09-10T15:00:00.000Z",
          summary: "x",
          medium: "call",
          participants: [{ bnpbContactId: "p", firstName: "A" }],
        })),
      };
      const res = await sync("live-secret", many);
      expect(res.status).toBe(400);
    });

    it("creates one pending suggestion per participant and is idempotent on re-send", async () => {
      seedOwner();
      seedToken("live-secret");
      const first = await sync("live-secret", payload());
      expect(first.status).toBe(200);
      const created = ownedSuggestions();
      expect(created).toHaveLength(2);
      expect(created.every((s) => s.status === "pending")).toBe(true);
      expect(new Set(created.map((s) => s.bnpbContactId))).toEqual(new Set(["p-1", "p-2"]));
      expect(created.find((s) => s.bnpbContactId === "p-2")!.bnpbName).toBe("Beth Doe");
      expect(created.find((s) => s.bnpbContactId === "p-1")!.text).toBe("Coffee downtown");

      const second = await sync("live-secret", payload());
      expect(second.status).toBe(200);
      expect(ownedSuggestions()).toHaveLength(2);
    });

    it("updates pending suggestions on re-push and leaves confirmed ones untouched", async () => {
      seedOwner();
      seedToken("live-secret");
      await sync("live-secret", payload());
      const colStore = getCollection(`users/${OWNER_UID}/interactionSuggestions`);
      const [settledKey, settledDoc] = Object.entries(colStore).find(([, d]) => (d as any).bnpbContactId === "p-1")!;
      colStore[settledKey] = { ...(settledDoc as any), status: "confirmed", text: "Edited by owner" };

      const edited = payload();
      (edited.interactions[0] as any).summary = "Coffee uptown";
      const res = await sync("live-secret", edited);
      expect(res.status).toBe(200);
      const after = ownedSuggestions();
      const ownerSettled = after.find((s) => s.bnpbContactId === "p-1")!;
      expect(ownerSettled.status).toBe("confirmed");
      expect(ownerSettled.text).toBe("Edited by owner");
      const stillPending = after.find((s) => s.bnpbContactId === "p-2")!;
      expect(stillPending.status).toBe("pending");
      expect(stillPending.summary).toBe("Coffee uptown");
    });

    it("withdraws pending suggestions for a tombstone and for a removed participant", async () => {
      seedOwner();
      seedToken("live-secret");
      await sync("live-secret", payload());

      const tomb = payload();
      (tomb.interactions[0] as any).deleted = true;
      expect((await sync("live-secret", tomb)).status).toBe(200);
      expect(ownedSuggestions().every((s) => s.status === "withdrawn")).toBe(true);

      await sync("live-secret", payload());
      const removed = payload();
      (removed.interactions[0] as any).participants = [
        { bnpbContactId: "p-1", firstName: "Alex", lastName: "Chen", nickname: "Al" },
      ];
      expect((await sync("live-secret", removed)).status).toBe(200);
      expect(ownedSuggestions().find((s) => s.bnpbContactId === "p-1")!.status).toBe("pending");
      expect(ownedSuggestions().find((s) => s.bnpbContactId === "p-2")!.status).toBe("withdrawn");
    });

    it("never stores fields outside the payload contract", async () => {
      seedOwner();
      seedToken("live-secret");
      await sync("live-secret", {
        interactions: [
          {
            syncId: "s1",
            occurredAt: "2026-09-10T15:00:00.000Z",
            summary: "Call",
            medium: "call",
            notes: "private thoughts",
            location: "home",
            markForPrayer: true,
            followUpAt: "2026-10-01",
            attachments: ["a"],
            participants: [{ bnpbContactId: "p-1", firstName: "Alex" }],
          },
        ],
      });
      const [stored] = ownedSuggestions();
      expect(stored.notes).toBeUndefined();
      expect(stored.location).toBeUndefined();
      expect(stored.markForPrayer).toBeUndefined();
      expect(stored.followUpAt).toBeUndefined();
      expect(stored.attachments).toBeUndefined();
    });

    it("records the last push time on the token", async () => {
      seedOwner();
      seedToken("live-secret");
      await sync("live-secret", payload());
      const stored = getCollection("bnpb_sync_tokens")[OWNER_UID] as Record<string, any>;
      expect(typeof stored.lastPushAt).toBe("string");
    });
  });

  describe("Not a CISA person (#1421)", () => {
    const seedChoice = (bnpbContactId: string) =>
      seedDoc(`users/${OWNER_UID}/notACisaPeople`, "choice-1", {
        bnpbContactId,
        createdAt: "2026-09-01T00:00:00.000Z",
      });

    it("writes new suggestions for a Not a CISA person as already dismissed", async () => {
      seedOwner();
      seedToken("live-secret");
      seedChoice("p-2");

      const res = await sync("live-secret", payload());
      expect(res.status).toBe(200);

      const chosen = ownedSuggestions().find((s) => s.bnpbContactId === "p-2")!;
      expect(chosen.status).toBe("dismissed");
      expect(chosen.dismissedBy).toBe("notACisaPerson");
      expect(ownedSuggestions().find((s) => s.bnpbContactId === "p-1")!.status).toBe("pending");
    });

    it("keeps a Not a CISA person suggestion dismissed on re-push", async () => {
      seedOwner();
      seedToken("live-secret");
      seedChoice("p-1");
      await sync("live-secret", payload());
      await sync("live-secret", payload());

      const chosen = ownedSuggestions().find((s) => s.bnpbContactId === "p-1")!;
      expect(chosen.status).toBe("dismissed");
    });

    it("does not bring back a suggestion the owner dismissed by hand", async () => {
      seedOwner();
      seedToken("live-secret");
      await sync("live-secret", payload());
      const colStore = getCollection(`users/${OWNER_UID}/interactionSuggestions`);
      const [key, settled] = Object.entries(colStore).find(
        ([, d]) => (d as any).bnpbContactId === "p-1",
      )!;
      colStore[key] = { ...(settled as any), status: "dismissed", dismissedBy: "single" };

      await sync("live-secret", payload());
      expect(ownedSuggestions().find((s) => s.bnpbContactId === "p-1")!.status).toBe("dismissed");
    });
  });
});

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
      .send({ keptId: "s1", combinedInId: "d1", reason: "Matching email" });
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

    // Gathering roster, overrides and attendance all drop the duplicate.
    const event = getCollection("events")["e1"];
    expect(event.roster).toEqual(["s1"]);
    expect(event.rosterOverride).toEqual(["s1"]);
    expect(event.rosterOverrideBase).toEqual(["s1"]);
    expect(event.attendance).toEqual({ present: ["s1"], absent: ["s1"] });
    expect(getCollection("rhythms")["r1"].roster).toEqual(["s1", "other"]);
    expect(getCollection("homes")["h1"].members).toEqual(["s1"]);
    expect(getCollection("outreach")["o1"].names[0]).toMatchObject({
      contactId: "s1",
      name: "Kept Name",
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
        "outreach",
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
      .send({ keptId: "s1", combinedInId: "d1" });
    expect(res.status).toBe(200);
    const record = getCollection("combineRecords")[res.body.combineRecordId];
    expect(record.status).toBe("done");
    expect(record.combinedAt).toBeTruthy();
    expect(record.completedAt).toBeTruthy();
  });

  it("records an Activity Log entry for the combine", async () => {
    seedCombine();
    await request(app).post("/api/combine-contacts").send({ keptId: "s1", combinedInId: "d1" });
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
      .send({ keptId: "s1", combinedInId: "d1", reason: "Matching email" });
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
    const res = await request(app).post("/api/combine-contacts").send({ keptId: "s1", combinedInId: "nope" });
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

  const combineOnce = async (): Promise<string> => {
    seedCombine();
    const res = await request(app)
      .post("/api/combine-contacts")
      .send({ keptId: "s1", combinedInId: "d1", reason: "Matching email" });
    expect(res.status).toBe(200);
    return res.body.combineRecordId as string;
  };

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
      outreach: structuredClone(getCollection("outreach")),
      aliases: structuredClone(getCollection("attendee_aliases")),
      imports: structuredClone(getCollection("pending_attendance_imports")),
      personalPrayers: structuredClone(getCollection("users/u2/personalPrayers")),
      prefs: structuredClone(getCollection("userPreferences")),
      inbox: structuredClone(getCollection("inboxState")),
      notifications: structuredClone(getCollection("notifications")),
    };

    const combineRes = await request(app)
      .post("/api/combine-contacts")
      .send({ keptId: "s1", combinedInId: "d1", reason: "Matching email" });
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
    expect(getCollection("outreach")).toEqual(before.outreach);
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
      .send({ keptId: "c1", combinedInId: "s1" });
    expect(second.status).toBe(200);

    const res = await request(app)
      .post("/api/combine-contacts/undo")
      .send({ combineRecordId: firstRecord });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain("c1");
    // The first combine is still undoable once the later one is undone.
    expect(getCollection("combineRecords")[firstRecord].status).toBe("done");
  });
});

describe("POST /api/combine-tags", () => {
  const seedTags = () => {
    seedDoc("contacts", "a", { name: "Alice", tags: ["BFA table", "BFA"] });
    seedDoc("contacts", "b", { name: "Bob", tags: ["bfa-table"] });
    seedDoc("contacts", "c", { name: "Cara", tags: ["Saved"] });
  };

  it("rewrites affected tags, drops duplicates, and writes a done tags record", async () => {
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
