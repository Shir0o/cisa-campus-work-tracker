import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import request from "supertest";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import type { Express } from "express";

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

  const entry = (id: string, d: Doc) => ({ id, ref: { _col: "", _id: id }, data: () => d });

  const collection = (name: string) => {
    const col = (store[name] ??= {});
    const list = () => Object.entries(col).map(([id, d]) => ({ ...entry(id, d), ref: { _col: name, _id: id } }));

    return {
      add: async (data: Doc) => {
        const id = `doc-${++seq}`;
        col[id] = { ...data };
        return { id, update: async (u: Doc) => { col[id] = { ...col[id], ...u }; } };
      },
      doc: (id?: string) => {
        const docId = id || `doc-${++seq}`;
        return {
          id: docId,
          _col: name,
          _id: docId,
          get: async () => ({ exists: docId in col, data: () => col[docId], id: docId }),
          update: async (u: Doc) => { col[docId] = { ...(col[docId] ?? {}), ...u }; },
          ref: { _col: name, _id: docId },
          collection: (sub: string) => collection(`${name}/${docId}/${sub}`),
        };
      },
      where: (field: string, _op: string, value: any) => ({
        get: async () => snapshot(list().filter((d) => d.data()[field] === value)),
      }),
      orderBy: () => ({
        limit: (n: number) => ({ get: async () => snapshot(list().slice(0, n)) }),
      }),
      limit: (n: number) => ({ get: async () => snapshot(list().slice(0, n)) }),
      get: async () => snapshot(list()),
    };
  };

  const db = {
    collection,
    batch: () => {
      const pending: Array<{ _col: string; _id: string; data: Doc }> = [];
      return {
        set: (ref: { _col: string; _id: string }, data: Doc) => pending.push({ ...ref, data }),
        update: (ref: { _col: string; _id: string }, data: Doc) => pending.push({ ...ref, data }),
        commit: async () => {
          for (const p of pending) {
            (store[p._col] ??= {})[p._id] = { ...(store[p._col]?.[p._id] ?? {}), ...p.data };
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
  };
});

// ── Module mocks ─────────────────────────────────────────────────────────────
vi.mock("firebase-admin", () => ({
  __esModule: true,
  default: {
    apps: [],
    initializeApp: vi.fn(() => ({})),
    firestore: { FieldValue: { serverTimestamp: () => ({ __mockServerTimestamp: true }) } },
    auth: () => ({
      verifyIdToken: mockVerifyIdToken,
      createCustomToken: mockCreateCustomToken,
    }),
  },
}));

vi.mock("firebase-admin/firestore", () => ({
  getFirestore: (_app: unknown, dbId?: string) => {
    getFirestoreDbIds.push(dbId);
    return mockDb;
  },
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = { generateContent: mockGenerateContent };
  },
  Type: { OBJECT: "object", STRING: "string", ARRAY: "array" },
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
  vi.stubEnv("GEMINI_API_KEY", "test-gemini-key");
  vi.stubEnv("APP_URL", "https://example.test");
  vi.stubEnv("EXPO_ACCESS_TOKEN", "test-expo-token");
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

    const res = await request(app).post("/api/feedback").send({ message: "Bug found", kind: "bug" });
    expect(res.status).toBe(200);
    expect(res.body.githubIssueUrl).toBe("https://github.com/org/repo/issues/42");
    expect(res.body.status).toBe("in_progress");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.github.com/repos/org/repo/issues");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse((init as RequestInit).body as string).labels).toEqual(["enhancement", "feedback"]);

    const saved = Object.values(getCollection("feedback"))[0];
    expect(saved.githubIssueUrl).toBe("https://github.com/org/repo/issues/42");
    expect(saved.status).toBe("in_progress");
  });

  it("includes screenshot markdown in GitHub issue body when screenshot is attached", async () => {
    vi.stubEnv("GITHUB_TOKEN", "gh-token");
    vi.stubEnv("GITHUB_REPO", "org/repo");
    vi.stubEnv("APP_URL", "https://app.example.com");
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ html_url: "https://github.com/org/repo/issues/43", number: 43 }), { status: 201 })
    );

    const res = await request(app).post("/api/feedback").send({
      message: "Bug with screenshot",
      kind: "bug",
      screenshot: "data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
    });
    expect(res.status).toBe(200);

    const [_, init] = fetchMock.mock.calls[0];
    const bodyStr = JSON.parse((init as RequestInit).body as string).body;
    expect(bodyStr).toContain("![Feedback Screenshot](https://app.example.com/api/feedback/");
    expect(bodyStr).toContain("/screenshot)");
  });

  it("uses the authenticated Firebase user when an Authorization header is present", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "uid-1", email: "sarah@example.com", name: "Sarah" });
    const res = await request(app)
      .post("/api/feedback")
      .set("Authorization", "Bearer valid-token")
      .send({ message: "hello" });
    expect(res.status).toBe(200);
    const saved = Object.values(getCollection("feedback"))[0];
    expect(saved.userId).toBe("uid-1");
    expect(saved.userEmail).toBe("sarah@example.com");
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
});

describe("GET /api/feedback/:id/screenshot", () => {
  it("returns 404 when the feedback document does not exist", async () => {
    const res = await request(app).get("/api/feedback/non-existent-id/screenshot");
    expect(res.status).toBe(404);
    expect(res.body.error).toContain("not found");
  });

  it("returns 404 when the feedback document has no screenshot", async () => {
    seedDoc("feedback", "fb-no-img", { message: "No screenshot here" });
    const res = await request(app).get("/api/feedback/fb-no-img/screenshot");
    expect(res.status).toBe(404);
    expect(res.body.error).toContain("No screenshot");
  });

  it("returns 200 with image/jpeg Content-Type and binary buffer for valid base64 screenshot", async () => {
    const mockBase64 = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";
    seedDoc("feedback", "fb-img-1", { message: "Has image", screenshot: mockBase64 });

    const res = await request(app).get("/api/feedback/fb-img-1/screenshot");
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("image/jpeg");
    expect(res.headers["cache-control"]).toContain("public, max-age=86400");
    expect(res.body).toBeInstanceOf(Buffer);
    expect(res.body.length).toBeGreaterThan(0);
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
    expect(url).toBe("https://api.github.com/repos/a/b/issues/9");
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
    expect(res.body.message).toContain("Ignored non-issues event");
  });

  it("marks matching feedback docs resolved when the issue is closed", async () => {
    vi.stubEnv("GITHUB_WEBHOOK_SECRET", "sekret");
    seedDoc("feedback", "fb-9", { status: "in_progress", githubIssueUrl: issueUrl });
    const res = await request(app)
      .post("/api/webhook/github")
      .set("x-github-event", "issues")
      .set("x-hub-signature-256", sign(closedPayload, "sekret"))
      .send(closedPayload);
    expect(res.status).toBe(200);
    expect(res.body.matchedDocsCount).toBe(1);
    expect(res.body.updates).toMatchObject({ status: "resolved" });
    expect(getCollection("feedback")["fb-9"].status).toBe("resolved");
  });

  it("archives feedback when closed with not_planned", async () => {
    vi.stubEnv("GITHUB_WEBHOOK_SECRET", "sekret");
    seedDoc("feedback", "fb-10", { status: "in_progress", githubIssueUrl: issueUrl });
    const payload = { action: "closed", issue: { html_url: issueUrl, state_reason: "not_planned" } };
    const res = await request(app)
      .post("/api/webhook/github")
      .set("x-github-event", "issues")
      .set("x-hub-signature-256", sign(payload, "sekret"))
      .send(payload);
    expect(res.status).toBe(200);
    expect(getCollection("feedback")["fb-10"].status).toBe("resolved");
    expect(getCollection("feedback")["fb-10"].archived).toBe(true);
  });

  it("reopens feedback when the issue is reopened", async () => {
    vi.stubEnv("GITHUB_WEBHOOK_SECRET", "sekret");
    seedDoc("feedback", "fb-11", { status: "resolved", archived: true, githubIssueUrl: issueUrl });
    const payload = { action: "reopened", issue: { html_url: issueUrl } };
    const res = await request(app)
      .post("/api/webhook/github")
      .set("x-github-event", "issues")
      .set("x-hub-signature-256", sign(payload, "sekret"))
      .send(payload);
    expect(res.status).toBe(200);
    expect(getCollection("feedback")["fb-11"].status).toBe("in_progress");
    expect(getCollection("feedback")["fb-11"].archived).toBe(false);
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
    expect(res.body.contact).toMatchObject({ isExisting: false, name: "Jane Doe", role: "Student" });

    const contacts = Object.values(getCollection("contacts"));
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({ name: "Jane Doe", stage: "First Contact" });
    expect(Object.values(getCollection("activities")).length).toBeGreaterThan(0);
    expect(Object.values(getCollection("notifications")).length).toBeGreaterThan(0);
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
  });

  it("attributes to the authenticated user when an Authorization header is present", async () => {
    mockGenerateContent.mockResolvedValue({ text: JSON.stringify({ name: "New Person" }) });
    const res = await request(app)
      .post("/api/quick-add")
      .set("Authorization", "Bearer tok")
      .send({ text: "Met New Person" });
    expect(res.status).toBe(200);
    expect(Object.values(getCollection("contacts"))[0].createdBy).toBe("u-123");
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
    expect(contacts[0]).toMatchObject({ name: "New Kid", role: "Student", stage: "First Contact" });
    const id = res.body.contact.id;
    expect(Object.values(getCollection(`contacts/${id}/interactions`))).toHaveLength(1);
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

describe("POST /api/send-push", () => {
  it("returns 400 when userId or title is missing", async () => {
    const res = await request(app).post("/api/send-push").send({ title: "Hi" });
    expect(res.status).toBe(400);
  });

  it("returns pushSent false when the user has no pushToken", async () => {
    seedDoc("users", "u-1", { displayName: "Sam" });
    const res = await request(app).post("/api/send-push").send({ userId: "u-1", title: "Hi" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, pushSent: false });
  });

  it("returns pushSent false when EXPO_ACCESS_TOKEN is not configured", async () => {
    vi.stubEnv("EXPO_ACCESS_TOKEN", "");
    seedDoc("users", "u-3", { pushToken: "ExponentPushToken[abc]" });
    const res = await request(app).post("/api/send-push").send({ userId: "u-3", title: "Hi" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, pushSent: false });
    expect(res.body.reason).toContain("EXPO_ACCESS_TOKEN");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("dispatches a push via Expo when the user has a pushToken", async () => {
    seedDoc("users", "u-2", { pushToken: "ExponentPushToken[abc]" });
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ data: { status: "ok" } }), { status: 200 }));
    const res = await request(app).post("/api/send-push").send({ userId: "u-2", title: "Hello", body: "World" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, pushSent: true });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://exp.host/--/api/v2/push/send");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer test-expo-token");
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({ to: "ExponentPushToken[abc]", title: "Hello" });
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
    mockVerifyIdToken.mockResolvedValue({ uid: "founder-1", email: "yilongwang05@gmail.com" });
    seedDoc("feedback", "f-2", { status: "new" });
    const res = await request(app)
      .post("/api/feedback/update")
      .set("Authorization", "Bearer tok")
      .send({ id: "f-2", status: "resolved" });
    expect(res.status).toBe(200);
  });

  it("allows a user whose users doc has role admin", async () => {
    mockVerifyIdToken.mockResolvedValue({ uid: "admin-1", email: "admin@example.com" });
    seedDoc("users", "admin-1", { role: "admin" });
    seedDoc("feedback", "f-3", { status: "new" });
    const res = await request(app)
      .post("/api/feedback/update")
      .set("Authorization", "Bearer tok")
      .send({ id: "f-3", status: "resolved" });
    expect(res.status).toBe(200);
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
    expect(url).toBe("https://api.github.com/repos/a/b/issues/10");
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
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("GitHub API error updating issue"));
    errSpy.mockRestore();
  });

  it("logs when the GitHub sync fetch throws", async () => {
    vi.stubEnv("GITHUB_TOKEN", "gh-token");
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockRejectedValue(new Error("network"));
    seedDoc("feedback", "fb-fetch", { status: "new", githubIssueUrl: "https://github.com/a/b/issues/15" });
    const res = await request(app).post("/api/feedback/update").send({ id: "fb-fetch", status: "resolved" });
    expect(res.status).toBe(200);
    expect(errSpy).toHaveBeenCalledWith(expect.stringContaining("Failed to update GitHub issue state for"), expect.any(Error));
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
  it("merges missing contact fields and upgrades the role on quick-add", async () => {
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
    expect(updated.location).toBe("Library");
    expect(updated.spiritualBackground).toBe("Christian family");
    expect(updated.role).toBe("Trainee");
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
  });
});

describe("POST /api/send-push — failure path", () => {
  it("returns 500 when the Expo push fetch fails", async () => {
    seedDoc("users", "u-4", { pushToken: "ExponentPushToken[abc]" });
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockRejectedValue(new Error("expo down"));
    const res = await request(app).post("/api/send-push").send({ userId: "u-4", title: "Hi" });
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    errSpy.mockRestore();
  });
});

describe("production static serving", () => {
  it("serves the SPA index.html for unknown client routes", async () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
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
      process.env.NODE_ENV = originalEnv;
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


