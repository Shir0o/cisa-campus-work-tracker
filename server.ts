

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
import { verifyTwilioRequest } from "./src/lib/twilioVerify";
import { FeedbackPipeline } from "./src/server/feedbackPipeline";
import { buildAttendancePreview } from "./src/lib/sync/attdCorrelator";
import { visibleToOf, type ContactTies } from "./src/lib/contactTies";
import { buildCombinePlan, buildCombineUndoPlan, combineRecordKind, referenceKey, timestampMillis, type CombineReferences, type CombineUndoCurrent, type CombinePicks, type CombineRecordKind } from "./src/lib/combineContactsPlan";
import { type TagCombine } from "./src/lib/tags";
import { TagCombineEngine, TagEngineError } from "./src/server/tagEngine";
import type { Contact } from "./src/types";
import { partnersAt, dayKey, cleanPairings, migrateByTermToPairings, type PartnerPairing, type PartnersByTerm } from "./src/lib/partnersModel";
import type { AttdEventMapping, AttdSyncPayload, AttendeeAlias } from "./src/lib/sync/attdCorrelator";
import {
  TranslationEngine,
  GeminiAIPort,
  FirestoreTranslationCachePort,
} from "./src/server/translationEngine";

dotenv.config();

// ── Combine records: claims and transactions (ADR 0038) ─────────────────────
// Firestore caps one transaction at 500 writes; the combine record takes one.
const MAX_TRANSACTION_WRITES = 500;
// A combine too large for one transaction claims its record as pending, and
// an undo too large claims it as undoing, while the batches run. A claim older
// than this is treated as interrupted: an undo may claim the record again and
// replay it against the current state, which skips what already landed.
const COMBINE_CLAIM_TTL_MS = 10 * 60 * 1000;

type CombineWriteOp =
  | { op: "set"; ref: any; data: Record<string, unknown> }
  | { op: "update"; ref: any; data: Record<string, unknown> }
  | { op: "delete"; ref: any };

/** A refusal raised inside a combine or undo transaction, sent as-is. */
class CombineRefusal extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

function applyCombineWrite(writer: any, op: CombineWriteOp) {
  if (op.op === "set") writer.set(op.ref, op.data);
  else if (op.op === "update") writer.update(op.ref, op.data);
  else writer.delete(op.ref);
}

async function commitInBatches(db: any, ops: CombineWriteOp[]) {
  const BATCH_LIMIT = 400;
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const op of ops.slice(i, i + BATCH_LIMIT)) applyCombineWrite(batch, op);
    await batch.commit();
  }
}

/**
 * Inbox read-state is one map per axis per person. Write only the keys that
 * differ, as field paths, so a key the person marks meanwhile is not lost to a
 * stale copy of the whole map.
 */
function mapKeyUpdates(field: string, from: unknown, to: unknown): Record<string, unknown> {
  const fromMap = (from ?? {}) as Record<string, unknown>;
  const toMap = (to ?? {}) as Record<string, unknown>;
  const updates: Record<string, unknown> = {};
  for (const key of new Set([...Object.keys(fromMap), ...Object.keys(toMap)])) {
    if (!(key in toMap)) updates[`${field}.${key}`] = FieldValue.delete();
    else if (!(key in fromMap) || fromMap[key] !== toMap[key]) updates[`${field}.${key}`] = toMap[key];
  }
  return updates;
}

/** Refuses while either contact is part of another pending or undoing combine record. */
async function refuseInFlightCombine(tx: any, db: any, contactIds: string[], ownRecordId?: string) {
  const snap = await tx.get(
    db.collection("combineRecords").where("status", "in", ["pending", "undoing"]),
  );
  const busy = snap.docs.find((d: any) => {
    const data = d.data();
    return d.id !== ownRecordId && (contactIds.includes(data.keptId) || contactIds.includes(data.combinedInId));
  });
  if (busy) {
    throw new CombineRefusal(
      409,
      `One of these contacts is in another combine or undo that has not finished (${busy.id}). Wait for it to finish, or undo it if it was interrupted.`,
      { inFlightCombineId: busy.id },
    );
  }
}

/**
 * Loads a combine record for an undo and answers the refusals every undo
 * shares: 404 when missing, 400 when it is the other kind (a record with no
 * kind is a contacts record), 409 when already undone. Returns null once it
 * has answered.
 */
async function loadCombineRecord(
  db: any,
  res: express.Response,
  combineRecordId: string,
  kind: CombineRecordKind,
) {
  const recordRef = db.collection("combineRecords").doc(combineRecordId);
  const recordSnap = await recordRef.get();
  if (!recordSnap.exists) {
    res.status(404).json({ success: false, error: "Combine record not found" });
    return null;
  }
  const record = recordSnap.data() as any;
  if (combineRecordKind(record) !== kind) {
    res.status(400).json({
      success: false,
      error: kind === "tags" ? "Not a tag combine record" : "Not a contact combine record",
    });
    return null;
  }
  if (record.status === "undone") {
    res.status(409).json({ success: false, error: "This combine has already been undone" });
    return null;
  }
  return { recordRef, record };
}

/** Whether an undo may claim this record: done, or a pending or undoing claim that has expired. */
function undoClaimable(record: any): boolean {
  if (record.status === "done") return true;
  if (record.status !== "pending" && record.status !== "undoing") return false;
  const claimedAt = Date.parse(record.claimedAt ?? record.combinedAt ?? "");
  return Number.isNaN(claimedAt) || Date.now() - claimedAt >= COMBINE_CLAIM_TTL_MS;
}

/**
 * Runs an undo's writes under a claim on its combine record, so two undos can
 * never both apply. When the writes fit, one transaction claims the record,
 * writes, and marks it undone. Otherwise a transaction moves it to undoing and
 * the writes follow in batches; if they fail partway the record stays undoing
 * until its claim expires, then any undo can claim it again and replay.
 */
async function undoUnderClaim(
  db: any,
  recordRef: any,
  ops: CombineWriteOp[],
  undone: Record<string, unknown>,
  check?: (tx: any) => Promise<void>,
) {
  const claim = async (tx: any) => {
    const snap = await tx.get(recordRef);
    if (!snap.exists || !undoClaimable(snap.data())) {
      throw new CombineRefusal(
        409,
        "This combine has already been undone, or another undo of it is still running",
      );
    }
    if (check) await check(tx);
  };
  if (ops.length < MAX_TRANSACTION_WRITES) {
    await db.runTransaction(async (tx: any) => {
      await claim(tx);
      for (const op of ops) applyCombineWrite(tx, op);
      tx.update(recordRef, undone);
    });
    return;
  }
  await db.runTransaction(async (tx: any) => {
    await claim(tx);
    tx.update(recordRef, { status: "undoing", claimedAt: new Date().toISOString() });
  });
  await commitInBatches(db, ops);
  await recordRef.update(undone);
}

export async function createApp() {
  const app = express();

  app.use(express.json({
    limit: "50mb",
    verify: (req: any, res, buf) => {
      req.rawBody = buf;
    }
  }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Terminal Request Logging Middleware to easily track incoming webhook/API requests in dev stdout console
  app.use((req, res, next) => {
    if (req.path.startsWith("/api/webhook") || req.path.startsWith("/api/quick-add")) {
      console.log(`\n============== [INCOMING WEBHOOK/API REQUEST] ==============`);
      console.log(`Timestamp   : ${new Date().toISOString()}`);
      console.log(`Method      : ${req.method}`);
      console.log(`URL         : ${req.originalUrl}`);
      console.log(`Headers     : ${JSON.stringify({
        host: req.headers.host,
        "content-type": req.headers["content-type"],
        "user-agent": req.headers["user-agent"]
      }, null, 2)}`);
      console.log(`Body/Payload: ${JSON.stringify(req.body, null, 2)}`);
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
    if (email.toLowerCase() === "yilongwang05@gmail.com") {
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

    return { uid, email, role };
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




  // --- Feedback Follow-ups and submitter-facing copy (ADR 0019) ---------------
  //
  // A Feedback Note is a conversation: Follow-ups live in
  // `feedback/{id}/replies` with Firestore as the source of truth, and mirror
  // to the linked GitHub issue's comments in both directions. Everything
  // arriving from GitHub is laundered by a model first, because the issue
  // stream carries agent triage briefs, stack traces and internal shorthand
  // that no submitter should read.

  // The owner's email, duplicated from OWNER_EMAIL in src/lib/permissions.ts.
  // That module cannot be imported here: it reaches ./partners -> ./firebase,
  // which initialises the *browser* Firebase SDK at module load.
  const OWNER_EMAIL_SERVER = (process.env.OWNER_EMAIL || "yilongwang05@gmail.com").trim().toLowerCase();



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

      const { type, kind, message, screenshot, url, userAgent, viewport } = req.body;

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

  // Endpoint: Update feedback status / archive (admin-facing, syncs with GitHub)
  app.post("/api/feedback/update", standardRateLimiter, async (req, res) => {
    try {
      // Authorize administrator role
      if (process.env.NODE_ENV !== "test") {
        try {
          await authorizeAdmin(req);
        } catch (authErr: any) {
          console.error("Admin authorization failed:", authErr);
          return res.status(403).json({ error: `Forbidden: ${authErr.message || String(authErr)}` });
        }
      }

      const { id, status, archived, githubIssueUrl } = req.body;
      if (!id) {
        return res.status(400).json({ error: "Missing required 'id' parameter." });
      }

      const db = getAdminDb();
      const pipeline = new FeedbackPipeline({ db });
      const result = await pipeline.updateNote({ id, status, archived, githubIssueUrl });

      res.status(200).json({ success: true, updates: result.updates });
    } catch (error: any) {
      if (error.status) {
        return res.status(error.status).json({ error: error.message });
      }
      console.error("Error in POST /api/feedback/update: ", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // Endpoint: post a Follow-up on a Feedback Note (ADR 0019)
  // The only write path for `feedback/{id}/replies` — the rules refuse client
  // writes — so that every Follow-up mirrors onto the linked issue and the
  // awaiting-reply flag and notifications cannot be skipped.
  app.post("/api/feedback/reply", feedbackWriteLimiter, async (req, res) => {
    try {
      let decoded: any;
      try {
        decoded = await authenticateFirebaseUser(req);
      } catch (authErr: any) {
        console.error("Firebase ID token verification failed:", authErr);
        return res.status(401).json({ error: "Unauthorized: " + (authErr.message || String(authErr)) });
      }

      const { id, body } = req.body;
      if (!id || typeof body !== "string" || !body.trim()) {
        return res.status(400).json({ error: "Missing required 'id' and 'body' parameters." });
      }

      const db = getAdminDb();
      const pipeline = new FeedbackPipeline({ db });
      const result = await pipeline.addFollowUp({
        id,
        body,
        actor: {
          uid: decoded.uid,
          email: decoded.email,
          name: decoded.name || decoded.displayName,
        },
      });

      res.status(200).json({ success: true, mirroredToGitHub: result.mirroredToGitHub });
    } catch (error: any) {
      if (error.status) {
        return res.status(error.status).json({ error: error.message });
      }
      console.error("Error in POST /api/feedback/reply: ", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // Endpoint: edit a Follow-up on a Feedback Note (ADR 0019). Only the reply's
  // author may rewrite it — Full-timers get no blanket edit rights, and a
  // relayed reply belongs to the issue, not to any app user. The edit mirrors
  // onto the comment posted when the reply was created, so the app and the
  // public issue do not diverge; an edit never touches status, outcome, or the
  // awaiting-reply flag, and never fires notifications.
  app.post("/api/feedback/reply/edit", feedbackWriteLimiter, async (req, res) => {
    try {
      let decoded: any;
      try {
        decoded = await authenticateFirebaseUser(req);
      } catch (authErr: any) {
        console.error("Firebase ID token verification failed:", authErr);
        return res.status(401).json({ error: "Unauthorized: " + (authErr.message || String(authErr)) });
      }

      const { id, replyId, body } = req.body;
      if (!id || !replyId || typeof body !== "string" || !body.trim()) {
        return res.status(400).json({ error: "Missing required 'id', 'replyId', and 'body' parameters." });
      }

      const db = getAdminDb();
      const pipeline = new FeedbackPipeline({ db });
      const result = await pipeline.editFollowUp({
        id,
        replyId,
        body,
        actorUid: decoded.uid,
      });

      res.status(200).json({ success: true, mirroredToGitHub: result.mirroredToGitHub });
    } catch (error: any) {
      if (error.status) {
        return res.status(error.status).json({ error: error.message });
      }
      console.error("Error in POST /api/feedback/reply/edit: ", error);
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

        if (digest !== signature) {
          console.warn("GitHub Webhook: Signature verification failed.");
          return res.status(403).json({ error: "Invalid signature." });
        }
      } else {
        console.warn("GITHUB_WEBHOOK_SECRET not configured; skipping webhook signature verification.");
      }

      const eventType = req.headers["x-github-event"] as string;
      const { action, issue, comment } = req.body;

      const db = getAdminDb();
      const pipeline = new FeedbackPipeline({ db });
      const result = await pipeline.handleGitHubWebhook({
        eventType,
        action,
        issue,
        comment,
      });

      if (result.message) {
        return res.status(200).json({ message: result.message });
      }
      if (result.relayedCount !== undefined) {
        return res.status(200).json({ success: true, relayedCount: result.relayedCount });
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

  // Helper: Generates short, appropriate initials for names
  function getInitials(fullName: string) {
    const parts = fullName.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "??";
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  // Core Service: Parses raw unstructured descriptions using Gemini
  async function parseContactFromText(rawText: string) {
    try {
      const prompt = `Extract contact details from this unstructured notification, text message, or description: "${rawText}"`;
      
      const response = await getAiClient().models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: `You are an expert utility designed to parse raw notes or verbal descriptions about newly met contacts and format them into structured JSON.
Analyze the input text carefully and extract the following:
1. name: string (Strictly required. The full name of the contact. If only a single name is offered, use that. If multiple people are mentioned, prioritize the main contact).
2. location: string (The dorm, building, venue, or context where they first connected, e.g., 'Campus Center', 'Miller Hall', 'Cafeteria'. Default to empty string if not mentioned).
3. email: string (Any email mentioned. Format appropriately; empty string if not mentioned).
4. phone: string (Any cell or phone number mentioned. Format in clean standard style: (XXX) XXX-XXXX; empty string if not mentioned).
5. stage: string (The progress stage. MUST be one of: 'First Contact', 'Outreach', 'Unassigned'. Default to 'First Contact' if not specified).
6. tags: array of strings (A maximum of 4 simple keyword tags. For example: ['Gospel', 'Inquisitive', 'Club Rush']. Never use a school year such as Freshman or Senior as a tag. Do not include space-padded commas).
7. spiritualBackground: string (Optional. Choose EXACTLY one of: 'Christian', 'Catholic', 'Other', 'None', or empty string if not explicit).
8. notes: string (Strictly required. A concise, polished summary of descriptions, what was discussed, their background, and key points of interest. Include any contextual cues like "Met in biology class").`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: "Extract full name (First and/or Last name)." },
              location: { type: Type.STRING, description: "Where they first met or live." },
              email: { type: Type.STRING, description: "Extracted email address." },
              phone: { type: Type.STRING, description: "Telephone formatted standard." },
              stage: { type: Type.STRING, description: "Pipeline stage. Must be: First Contact, Outreach, or Unassigned." },
              tags: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
                description: "Clean descriptive tags summarizing characters or interests."
              },
              spiritualBackground: { type: Type.STRING, description: "Religious background if specified: Christian, Catholic, Other, None, or empty." },
              notes: { type: Type.STRING, description: "Clean structured meeting context summary." }
            },
            required: ["name", "notes"]
          }
        }
      });

      if (!response.text) {
        throw new Error("No response returned from the Gemini API.");
      }

      return JSON.parse(response.text.trim());
    } catch (error) {
      console.error("Gemini Parsing Error: ", error);
      throw error;
    }
  }

  // Core Service: Parses subsequent/follow-up meeting details specifically for the interaction subcommand
  async function parseInteractionFromText(rawText: string) {
    try {
      const prompt = `Extract interaction details from this description: "${rawText}"`;
      
      const response = await getAiClient().models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: `You are an expert utility designed to parse raw subsequent logs, meeting summaries, or prayer updates of conversations with existing contacts and format them into structured JSON.
Analyze the input text carefully and extract the following:
1. contactName: string (Strictly required. The name of the contact being met/interacted with. Extract the full name if available).
2. content: string (Strictly required. A concise, polished summary of what was discussed, updates shared, prayer burdens, or key discussion items).
3. type: string (The type of interaction, e.g., 'Chat', 'Coffee', 'Prayer', 'Bible Study', 'Call', 'Meeting', or 'General Discussion'. Default to 'Chat' if not specified).
4. dateOffset: string (Optional. When it happened if mentioned, e.g., 'yesterday', 'today', 'last Friday', etc., otherwise defaults to empty).`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              contactName: { type: Type.STRING, description: "Extracted full name of the contact." },
              content: { type: Type.STRING, description: "Polished context description of what was chatted or shared." },
              type: { type: Type.STRING, description: "Type of interaction logged: Chat, Coffee, Prayer, Bible Study, Call, Meeting, etc." },
              dateOffset: { type: Type.STRING, description: "Indicated timing of the interaction." }
            },
            required: ["contactName", "content"]
          }
        }
      });

      if (!response.text) {
        throw new Error("No response returned from the Gemini API.");
      }

      return JSON.parse(response.text.trim());
    } catch (error) {
      console.error("Gemini Interaction Parsing Error: ", error);
      throw error;
    }
  }

  // Helper: Find an existing contact based on name overlap, email, or telephone number
  async function findExistingContact(parsedName: string, parsedEmail: string, parsedPhone: string) {
    const db = getAdminDb();
    const snapshot = await db.collection("contacts").get();
    const contacts: any[] = [];
    snapshot.forEach(doc => {
      contacts.push({ id: doc.id, ...doc.data() });
    });

    const cleanParsedPhone = parsedPhone ? parsedPhone.replace(/\D/g, "") : "";
    const cleanParsedEmail = parsedEmail ? parsedEmail.trim().toLowerCase() : "";
    const cleanParsedName = parsedName ? parsedName.trim().toLowerCase() : "";

    // 1. Match by email first
    if (cleanParsedEmail) {
      const match = contacts.find(c => c.email && c.email.trim().toLowerCase() === cleanParsedEmail);
      if (match) return match;
    }

    // 2. Match by phone
    if (cleanParsedPhone) {
      const match = contacts.find(c => {
        if (!c.phone) return false;
        const cleanPhone = c.phone.replace(/\D/g, "");
        return cleanPhone === cleanParsedPhone;
      });
      if (match) return match;
    }

    // 3. Match by exact name
    if (cleanParsedName) {
      const match = contacts.find(c => c.name && c.name.trim().toLowerCase() === cleanParsedName);
      if (match) return match;
    }

    // 4. Match by fuzzy name containment (case-insensitive substring overlap)
    //    Only treat a substring hit as a match when it aligns on a word
    //    boundary — otherwise prefix-only names like "Robert" wrongly fold
    //    into existing contacts such as "Roberto Garcia" (#731).
    if (cleanParsedName) {
      const isWordBoundaryMatch = (haystack: string, needle: string) => {
        if (!needle) return false;
        let idx = haystack.indexOf(needle);
        while (idx !== -1) {
          const prev = idx === 0 ? " " : haystack[idx - 1];
          const next = idx + needle.length === haystack.length ? " " : haystack[idx + needle.length];
          if (!/[a-z0-9]/.test(prev) && !/[a-z0-9]/.test(next)) return true;
          idx = haystack.indexOf(needle, idx + 1);
        }
        return false;
      };
      const potentials = contacts.filter(c => {
        if (!c.name) return false;
        const dbName = c.name.trim().toLowerCase();
        return isWordBoundaryMatch(dbName, cleanParsedName)
          || isWordBoundaryMatch(cleanParsedName, dbName);
      });
      // Return if exactly one unique contact matched fuzzy lookup
      if (potentials.length === 1) {
        return potentials[0];
      }
    }

    return null;
  }

  // Helper: Match an external sender against registered team members in `groupme_aliases` or `users`
  async function findMatchingTeamUser(senderName?: string, senderEmail?: string, senderId?: string) {
    const db = getAdminDb();

    // 1. If senderId is provided, check groupme_aliases collection first
    if (senderId) {
      try {
        const aliasDoc = await db.collection("groupme_aliases").doc(senderId).get();
        if (aliasDoc.exists) {
          const aliasData = aliasDoc.data();
          if (aliasData?.userId) {
            const userDoc = await db.collection("users").doc(aliasData.userId).get();
            if (userDoc.exists) {
              return { id: userDoc.id, ...userDoc.data() };
            }
          }
        }
      } catch (err) {
        console.warn("Failed to check groupme_aliases for senderId:", err);
      }
    }

    if (!senderName && !senderEmail) return null;
    const snapshot = await db.collection("users").get();
    const cleanName = (senderName || "").trim().toLowerCase();
    const cleanEmail = (senderEmail || "").trim().toLowerCase();

    let matchedUser: { id: string; displayName?: string; email?: string } | null = null;

    snapshot.forEach(doc => {
      const data = doc.data();
      const uEmail = (data.email || "").trim().toLowerCase();
      const uName = (data.displayName || data.name || "").trim().toLowerCase();

      if (cleanEmail && uEmail && uEmail === cleanEmail) {
        matchedUser = { id: doc.id, ...data };
      } else if (!matchedUser && cleanName && uName) {
        if (uName === cleanName || uName.startsWith(cleanName) || cleanName.startsWith(uName)) {
          matchedUser = { id: doc.id, ...data };
        }
      }
    });

    return matchedUser;
  }

  // Helper: Resolve gospel partner co-creators for a user from settings/partners
  async function resolvePartnerCoCreators(userId?: string): Promise<string[]> {
    if (!userId || userId.startsWith("system-") || userId.startsWith("groupme-") || userId === "system-quick-add") {
      return [];
    }
    try {
      const partnersDoc = await getAdminDb().collection("settings").doc("partners").get();
      if (!partnersDoc.exists) return [];
      const data = partnersDoc.data() || {};
      const pairings: PartnerPairing[] = Array.isArray(data.pairings)
        ? cleanPairings(data.pairings)
        : migrateByTermToPairings(data.byTerm as PartnersByTerm);
      return partnersAt(pairings, userId, dayKey());
    } catch (e) {
      console.warn("Error resolving partner co-creators:", e);
      return [];
    }
  }

  // Developer Logging Helper: Records incoming API and webhook events for debugging purposes
  async function logApiCall(source: string, payload: any, headers: any, status: "success" | "error" | "ignored", result: string, error?: string) {
    try {
      const cleanHeaders = {
        host: headers.host,
        "content-type": headers["content-type"],
        "user-agent": headers["user-agent"],
        "x-forwarded-for": headers["x-forwarded-for"]
      };

      await getAdminDb().collection("webhook_logs").add({
        id: Math.random().toString(36).substr(2, 9),
        timestamp: new Date().toISOString(),
        serverTimestamp: FieldValue.serverTimestamp(),
        source,
        payload: typeof payload === "object" ? JSON.stringify(payload) : String(payload),
        headers: JSON.stringify(cleanHeaders),
        status,
        result,
        error: error || ""
      });
    } catch (e) {
      console.error("Failed to write to firestore webhook_logs:", e);
    }
  }

  // Helper: Extract optional subcommand and remaining text, handling optional !add prefixes
  function extractSubcommandAndText(rawText: string) {
    let text = rawText.trim();
    
    // 1. Remove standard command prefix if present (e.g. !add, /add, add:, add) followed by space
    const prefixRegex = /^(?:!add|\/add|add:|add)\s+/i;
    if (prefixRegex.test(text)) {
      text = text.replace(prefixRegex, "").trim();
    }
    
    // 2. Identify subcommand option (contact or interaction)
    const contactSubcommandRegex = /^(?:contact|contacts)(?:\s+|:\s*|-\s*)/i;
    const interactionSubcommandRegex = /^(?:interaction|interactions)(?:\s+|:\s*|-\s*)/i;
    
    if (contactSubcommandRegex.test(text)) {
      return {
        subcommand: "contact" as const,
        remainingText: text.replace(contactSubcommandRegex, "").trim()
      };
    } else if (interactionSubcommandRegex.test(text)) {
      return {
        subcommand: "interaction" as const,
        remainingText: text.replace(interactionSubcommandRegex, "").trim()
      };
    }
    
    // Default fallback to "contact" if no option matched explicitly
    return {
      subcommand: "contact" as const,
      remainingText: text
    };
  }

  // GroupMe bot hook always tags new contacts with the active semester (e.g.
  // "Fall 2026"). The web app's tag normalizer displays compact variants as
  // spaced seasons, but the bot can write the canonical form directly.
  function currentSemesterTag(now = new Date()) {
    const month = now.getMonth() + 1; // 1-12
    const year = now.getFullYear();
    if (month >= 8) return `Fall ${year}`;
    if (month >= 5) return `Summer ${year}`;
    return `Spring ${year}`;
  }

  // Core Endpoint Router: Dispatches to either contact addition/updating or specific interaction logging
  async function performQuickAdd(text: string, operatorInfo?: { userId?: string, userName?: string }) {
    const opUserId = operatorInfo?.userId || "system-quick-add";
    const opUserName = operatorInfo?.userName || "Quick Add AI Service";

    const { subcommand, remainingText } = extractSubcommandAndText(text);

    if (subcommand === "interaction") {
      const parsed = await parseInteractionFromText(remainingText);

      if (!parsed.contactName) {
        throw new Error("Failed to extract a valid contact name for committing subsequent interaction.");
      }

      // Find if contact exists
      const existingContact = await findExistingContact(parsed.contactName, "", "");

      if (existingContact) {
        const loggedAt = new Date().toISOString();
        // Update contact lastSeen and metadata
        const updatePayload: any = {
          lastSeen: "Just now",
          updatedAt: new Date().toISOString(),
          updatedBy: opUserId,
          updatedByName: opUserName,
          hasNewActivity: true,
          // The interaction below reaches them (#1335).
          reachedAt: loggedAt,
        };

        await getAdminDb().collection("contacts").doc(existingContact.id).update(updatePayload);

        // Add to interactions collection
        await getAdminDb()
          .collection("contacts")
          .doc(existingContact.id)
          .collection("interactions")
          .add({
            createdById: opUserId,
            createdByName: opUserName,
            contactId: existingContact.id,
            contactName: existingContact.name,
            content: parsed.content || `Interaction logged: "${remainingText}"`,
            type: parsed.type || "Quick Add Note",
            dateTime: loggedAt,
            createdAt: new Date().toISOString(),
            serverCreatedAt: FieldValue.serverTimestamp()
          });

        const detailedLog = [
          `Logged interaction with existing contact: ${existingContact.name}`,
          parsed.content ? `Details: ${parsed.content}` : "",
          `Type: ${parsed.type || "Quick Add Note"}`
        ].filter(Boolean).join("\n");

        // Log the action in activities
        await getAdminDb().collection("activities").add({
          userId: opUserId,
          userName: opUserName,
          userPhoto: "",
          action: "logged an interaction with existing contact",
          targetId: existingContact.id,
          targetName: existingContact.name,
          targetType: "contact",
          type: "comment",
          description: detailedLog,
          createdAt: new Date().toISOString()
        });

        // Notify admins
        await getAdminDb().collection("notifications").add({
          userId: "ALL_ACTIVE",
          title: "📝 Interaction Logged via Quick Add",
          message: `Logged a text interaction of type "${parsed.type || "Quick Add Note"}" for existing contact "${existingContact.name}".`,
          type: "info",
          read: false,
          createdAt: FieldValue.serverTimestamp(),
          link: "/directory",
          targetId: existingContact.id
        });

        return {
          id: existingContact.id,
          isExisting: true,
          name: existingContact.name,
          stage: existingContact.stage,
          notes: parsed.content || ""
        };
      } else {
        // Contact doesn't exist, create minimal contact and append interaction
        const partnerCoCreators = await resolvePartnerCoCreators(opUserId);
        const loggedAt = new Date().toISOString();
        const contactData = {
          name: parsed.contactName,
          email: "",
          phone: "",
          stage: "First Contact",
          tags: ["Auto-Created"],
          notes: `Created automatically via incoming interaction log: "${parsed.content}"`,
          spiritualBackground: "",
          initials: getInitials(parsed.contactName),
          lastSeen: "Just now",
          createdAt: new Date().toISOString(),
          serverCreatedAt: FieldValue.serverTimestamp(),
          createdBy: opUserId,
          createdByName: opUserName,
          ...(partnerCoCreators.length > 0 ? { coCreators: partnerCoCreators } : {}),
          hasNewActivity: true,
          // The interaction below reaches them (#1335).
          reachedAt: loggedAt,
        };
        // `createdBy` is a persisted tie, so the access list the rules read has
        // to be derived and written in the same breath (#1024 phase 4).
        const docRef = await getAdminDb()
          .collection("contacts")
          .add({ ...contactData, visibleTo: visibleToOf(contactData as ContactTies) });

        // Add interaction
        await getAdminDb()
          .collection("contacts")
          .doc(docRef.id)
          .collection("interactions")
          .add({
            createdById: opUserId,
            createdByName: opUserName,
            contactId: docRef.id,
            contactName: contactData.name,
            content: parsed.content || `Initial interaction logged.`,
            type: parsed.type || "Quick Add Note",
            dateTime: loggedAt,
            createdAt: new Date().toISOString(),
            serverCreatedAt: FieldValue.serverTimestamp()
          });

        const detailedLog = [
          `Auto-created contact during interaction log: ${contactData.name}`,
          parsed.content ? `Details: ${parsed.content}` : "",
          `Type: ${parsed.type || "Quick Add Note"}`
        ].filter(Boolean).join("\n");

        // Log in activities
        await getAdminDb().collection("activities").add({
          userId: opUserId,
          userName: opUserName,
          userPhoto: "",
          action: "created a new contact via external trigger",
          targetId: docRef.id,
          targetName: contactData.name,
          targetType: "contact",
          type: "create",
          description: detailedLog,
          createdAt: new Date().toISOString()
        });

        // Notify admins
        await getAdminDb().collection("notifications").add({
          userId: "ALL_ACTIVE",
          title: "📞 New Contact Added via Quick Add",
          message: `Successfully created ${contactData.name} (Student) and logged initial interaction ("${parsed.type || "Quick Add Note"}").`,
          type: "success",
          read: false,
          createdAt: FieldValue.serverTimestamp(),
          link: "/directory",
          targetId: docRef.id
        });

        return {
          id: docRef.id,
          isExisting: false,
          name: contactData.name,
          stage: contactData.stage,
          notes: parsed.content || ""
        };
      }
    } else {
      // subcommand === "contact"
      const parsed = await parseContactFromText(remainingText);

      if (!parsed.name) {
        throw new Error("Failed to extract a valid name from the text description.");
      }

      // Check if contact already exists
      const existingContact = await findExistingContact(parsed.name, parsed.email, parsed.phone);

      if (existingContact) {
        const loggedAt = new Date().toISOString();
        const updatePayload: any = {
          lastSeen: "Just now",
          updatedAt: new Date().toISOString(),
          updatedBy: opUserId,
          updatedByName: opUserName,
          hasNewActivity: true,
          // The interaction below reaches them (#1335).
          reachedAt: loggedAt,
        };

        // Merge fields cleanly if they are empty on the existing contact record
        if (!existingContact.email && parsed.email) updatePayload.email = parsed.email;
        if (!existingContact.phone && parsed.phone) updatePayload.phone = parsed.phone;
        if (!existingContact.spiritualBackground && parsed.spiritualBackground) {
          updatePayload.spiritualBackground = parsed.spiritualBackground;
        }

        const existingTags = existingContact.tags || [];
        const newTags = parsed.tags || [];
        const combinedTags = Array.from(new Set([...existingTags, ...newTags]));
        if (combinedTags.length > existingTags.length) {
          updatePayload.tags = combinedTags;
        }

        // Update the contact in Firebase
        await getAdminDb().collection("contacts").doc(existingContact.id).update(updatePayload);

        // Add to contact's interactions subcollection
        await getAdminDb()
          .collection("contacts")
          .doc(existingContact.id)
          .collection("interactions")
          .add({
            createdById: opUserId,
            createdByName: opUserName,
            contactId: existingContact.id,
            contactName: existingContact.name,
            content: parsed.notes || `Interaction logged via Quick Add: "${remainingText}"`,
            type: "Quick Add Note",
            dateTime: loggedAt,
            createdAt: new Date().toISOString(),
            serverCreatedAt: FieldValue.serverTimestamp()
          });

        // Format description logging message
        const hasUpdates = Object.keys(updatePayload).filter(k => !["lastSeen", "updatedAt", "updatedBy", "updatedByName", "hasNewActivity", "reachedAt"].includes(k)).length > 0;
        const changeSummary = hasUpdates 
          ? `Filled details: ${Object.keys(updatePayload).filter(k => !["lastSeen", "updatedAt", "updatedBy", "updatedByName", "hasNewActivity", "reachedAt"].includes(k)).join(", ")}` 
          : "No additional empty fields were present to fill.";

        const detailedLog = [
          `Logged interaction with existing contact: ${existingContact.name}`,
          parsed.notes ? `Interaction details: ${parsed.notes}` : "",
          changeSummary
        ].filter(Boolean).join("\n");

        // Log the action in activities
        await getAdminDb().collection("activities").add({
          userId: opUserId,
          userName: opUserName,
          userPhoto: "",
          action: "logged an interaction with existing contact",
          targetId: existingContact.id,
          targetName: existingContact.name,
          targetType: "contact",
          type: "comment",
          description: detailedLog,
          createdAt: new Date().toISOString()
        });

        // Notify all system admins/operators
        await getAdminDb().collection("notifications").add({
          userId: "ALL_ACTIVE",
          title: "📝 Interaction Logged via Quick Add",
          message: `Logged a text interaction and updated fields for existing contact "${existingContact.name}".`,
          type: "info",
          read: false,
          createdAt: FieldValue.serverTimestamp(),
          link: "/directory",
          targetId: existingContact.id
        });

        return { id: existingContact.id, isExisting: true, name: existingContact.name, notes: parsed.notes || "", stage: existingContact.stage };
      }

      // Creating new contact
      const partnerCoCreators = await resolvePartnerCoCreators(opUserId);
      const contactData = {
        name: parsed.name,
        email: parsed.email || "",
        phone: parsed.phone || "",
        stage: parsed.stage || "First Contact",
        tags: parsed.tags || [],
        notes: parsed.notes || "",
        spiritualBackground: parsed.spiritualBackground || "",
        initials: getInitials(parsed.name),
        lastSeen: "Just now",
        createdAt: new Date().toISOString(),
        serverCreatedAt: FieldValue.serverTimestamp(),
        createdBy: opUserId,
        createdByName: opUserName,
        ...(partnerCoCreators.length > 0 ? { coCreators: partnerCoCreators } : {}),
        hasNewActivity: true,
      };
      // Derived from the ties actually persisted above, so this agrees exactly
      // with what scripts/backfill-contact-visible-to.ts would compute
      // (#1024 phase 4). An automation label like "external-automation" is no
      // real teammate's uid, so it grants nobody access -- but it has to be in
      // the list for the backfill not to keep re-planning this row.
      // Add directly to contacts collection using admin privileges
      const docRef = await getAdminDb()
        .collection("contacts")
        .add({ ...contactData, visibleTo: visibleToOf(contactData as ContactTies) });

      // Document formatted log message
      const fieldsLog = [
        `Stage: ${contactData.stage}`,
        contactData.email ? `Email: ${contactData.email}` : "",
        contactData.phone ? `Phone: ${contactData.phone}` : "",
        contactData.spiritualBackground ? `Spiritual Background: ${contactData.spiritualBackground}` : "",
        contactData.tags.length > 0 ? `Tags: ${contactData.tags.join(", ")}` : "",
        contactData.notes ? `Quick Add Notes: ${contactData.notes}` : "Added via speech/text parsed quick-add description."
      ].filter(Boolean).join("\n");

      // Log the action in activities
      await getAdminDb().collection("activities").add({
        userId: opUserId,
        userName: opUserName,
        userPhoto: "",
        action: "created a new contact via external trigger",
        targetId: docRef.id,
        targetName: contactData.name,
        targetType: "contact",
        type: "create",
        description: fieldsLog,
        createdAt: new Date().toISOString()
      });

      // Notify all system admins/operators
      await getAdminDb().collection("notifications").add({
        userId: "ALL_ACTIVE",
        title: "📞 New Contact Added via Quick Add",
        message: `Successfully created ${contactData.name} from text description.`,
        type: "success",
        read: false,
        createdAt: FieldValue.serverTimestamp(),
        link: "/directory",
        targetId: docRef.id
      });

      return { id: docRef.id, isExisting: false, ...contactData };
    }
  }



  // Endpoint 0: Developer Query Endpoint to fetch latest webhook logs as JSON outside the website
  app.get("/api/webhook/logs", standardRateLimiter, async (req, res) => {
    try {
      // Admin-only: these logs contain raw contact PII and SMS/GroupMe message bodies.
      if (process.env.NODE_ENV !== "test") {
        try {
          await authorizeAdmin(req);
        } catch (authErr: any) {
          return res.status(403).json({ error: `Forbidden: ${authErr.message || String(authErr)}` });
        }
      }

      const limitVal = Math.min(parseInt(req.query.limit as string) || 10, 50);
      const snapshot = await getAdminDb()
        .collection("webhook_logs")
        .orderBy("timestamp", "desc")
        .limit(limitVal)
        .get();
      
      const logs = snapshot.docs.map(doc => ({
        dbId: doc.id,
        ...doc.data()
      }));
      
      res.status(200).json({ logs });
    } catch (error: any) {
      console.error("Error retrieving webhook logs via API: ", error);
      res.status(500).json({ error: error.message || "Failed to retrieve webhook logs" });
    }
  });

  // Endpoint 1: Direct JSON API endpoint for custom clients, Siri, Android Shortcuts, or browser tools
  app.post("/api/quick-add", standardRateLimiter, async (req, res) => {
    try {
      const { text } = req.body;

      // If a Firebase ID token is supplied (the in-app Quick Add box), verify it
      // and attribute the contact to the real signed-in user. Otherwise (curl,
      // Siri/Android Shortcuts) this is an intentionally public automation
      // endpoint, so fall back to a generic label instead of trusting a
      // client-supplied userId/userName, which anyone could otherwise forge to
      // impersonate a specific teammate.
      let userId = "external-automation";
      let userName = "External Automation";
      if (req.headers.authorization) {
        try {
          const decoded = await authenticateFirebaseUser(req);
          userId = decoded.uid;
          userName = decoded.name || decoded.email || "Teammate";
        } catch (authErr: any) {
          return res.status(401).json({ error: `Unauthorized: ${authErr.message || String(authErr)}` });
        }
      }

      if (!text || typeof text !== "string") {
        const errMsg = "No text description provided. Please include a 'text' property.";
        await logApiCall("Quick Add API", req.body, req.headers, "error", errMsg, "Missing required 'text' parameter.");
        return res.status(400).json({ error: errMsg });
      }

      console.log(`Processing Quick Add Request: "${text}"`);
      const contact = await performQuickAdd(text, { userId, userName }) as any;
      const outcome = contact.isExisting 
        ? `Matched existing contact "${contact.name}" and logged interaction.`
        : `Created new contact "${contact.name}".`;

      await logApiCall("Quick Add API", req.body, req.headers, "success", outcome);
      res.status(200).json({ success: true, contact });
    } catch (error: any) {
      console.error("Quick Add Service Error: ", error);
      await logApiCall("Quick Add API", req.body, req.headers, "error", "Internal server quick-add error.", error.message || String(error));
      res.status(500).json({ success: false, error: error.message || "Internal Server Error" });
    }
  });

  // Endpoint 2: URL-Encoded Twilio Webhook compatibility endpoint (SMS & WhatsApp trigger)
  app.post("/api/webhook/sms", standardRateLimiter, async (req, res) => {
    try {
      const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
      if (twilioAuthToken) {
        if (!verifyTwilioRequest(req, twilioAuthToken)) {
          console.warn("Twilio SMS Webhook: Signature verification failed.");
          return res.status(403).type("text/xml").send(`
          <Response>
            <Message>Forbidden: invalid signature.</Message>
          </Response>
        `);
        }
      } else {
        console.warn("TWILIO_AUTH_TOKEN not configured; skipping SMS webhook signature verification.");
      }

      const smsBody = req.body.Body;
      const smsFrom = req.body.From;

      if (!smsBody) {
        const errMsg = "Error: Please provide a valid text description in the body.";
        await logApiCall("Twilio SMS", req.body, req.headers, "error", "Body missing", "Twilio body parsed empty");
        return res.status(400).type("text/xml").send(`
          <Response>
            <Message>${errMsg}</Message>
          </Response>
        `);
      }

      console.log(`Processing Webhook Trigger from ${smsFrom}: "${smsBody}"`);
      const contact = await performQuickAdd(smsBody, {
        userId: smsFrom ? `sms-${smsFrom}` : "system-sms",
        userName: smsFrom ? `SMS: ${smsFrom}` : "SMS User"
      }) as any;
      const outcome = contact.isExisting 
        ? `SMS from ${smsFrom} matched existing contact "${contact.name}" and logged interaction.`
        : `SMS from ${smsFrom} created new contact "${contact.name}".`;

      await logApiCall("Twilio SMS", req.body, req.headers, "success", outcome);

      const twiml = `
<Response>
  <Message>
🎉 ${contact.isExisting ? "Logged Interaction with" : "Added"} ${contact.name}!
📍 Location: ${contact.location ? contact.location : "Not specified"}
${contact.isExisting ? "📝 Added interaction notes to history." : `💡 Notes: ${contact.notes.substring(0, 100)}${contact.notes.length > 100 ? "..." : ""}`}
  </Message>
</Response>
      `.trim();

      res.status(200).type("text/xml").send(twiml);
    } catch (error: any) {
      console.error("Webhook Quick Add Error: ", error);
      await logApiCall("Twilio SMS", req.body, req.headers, "error", "Error parsing SMS to contact.", error.message || String(error));
      const safeErrorMsg = String(error.message || "Internal server processing error.")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
      const twimlError = `
<Response>
  <Message>
⚠️ Failed to parse/quick-add contact via AI service.
Error: ${safeErrorMsg}
  </Message>
</Response>
      `.trim();
      res.status(500).type("text/xml").send(twimlError);
    }
  });

  // Endpoint 2.5: GroupMe Bot Callback Endpoint to add contacts dynamically from GroupMe chats
  app.post("/api/webhook/groupme", async (req, res) => {
    try {
      const { text, sender_type, name, sender_id, group_id } = req.body;

      // GroupMe callbacks carry no cryptographic signature; if the bot's group
      // is configured, restrict inbound triggers to that group.
      const expectedGroupId = process.env.GROUPME_GROUP_ID;
      if (expectedGroupId) {
        if (group_id !== expectedGroupId) {
          console.warn(`GroupMe Webhook: group_id mismatch (got "${group_id}").`);
          return res.status(403).json({ error: "Forbidden: unrecognized group." });
        }
      } else {
        console.warn("GROUPME_GROUP_ID not configured; accepting GroupMe webhook from any group.");
      }

      if (sender_type === "bot") {
        await logApiCall("GroupMe", req.body, req.headers, "ignored", `Ignored message from bot: "${text || ""}"`);
        return res.status(200).json({ status: "ignored_bot_sender" });
      }

      if (!text || typeof text !== "string") {
        const errMsg = "No message text provided.";
        await logApiCall("GroupMe", req.body, req.headers, "error", "Missing parameter 'text'", errMsg);
        return res.status(400).json({ error: errMsg });
      }

      const cleanText = text.trim();
      let textToParse = "";
      const lowerText = cleanText.toLowerCase();

      if (lowerText.startsWith("!add ")) {
        textToParse = cleanText.substring(5).trim();
      } else if (lowerText.startsWith("add: ")) {
        textToParse = cleanText.substring(5).trim();
      } else if (lowerText.startsWith("/add ")) {
        textToParse = cleanText.substring(5).trim();
      } else {
        const ignoreMsg = `Ignored message from "${name || "Unknown"}": No matching prefix trigger ("!add ", "add: " or "/add ") found.`;
        await logApiCall("GroupMe", req.body, req.headers, "ignored", ignoreMsg);
        return res.status(200).json({ status: "ignored_no_trigger_prefix" });
      }

      if (!textToParse) {
        const ignoreMsg = `Ignored message from "${name || "Unknown"}": Empty contents after trigger.`;
        await logApiCall("GroupMe", req.body, req.headers, "ignored", ignoreMsg);
        return res.status(200).json({ status: "empty_content_after_prefix" });
      }

      console.log(`Processing GroupMe Bot incoming trigger from user "${name}": "${textToParse}"`);
      const matchedUser = await findMatchingTeamUser(name, undefined, sender_id);
      const opUserId = matchedUser ? matchedUser.id : (sender_id ? `groupme-${sender_id}` : "system-groupme");
      const opUserName = matchedUser ? (matchedUser.displayName || matchedUser.email || name) : (name ? `${name} (GroupMe)` : "GroupMe User");

      const contact = await performQuickAdd(textToParse, {
        userId: opUserId,
        userName: opUserName
      }) as any;

      // Always carry the active semester on GroupMe-added contacts (issue #410).
      const semesterTag = currentSemesterTag();
      const groupMeContactRef = getAdminDb().collection("contacts").doc(contact.id);
      const groupMeContactSnap = await groupMeContactRef.get();
      if (groupMeContactSnap.exists) {
        const contactData = groupMeContactSnap.data() || {};
        const existingTags = Array.isArray(contactData.tags) ? contactData.tags : [];
        if (!existingTags.some((t: any) => String(t).toLowerCase() === semesterTag.toLowerCase())) {
          await groupMeContactRef.update({ tags: [...existingTags, semesterTag] });
        }
      }

      const outcome = contact.isExisting 
        ? `GroupMe trigger from "${name}" matched existing contact "${contact.name}" and logged interaction.`
        : `GroupMe trigger from "${name}" created new contact "${contact.name}".`;

      await logApiCall("GroupMe", req.body, req.headers, "success", outcome);

      // Confirm back into the group. This is best-effort: if the bot isn't
      // configured or the GroupMe API is briefly down, the quick-add has
      // already succeeded and we should not fail the webhook for it.
      const groupMeBotId = process.env.GROUPME_BOT_ID;
      if (groupMeBotId) {
        const confirmationText = contact.isExisting
          ? `✅ ${contact.name} was already on the list, so I logged the interaction.`
          : `✅ Added ${contact.name} to the tracker.`;
        try {
          await fetch("https://api.groupme.com/v3/bots/post", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bot_id: groupMeBotId, text: confirmationText }),
          });
        } catch (botError: any) {
          console.error("GroupMe bot confirmation failed: ", botError.message || botError);
        }
      }

      res.status(200).json({
        success: true,
        message: contact.isExisting 
          ? `Successfully logged interaction with existing contact ${contact.name}` 
          : `Successfully created contact ${contact.name}`,
        contact
      });
    } catch (error: any) {
      console.error("GroupMe Webhook Error: ", error);
      await logApiCall("GroupMe", req.body, req.headers, "error", "Error parsing GroupMe bot message.", error.message || String(error));
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // AI Notes Analyzer endpoint: automates contact linking and suggests tasks
  app.post("/api/analyze-notes", standardRateLimiter, async (req, res) => {
    try {
      // Admin-only: this endpoint dumps the full contact directory + user roster
      // into the AI prompt (matches the client-side canEdit=isAdmin gating on the
      // "Analyze notes" button in CoordinationNotes).
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

      console.log(`[AI Notes Analyzer] Analyzing notes content (${text.length} chars)`);

      const db = getAdminDb();

      // Fetch all contacts (limited to 200 to optimize prompt size)
      const contactsSnapshot = await db.collection("contacts").limit(200).get();
      const contactsList = contactsSnapshot.docs.map(doc => ({
        id: doc.id,
        name: doc.data().name || "Unknown"
      }));

      // Fetch all approved users (limited to 100 to optimize prompt size)
      const usersSnapshot = await db.collection("users").limit(100).get();
      const usersList = usersSnapshot.docs
        .filter(doc => doc.data().approved !== false)
        .map(doc => ({
          id: doc.id,
          name: doc.data().displayName || doc.data().email || "Teammate"
        }));

      const currentDate = new Date().toISOString().split("T")[0];

      const prompt = `Here are the meeting notes to analyze:\n\n${text}\n\nAvailable Contacts:\n${JSON.stringify(
        contactsList
      )}\n\nAvailable Users (Team Members):\n${JSON.stringify(usersList)}`;

      const response = await getAiClient().models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: `You are an expert assistant for a campus ministry tracker. Your job is to analyze meeting notes (written in markdown) and do two things:
1. Identify contacts mentioned in the notes and add markdown links to their profiles in the format [Name](/contacts/id) based on the provided contacts list. Only link names that are actual contacts and not part of existing links. Ensure you match names accurately. If a contact name is a common noun (e.g., Will, Hope, Grace, Joy), only link it if the context indicates it refers to the person.
2. Suggest tasks/action items extracted from the notes, matching each task to a contact from the contacts list (if applicable) and an assignee from the users list (if applicable). Suggest a priority ('low', 'medium', 'high') and a due date (YYYY-MM-DD format) based on context and relative terms (like 'before Friday', 'next week', 'by Monday').
The current local date is: ${currentDate}.`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              updatedMarkdown: {
                type: Type.STRING,
                description: "The complete updated meeting notes markdown with contact names wrapped in [Name](/contacts/id) links."
              },
              suggestedTasks: {
                type: Type.ARRAY,
                description: "List of tasks/action items extracted from the notes.",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    title: { type: Type.STRING, description: "Clear action-oriented task description." },
                    dueDate: { type: Type.STRING, description: "Suggested due date (YYYY-MM-DD format) or empty string if not mentioned/estimatable." },
                    priority: { type: Type.STRING, description: "Suggested priority: low, medium, or high." },
                    contactId: { type: Type.STRING, description: "The matching contact ID if associated with a contact, or null." },
                    contactName: { type: Type.STRING, description: "The matched contact name, or null." },
                    assigneeId: { type: Type.STRING, description: "The matching user ID if assigned to a team member, or null." },
                    assigneeName: { type: Type.STRING, description: "The matched team member name, or null." }
                  },
                  required: ["title", "priority"]
                }
              }
            },
            required: ["updatedMarkdown", "suggestedTasks"]
          }
        }
      });

      if (!response.text) {
        throw new Error("No response returned from the Gemini API.");
      }

      let parsed;
      try {
        parsed = JSON.parse(response.text.trim());
      } catch (parseError: any) {
        throw new Error(`Failed to parse AI response: ${parseError.message || String(parseError)}`);
      }

      console.log(`[AI Notes Analyzer] Analysis complete. Extracted ${parsed.suggestedTasks.length} tasks.`);
      res.status(200).json({ success: true, ...parsed });
    } catch (error: any) {
      console.error("AI Notes Analyzer Error: ", error);
      res.status(500).json({ error: error.message || "Failed to analyze notes" });
    }
  });

  // AI Smart Import endpoint: parses raw text into contacts, interactions, and discussions
  app.post("/api/smart-import/parse", standardRateLimiter, async (req, res) => {
    try {
      if (process.env.NODE_ENV !== "test") {
        try {
          await authenticateFirebaseUser(req);
        } catch (authErr: any) {
          return res.status(401).json({ error: `Unauthorized: ${authErr.message || String(authErr)}` });
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

      const currentDate = new Date().toISOString().split("T")[0];

      const prompt = `Please parse the following unstructured text into structured contacts, interactions (1-on-1 conversations/touches/logs), and discussions (group coordination/meeting notes/board topics).

Input Text:
${text}

Existing Contacts Database:
${JSON.stringify(contactsList)}`;

      const response = await getAiClient().models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          systemInstruction: `You are an expert assistant for a campus ministry work tracker. Parse the provided unstructured text into three categories:
1. contacts: Individuals mentioned in the text. For each contact, infer their name, email, phone, stage ('lead', 'contact', 'follow-up', 'connected', or 'active'), spiritual background, notes/summary, and relevant tags. If a contact matches an existing contact from the provided Existing Contacts Database (by exact or close name/email/phone), set matchedContactId to their existing ID and matchedContactName to their existing name; otherwise set matchedContactId and matchedContactName to null. Assign a temporary ID 'c1', 'c2', etc.
2. interactions: 1-on-1 touchpoints, phone calls, meetings, text exchanges, or notes logged about a contact. Set contactRef to the matching contact's temporary ID (e.g. 'c1') or matchedContactId, contactName, dateTime (ISO format YYYY-MM-DDTHH:mm or YYYY-MM-DD), type ('coffee', 'call', 'text', 'meeting', 'note'), and full interaction content summary. Assign a temporary ID 'i1', 'i2', etc. Current date is ${currentDate}.
3. discussions: Group notes, strategy documents, team board notes, or topic discussions. Set title, audience ('team', 'trainees', or 'everyone'), content (in Markdown), tags, and mentioned contact names. Assign a temporary ID 'd1', 'd2', etc.`,
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
              interactions: {
                type: Type.ARRAY,
                description: "Parsed 1-on-1 interaction logs extracted from text",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    tempId: { type: Type.STRING },
                    contactRef: { type: Type.STRING },
                    contactName: { type: Type.STRING },
                    dateTime: { type: Type.STRING },
                    type: { type: Type.STRING },
                    content: { type: Type.STRING },
                  },
                  required: ["tempId", "content"],
                },
              },
              discussions: {
                type: Type.ARRAY,
                description: "Parsed discussion board notes extracted from text",
                items: {
                  type: Type.OBJECT,
                  properties: {
                    tempId: { type: Type.STRING },
                    title: { type: Type.STRING },
                    audience: { type: Type.STRING, description: "team, trainees, or everyone" },
                    content: { type: Type.STRING, description: "Markdown body" },
                    tags: { type: Type.ARRAY, items: { type: Type.STRING } },
                    mentionedContactNames: { type: Type.ARRAY, items: { type: Type.STRING } },
                  },
                  required: ["tempId", "title", "content"],
                },
              },
            },
            required: ["contacts", "interactions", "discussions"],
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

      console.log(
        `[AI Smart Import] Parse complete: ${parsed.contacts?.length || 0} contacts, ${
          parsed.interactions?.length || 0
        } interactions, ${parsed.discussions?.length || 0} discussions.`
      );

      res.status(200).json({ success: true, data: parsed });
    } catch (error: any) {
      console.error("AI Smart Import Error: ", error);
      res.status(500).json({ error: error.message || "Failed to parse text" });
    }
  });

  app.post("/api/smart-import/commit", standardRateLimiter, async (req, res) => {
    try {
      let uid = "system";
      let userName = "Smart Import";
      if (process.env.NODE_ENV !== "test") {
        try {
          const decodedToken = await authenticateFirebaseUser(req);
          uid = decodedToken.uid;
          userName = decodedToken.name || decodedToken.email?.split("@")[0] || "Smart Import";
        } catch (authErr: any) {
          return res.status(401).json({ error: `Unauthorized: ${authErr.message || String(authErr)}` });
        }
      }

      const { contacts = [], interactions = [], discussions = [] } = req.body;
      const db = getAdminDb();
      const batch = db.batch();

      let cCount = 0;
      let iCount = 0;
      let dCount = 0;

      const tempIdToRealIdMap: Record<string, string> = {};

      // 1. Process Contacts
      for (const contact of contacts) {
        if (contact.matchedContactId) {
          tempIdToRealIdMap[contact.tempId] = contact.matchedContactId;
          tempIdToRealIdMap[contact.matchedContactId] = contact.matchedContactId;
        } else {
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
          tempIdToRealIdMap[contact.tempId] = newContactRef.id;
          cCount++;
        }
      }

      // 2. Process Interactions
      for (const interaction of interactions) {
        let targetContactId = interaction.contactId || null;
        if (!targetContactId && interaction.contactRef && tempIdToRealIdMap[interaction.contactRef]) {
          targetContactId = tempIdToRealIdMap[interaction.contactRef];
        }
        if (!targetContactId && interaction.contactName) {
          const found = contacts.find(
            (c: any) => c.name?.toLowerCase() === interaction.contactName?.toLowerCase()
          );
          if (found && tempIdToRealIdMap[found.tempId]) {
            targetContactId = tempIdToRealIdMap[found.tempId];
          }
        }

        if (targetContactId) {
          const interactionRef = db.collection("contacts").doc(targetContactId).collection("interactions").doc();
          const dateStr = interaction.dateTime || new Date().toISOString().split("T")[0];
          const interactionData = {
            contactId: targetContactId,
            contactName: (interaction.contactName || "Contact").slice(0, 128),
            content: (interaction.content || "").slice(0, 5000),
            dateTime: dateStr,
            type: interaction.type || "note",
            userId: uid,
            userName: userName.slice(0, 128),
            createdAt: FieldValue.serverTimestamp(),
          };

          batch.set(interactionRef, interactionData);
          iCount++;

          const contactRef = db.collection("contacts").doc(targetContactId);
          batch.update(contactRef, {
            lastSeen: dateStr,
            lastContactedBy: userName,
            lastContactedById: uid,
            lastContactedDate: dateStr,
            // The imported interaction reaches them (#1335).
            reachedAt: dateStr,
            updatedAt: new Date().toISOString(),
          });
        }
      }

      // 3. Process Discussions
      for (const discussion of discussions) {
        const boardDocRef = db.collection("board_docs").doc();
        const dateStr = new Date().toISOString().split("T")[0];

        const boardDocData = {
          title: (discussion.title || "Imported Discussion").slice(0, 200),
          audience: discussion.audience || "team",
          md: (discussion.content || "").slice(0, 100000),
          tags: discussion.tags || [],
          date: dateStr,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          deletedAt: null,
          authorName: userName.slice(0, 128),
          authorId: uid,
        };

        batch.set(boardDocRef, boardDocData);
        dCount++;
      }

      await batch.commit();

      console.log(`[AI Smart Import] Commit complete: ${cCount} contacts, ${iCount} interactions, ${dCount} discussions.`);
      res.status(200).json({
        success: true,
        summary: { contactsCount: cCount, interactionsCount: iCount, discussionsCount: dCount },
      });
    } catch (error: any) {
      console.error("AI Smart Import Commit Error: ", error);
      res.status(500).json({ error: error.message || "Failed to commit smart import items to database." });
    }
  });


  // Self-service token exchange: mints a short-lived custom token for the
  // caller's own uid, so the mobile app can bridge its Firebase session into
  // a react-native-webview page (which has its own, separate auth storage).
  // No privilege escalation — the token signs in as the same uid the caller
  // already authenticated as.
  app.post("/api/mint-custom-token", standardRateLimiter, async (req, res) => {
    try {
      const decodedToken = await authenticateFirebaseUser(req);
      const token = await getAdminAuth().createCustomToken(decodedToken.uid);
      res.status(200).json({ success: true, token });
    } catch (error: any) {
      console.error("Mint Custom Token Error: ", error);
      res.status(401).json({ success: false, error: error.message || "Failed to mint custom token" });
    }
  });

  // #1103: Save or update a mapping between GroupMe senderId and registered team user
  app.post("/api/groupme-aliases", standardRateLimiter, async (req, res) => {
    try {
      if (process.env.NODE_ENV !== "test") {
        try {
          await authorizeAdmin(req);
        } catch (authErr: any) {
          return res.status(403).json({ success: false, error: `Forbidden: ${authErr.message || String(authErr)}` });
        }
      }
      const { senderId, userId, name } = req.body;
      if (!senderId || !userId) {
        return res.status(400).json({ success: false, error: "senderId and userId are required" });
      }

      // Verify user exists
      const userDoc = await getAdminDb().collection("users").doc(userId).get();
      if (!userDoc.exists) {
        return res.status(404).json({ success: false, error: "User not found" });
      }
      const userData = userDoc.data() || {};
      const userName = name || userData.displayName || userData.name || userData.email || "Unknown";

      await getAdminDb().collection("groupme_aliases").doc(senderId).set({
        senderId,
        userId,
        name: userName,
        updatedAt: new Date().toISOString(),
        serverUpdatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      res.status(200).json({ success: true, senderId, userId, name: userName });
    } catch (error: any) {
      console.error("Save GroupMe Alias Error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to save GroupMe alias",
      });
    }
  });

  // #1103: Retroactive repair endpoint: reassign contacts created by `groupme-<senderId>`
  // to the real registered user, updating createdByName, partner coCreators, and visibleTo
  app.post("/api/groupme-aliases/repair", standardRateLimiter, async (req, res) => {
    try {
      if (process.env.NODE_ENV !== "test") {
        try {
          await authorizeAdmin(req);
        } catch (authErr: any) {
          return res.status(403).json({ success: false, error: `Forbidden: ${authErr.message || String(authErr)}` });
        }
      }
      const { senderId, userId } = req.body;
      if (!senderId || !userId) {
        return res.status(400).json({ success: false, error: "senderId and userId are required" });
      }

      const userDoc = await getAdminDb().collection("users").doc(userId).get();
      if (!userDoc.exists) {
        return res.status(404).json({ success: false, error: "Target user not found" });
      }
      const userData = userDoc.data() || {};
      const targetUserName = userData.displayName || userData.name || userData.email || "Team Member";

      // Also ensure alias is stored
      await getAdminDb().collection("groupme_aliases").doc(senderId).set({
        senderId,
        userId,
        name: targetUserName,
        updatedAt: new Date().toISOString(),
        serverUpdatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      const legacyCreatedBy = `groupme-${senderId}`;
      const contactsSnap = await getAdminDb()
        .collection("contacts")
        .where("createdBy", "==", legacyCreatedBy)
        .get();

      const partnerCoCreators = await resolvePartnerCoCreators(userId);
      let repairedCount = 0;

      for (const contactDoc of contactsSnap.docs) {
        const cData = contactDoc.data() || {};
        const existingCoCreators: string[] = Array.isArray(cData.coCreators) ? cData.coCreators : [];
        const mergedCoCreators = [...new Set([...existingCoCreators, ...partnerCoCreators])];

        const ties: ContactTies = {
          createdBy: userId,
          addedBy: cData.addedBy,
          coCreators: mergedCoCreators,
          founders: cData.founders,
          carers: cData.carers,
        };

        await contactDoc.ref.update({
          createdBy: userId,
          createdByName: targetUserName,
          coCreators: mergedCoCreators,
          visibleTo: visibleToOf(ties),
          updatedAt: new Date().toISOString(),
          updatedBy: userId,
          updatedByName: targetUserName,
        });

        repairedCount++;
      }

      res.status(200).json({
        success: true,
        senderId,
        userId,
        repairedCount,
      });
    } catch (error: any) {
      console.error("GroupMe Contacts Repair Error:", error);
      res.status(500).json({
        success: false,
        error: error.message || "Failed to repair GroupMe contacts",
      });
    }
  });

  // Combine contacts (issue #1427, ADR 0038). Full-timers only. The browser
  // builds a read-only three-column preview; this endpoint re-reads every
  // reference, rebuilds the same pure plan (src/lib/combineContactsPlan.ts),
  // moves the subcollection documents, re-points the references, refreshes
  // cached names, deletes the combined-in contact, and writes a permanent
  // combine record: all in one transaction when it fits, otherwise the record
  // is claimed as pending while batches run, then marked done.
  app.post("/api/combine-contacts", standardRateLimiter, async (req, res) => {
    const actor = await requireFullTimerActor(req, res);
    if (!actor) return;
    const { actorId, actorName } = actor;

    const keptId = typeof req.body?.keptId === "string" ? req.body.keptId : "";
    const combinedInId = typeof req.body?.combinedInId === "string" ? req.body.combinedInId : "";
    if (!keptId || !combinedInId) {
      return res.status(400).json({ success: false, error: "keptId and combinedInId are required" });
    }
    if (keptId === combinedInId) {
      return res.status(400).json({ success: false, error: "keptId and combinedInId must differ" });
    }
    // A preview (dryRun) writes nothing, so only a real combine must say what
    // the browser saw. null means "the contact had no updatedAt".
    if (
      req.body?.dryRun !== true &&
      (req.body?.keptUpdatedAt === undefined || req.body?.combinedInUpdatedAt === undefined)
    ) {
      return res
        .status(400)
        .json({ success: false, error: "keptUpdatedAt and combinedInUpdatedAt are required" });
    }

    try {
      const db = getAdminDb();

      const [keptSnap, combinedInSnap] = await Promise.all([
        db.collection("contacts").doc(keptId).get(),
        db.collection("contacts").doc(combinedInId).get(),
      ]);
      if (!keptSnap.exists || !combinedInSnap.exists) {
        return res.status(404).json({ success: false, error: "One or both contacts were not found" });
      }

      const keptContact = { id: keptSnap.id, ...keptSnap.data() } as unknown as Contact;
      const combinedInContact = { id: combinedInSnap.id, ...combinedInSnap.data() } as unknown as Contact;

      // The browser sends the last-updated stamp of each contact as it saw it
      // (null when the contact had none). If either has changed since, refuse
      // with a conflict so the page can rebuild the preview rather than commit
      // a result built on stale data.
      const body = req.body ?? {};
      if (body.keptUpdatedAt !== undefined || body.combinedInUpdatedAt !== undefined) {
        const currentKeptStamp = timestampMillis(keptSnap.data()?.updatedAt);
        const currentCombinedInStamp = timestampMillis(combinedInSnap.data()?.updatedAt);
        if (
          timestampMillis(body.keptUpdatedAt) !== currentKeptStamp ||
          timestampMillis(body.combinedInUpdatedAt) !== currentCombinedInStamp
        ) {
          return res.status(409).json({
            success: false,
            conflict: true,
            error: "One or both contacts changed since this preview was built. Rebuild the preview and try again.",
          });
        }
      }

      const picks: CombinePicks =
        body.picks && typeof body.picks === "object" ? (body.picks as CombinePicks) : {};

      const [
        interactionsSnap,
        threadsSnap,
        teamThreadsSnap,
        commentsSnap,
        prayersSnap,
        tasksSnap,
        visitsSnap,
        eventsSnap,
        rhythmsSnap,
        homesSnap,
        outreachSnap,
        aliasesSnap,
        importsSnap,
        prefsSnap,
        inboxSnap,
        notificationsSnap,
        activitiesSnap,
        usersSnap,
        keptInteractionsSnap,
        keptThreadsSnap,
        keptTeamThreadsSnap,
        keptCommentsSnap,
      ] = await Promise.all([
        db.collection("contacts").doc(combinedInId).collection("interactions").get(),
        db.collection("contacts").doc(combinedInId).collection("threads").get(),
        db.collection("contacts").doc(combinedInId).collection("teamThreads").get(),
        db.collection("contacts").doc(combinedInId).collection("comments").get(),
        db.collection("prayers").where("contactId", "==", combinedInId).get(),
        db.collection("tasks").where("contactId", "==", combinedInId).get(),
        db.collection("visits").where("contactIds", "array-contains", combinedInId).get(),
        db.collection("events").get(),
        db.collection("rhythms").where("roster", "array-contains", combinedInId).get(),
        db.collection("homes").where("members", "array-contains", combinedInId).get(),
        db.collection("outreach").get(),
        db.collection("attendee_aliases").where("contactId", "==", combinedInId).get(),
        db.collection("pending_attendance_imports").get(),
        db.collection("userPreferences").get(),
        db.collection("inboxState").get(),
        db.collection("notifications").where("targetId", "==", combinedInId).get(),
        db.collection("activities").where("targetId", "==", combinedInId).get(),
        db.collection("users").get(),
        db.collection("contacts").doc(keptId).collection("interactions").get(),
        db.collection("contacts").doc(keptId).collection("threads").get(),
        db.collection("contacts").doc(keptId).collection("teamThreads").get(),
        db.collection("contacts").doc(keptId).collection("comments").get(),
      ]);

      const subDocs = (snap: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) =>
        snap.docs.map((d) => ({ id: d.id, data: d.data() }));

      const allDocs = (snap: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) =>
        snap.docs.map((d) => ({ id: d.id, data: d.data() }));

      // Personal prayers live under each user; read them per user rather than
      // with a collection-group query so the same code runs under the test
      // harness and the Admin SDK alike.
      const personalPrayers: CombineReferences["personalPrayers"] = [];
      await Promise.all(
        usersSnap.docs.map(async (user: any) => {
          const snap = await db
            .collection("users")
            .doc(user.id)
            .collection("personalPrayers")
            .get();
          for (const d of snap.docs) {
            personalPrayers.push({ id: d.id, userId: user.id, data: d.data() });
          }
        }),
      );

      const refs: CombineReferences = {
        interactions: subDocs(interactionsSnap),
        threads: subDocs(threadsSnap),
        teamThreads: subDocs(teamThreadsSnap),
        comments: subDocs(commentsSnap),
        prayers: allDocs(prayersSnap),
        tasks: allDocs(tasksSnap),
        visits: visitsSnap.docs.map((d: any) => ({
          id: d.id,
          contactIds: (d.data().contactIds ?? []) as string[],
          data: d.data(),
        })),
        gatherings: allDocs(eventsSnap),
        rhythms: allDocs(rhythmsSnap),
        homes: allDocs(homesSnap),
        outreach: allDocs(outreachSnap),
        attendeeAliases: allDocs(aliasesSnap),
        pendingImports: allDocs(importsSnap),
        personalPrayers,
        userPreferences: allDocs(prefsSnap),
        inboxStates: allDocs(inboxSnap),
        notifications: allDocs(notificationsSnap),
        activities: allDocs(activitiesSnap),
        keptSubDocIds: {
          interactions: keptInteractionsSnap.docs.map((d: any) => d.id),
          threads: keptThreadsSnap.docs.map((d: any) => d.id),
          teamThreads: keptTeamThreadsSnap.docs.map((d: any) => d.id),
          comments: keptCommentsSnap.docs.map((d: any) => d.id),
        },
      };

      const now = new Date().toISOString();
      const plan = buildCombinePlan(keptContact, combinedInContact, refs, {
        now,
        updatedById: actorId,
        updatedByName: actorName,
      }, picks);

      // A dry run returns the review's "What moves" list without writing.
      if (req.body?.dryRun === true) {
        return res.status(200).json({ success: true, dryRun: true, moves: plan.moves });
      }

      const reason = typeof req.body?.reason === "string" ? req.body.reason : "";
      const recordRef = db.collection("combineRecords").doc();
      // Stamp the banner every reader of the kept contact will see, and keep it
      // in keptAfter so undo removes it (or restores an earlier combine's, #1434).
      plan.keptData.combinedFrom = {
        name: combinedInContact.name,
        at: now,
        byName: actorName,
        combineRecordId: recordRef.id,
      };
      const record = {
        kind: "contacts" satisfies CombineRecordKind,
        keptId,
        combinedInId,
        reason,
        picks,
        status: "pending",
        keptBefore: { ...keptSnap.data() },
        combinedInBefore: { ...combinedInSnap.data() },
        keptAfter: plan.keptData,
        movedDocuments: plan.movedDocuments,
        collidedDocuments: plan.collidedDocuments,
        rewrittenReferences: plan.rewrittenReferences,
        combinedBy: actorId,
        combinedByName: actorName,
        combinedAt: now,
      };

      const ops: CombineWriteOp[] = [];
      ops.push({
        op: "update",
        ref: db.collection("contacts").doc(keptId),
        data: plan.keptData,
      });
      for (const moved of plan.movedDocuments) {
        ops.push({
          op: "set",
          ref: db.collection("contacts").doc(keptId).collection(moved.newPath.split("/")[2]).doc(moved.originalPath.split("/")[3]),
          data: moved.originalData,
        });
        ops.push({
          op: "delete",
          ref: db.collection("contacts").doc(combinedInId).collection(moved.originalPath.split("/")[2]).doc(moved.originalPath.split("/")[3]),
        });
      }
      // A collided document is not copied: the kept contact's own copy stays.
      for (const collided of plan.collidedDocuments) {
        const parts = collided.originalPath.split("/");
        ops.push({
          op: "delete",
          ref: db.collection("contacts").doc(combinedInId).collection(parts[2]).doc(parts[3]),
        });
      }
      // Every re-pointed reference is written generically: group by document so
      // a document with several rewritten fields is written once.
      const byDocument = new Map<
        string,
        { collection: string; document: string; data: Record<string, unknown> }
      >();
      for (const ref of plan.rewrittenReferences) {
        const key = `${ref.collection}/${ref.document}`;
        const fields =
          ref.collection === "inboxState"
            ? mapKeyUpdates(ref.field, ref.before, ref.after)
            : { [ref.field]: ref.after };
        const entry = byDocument.get(key);
        if (entry) Object.assign(entry.data, fields);
        else
          byDocument.set(key, {
            collection: ref.collection,
            document: ref.document,
            data: { ...fields },
          });
      }
      for (const entry of byDocument.values()) {
        ops.push({
          op: "update",
          ref: db.collection(entry.collection).doc(entry.document),
          data: entry.data,
        });
      }
      ops.push({ op: "delete", ref: db.collection("contacts").doc(combinedInId) });

      // Inside the transaction, re-check that both contacts are as the plan
      // saw them and in no other unfinished combine or undo. Reading them there
      // also makes a concurrent combine or undo that writes them conflict.
      const guard = async (tx: any) => {
        const [keptNow, combinedInNow] = await Promise.all([
          tx.get(db.collection("contacts").doc(keptId)),
          tx.get(db.collection("contacts").doc(combinedInId)),
        ]);
        if (
          !keptNow.exists ||
          !combinedInNow.exists ||
          timestampMillis(keptNow.data()?.updatedAt) !== timestampMillis(keptSnap.data()?.updatedAt) ||
          timestampMillis(combinedInNow.data()?.updatedAt) !==
            timestampMillis(combinedInSnap.data()?.updatedAt)
        ) {
          throw new CombineRefusal(
            409,
            "One or both contacts changed since this preview was built. Rebuild the preview and try again.",
            { conflict: true },
          );
        }
        await refuseInFlightCombine(tx, db, [keptId, combinedInId]);
      };

      if (ops.length < MAX_TRANSACTION_WRITES) {
        // The whole combine fits in one transaction: all of it lands or none.
        await db.runTransaction(async (tx: any) => {
          await guard(tx);
          for (const op of ops) applyCombineWrite(tx, op);
          tx.set(recordRef, { ...record, status: "done", completedAt: new Date().toISOString() });
        });
      } else {
        // Too large for one transaction: claim the record as pending, then
        // write in batches. A combine interrupted partway stays pending, which
        // keeps both contacts out of other combines until it is undone.
        await db.runTransaction(async (tx: any) => {
          await guard(tx);
          tx.set(recordRef, { ...record, status: "pending", claimedAt: now });
        });
        await commitInBatches(db, ops);
        await recordRef.update({ status: "done", completedAt: new Date().toISOString() });
      }

      await db.collection("activities").add({
        userId: actorId,
        userName: actorName,
        userPhoto: "",
        action: "combined contact into",
        targetId: keptId,
        targetName: keptContact.name,
        targetType: "contact",
        type: "edit",
        description: `Combined "${combinedInContact.name}" (${combinedInId}) into "${keptContact.name}" (${keptId}).`,
        createdAt: now,
      });

      return res.status(200).json({ success: true, combineRecordId: recordRef.id });
    } catch (error: any) {
      if (error instanceof CombineRefusal) {
        return res.status(error.status).json({ success: false, error: error.message, ...error.extra });
      }
      console.error("Combine Contacts Error:", error);
      return res
        .status(500)
        .json({ success: false, error: error.message || "Failed to combine contacts" });
    }
  });

  // Undo a combine (issue #1428, ADR 0038). Full-timers only. Replays the
  // combine record in reverse: the kept contact returns to its before-image,
  // the combined-in contact is recreated under its original id, moved
  // documents return to their original path, and rewritten references are put back.
  // This ticket covers undoing a combine nothing has changed since; leaving
  // later work alone is #1429. A combine can only be undone once.
  app.post("/api/combine-contacts/undo", standardRateLimiter, async (req, res) => {
    const actor = await requireFullTimerActor(req, res);
    if (!actor) return;
    const { actorId, actorName } = actor;

    const combineRecordId =
      typeof req.body?.combineRecordId === "string" ? req.body.combineRecordId : "";
    if (!combineRecordId) {
      return res.status(400).json({ success: false, error: "combineRecordId is required" });
    }
    const dryRun = req.body?.dryRun === true;

    try {
      const db = getAdminDb();
      const loaded = await loadCombineRecord(db, res, combineRecordId, "contacts");
      if (!loaded) return;
      const { recordRef, record } = loaded;

      const keptId: string = record.keptId;
      const combinedInId: string = record.combinedInId;
      const keptBefore: Record<string, unknown> = record.keptBefore ?? {};
      const combinedInBefore: Record<string, unknown> = record.combinedInBefore ?? {};
      const movedDocuments: Array<{
        originalPath: string;
        newPath: string;
        originalData: Record<string, unknown>;
      }> = Array.isArray(record.movedDocuments) ? record.movedDocuments : [];
      const collidedDocuments: typeof movedDocuments = Array.isArray(record.collidedDocuments)
        ? record.collidedDocuments
        : [];
      const rewrittenReferences: Array<{
        collection: string;
        document: string;
        field: string;
        before: unknown;
        after: unknown;
      }> = Array.isArray(record.rewrittenReferences) ? record.rewrittenReferences : [];

      // Refuse while a later combine still has this kept contact combined in: the
      // kept contact no longer exists on its own. Name the later combine so the
      // Full-timer can undo it first.
      const laterCombinesSnap = await db
        .collection("combineRecords")
        .where("combinedInId", "==", keptId)
        .get();
      const laterCombine = laterCombinesSnap.docs
        .map((d: any) => ({ id: d.id, ...d.data() }))
        .find((c: any) => c.status === "done" && c.id !== combineRecordId);
      if (laterCombine) {
        const laterKeptId: string = laterCombine.keptId;
        const laterKeptName: string = laterCombine.keptBefore?.name || laterKeptId;
        return res.status(409).json({
          success: false,
          error: `"${keptBefore.name ?? keptId}" was later combined into "${laterKeptName}" (${laterKeptId}). Undo that combine (${laterCombine.id}) first.`,
          laterCombineId: laterCombine.id,
          laterKeptId,
        });
      }

      // Read the current state once, then plan against it.
      const [keptSnap, interactionsSnap, threadsSnap, teamThreadsSnap, commentsSnap] =
        await Promise.all([
          db.collection("contacts").doc(keptId).get(),
          db.collection("contacts").doc(keptId).collection("interactions").get(),
          db.collection("contacts").doc(keptId).collection("threads").get(),
          db.collection("contacts").doc(keptId).collection("teamThreads").get(),
          db.collection("contacts").doc(keptId).collection("comments").get(),
        ]);

      const subDocs = (snap: { docs: Array<{ id: string; data: () => Record<string, unknown> }> }) =>
        snap.docs.map((d) => ({ id: d.id, data: d.data() }));

      const movedCurrent: CombineUndoCurrent["movedCurrent"] = {};
      await Promise.all(
        movedDocuments.map(async (moved) => {
          const parts = moved.newPath.split("/");
          const snap = await db
            .collection("contacts")
            .doc(parts[1])
            .collection(parts[2])
            .doc(parts[3])
            .get();
          movedCurrent[moved.originalPath] = snap.exists
            ? (snap.data() as Record<string, unknown>)
            : null;
        }),
      );

      const refDocs = new Map<string, Record<string, unknown> | null>();
      await Promise.all(
        rewrittenReferences.map(async (ref) => {
          const key = `${ref.collection}/${ref.document}`;
          if (refDocs.has(key)) return;
          const snap = await db.collection(ref.collection).doc(ref.document).get();
          refDocs.set(key, snap.exists ? (snap.data() as Record<string, unknown>) : null);
        }),
      );
      const referenceValues: Record<string, unknown> = {};
      for (const ref of rewrittenReferences) {
        const data = refDocs.get(`${ref.collection}/${ref.document}`);
        referenceValues[referenceKey(ref.collection, ref.document, ref.field)] =
          data ? data[ref.field] : undefined;
      }

      const plan = buildCombineUndoPlan(
        {
          keptId,
          combinedInId,
          keptBefore,
          combinedInBefore,
          keptAfter: (record.keptAfter ?? {}) as Record<string, unknown>,
          movedDocuments,
          collidedDocuments,
          rewrittenReferences,
        },
        {
          kept: (keptSnap.data() ?? {}) as Record<string, unknown>,
          keptSubDocs: {
            interactions: subDocs(interactionsSnap),
            threads: subDocs(threadsSnap),
            teamThreads: subDocs(teamThreadsSnap),
            comments: subDocs(commentsSnap),
          },
          movedCurrent,
          referenceValues,
        },
      );

      const preview = {
        goesBack: plan.goesBack,
        stays: plan.stays,
        notRestored: plan.notRestored,
      };

      if (dryRun) {
        return res.status(200).json({ success: true, dryRun: true, preview });
      }

      const now = new Date().toISOString();

      const ops: CombineWriteOp[] = [];

      // The kept contact is restored field by field, so later edits and later
      // additions stay.
      if (plan.keptUpdates.length > 0) {
        const keptUpdate: Record<string, unknown> = {};
        for (const update of plan.keptUpdates) {
          keptUpdate[update.field] = update.remove ? FieldValue.delete() : update.value;
        }
        ops.push({ op: "update", ref: db.collection("contacts").doc(keptId), data: keptUpdate });
      }

      // The combined-in contact is recreated under its original id.
      ops.push({
        op: "set",
        ref: db.collection("contacts").doc(combinedInId),
        data: combinedInBefore,
      });

      // Moved documents return to their original path carrying their current data.
      for (const moved of plan.movedBack) {
        const originalParts = moved.originalPath.split("/");
        const newParts = moved.newPath.split("/");
        ops.push({
          op: "set",
          ref: db
            .collection("contacts")
            .doc(combinedInId)
            .collection(originalParts[2])
            .doc(originalParts[3]),
          data: moved.data,
        });
        ops.push({
          op: "delete",
          ref: db.collection("contacts").doc(keptId).collection(newParts[2]).doc(newParts[3]),
        });
      }

      // Collided documents are recreated; the kept contact's own copy is never touched.
      for (const collided of plan.recreated) {
        const parts = collided.originalPath.split("/");
        ops.push({
          op: "set",
          ref: db.collection("contacts").doc(combinedInId).collection(parts[2]).doc(parts[3]),
          data: collided.data,
        });
      }

      // Rewritten references are restored only where they still hold the combine value.
      // Grouped by document so a document with several rewritten fields is written once.
      const byDocument = new Map<
        string,
        { collection: string; document: string; data: Record<string, unknown> }
      >();
      for (const ref of plan.referenceRestores) {
        const key = `${ref.collection}/${ref.document}`;
        const fields =
          ref.collection === "inboxState"
            ? mapKeyUpdates(ref.field, refDocs.get(key)?.[ref.field], ref.value)
            : { [ref.field]: ref.value };
        const entry = byDocument.get(key);
        if (entry) Object.assign(entry.data, fields);
        else
          byDocument.set(key, {
            collection: ref.collection,
            document: ref.document,
            data: { ...fields },
          });
      }
      for (const entry of byDocument.values()) {
        ops.push({
          op: "update",
          ref: db.collection(entry.collection).doc(entry.document),
          data: entry.data,
        });
      }

      await undoUnderClaim(
        db,
        recordRef,
        ops,
        { status: "undone", undoneBy: actorId, undoneByName: actorName, undoneAt: now },
        (tx) => refuseInFlightCombine(tx, db, [keptId, combinedInId], combineRecordId),
      );

      await db.collection("activities").add({
        userId: actorId,
        userName: actorName,
        userPhoto: "",
        action: "undid combine of",
        targetId: keptId,
        targetName: (keptBefore.name as string) ?? "",
        targetType: "contact",
        type: "edit",
        description: `Undid combine of "${combinedInBefore.name ?? combinedInId}" (${combinedInId}) into "${keptBefore.name ?? keptId}" (${keptId}).`,
        createdAt: now,
      });

      return res.status(200).json({ success: true, preview });
    } catch (error: any) {
      if (error instanceof CombineRefusal) {
        return res.status(error.status).json({ success: false, error: error.message, ...error.extra });
      }
      console.error("Undo Combine Error:", error);
      return res
        .status(500)
        .json({ success: false, error: error.message || "Failed to undo combine" });
    }
  });

  // Combine tags (issue #1435, spec #1426, issue #1587). Full-timers only.
  // Replaces every occurrence of any variant with the target tag, deduping per
  // contact. Can optionally mark new targets as standard tags. Writes a combine
  // record of kind tags holding each contact's tags before and after and the
  // standard tags it added.
  app.post("/api/combine-tags", standardRateLimiter, async (req, res) => {
    const actor = await requireFullTimerActor(req, res);
    if (!actor) return;
    const { actorId, actorName } = actor;

    const rawCombines = req.body?.combines;
    if (!Array.isArray(rawCombines) || rawCombines.length === 0) {
      return res.status(400).json({ success: false, error: "combines are required" });
    }
    const combines: TagCombine[] = rawCombines
      .filter((c: any) => c && typeof c === "object")
      .map((c: any) => ({
        variants: Array.isArray(c.variants)
          ? c.variants.filter((v: any) => typeof v === "string")
          : [],
        target: typeof c.target === "string" ? c.target : "",
      }))
      .filter((c: TagCombine) => c.target && c.variants.length > 0);
    if (combines.length === 0) {
      return res.status(400).json({ success: false, error: "combines are required" });
    }

    try {
      const db = getAdminDb();
      const engine = new TagCombineEngine({ db });
      const result = await engine.combineTags({
        combines,
        dryRun: req.body?.dryRun === true,
        makeStandard: Array.isArray(req.body?.makeStandard)
          ? req.body.makeStandard.filter((v: any) => typeof v === "string")
          : [],
        actorId,
        actorName,
      });

      return res.status(200).json(result);
    } catch (error: any) {
      if (error instanceof TagEngineError) {
        return res
          .status(error.status)
          .json({ success: false, error: error.message, ...error.extra });
      }
      console.error("Combine Tags Error:", error);
      return res
        .status(500)
        .json({ success: false, error: error.message || "Failed to combine tags" });
    }
  });

  // Undo a tag combine (issue #1436, spec #1426, issue #1587). Full-timers only. Replays the
  // tag combine record: each contact returns to its before-tags only while its
  // current tags still equal what the combine wrote. Contacts re-tagged (or
  // deleted) since are skipped and reported. Standard tags added by the combine
  // stay. A combine can only be undone once.
  app.post("/api/combine-tags/undo", standardRateLimiter, async (req, res) => {
    const actor = await requireFullTimerActor(req, res);
    if (!actor) return;
    const { actorId, actorName } = actor;

    const combineRecordId =
      typeof req.body?.combineRecordId === "string" ? req.body.combineRecordId : "";
    if (!combineRecordId) {
      return res.status(400).json({ success: false, error: "combineRecordId is required" });
    }
    const dryRun = req.body?.dryRun === true;

    try {
      const db = getAdminDb();
      const engine = new TagCombineEngine({ db });
      const result = await engine.undoCombine({
        combineRecordId,
        dryRun,
        actorId,
        actorName,
      });

      return res.status(200).json(result);
    } catch (error: any) {
      if (error instanceof TagEngineError) {
        return res
          .status(error.status)
          .json({ success: false, error: error.message, ...error.extra });
      }
      console.error("Undo Tag Combine Error:", error);
      return res
        .status(500)
        .json({ success: false, error: error.message || "Failed to undo tag combine" });
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

  function syncTokenFromSettings(settings: Record<string, unknown> | null): string {
    if (settings === null) return '';
    const candidates = [settings.attdSyncToken, settings.syncToken, settings.cisaSyncToken, settings.token];
    for (const candidate of candidates) {
      if (typeof candidate === 'string') {
        const trimmed = candidate.trim();
        if (trimmed !== '') return trimmed;
      }
    }
    return '';
  }

  function syncTokensMatch(stored: string, provided: string): boolean {
    if (stored === '' || provided === '') return false;
    const left = Buffer.from(stored);
    const right = Buffer.from(provided);
    if (left.length === right.length) return crypto.timingSafeEqual(left, right);
    return false;
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
    handleAttendanceSyncIntake,
  );

  // --- BNPB Interaction suggestions: Personal Sync Token + intake -----------
  // ADR 0037, #1420. The owner generates a Personal Sync Token in Settings and
  // pastes it into BNPB; BNPB POSTs its Interactions here and each becomes one
  // pending suggestion per named person in the owner's own queue. The feature
  // is owner-only at every layer: token endpoints return 403 for anyone else,
  // and the intake refuses any token whose uid is not the owner's. Only
  // `syncId`, `occurredAt`, `durationMinutes`, `summary`, `medium`, `updatedAt`,
  // `deleted` and the participant name parts cross the contract; BNPB `notes`
  // and the other private fields are ignored and never stored.
  //
  // The per-request cap is BNPB_SYNC_MAX_INTERACTIONS; BNPB pages its pushes
  // to stay under it (recorded on Shir0o/bnpb#309).
  const BNPB_SYNC_MAX_INTERACTIONS = 200;
  const BNPB_SYNC_TOKEN_COLLECTION = 'bnpb_sync_tokens';
  const BNPB_SUGGESTIONS_SUBCOLLECTION = 'interactionSuggestions';
  const BNPB_NOT_A_CISA_PERSON_SUBCOLLECTION = 'notACisaPeople';

  const personalSyncTokenHash = (token: string): string =>
    crypto.createHash('sha256').update(token, 'utf8').digest('hex');

  // Suggestion ids are a deterministic hash of `syncId` + `bnpbContactId`:
  // both are opaque strings from BNPB that may carry characters Firestore ids
  // reject, while the fields themselves are stored on the document so nothing
  // is lost.
  const bnpbSuggestionId = (syncId: string, bnpbContactId: string): string =>
    crypto.createHash('sha256').update(`${syncId}\u0000${bnpbContactId}`, 'utf8').digest('hex').slice(0, 40);

  function bnpbParticipantName(participant: {
    firstName?: string;
    lastName?: string;
    nickname?: string;
  }): string {
    const first = (participant.firstName ?? '').trim();
    const last = (participant.lastName ?? '').trim();
    const full = `${first} ${last}`.trim();
    if (full !== '') return full;
    return (participant.nickname ?? '').trim();
  }

  interface BnpbParticipantPayload {
    bnpbContactId: string;
    firstName?: string;
    lastName?: string;
    nickname?: string;
  }

  interface BnpbInteractionPayload {
    syncId: string;
    occurredAt: string;
    durationMinutes?: number;
    summary: string;
    medium: string;
    updatedAt?: string;
    deleted?: boolean;
    participants: BnpbParticipantPayload[];
  }

  function parseBnpbSyncBody(
    body: unknown,
  ): { interactions: BnpbInteractionPayload[] } | { error: string } {
    if (body === null || typeof body !== 'object') {
      return { error: 'Body must be a JSON object.' };
    }
    const rawInteractions = (body as Record<string, unknown>).interactions;
    if (!Array.isArray(rawInteractions)) return { error: 'interactions must be an array.' };
    if (rawInteractions.length > BNPB_SYNC_MAX_INTERACTIONS) {
      return { error: `At most ${BNPB_SYNC_MAX_INTERACTIONS} interactions per request.` };
    }

    const interactions: BnpbInteractionPayload[] = [];
    for (const raw of rawInteractions) {
      if (raw === null || typeof raw !== 'object') return { error: 'Each interaction must be an object.' };
      const item = raw as Record<string, unknown>;
      if (typeof item.syncId !== 'string' || item.syncId.trim() === '') return { error: 'syncId is required.' };
      if (typeof item.occurredAt !== 'string' || item.occurredAt.trim() === '') return { error: 'occurredAt is required.' };
      if (typeof item.summary !== 'string') return { error: 'summary is required.' };
      if (typeof item.medium !== 'string') return { error: 'medium is required.' };
      if (item.durationMinutes !== undefined && item.durationMinutes !== null && typeof item.durationMinutes !== 'number') {
        return { error: 'durationMinutes must be a number.' };
      }
      if (item.deleted !== undefined && typeof item.deleted !== 'boolean') return { error: 'deleted must be a boolean.' };
      if (!Array.isArray(item.participants)) return { error: 'participants must be an array.' };

      const participants: BnpbParticipantPayload[] = [];
      for (const rawParticipant of item.participants) {
        if (rawParticipant === null || typeof rawParticipant !== 'object') {
          return { error: 'Each participant must be an object.' };
        }
        const participant = rawParticipant as Record<string, unknown>;
        if (typeof participant.bnpbContactId !== 'string' || participant.bnpbContactId.trim() === '') {
          return { error: 'participant bnpbContactId is required.' };
        }
        participants.push({
          bnpbContactId: participant.bnpbContactId,
          ...(typeof participant.firstName === 'string' ? { firstName: participant.firstName } : {}),
          ...(typeof participant.lastName === 'string' ? { lastName: participant.lastName } : {}),
          ...(typeof participant.nickname === 'string' ? { nickname: participant.nickname } : {}),
        });
      }

      interactions.push({
        syncId: item.syncId,
        occurredAt: item.occurredAt,
        ...(typeof item.durationMinutes === 'number' ? { durationMinutes: item.durationMinutes } : {}),
        summary: item.summary,
        medium: item.medium,
        ...(typeof item.updatedAt === 'string' ? { updatedAt: item.updatedAt } : {}),
        ...(typeof item.deleted === 'boolean' ? { deleted: item.deleted } : {}),
        participants,
      });
    }

    return { interactions };
  }

  async function requirePersonalSyncOwner(
    req: express.Request,
    res: express.Response,
  ): Promise<{ uid: string } | null> {
    try {
      const decoded = await authenticateFirebaseUser(req);
      const email = String(decoded.email ?? '').trim().toLowerCase();
      // Like the rules' isSuperAdmin(): an unverified address is not the owner.
      if (email !== OWNER_EMAIL_SERVER || decoded.email_verified !== true) {
        res.status(403).json({ success: false, error: 'Only the app owner can manage a Personal Sync Token.' });
        return null;
      }
      return { uid: decoded.uid };
    } catch {
      res.status(401).json({ success: false, error: 'Authentication required.' });
      return null;
    }
  }

  app.post('/api/bnpb/token', standardRateLimiter, async (req, res) => {
    const owner = await requirePersonalSyncOwner(req, res);
    if (owner === null) return;
    try {
      const token = crypto.randomBytes(32).toString('base64url');
      const createdAt = new Date().toISOString();
      await getAdminDb().collection(BNPB_SYNC_TOKEN_COLLECTION).doc(owner.uid).set({
        uid: owner.uid,
        tokenHash: personalSyncTokenHash(token),
        createdAt,
        lastPushAt: null,
      });
      return res.status(200).json({ success: true, token, createdAt });
    } catch (error) {
      console.error('POST /api/bnpb/token error:', error);
      return res.status(500).json({ success: false, error: 'Could not generate a token.' });
    }
  });

  app.post('/api/bnpb/token/revoke', standardRateLimiter, async (req, res) => {
    const owner = await requirePersonalSyncOwner(req, res);
    if (owner === null) return;
    try {
      await getAdminDb().collection(BNPB_SYNC_TOKEN_COLLECTION).doc(owner.uid).delete();
      return res.status(200).json({ success: true });
    } catch (error) {
      console.error('POST /api/bnpb/token/revoke error:', error);
      return res.status(500).json({ success: false, error: 'Could not revoke the token.' });
    }
  });

  app.get('/api/bnpb/token', standardRateLimiter, async (req, res) => {
    const owner = await requirePersonalSyncOwner(req, res);
    if (owner === null) return;
    try {
      const snap = await getAdminDb().collection(BNPB_SYNC_TOKEN_COLLECTION).doc(owner.uid).get();
      const data = snap.exists ? (snap.data() as Record<string, unknown>) : null;
      return res.status(200).json({
        success: true,
        active: snap.exists,
        createdAt: data ? data.createdAt ?? null : null,
        lastPushAt: data ? data.lastPushAt ?? null : null,
      });
    } catch (error) {
      console.error('GET /api/bnpb/token error:', error);
      return res.status(500).json({ success: false, error: 'Could not read the token.' });
    }
  });

  app.post('/api/bnpb/sync', standardRateLimiter, async (req, res) => {
    try {
      const provided = String(req.headers['x-sync-token'] ?? '');
      if (provided === '') {
        return res.status(401).json({ success: false, error: 'Missing x-sync-token.' });
      }
      const db = getAdminDb();
      const tokenSnap = await db
        .collection(BNPB_SYNC_TOKEN_COLLECTION)
        .where('tokenHash', '==', personalSyncTokenHash(provided))
        .limit(1)
        .get();
      if (tokenSnap.empty) {
        return res.status(401).json({ success: false, error: 'Invalid or revoked token.' });
      }
      const uid = String((tokenSnap.docs[0].data() as Record<string, unknown>).uid ?? '');
      if (uid === '') {
        return res.status(401).json({ success: false, error: 'Invalid token.' });
      }
      const userSnap = await db.collection('users').doc(uid).get();
      const ownerEmail = userSnap.exists
        ? String((userSnap.data() as Record<string, unknown>).email ?? '').trim().toLowerCase()
        : '';
      if (ownerEmail !== OWNER_EMAIL_SERVER) {
        return res.status(401).json({ success: false, error: 'This token does not belong to the app owner.' });
      }

      const parsedBody = parseBnpbSyncBody(req.body);
      if ('error' in parsedBody) {
        return res.status(400).json({ success: false, error: parsedBody.error });
      }

      const suggestions = db.collection('users').doc(uid).collection(BNPB_SUGGESTIONS_SUBCOLLECTION);
      const choicesSnap = await db
        .collection('users')
        .doc(uid)
        .collection(BNPB_NOT_A_CISA_PERSON_SUBCOLLECTION)
        .get();
      const notACisa = new Set(
        choicesSnap.docs.map((entry) => String((entry.data() as Record<string, unknown>).bnpbContactId ?? '')),
      );
      const now = new Date().toISOString();
      let created = 0;
      let updated = 0;
      let withdrawn = 0;

      // What each syncId already has, read up front in `in` chunks (30 values
      // is Firestore's limit). The map is kept current as the loop queues
      // writes, so a syncId repeated in one request still sees what its first
      // copy wrote.
      type ExistingSuggestion = { id: string; data: Record<string, unknown> };
      const syncIds = [...new Set(parsedBody.interactions.map((i) => i.syncId))];
      const syncIdChunks: string[][] = [];
      for (let i = 0; i < syncIds.length; i += 30) syncIdChunks.push(syncIds.slice(i, i + 30));
      const existingSnaps = await Promise.all(
        syncIdChunks.map((chunk) => suggestions.where('syncId', 'in', chunk).get()),
      );
      const existingBySync = new Map<string, Map<string, ExistingSuggestion>>();
      for (const snap of existingSnaps) {
        for (const entry of snap.docs) {
          const data = entry.data() as Record<string, unknown>;
          const syncId = String(data.syncId);
          let byContact = existingBySync.get(syncId);
          if (!byContact) existingBySync.set(syncId, (byContact = new Map()));
          byContact.set(String(data.bnpbContactId), { id: entry.id, data });
        }
      }

      // Writes are queued, then committed in batches of at most 500 operations.
      const writes: Array<(batch: FirebaseFirestore.WriteBatch) => void> = [];

      for (const interaction of parsedBody.interactions) {
        let existingByContact = existingBySync.get(interaction.syncId);
        if (!existingByContact) existingBySync.set(interaction.syncId, (existingByContact = new Map()));
        const currentContactIds = new Set(interaction.participants.map((p) => p.bnpbContactId));

        // A tombstoned Interaction, or one that lost a participant, withdraws
        // the still-pending suggestion for that person; settled ones stay.
        for (const [contactId, entry] of existingByContact) {
          if (entry.data.status !== 'pending') continue;
          if (interaction.deleted === true || !currentContactIds.has(contactId)) {
            const ref = suggestions.doc(entry.id);
            writes.push((batch) => batch.update(ref, { status: 'withdrawn', updatedAt: now }));
            entry.data = { ...entry.data, status: 'withdrawn', updatedAt: now };
            withdrawn += 1;
          }
        }
        if (interaction.deleted === true) continue;

        for (const participant of interaction.participants) {
          const existing = existingByContact.get(participant.bnpbContactId);
          if (existing && (existing.data.status === 'confirmed' || existing.data.status === 'dismissed')) {
            continue;
          }
          // A "Not a CISA person" choice arrives already settled, so the owner
          // is never asked again and an Undo of the choice can restore it.
          const notCisa = notACisa.has(participant.bnpbContactId);
          // A re-push keeps what the owner already did on a waiting suggestion:
          // the Contact they chose, and text they tidied away from the summary.
          const ownerText =
            existing && typeof existing.data.text === 'string' && existing.data.text !== existing.data.summary
              ? existing.data.text
              : null;
          const chosenContactId =
            existing && typeof existing.data.contactId === 'string' ? existing.data.contactId : null;
          const suggestion = {
            syncId: interaction.syncId,
            bnpbContactId: participant.bnpbContactId,
            bnpbName: bnpbParticipantName(participant),
            bnpbNickname: (participant.nickname ?? '').trim() || null,
            occurredAt: interaction.occurredAt,
            durationMinutes: interaction.durationMinutes ?? null,
            summary: interaction.summary,
            medium: interaction.medium,
            sourceUpdatedAt: interaction.updatedAt ?? null,
            status: notCisa ? 'dismissed' : 'pending',
            ...(notCisa ? { dismissedBy: 'notACisaPerson', dismissedAt: now } : {}),
            text: ownerText ?? interaction.summary,
            ...(chosenContactId ? { contactId: chosenContactId } : {}),
            createdAt: existing ? existing.data.createdAt ?? now : now,
            updatedAt: now,
          };
          const id = existing ? existing.id : bnpbSuggestionId(interaction.syncId, participant.bnpbContactId);
          const ref = suggestions.doc(id);
          writes.push((batch) => batch.set(ref, suggestion));
          existingByContact.set(participant.bnpbContactId, { id, data: suggestion });
          if (existing) updated += 1;
          else created += 1;
        }
      }

      for (let i = 0; i < writes.length; i += 500) {
        const batch = db.batch();
        for (const write of writes.slice(i, i + 500)) write(batch);
        await batch.commit();
      }

      await db.collection(BNPB_SYNC_TOKEN_COLLECTION).doc(uid).update({ lastPushAt: now });
      return res.status(200).json({ success: true, created, updated, withdrawn });
    } catch (error) {
      console.error('POST /api/bnpb/sync error:', error);
      return res.status(500).json({ success: false, error: 'Could not process the sync.' });
    }
  });

  // Translation Endpoint: translates batched text strings to targetLang with Firestore L3 caching
  app.post("/api/translate", standardRateLimiter, async (req, res) => {
    try {
      if (process.env.NODE_ENV !== "test") {
        try {
          await authenticateFirebaseUser(req);
        } catch (authErr: any) {
          return res.status(401).json({ error: `Unauthorized: ${authErr.message || String(authErr)}` });
        }
      }

      const { texts, targetLang = "es", sourceLang = "en" } = req.body;

      if (!texts || !Array.isArray(texts) || texts.length === 0) {
        return res.status(400).json({ error: "Missing or invalid 'texts' parameter. Must be a non-empty array of strings." });
      }

      if (texts.length > 100) {
        return res.status(400).json({ error: "Batch size exceeds maximum limit of 100 items." });
      }

      if (typeof targetLang !== "string" || !/^[a-z]{2,5}(-[a-zA-Z0-9]+)?$/i.test(targetLang.trim())) {
        return res.status(400).json({ error: "Invalid 'targetLang' parameter." });
      }

      const normalizedTargetLang = targetLang.trim().toLowerCase();

      let totalChars = 0;
      for (const t of texts) {
        if (typeof t !== "string") {
          return res.status(400).json({ error: "All elements in 'texts' must be strings." });
        }
        totalChars += t.length;
      }

      if (totalChars > 50000) {
        return res.status(400).json({ error: "Total character length exceeds maximum limit of 50000 characters." });
      }

      const engine = new TranslationEngine({
        aiPort: new GeminiAIPort({
          aiClient: getAiClient(),
          model: "gemini-3.5-flash",
        }),
        cachePort: new FirestoreTranslationCachePort(getAdminDb(), () => new Date().toISOString()),
      });

      const dailyLimitRaw = parseInt(process.env.TRANSLATION_DAILY_LIMIT || "", 10);
      const dailyLimit = Number.isFinite(dailyLimitRaw) && dailyLimitRaw > 0 ? dailyLimitRaw : 2000;

      const result = await engine.translateTexts(texts, normalizedTargetLang, {
        sourceLang: typeof sourceLang === "string" ? sourceLang.slice(0, 10) : "auto",
        dailyLimit,
      });

      res.status(200).json(result);
    } catch (error: any) {
      console.error("Translation API Error: ", error);
      res.status(500).json({ error: error.message || "Failed to translate texts." });
    }
  });

  // Endpoint 3: Public endpoint to verify that the Gemini API is configured

  app.get("/api/quick-add/status", (req, res) => {
    res.json({
      geminiConfigured: !!process.env.GEMINI_API_KEY,
      endpointUrl: "/api/quick-add",
      webhookUrl: "/api/webhook/sms",
      groupmeWebhookUrl: "/api/webhook/groupme",
      appUrl: process.env.APP_URL || "https://cisa-campus-work-tracker.pages.dev"
    });
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
