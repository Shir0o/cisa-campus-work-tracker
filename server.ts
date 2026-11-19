

import express from "express";
import rateLimit from "express-rate-limit";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import { initializeApp, getApps, getApp } from "firebase-admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import dotenv from "dotenv";
import { FeedbackPipeline } from "./src/server/feedbackPipeline";
import { OWNER_EMAIL } from "./src/lib/permissions";
import { buildAttendancePreview } from "./src/lib/sync/attdCorrelator";
import { visibleToOf, type ContactTies } from "./src/lib/contactTies";
import { ContactCombineEngine, ContactEngineError } from "./src/server/contactEngine";
import { TestAccountPurgeEngine, purgePlanFingerprint } from "./src/server/testAccountPurgeEngine";
import { failsClosed, rateLimitKey } from "./src/server/requestGuards";
import type { AttdEventMapping, AttdSyncPayload, AttendeeAlias } from "./src/lib/sync/attdCorrelator";

dotenv.config();

export async function createApp() {
  const app = express();
  // Cloud Run's front end is one proxy hop: trusting it makes req.ip the real
  // caller instead of Google's front end, so rate limits count per visitor.
  // Requests through the Cloudflare proxy are keyed by rateLimitKey().
  app.set("trust proxy", 1);

  app.use(express.json({
    limit: "50mb",
    verify: (req: any, res, buf) => {
      req.rawBody = buf;
    }
  }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Terminal Request Logging Middleware to easily track incoming webhook/API requests in dev stdout console
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/webhook")) {
      console.log(`\n============== [INCOMING WEBHOOK/API REQUEST] ==============`);
      console.log(`Timestamp   : ${new Date().toISOString()}`);
      console.log(`Method      : ${req.method}`);
      console.log(`URL         : ${req.originalUrl}`);
      console.log(`Headers     : ${JSON.stringify({
        host: req.headers.host,
        "content-type": req.headers["content-type"],
        "user-agent": req.headers["user-agent"]
      }, null, 2)}`);
      // Bodies carry contact PII and message text; keep them out of production logs.
      if (process.env.NODE_ENV !== "production") {
        console.log(`Body/Payload: ${JSON.stringify(req.body, null, 2)}`);
      }
      console.log(`============================================================\n`);
    }
    next();
  });

  // Global lazy-initialized variables
  let adminDbInstance: ReturnType<typeof getFirestore> | null = null;
  let aiClientInstance: GoogleGenAI | null = null;

  // Standard rate limiter for sensitive and expensive API routes
  const standardRateLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 100,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many requests. Please try again later." },
    keyGenerator: rateLimitKey,
    skip: () => process.env.NODE_ENV === "test",
  });

  function getAdminDb() {
    if (!adminDbInstance) {
      try {
        const configPath = path.join(process.cwd(), "firebase-applet-config.json");
        if (!fs.existsSync(configPath)) {
          throw new Error("firebase-applet-config.json was not found in the workspace.");
        }
        const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        
        // Help prevent "app already exists" issues inside live dev loops
        let firebaseApp;
        if (getApps().length === 0) {
          firebaseApp = initializeApp({
            projectId: config.projectId,
            // createCustomToken needs to know which service account to sign
            // with — without this it tries to auto-discover one via the GCP
            // metadata server, which doesn't exist in local/Cloud Run dev.
            serviceAccountId: "firebase-adminsdk-fbsvc@sac-campus-hub.iam.gserviceaccount.com",
          });
        } else {
          firebaseApp = getApp();
        }

        // Properly get custom Firestore instance using getFirestore from subpath.
        // FIREBASE_FIRESTORE_DB_ID overrides the database id from
        // firebase-applet-config.json so a QA/staging deployment can target a
        // separate named database (e.g. qa-db) without a code change.
        const firestoreDatabaseId =
          process.env.FIREBASE_FIRESTORE_DB_ID || config.firestoreDatabaseId;
        adminDbInstance = getFirestore(firebaseApp, firestoreDatabaseId);
      } catch (err: any) {
        console.error("Firebase Admin initialization failed lazily: ", err);
        throw new Error(`Firebase Admin failed to start: ${err.message}`);
      }
    }
    return adminDbInstance;
  }

  function getAiClient() {
    if (!aiClientInstance) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY is not configured on the server. Please define it in your environment properties.");
      }
      aiClientInstance = new GoogleGenAI({
        apiKey: apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    }
    return aiClientInstance;
  }

  // Helper function to get Admin Auth instance
  function getAdminAuth() {
    getAdminDb(); // ensure admin is initialized
    return getAuth();
  }

  // Authenticate Firebase user from request Authorization header
  async function authenticateFirebaseUser(req: express.Request) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new Error("Missing or invalid Authorization header");
    }
    const token = authHeader.split("Bearer ")[1];
    const decodedToken = await getAdminAuth().verifyIdToken(token);
    return decodedToken;
  }

  // Authorize administrator role
  async function authorizeAdmin(req: express.Request) {
    const decodedToken = await authenticateFirebaseUser(req);
    const uid = decodedToken.uid;
    const email = decodedToken.email || "";

    let role: string;
    // Like the rules' isSuperAdmin(): an unverified address is not the owner.
    if (email.toLowerCase() === "yilongwang05@gmail.com" && decodedToken.email_verified === true) {
      role = "admin";
    } else {
      const userDoc = await getAdminDb().collection("users").doc(uid).get();
      if (!userDoc.exists) {
        throw new Error("User does not exist in the system");
      }

      const userData = userDoc.data()!;
      if (userData.role !== "admin") {
        throw new Error("User is not an administrator");
      }
      role = userData.role;
    }

    // Enforce a completed second factor on administrator endpoints (ADR 0029,
    // TOTP MFA). Full-timers and the owner are mandatory-enrolled, so a token
    // that did not complete a second factor is rejected here — not only in the
    // UI — keeping the admin API honest. The `firebase.sign_in_second_factor`
    // claim is present only when sign-in finished a second factor.
    if (!decodedToken.firebase?.sign_in_second_factor) {
      throw new Error("Multi-factor authentication required");
    }

    return { uid, email, role, decodedToken };
  }

  // The Full-timer gate every combine endpoint shares. A refusal is answered
  // here (403) and returns null. In tests the actor is fixed.
  async function requireFullTimerActor(req: express.Request, res: express.Response) {
    try {
      if (process.env.NODE_ENV !== "test") {
        const authorized = await authorizeAdmin(req);
        return { actorId: authorized.uid, actorName: authorized.email || authorized.uid };
      }
      return { actorId: "test-user", actorName: "Test User" };
    } catch (authErr: any) {
      res
        .status(403)
        .json({ success: false, error: `Forbidden: ${authErr.message || String(authErr)}` });
      return null;
    }
  }




  // --- Feedback: reports and their outcome ----------------------------------
  //
  // A report is written to Firestore and filed on GitHub. When the issue
  // closes, a webhook writes the outcome back and notifies the submitter with
  // one fixed sentence. Replies and their GitHub mirror are cut.

  const OWNER_EMAIL_SERVER = (process.env.OWNER_EMAIL || OWNER_EMAIL).trim().toLowerCase();

  /**
   * Both feedback write paths cost more than a database row: each creates or
   * comments on a public GitHub issue, fans notifications out, and (for a
   * close summary or a laundered relay) spends a model call. Authenticating
   * bounds who can do that, not how often — so the writes are also capped per
   * IP. Reads, the webhook and the admin triage routes are untouched.
   */
  const feedbackWriteLimiter = rateLimit({
    windowMs: 5 * 60 * 1000,
    limit: 20,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: { error: "Too many notes from this address. Please wait a few minutes." },
    keyGenerator: rateLimitKey,
    // Off under test, matching this file's existing NODE_ENV convention: the
    // suite drives both routes well past the cap from one address, and a
    // shared counter would make results depend on test order.
    skip: () => process.env.NODE_ENV === "test",
  });

  // Endpoint: Submit feedback (with diagnostics and auto GitHub issue creation)
  app.post("/api/feedback", feedbackWriteLimiter, async (req, res) => {
    try {
      let userId = req.body.userId;
      let userName = req.body.userName;

      // Authenticate via Firebase ID token if Authorization header is present
      if (req.headers.authorization) {
        try {
          const decoded = await authenticateFirebaseUser(req);
          userId = decoded.uid;
          userName = decoded.name || decoded.displayName || req.body.userName || "Anonymous User";
        } catch (authErr: any) {
          console.error("Firebase ID token verification failed:", authErr);
          return res.status(401).json({ error: "Unauthorized: " + (authErr.message || String(authErr)) });
        }
      } else if (process.env.NODE_ENV !== "test") {
        return res.status(401).json({ error: "Unauthorized: Authorization header is required." });
      }

      const { type, kind, message, screenshot, url, userAgent, viewport, inputTrace } = req.body;

      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Missing required 'message' parameter." });
      }

      const db = getAdminDb();
      const pipeline = new FeedbackPipeline({ db });
      const result = await pipeline.submitNote({
        userId,
        userName,
        type,
        kind,
        message,
        url,
        userAgent,
        viewport,
        inputTrace,
        screenshot,
      });

      res.status(200).json({
        success: true,
        id: result.id,
        githubIssueUrl: result.githubIssueUrl,
        status: result.status,
      });
    } catch (error: any) {
      console.error("Error in POST /api/feedback: ", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // Endpoint: GitHub Webhook to sync issue closure/reopening back to app feedback
  app.post("/api/webhook/github", async (req, res) => {
    try {
      // Cryptographically verify webhook signature
      const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;
      if (webhookSecret) {
        const signature = req.headers["x-hub-signature-256"] as string;
        if (!signature) {
          console.warn("GitHub Webhook: Missing X-Hub-Signature-256 header.");
          return res.status(401).json({ error: "Missing signature." });
        }

        const rawBody = (req as any).rawBody;
        if (!rawBody) {
          console.error("GitHub Webhook: Raw body not available for verification.");
          return res.status(500).json({ error: "Raw body not available." });
        }

        const hmac = crypto.createHmac("sha256", webhookSecret);
        const digest = "sha256=" + hmac.update(rawBody).digest("hex");

        const digestBuf = Buffer.from(digest);
        const signatureBuf = Buffer.from(signature);
        if (digestBuf.length !== signatureBuf.length || !crypto.timingSafeEqual(digestBuf, signatureBuf)) {
          console.warn("GitHub Webhook: Signature verification failed.");
          return res.status(403).json({ error: "Invalid signature." });
        }
      } else if (failsClosed()) {
        console.error("GITHUB_WEBHOOK_SECRET not configured; refusing an unverifiable GitHub webhook.");
        return res.status(503).json({ error: "Webhook verification is not configured." });
      } else {
        console.warn("GITHUB_WEBHOOK_SECRET not configured; skipping webhook signature verification.");
      }

      const eventType = req.headers["x-github-event"] as string;
      const { action, issue } = req.body;

      const db = getAdminDb();
      const pipeline = new FeedbackPipeline({ db });
      const result = await pipeline.handleGitHubWebhook({
        eventType,
        action,
        issue,
      });

      if (result.message) {
        return res.status(200).json({ message: result.message });
      }
      return res.status(200).json({
        success: true,
        matchedDocsCount: result.matchedDocsCount ?? 0,
        updates: result.updates ?? {},
      });
    } catch (error: any) {
      if (error.status) {
        return res.status(error.status).json({ error: error.message });
      }
      console.error("Error in POST /api/webhook/github: ", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // AI Smart Import endpoint: parses raw text into contacts, interactions, and discussions
  app.post("/api/smart-import/parse", standardRateLimiter, async (req, res) => {
    try {
      // Full-timers only, like the Smart Import button: the prompt carries every
      // contact's name, email and phone, and the model's answer comes back here.
      if (process.env.NODE_ENV !== "test") {
        try {
          await authorizeAdmin(req);
        } catch (authErr: any) {
          return res.status(403).json({ error: `Forbidden: ${authErr.message || String(authErr)}` });
        }
      }

      const { text } = req.body;
      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "Missing required 'text' parameter." });
      }

      console.log(`[AI Smart Import] Parsing text content (${text.length} chars)`);

      const db = getAdminDb();
      const contactsSnapshot = await db.collection("contacts").get();
      const contactsList = contactsSnapshot.docs
        .map((d) => {
          const data = d.data();
          const item: { id: string; name: string; email?: string; phone?: string } = {
            id: d.id,
            name: data.name || "Unknown",
          };
          if (data.email && typeof data.email === "string" && data.email.trim()) {
            item.email = data.email.trim();
          }
          if (data.phone && typeof data.phone === "string" && data.phone.trim()) {
            item.phone = data.phone.trim();
          }
          return item;
        })
        .filter((c) => c.name !== "Unknown");

      const prompt = `Please parse the following unstructured text into structured contacts.

Input Text:
${text}

Existing Contacts Database:
${JSON.stringify(contactsList)}`;

      const response = await getAiClient().models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: `You are an expert assistant for a campus ministry work tracker. Parse the provided unstructured text into contacts:
1. contacts: Individuals mentioned in the text. For each contact, infer their name, email, phone, stage ('lead', 'contact', 'follow-up', 'connected', or 'active'), spiritual background, notes/summary, and relevant tags. If a contact matches an existing contact from the provided Existing Contacts Database (by exact or close name/email/phone), set matchedContactId to their existing ID and matchedContactName to their existing name; otherwise set matchedContactId and matchedContactName to null. Assign a temporary ID 'c1', 'c2', etc.`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              contacts: {
                type: Type.ARRAY,
                description: "Parsed contacts extracted from text",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    tempId: { type: Type.STRING },
                    name: { type: Type.STRING },
                    email: { type: Type.STRING },
                    phone: { type: Type.STRING },
                    stage: { type: Type.STRING, description: "lead, contact, follow-up, connected, or active" },
                    notes: { type: Type.STRING },
                    tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                    spiritualBackground: { type: Type.STRING },
                    matchedContactId: { type: Type.STRING, nullable: true },
                    matchedContactName: { type: Type.STRING, nullable: true },
                  },
                  required: ["tempId", "name"],
                },
              },
            },
            required: ["contacts"],
          },
        },
      });

      if (!response.text) {
        throw new Error("No response returned from Gemini API.");
      }

      let parsed;
      try {
        parsed = JSON.parse(response.text.trim());
      } catch (parseErr: any) {
        throw new Error(`Failed to parse AI response: ${parseErr.message || String(parseErr)}`);
      }

      console.log(`[AI Smart Import] Parse complete: ${parsed.contacts?.length || 0} contacts.`);

      res.status(200).json({ success: true, data: { contacts: parsed.contacts || [] } });
    } catch (error: any) {
      console.error("AI Smart Import Error: ", error);
      res.status(500).json({ error: error.message || "Failed to parse text" });
    }
  });

  app.post("/api/smart-import/commit", standardRateLimiter, async (req, res) => {
    try {
      let uid = "system";
      let userName = "Smart Import";
      // Full-timers only: the commit writes with admin rights, past the rules'
      // visibleTo checks, to any contact id the request names.
      if (process.env.NODE_ENV !== "test") {
        try {
          const authorized = await authorizeAdmin(req);
          const decodedToken = authorized.decodedToken;
          uid = authorized.uid;
          userName = decodedToken.name || decodedToken.email?.split("@")[0] || "Smart Import";
        } catch (authErr: any) {
          return res.status(403).json({ error: `Forbidden: ${authErr.message || String(authErr)}` });
        }
      }

      const { contacts = [] } = req.body;
      const db = getAdminDb();
      const batch = db.batch();

      let cCount = 0;

      // Process Contacts
      for (const contact of contacts) {
        if (contact.matchedContactId) continue;

        const newContactRef = db.collection("contacts").doc();
        const name = (contact.name || "Unnamed Contact").slice(0, 128);
        const initials =
          name
            .split(" ")
            .map((n: string) => n[0])
            .join("")
            .slice(0, 2)
            .toUpperCase() || "??";

        const newContactData = {
          name,
          email: (contact.email || "").slice(0, 128),
          phone: (contact.phone || "").slice(0, 32),
          stage: (contact.stage || "lead").slice(0, 64),
          lastSeen: new Date().toISOString().split("T")[0],
          initials,
          notes: contact.notes || "",
          tags: contact.tags || [],
          spiritualBackground: contact.spiritualBackground || "",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          createdBy: uid,
          createdByName: userName.slice(0, 128),
        };
        // `createdBy` is a persisted tie; without the derived list the
        // importer cannot see what they just imported (#1024 phase 4).
        batch.set(newContactRef, {
          ...newContactData,
          visibleTo: visibleToOf(newContactData as ContactTies),
        });
        cCount++;
      }

      await batch.commit();

      console.log(`[AI Smart Import] Commit complete: ${cCount} contacts.`);
      res.status(200).json({
        success: true,
        summary: { contactsCount: cCount },
      });
    } catch (error: any) {
      console.error("AI Smart Import Commit Error: ", error);
      res.status(500).json({ error: error.message || "Failed to commit smart import items to database." });
    }
  });


  // Combine contacts (issue #1427, ADR 0038, deepened in #1586). Full-timers only.
  app.post("/api/combine-contacts", standardRateLimiter, async (req, res) => {
    const actor = await requireFullTimerActor(req, res);
    if (!actor) return;
    const { actorId, actorName } = actor;

    const keptId = typeof req.body?.keptId === "string" ? req.body.keptId : "";
    const combinedInId = typeof req.body?.combinedInId === "string" ? req.body.combinedInId : "";

    try {
      const db = getAdminDb();
      const engine = new ContactCombineEngine({ db });

      if (req.body?.dryRun === true) {
        const result = await engine.previewCombine({
          keptId,
          combinedInId,
          picks: req.body?.picks,
          expectedTimestamps: {
            keptUpdatedAt: req.body?.keptUpdatedAt,
            combinedInUpdatedAt: req.body?.combinedInUpdatedAt,
          },
          actorId,
          actorName,
        });
        return res.status(200).json({ success: true, dryRun: true, moves: result.moves });
      }

      const result = await engine.executeCombine({
        keptId,
        combinedInId,
        expectedTimestamps: {
          keptUpdatedAt: req.body?.keptUpdatedAt,
          combinedInUpdatedAt: req.body?.combinedInUpdatedAt,
        },
        picks: req.body?.picks,
        reason: req.body?.reason,
        actorId,
        actorName,
      });

      return res.status(200).json({ success: true, combineRecordId: result.combineRecordId });
    } catch (error: any) {
      if (error instanceof ContactEngineError) {
        return res.status(error.status).json({ success: false, error: error.message, ...error.extra });
      }
      console.error("Combine Contacts Error:", error);
      return res
        .status(500)
        .json({ success: false, error: error.message || "Failed to combine contacts" });
    }
  });

  // Test Account Purge (Settings → Danger Zone). Full-timers only. Both the
  // preview (`dryRun`) and the purge scan on the server, so the client never
  // names what gets deleted.
  app.post("/api/test-account-purge", standardRateLimiter, async (req, res) => {
    const actor = await requireFullTimerActor(req, res);
    if (!actor) return;

    try {
      const engine = new TestAccountPurgeEngine({
        db: getAdminDb() as any,
        auth: getAdminAuth() as any,
        ownerEmail: OWNER_EMAIL_SERVER,
      });
      const plan = await engine.scan(actor.actorId);
      const fingerprint = purgePlanFingerprint(plan);
      if (req.body?.dryRun === true) {
        return res.status(200).json({ success: true, dryRun: true, plan, fingerprint });
      }
      // Delete only what the Full-timer was shown: a purge must carry the
      // preview's fingerprint, and a scan that has changed since is refused
      // with the new plan so the screen can show it (Nov 2026).
      if (typeof req.body?.fingerprint !== "string" || req.body.fingerprint !== fingerprint) {
        return res.status(409).json({
          success: false,
          error: "The test accounts changed since the preview. Check the new list before purging.",
          plan,
          fingerprint,
        });
      }
      const result = await engine.purge(plan, { deleteTestContacts: req.body?.deleteTestContacts === true });
      return res.status(200).json({ success: true, ...result });
    } catch (error: any) {
      console.error("Test Account Purge Error:", error);
      return res
        .status(500)
        .json({ success: false, error: error.message || "Failed to purge test accounts" });
    }
  });

  // Undo a combine (issue #1428, ADR 0038, deepened in #1586). Full-timers only.
  app.post("/api/combine-contacts/undo", standardRateLimiter, async (req, res) => {
    const actor = await requireFullTimerActor(req, res);
    if (!actor) return;
    const { actorId, actorName } = actor;

    const combineRecordId =
      typeof req.body?.combineRecordId === "string" ? req.body.combineRecordId : "";
    const dryRun = req.body?.dryRun === true;

    try {
      const db = getAdminDb();
      const engine = new ContactCombineEngine({ db });

      if (dryRun) {
        const result = await engine.previewUndo(combineRecordId, { actorId, actorName });
        return res.status(200).json({ success: true, dryRun: true, preview: result.preview });
      }

      const result = await engine.executeUndo(combineRecordId, { actorId, actorName });
      return res.status(200).json({ success: true, preview: result.preview });
    } catch (error: any) {
      if (error instanceof ContactEngineError) {
        return res.status(error.status).json({ success: false, error: error.message, ...error.extra });
      }
      console.error("Undo Combine Error:", error);
      return res
        .status(500)
        .json({ success: false, error: error.message || "Failed to undo combine" });
    }
  });

  // -- Guest links for coordination docs --------------------------------------
  // A guest link is a secret key on one board_docs page. These are the only
  // unauthenticated reads/writes in the app, so they are deliberately narrow:
  // the key must match the page's stored capability, and the payload is a fixed
  // public subset - never contacts, threads, or the user directory.
  const guestLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests" },
    keyGenerator: rateLimitKey,
  });

  const MAX_GUEST_MD = 100000;

  // Compare via fixed-length digests so a wrong key cannot be probed by length
  // or by timing. Returns false for anything that is not a non-empty string.
  function guestKeyMatches(stored: unknown, provided: unknown): boolean {
    if (typeof stored !== "string" || typeof provided !== "string") return false;
    if (stored.length === 0 || provided.length === 0) return false;
    const a = crypto.createHash("sha256").update(stored).digest();
    const b = crypto.createHash("sha256").update(provided).digest();
    return crypto.timingSafeEqual(a, b);
  }

  // Shared server-side capability check for the read and write endpoints.
  async function loadGuestDoc(docId: string, key: unknown) {
    const snap = await getAdminDb().collection("board_docs").doc(docId).get();
    if (!snap.exists) return null;
    const data = snap.data() || {};
    const guest = data.guestAccess;
    if (!guest || guest.enabled !== true || !guestKeyMatches(guest.key, key)) return null;
    const permission = guest.permission === "edit" ? "edit" : "view";
    return { data, permission };
  }

  // Read: only the public fields a guest page renders, plus (for an edit link) a
  // scoped custom token that bounds RTDB collaboration to this one doc.
  app.get("/api/guest-doc/:docId", guestLimiter, async (req, res) => {
    try {
      const docId = String(req.params.docId);
      const found = await loadGuestDoc(docId, req.query.key);
      if (!found) {
        res.status(404).json({ error: "unavailable" });
        return;
      }
      const { data, permission } = found;
      const doc = {
        id: docId,
        title: typeof data.title === "string" ? data.title : "",
        date: typeof data.date === "string" ? data.date : "",
        audience: data.audience === "trainees" || data.audience === "everyone" ? data.audience : "team",
        md: typeof data.md === "string" ? data.md : "",
      };
      let collabToken: string | undefined;
      if (permission === "edit") {
        try {
          collabToken = await getAdminAuth().createCustomToken(`guest_${crypto.randomUUID()}`, {
            guest: true,
            guestDoc: docId,
          });
        } catch (e) {
          // Editing still works through the save endpoint; only live sync degrades.
          console.error("Guest collab token mint failed: ", e);
        }
      }
      res.set("Cache-Control", "no-store");
      res.status(200).json({ doc, permission, collabToken });
    } catch (error: any) {
      console.error("GET /api/guest-doc error: ", error);
      res.status(500).json({ error: "unavailable" });
    }
  });

  // Write: edit links can persist the page's markdown. The live Yjs session over
  // RTDB is the fast path; this is the durable copy for when no Full-timer has
  // the page open. Only `md` (and attribution) is writable - never audience,
  // title, or the guest config itself.
  app.post("/api/guest-doc/:docId", guestLimiter, async (req, res) => {
    try {
      const docId = String(req.params.docId);
      const found = await loadGuestDoc(docId, req.body?.key);
      if (!found || found.permission !== "edit") {
        res.status(404).json({ error: "unavailable" });
        return;
      }
      const md = req.body?.md;
      if (typeof md !== "string" || md.length > MAX_GUEST_MD) {
        res.status(400).json({ error: "Invalid markdown" });
        return;
      }
      const rawName = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 80) : "";
      await getAdminDb().collection("board_docs").doc(docId).update({
        md,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: "guest",
        updatedByName: rawName || "Guest",
      });
      res.status(200).json({ success: true });
    } catch (error: any) {
      console.error("POST /api/guest-doc error: ", error);
      res.status(500).json({ error: "unavailable" });
    }
  });

  const asAttendanceRecord = (value: unknown): Record<string, unknown> | null => {
    if (typeof value === 'object') {
      if (value === null) return null;
      return value as Record<string, unknown>;
    }
    return null;
  };

  function parseAttendanceSyncPayload(body: unknown): { payload?: AttdSyncPayload; error?: string } {
    const data = asAttendanceRecord(body);
    if (data === null) return { error: 'Request body must be a JSON object.' };
    const attdEventId = typeof data.attdEventId === 'string' ? data.attdEventId.trim() : '';
    if (attdEventId === '') return { error: 'attdEventId is required.' };
    const eventName = typeof data.eventName === 'string' ? data.eventName.trim() : '';
    if (eventName === '') return { error: 'eventName is required.' };
    const sessionDate = typeof data.sessionDate === 'string' ? data.sessionDate.trim() : '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(sessionDate) === false) return { error: 'sessionDate must be yyyy-MM-dd.' };
    const frequency = typeof data.frequency === 'string' ? data.frequency : 'Weekly';
    const repeatingDays: string[] = [];
    if (Array.isArray(data.repeatingDays)) {
      for (const day of data.repeatingDays) {
        if (typeof day === 'string') repeatingDays.push(day);
      }
    }
    if (Array.isArray(data.records) === false) return { error: 'records must be an array.' };
    const records: AttdSyncPayload['records'] = [];
    for (const raw of data.records) {
      const row = asAttendanceRecord(raw);
      if (row === null) return { error: 'Each record must be an object.' };
      const attendee = typeof row.attendee === 'string' ? row.attendee.trim() : '';
      if (attendee === '') return { error: 'Each record needs an attendee name.' };
      const rawStatus = row.status;
      const validStatus = rawStatus === 'present' ? true : rawStatus === 'absent' ? true : rawStatus === 'late';
      if (validStatus === false) return { error: 'Each record status must be present, absent, or late.' };
      const status = rawStatus as AttdSyncPayload['records'][number]['status'];
      const rawMemberId = typeof row.memberId === 'string' ? row.memberId.trim() : '';
      const memberId = rawMemberId === '' ? null : rawMemberId;
      const isLate = row.isLate === true;
      const recordedAt = typeof row.recordedAt === 'string' ? row.recordedAt : undefined;
      records.push({ memberId, attendee, status, isLate, recordedAt });
    }
    const eventTime = typeof data.eventTime === 'string' ? data.eventTime : undefined;
    const payload: AttdSyncPayload = {
      attdEventId,
      eventName,
      frequency,
      repeatingDays,
      eventTime,
      sessionDate,
      records,
    };
    return { payload };
  }

  // ADR 0052: the credential is stored as the SHA-256 of the token, so the
  // server can verify a header without holding the token itself. The legacy
  // plaintext field is read too while a half-migrated environment still has one.
  function syncTokenFromSettings(settings: Record<string, unknown> | null): { hash: string; legacy: string } {
    const stored = { hash: '', legacy: '' };
    if (settings === null) return stored;
    if (typeof settings.attdSyncTokenHash === 'string') {
      stored.hash = settings.attdSyncTokenHash.trim();
    }
    // remove when attdSyncToken is gone everywhere
    const candidates = [settings.attdSyncToken, settings.syncToken, settings.cisaSyncToken, settings.token];
    for (const candidate of candidates) {
      if (typeof candidate === 'string') {
        const trimmed = candidate.trim();
        if (trimmed !== '') {
          stored.legacy = trimmed;
          break;
        }
      }
    }
    return stored;
  }

  function syncTokensMatch(stored: { hash: string; legacy: string }, provided: string): boolean {
    if (provided === '') return false;
    if (stored.hash !== '') {
      const providedDigest = crypto.createHash('sha256').update(provided, 'utf8').digest();
      const storedDigest = Buffer.from(stored.hash, 'hex');
      // Kept so a malformed stored hash or header cannot throw out of
      // timingSafeEqual; the digests are normally the same length by construction.
      if (storedDigest.length === providedDigest.length && crypto.timingSafeEqual(storedDigest, providedDigest)) {
        return true;
      }
    }
    // remove when attdSyncToken is gone everywhere
    if (stored.legacy === '') return false;
    const left = Buffer.from(stored.legacy);
    const right = Buffer.from(provided);
    if (left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
  }

  const handleAttendanceSyncIntake = async (req: express.Request, res: express.Response) => {
    try {
      const provided = String(req.headers['x-sync-token'] ?? '');
      const adminDb = getAdminDb();
      const settingsSnap = await adminDb.collection('settings').doc('integrations').get();
      const settings = settingsSnap.exists ? (settingsSnap.data() as Record<string, unknown>) : null;
      if (syncTokensMatch(syncTokenFromSettings(settings), provided) === false) {
        return res.status(401).json({ success: false, error: 'Invalid or missing x-sync-token.' });
      }

      const parsed = parseAttendanceSyncPayload(req.body);
      if (parsed.error) return res.status(400).json({ success: false, error: parsed.error });
      if (parsed.payload === undefined) return res.status(400).json({ success: false, error: 'Invalid payload.' });
      const payload = parsed.payload;

      const [contactsSnap, rhythmsSnap, mappingsSnap, aliasesSnap, eventsSnap] = await Promise.all([
        adminDb.collection('contacts').get(),
        adminDb.collection('rhythms').get(),
        adminDb.collection('integrations_attd_event_mappings').get(),
        adminDb.collection('attendee_aliases').get(),
        adminDb.collection('events').where('date', '==', payload.sessionDate).get(),
      ]);

      const mapDocs = (snap: any) =>
        snap.docs.map((entry: any) => ({ id: entry.id, ...(entry.data() as Record<string, unknown>) }));

      const preview = buildAttendancePreview({
        payload,
        contacts: mapDocs(contactsSnap) as any,
        rhythms: mapDocs(rhythmsSnap) as any,
        mappings: mapDocs(mappingsSnap) as AttdEventMapping[],
        aliases: mapDocs(aliasesSnap) as AttendeeAlias[],
        gatherings: mapDocs(eventsSnap) as any,
      });

      const created = await adminDb.collection('pending_attendance_imports').add({
        attdEventId: payload.attdEventId,
        eventName: payload.eventName,
        frequency: payload.frequency,
        repeatingDays: payload.repeatingDays,
        eventTime: payload.eventTime ?? null,
        sessionDate: payload.sessionDate,
        records: payload.records,
        payload,
        preview,
        targetRhythmId: preview.rhythmId,
        targetGatheringId: preview.gatheringId,
        matchSource: preview.matchSource,
        attendeeMatches: preview.attendees,
        stats: preview.stats,
        status: 'pending',
        createdAt: FieldValue.serverTimestamp(),
        createdBy: 'attd',
      });

      return res.status(201).json({ success: true, importId: created.id, preview });
    } catch (error) {
      console.error('POST /api/attendance-sync error:', error);
      return res.status(500).json({ success: false, error: 'Could not stage attendance sync.' });
    }
  };

  app.post(
    ['/api/attendance-sync', '/api/attendance-sync/intake', '/api/attd/sync', '/api/integrations/attd/attendance'],
    standardRateLimiter,
    handleAttendanceSyncIntake,
  );

  // The public sign-up form's "New Student Sign-up" alert to the Full-timers.
  // The browser used to write it straight into notifications, which let any
  // signed-out visitor push arbitrary alerts to the team. Now the server
  // writes it, worded here, at most once per real sign-up made in the last
  // few minutes, and behind the rate limit.
  const SIGNUP_NOTIFY_WINDOW_MS = 10 * 60 * 1000;
  app.post("/api/signup-notify", standardRateLimiter, async (req, res) => {
    try {
      const contactId = req.body?.contactId;
      if (typeof contactId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(contactId)) {
        return res.status(400).json({ error: "A contactId is required." });
      }
      const db = getAdminDb();
      const snap = await db.collection("contacts").doc(contactId).get();
      const data: any = snap.exists ? snap.data() : null;
      const tags: unknown[] = Array.isArray(data?.tags) ? data.tags : [];
      const createdMs =
        typeof data?.createdAt?.toMillis === "function"
          ? data.createdAt.toMillis()
          : Date.parse(String(data?.createdTime || ""));
      const age = Date.now() - createdMs;
      const recent = Number.isFinite(createdMs) && age >= -60_000 && age <= SIGNUP_NOTIFY_WINDOW_MS;
      if (!data || !tags.includes("New Sign Up") || !recent) {
        return res.status(404).json({ error: "No recent sign-up with that id." });
      }

      const notifRef = db.collection("notifications").doc(`signup-${contactId}`);
      if ((await notifRef.get()).exists) {
        return res.status(200).json({ success: true, alreadySent: true });
      }
      const name = String(data.name || "Someone").trim().slice(0, 100) || "Someone";
      await notifRef.set({
        userId: "ALL_ADMINS",
        title: "New Student Sign-up",
        message: `${name} has signed up via the public form.`,
        type: "event",
        read: false,
        createdAt: FieldValue.serverTimestamp(),
      });
      return res.status(200).json({ success: true });
    } catch (error: any) {
      console.error("Sign-up notify error:", error);
      return res.status(500).json({ error: "Could not send the sign-up alert." });
    }
  });

  // Endpoint 3: Public endpoint to verify that the Gemini API is configured

  // An unmatched API path is a 404, never the SPA shell.
  app.use("/api", (_req, res) => {
    res.status(404).json({ error: "Not found" });
  });

  // Serve static UI and mount Vite Dev Server middleware
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.use(standardRateLimiter, (req, res) => {
      res.sendFile("index.html", { root: distPath });
    });
  }

  return app;
}

async function startServer() {
  const app = await createApp();
  const PORT = 3000;

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Full-Stack Express Server active on http://0.0.0.0:${PORT}`);
  });
}

// Only auto-start when run as the server entrypoint — vitest (NODE_ENV=test)
// imports createApp() directly and must not bind port 3000.
if (process.env.NODE_ENV !== "test") {
  startServer().catch((err) => {
    console.error("Fatal Server Startup Error:", err);
    process.exit(1);
  });
}
