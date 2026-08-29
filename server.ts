

import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import dotenv from "dotenv";
import { verifyTwilioRequest } from "./src/lib/twilioVerify";

dotenv.config();

const GITHUB_TITLE_MAX = 512;

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
        if (admin.apps.length === 0) {
          firebaseApp = admin.initializeApp({
            projectId: config.projectId,
            // createCustomToken needs to know which service account to sign
            // with — without this it tries to auto-discover one via the GCP
            // metadata server, which doesn't exist in local/Cloud Run dev.
            serviceAccountId: "firebase-adminsdk-fbsvc@sac-campus-hub.iam.gserviceaccount.com",
          });
        } else {
          firebaseApp = admin.apps[0]!;
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
    return admin.auth();
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

    if (email.toLowerCase() === "yilongwang05@gmail.com") {
      return { uid, email, role: "admin" };
    }

    const userDoc = await getAdminDb().collection("users").doc(uid).get();
    if (!userDoc.exists) {
      throw new Error("User does not exist in the system");
    }

    const userData = userDoc.data()!;
    if (userData.role !== "admin") {
      throw new Error("User is not an administrator");
    }

    return { uid, email, role: userData.role };
  }

  // Helper function to update GitHub issue state bidirectionally
  async function updateGitHubIssueState(issueUrl: string | undefined, state: 'open' | 'closed', reason?: 'completed' | 'not_planned') {
    if (!issueUrl) return;
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      console.warn("GITHUB_TOKEN not configured; skipping GitHub issue status sync.");
      return;
    }

    // Parse owner, repo, issue number from HTML URL
    const match = issueUrl.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
    if (!match) {
      console.error(`Invalid GitHub issue URL format for sync: ${issueUrl}`);
      return;
    }

    const [_, owner, repo, issueNumber] = match;
    const targetUrl = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}`;

    try {
      const payload: any = { state };
      if (state === 'closed' && reason) {
        payload.state_reason = reason;
      }

      const response = await fetch(targetUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json',
          'User-Agent': 'CISA-Campus-Work-Tracker-Server',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`GitHub API error updating issue: ${response.status} - ${errorText}`);
      } else {
        console.log(`Successfully updated GitHub issue state to ${state} (${reason || 'no reason'}) for ${issueUrl}`);
      }
    } catch (error) {
      console.error(`Failed to update GitHub issue state for ${issueUrl}:`, error);
    }
  }

  // Endpoint: Submit feedback (with capture diagnostics and auto GitHub issue creation)
  app.post("/api/feedback", async (req, res) => {
    try {
      let userId = req.body.userId;
      let userEmail = req.body.userEmail;
      let userName = req.body.userName;

      // Authenticate via Firebase ID token if Authorization header is present
      if (req.headers.authorization) {
        try {
          const decoded = await authenticateFirebaseUser(req);
          userId = decoded.uid;
          userEmail = decoded.email || "anonymous";
          userName = decoded.name || decoded.displayName || req.body.userName || "Anonymous User";
        } catch (authErr: any) {
          console.error("Firebase ID token verification failed:", authErr);
          return res.status(401).json({ error: `Unauthorized: ${authErr.message || String(authErr)}` });
        }
      } else if (process.env.NODE_ENV !== "test") {
        return res.status(401).json({ error: "Unauthorized: Authorization header is required." });
      }

      const {
        type,
        kind,
        message,
        screenshot,
        url,
        userAgent,
        viewport
      } = req.body;

      if (!message || typeof message !== "string") {
        return res.status(400).json({ error: "Missing required 'message' parameter." });
      }

      const db = getAdminDb();
      const feedbackData: any = {
        userId: userId || "anonymous",
        userEmail: userEmail || "anonymous",
        userName: userName || "Anonymous User",
        type: type || "enhancement",
        kind: kind || "thought",
        message: message.trim(),
        status: "new",
        createdAt: new Date().toISOString(),
        archived: false,
      };

      if (screenshot) feedbackData.screenshot = screenshot;
      if (url) feedbackData.url = url;
      if (userAgent) feedbackData.userAgent = userAgent;
      if (viewport) feedbackData.viewport = viewport;

      // 1. Save to Firestore
      const docRef = await db.collection("feedback").add(feedbackData);
      console.log(`Saved feedback document to Firestore: "${docRef.id}"`);

      // 2. Best-effort create GitHub issue if credentials exist
      const githubToken = process.env.GITHUB_TOKEN;
      const githubRepo = process.env.GITHUB_REPO || process.env.VITE_GITHUB_REPO || "Shir0o/cisa-campus-work-tracker";

      let githubIssueUrl = "";
      if (githubToken && githubRepo) {
        try {
          const kindLabel = kind || type;
          const cleanMsg = message.trim();
          const prefix = `[Feedback] ${kindLabel}: `;
          const remaining = GITHUB_TITLE_MAX - prefix.length;
          const title = cleanMsg.length <= remaining
            ? `${prefix}${cleanMsg}`
            : `${prefix}${cleanMsg.slice(0, remaining - 1)}…`;

          let body = `### Feedback Details
- **Submitted By:** ${userName || 'Anonymous'} (${userEmail || 'anonymous'})
- **Type:** ${type || 'enhancement'}
- **Kind:** ${kindLabel}
- **Date:** ${new Date().toLocaleString()}
- **Page URL:** ${url || 'N/A'}
- **Viewport:** ${viewport || 'N/A'}
- **User Agent:** ${userAgent || 'N/A'}

### Message
\`\`\`text
${cleanMsg}
\`\`\`

---
*Created automatically from CISA Campus Work Tracker user feedback.*`;

          if (screenshot) {
            const rawBaseUrl = process.env.APP_URL || process.env.VITE_APP_URL || `${req.protocol}://${req.get('host')}`;
            const baseUrl = rawBaseUrl.replace(/\/+$/, '');
            const imageUrl = `${baseUrl}/api/feedback/${docRef.id}/screenshot`;
            body += `\n\n### Screenshot\n![Feedback Screenshot](${imageUrl})\n\n*(View screenshot directly on GitHub or in app admin panel)*`;
          }

          const labels = [type || 'enhancement', 'feedback'];

          const ghResponse = await fetch(`https://api.github.com/repos/${githubRepo}/issues`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${githubToken}`,
              'Accept': 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
              'Content-Type': 'application/json',
              'User-Agent': 'CISA-Campus-Work-Tracker-Server',
            },
            body: JSON.stringify({
              title,
              body,
              labels,
            }),
          });

          if (ghResponse.ok) {
            const issueData = (await ghResponse.json()) as { html_url: string; number: number };
            githubIssueUrl = issueData.html_url;
            console.log(`  ✓ Auto-created GitHub Issue #${issueData.number}: ${githubIssueUrl}`);
            
            // Update Firestore with the GitHub Issue URL and status in_progress
            await docRef.update({
              githubIssueUrl,
              status: "in_progress"
            });
          } else {
            const errorText = await ghResponse.text();
            console.error(`GitHub API error creating issue: ${ghResponse.status} - ${errorText}`);
          }
        } catch (ghErr) {
          console.error("Failed to auto-create GitHub issue:", ghErr);
        }
      } else {
        console.warn("GitHub credentials not fully configured; skipping auto GitHub issue creation.");
      }

      res.status(200).json({
        success: true,
        id: docRef.id,
        githubIssueUrl,
        status: githubIssueUrl ? "in_progress" : "new",
      });
    } catch (error: any) {
      console.error("Error in POST /api/feedback: ", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // Endpoint: GET /api/feedback/:id/screenshot (serves binary image bytes for GitHub issue embedding)
  app.get("/api/feedback/:id/screenshot", async (req, res) => {
    try {
      const feedbackId = req.params.id;
      if (!feedbackId) {
        return res.status(400).json({ error: "Missing required feedback id parameter." });
      }

      const db = getAdminDb();
      const docSnap = await db.collection("feedback").doc(feedbackId).get();
      if (!docSnap.exists) {
        return res.status(404).json({ error: `Feedback document with id "${feedbackId}" not found.` });
      }

      const data = docSnap.data()!;
      const screenshot = data.screenshot;
      if (!screenshot || typeof screenshot !== "string") {
        return res.status(404).json({ error: `No screenshot attached to feedback document "${feedbackId}".` });
      }

      // Parse data URL format: data:<contentType>;base64,<base64Data>
      const match = screenshot.match(/^data:([^;]+);base64,(.+)$/);
      let contentType = "image/jpeg";
      let base64Data = screenshot;

      if (match) {
        contentType = match[1];
        base64Data = match[2];
      }

      const buffer = Buffer.from(base64Data, "base64");
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", buffer.length);
      res.setHeader("Cache-Control", "public, max-age=86400");
      res.status(200).send(buffer);
    } catch (error: any) {
      console.error("Error in GET /api/feedback/:id/screenshot: ", error);
      res.status(500).json({ error: error.message || "Internal Server Error" });
    }
  });

  // Endpoint: Update feedback status / archive (admin-facing, syncs with GitHub)
  app.post("/api/feedback/update", async (req, res) => {
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
      const docRef = db.collection("feedback").doc(id);
      const docSnap = await docRef.get();
      if (!docSnap.exists) {
        return res.status(404).json({ error: `Feedback document with id "${id}" not found.` });
      }

      const currentData = docSnap.data()!;
      const updates: any = {};
      if (status !== undefined) updates.status = status;
      if (archived !== undefined) updates.archived = archived;
      if (githubIssueUrl !== undefined) updates.githubIssueUrl = githubIssueUrl;

      // Save changes to Firestore
      await docRef.update(updates);
      console.log(`Updated feedback document "${id}" with:`, updates);

      // Bidirectional sync: check if we need to update GitHub issue state
      const targetIssueUrl = githubIssueUrl !== undefined ? githubIssueUrl : currentData.githubIssueUrl;
      if (targetIssueUrl) {
        const nextStatus = status !== undefined ? status : currentData.status;
        const nextArchived = archived !== undefined ? archived : currentData.archived;

        if (archived === true && nextStatus !== 'resolved') {
          // If archived is true, close issue as not_planned
          await updateGitHubIssueState(targetIssueUrl, 'closed', 'not_planned');
        } else if (status === 'resolved') {
          // If resolved, close issue as completed
          await updateGitHubIssueState(targetIssueUrl, 'closed', 'completed');
        } else if ((status === 'in_progress' || status === 'new') && currentData.status === 'resolved') {
          // If changing back from resolved to open
          await updateGitHubIssueState(targetIssueUrl, 'open');
        } else if (archived === false && currentData.archived === true) {
          // If unarchived, reopen issue if it's closed, or sync status
          await updateGitHubIssueState(targetIssueUrl, nextStatus === 'resolved' ? 'closed' : 'open', nextStatus === 'resolved' ? 'completed' : undefined);
        }
      }

      res.status(200).json({ success: true, updates });
    } catch (error: any) {
      console.error("Error in POST /api/feedback/update: ", error);
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

      const eventType = req.headers["x-github-event"];
      if (eventType !== "issues") {
        return res.status(200).json({ message: `Ignored non-issues event type: ${eventType}` });
      }

      const { action, issue } = req.body;
      if (!issue || !issue.html_url) {
        return res.status(400).json({ error: "Invalid issues event payload." });
      }

      const issueUrl = issue.html_url;
      const db = getAdminDb();
      
      // Query feedback collection to find document with matching githubIssueUrl
      const snapshot = await db.collection("feedback").where("githubIssueUrl", "==", issueUrl).get();
      if (snapshot.empty) {
        console.log("GitHub Webhook: No feedback doc found matching issue URL: " + issueUrl);
        return res.status(200).json({ message: "No matching feedback document found." });
      }

      console.log(`GitHub Webhook: Found ${snapshot.size} feedback documents matching issue URL: ${issueUrl}`);

      const updates: any = {};
      if (action === "closed") {
        updates.status = "resolved";
        if (issue.state_reason === "not_planned") {
          updates.archived = true;
        }
      } else if (action === "reopened") {
        updates.status = "in_progress";
        updates.archived = false;
      } else {
        return res.status(200).json({ message: `Ignored action: ${action}` });
      }

      // Update all matching documents
      const batch = db.batch();
      snapshot.forEach(doc => {
        batch.update(doc.ref, updates);
      });
      await batch.commit();

      console.log(`GitHub Webhook: Successfully updated feedback doc(s) for issue ${issueUrl} with updates:`, updates);
      res.status(200).json({ success: true, matchedDocsCount: snapshot.size, updates });
    } catch (error: any) {
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
2. role: string (The group or background of the person, e.g., 'Student', 'Faculty', 'Alumni', 'Resident'. Default to 'Student' if not specified).
3. location: string (The dorm, building, venue, or context where they first connected, e.g., 'Campus Center', 'Miller Hall', 'Cafeteria'. Default to empty string if not mentioned).
4. email: string (Any email mentioned. Format appropriately; empty string if not mentioned).
5. phone: string (Any cell or phone number mentioned. Format in clean standard style: (XXX) XXX-XXXX; empty string if not mentioned).
6. stage: string (The progress stage. MUST be one of: 'First Contact', 'Outreach', 'Unassigned'. Default to 'First Contact' if not specified).
7. tags: array of strings (A maximum of 4 simple keyword tags. For example: ['Freshman', 'Gospel', 'Inquisitive']. Do not include space-padded commas).
8. spiritualBackground: string (Optional. Choose EXACTLY one of: 'Christian', 'Catholic', 'Other', 'None', or empty string if not explicit).
9. notes: string (Strictly required. A concise, polished summary of descriptions, what was discussed, their background, and key points of interest. Include any contextual cues like "Met in biology class").`,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING, description: "Extract full name (First and/or Last name)." },
              role: { type: Type.STRING, description: "The contact's primary group classification." },
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
    if (cleanParsedName) {
      const potentials = contacts.filter(c => {
        if (!c.name) return false;
        const dbName = c.name.trim().toLowerCase();
        return dbName.includes(cleanParsedName) || cleanParsedName.includes(dbName);
      });
      // Return if exactly one unique contact matched fuzzy lookup
      if (potentials.length === 1) {
        return potentials[0];
      }
    }

    return null;
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
        serverTimestamp: admin.firestore.FieldValue.serverTimestamp(),
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
        // Update contact lastSeen and metadata
        const updatePayload: any = {
          lastSeen: "Just now",
          updatedAt: new Date().toISOString(),
          updatedBy: opUserId,
          updatedByName: opUserName,
          hasNewActivity: true
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
            dateTime: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            serverCreatedAt: admin.firestore.FieldValue.serverTimestamp()
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
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          link: "/directory",
          targetId: existingContact.id
        });

        return {
          id: existingContact.id,
          isExisting: true,
          name: existingContact.name,
          role: existingContact.role,
          location: existingContact.location,
          stage: existingContact.stage,
          notes: parsed.content || ""
        };
      } else {
        // Contact doesn't exist, create minimal contact and append interaction
        const contactData = {
          name: parsed.contactName,
          role: "Student",
          location: "",
          email: "",
          phone: "",
          stage: "First Contact",
          tags: ["Auto-Created"],
          notes: `Created automatically via incoming interaction log: "${parsed.content}"`,
          spiritualBackground: "",
          initials: getInitials(parsed.contactName),
          lastSeen: "Just now",
          createdAt: new Date().toISOString(),
          serverCreatedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdBy: opUserId,
          createdByName: opUserName,
          hasNewActivity: true,
          attendance: {}
        };

        const docRef = await getAdminDb().collection("contacts").add(contactData);

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
            dateTime: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            serverCreatedAt: admin.firestore.FieldValue.serverTimestamp()
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
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          link: "/directory",
          targetId: docRef.id
        });

        return {
          id: docRef.id,
          isExisting: false,
          name: contactData.name,
          role: contactData.role,
          location: contactData.location,
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
        const updatePayload: any = {
          lastSeen: "Just now",
          updatedAt: new Date().toISOString(),
          updatedBy: opUserId,
          updatedByName: opUserName,
          hasNewActivity: true
        };

        // Merge fields cleanly if they are empty on the existing contact record
        if (!existingContact.email && parsed.email) updatePayload.email = parsed.email;
        if (!existingContact.phone && parsed.phone) updatePayload.phone = parsed.phone;
        if (!existingContact.location && parsed.location) updatePayload.location = parsed.location;
        if (!existingContact.spiritualBackground && parsed.spiritualBackground) {
          updatePayload.spiritualBackground = parsed.spiritualBackground;
        }
        if (parsed.role && parsed.role !== "Student" && existingContact.role === "Student") {
          updatePayload.role = parsed.role;
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
            dateTime: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            serverCreatedAt: admin.firestore.FieldValue.serverTimestamp()
          });

        // Format description logging message
        const hasUpdates = Object.keys(updatePayload).filter(k => !["lastSeen", "updatedAt", "updatedBy", "updatedByName", "hasNewActivity"].includes(k)).length > 0;
        const changeSummary = hasUpdates 
          ? `Filled details: ${Object.keys(updatePayload).filter(k => !["lastSeen", "updatedAt", "updatedBy", "updatedByName", "hasNewActivity"].includes(k)).join(", ")}` 
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
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          link: "/directory",
          targetId: existingContact.id
        });

        return { id: existingContact.id, isExisting: true, name: existingContact.name, notes: parsed.notes || "", role: existingContact.role, location: existingContact.location, stage: existingContact.stage };
      }

      // Creating new contact
      const contactData = {
        name: parsed.name,
        role: parsed.role || "Student",
        location: parsed.location || "",
        email: parsed.email || "",
        phone: parsed.phone || "",
        stage: parsed.stage || "First Contact",
        tags: parsed.tags || [],
        notes: parsed.notes || "",
        spiritualBackground: parsed.spiritualBackground || "",
        initials: getInitials(parsed.name),
        lastSeen: "Just now",
        createdAt: new Date().toISOString(),
        serverCreatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: opUserId,
        createdByName: opUserName,
        hasNewActivity: true,
        attendance: {}
      };

      // Add directly to contacts collection using admin privileges
      const docRef = await getAdminDb().collection("contacts").add(contactData);

      // Document formatted log message
      const fieldsLog = [
        `Group: ${contactData.role}`,
        `Stage: ${contactData.stage}`,
        `Address: ${contactData.location}`,
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
        message: `Successfully created ${contactData.name} (${contactData.role}) from text description.`,
        type: "success",
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        link: "/directory",
        targetId: docRef.id
      });

      return { id: docRef.id, isExisting: false, ...contactData };
    }
  }



  // Endpoint 0: Developer Query Endpoint to fetch latest webhook logs as JSON outside the website
  app.get("/api/webhook/logs", async (req, res) => {
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
  app.post("/api/quick-add", async (req, res) => {
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
  app.post("/api/webhook/sms", async (req, res) => {
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
📋 Group: ${contact.role}
📍 Location: ${contact.location ? contact.location : "Not specified"}
${contact.isExisting ? "📝 Added interaction notes to history." : `💡 Notes: ${contact.notes.substring(0, 100)}${contact.notes.length > 100 ? "..." : ""}`}
  </Message>
</Response>
      `.trim();

      res.status(200).type("text/xml").send(twiml);
    } catch (error: any) {
      console.error("Webhook Quick Add Error: ", error);
      await logApiCall("Twilio SMS", req.body, req.headers, "error", "Error parsing SMS to contact.", error.message || String(error));
      const twimlError = `
<Response>
  <Message>
⚠️ Failed to parse/quick-add contact via AI service.
Error: ${error.message || "Internal server processing error."}
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
      const contact = await performQuickAdd(textToParse, {
        userId: sender_id ? `groupme-${sender_id}` : "system-groupme",
        userName: name ? `${name} (GroupMe)` : "GroupMe User"
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
  app.post("/api/analyze-notes", async (req, res) => {
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
  app.post("/api/smart-import/parse", async (req, res) => {
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
1. contacts: Individuals mentioned in the text. For each contact, infer their name, email, phone, stage ('lead', 'contact', 'follow-up', 'connected', or 'active'), role ('Student', 'Trainee', 'Community'), spiritual background, notes/summary, and relevant tags. If a contact matches an existing contact from the provided Existing Contacts Database (by exact or close name/email/phone), set matchedContactId to their existing ID and matchedContactName to their existing name; otherwise set matchedContactId and matchedContactName to null. Assign a temporary ID 'c1', 'c2', etc.
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
                    role: { type: Type.STRING },
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

  app.post("/api/smart-import/commit", async (req, res) => {
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
            role: (contact.role || "Student").slice(0, 64),
            location: "",
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

          batch.set(newContactRef, newContactData);
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
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
          };

          batch.set(interactionRef, interactionData);
          iCount++;

          const contactRef = db.collection("contacts").doc(targetContactId);
          batch.update(contactRef, {
            lastSeen: dateStr,
            lastContactedBy: userName,
            lastContactedById: uid,
            lastContactedDate: dateStr,
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
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
  app.post("/api/mint-custom-token", async (req, res) => {
    try {
      const decodedToken = await authenticateFirebaseUser(req);
      const token = await getAdminAuth().createCustomToken(decodedToken.uid);
      res.status(200).json({ success: true, token });
    } catch (error: any) {
      console.error("Mint Custom Token Error: ", error);
      res.status(401).json({ success: false, error: error.message || "Failed to mint custom token" });
    }
  });

  // Remote Push Dispatch: sends an Expo push notification to target user's registered pushToken
  app.post("/api/send-push", async (req, res) => {
    try {
      const { userId, title, body, data } = req.body;
      if (!userId || !title) {
        return res.status(400).json({ success: false, error: "userId and title are required" });
      }

      const expoAccessToken = process.env.EXPO_ACCESS_TOKEN;
      if (!expoAccessToken) {
        return res.status(200).json({ success: true, pushSent: false, reason: "EXPO_ACCESS_TOKEN not configured" });
      }

      const db = getAdminDb();
      const userSnap = await db.collection("users").doc(userId).get();
      const pushToken = userSnap.data()?.pushToken;

      if (!pushToken || typeof pushToken !== "string") {
        return res.status(200).json({ success: true, pushSent: false, reason: "No pushToken registered for user" });
      }

      const pushResponse = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
          "Authorization": `Bearer ${expoAccessToken}`,
        },
        body: JSON.stringify({
          to: pushToken,
          sound: "default",
          title: title,
          body: body || "",
          data: data || {},
        }),
      });

      const pushResult = await pushResponse.json();
      res.status(200).json({ success: true, pushSent: true, result: pushResult });
    } catch (error: any) {
      console.error("Send Push Error: ", error);
      res.status(500).json({ success: false, error: error.message || "Failed to send push notification" });
    }
  });

  // Translation Endpoint: translates batched text strings to targetLang with Firestore L3 caching
  app.post("/api/translate", async (req, res) => {
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

      const db = getAdminDb();
      const cacheMap = new Map<string, string>();
      const existingCachedHashes = new Set<string>();

      // Compute hashes for unique non-empty trimmed texts
      const uniqueItemsMap = new Map<string, string>(); // hash -> trimmedText
      for (const rawText of texts) {
        const trimmed = rawText.trim();
        if (trimmed) {
          const hash = crypto.createHash("sha256").update(`${normalizedTargetLang}:${trimmed}`).digest("hex");
          uniqueItemsMap.set(hash, trimmed);
        }
      }

      // Check Firestore cache for existing translations
      const hashList = Array.from(uniqueItemsMap.keys());
      if (hashList.length > 0) {
        const lookups = hashList.map(async (hash) => {
          try {
            const docSnap = await db.collection("translations").doc(hash).get();
            if (docSnap.exists) {
              const data = docSnap.data();
              if (data && typeof data.translatedText === "string") {
                cacheMap.set(hash, data.translatedText);
                existingCachedHashes.add(hash);
              }
            }
          } catch (e) {
            console.warn(`[Translation Cache] Lookup failed for hash ${hash}:`, e);
          }
        });
        await Promise.all(lookups);
      }

      // Identify items that need translation
      const uncachedItems: Array<{ id: number; hash: string; text: string }> = [];
      let nextId = 0;
      for (const [hash, trimmedText] of uniqueItemsMap.entries()) {
        if (!cacheMap.has(hash)) {
          uncachedItems.push({ id: nextId++, hash, text: trimmedText });
        }
      }

      // If we have uncached items, call Gemini in chunks with timeout protection
      if (uncachedItems.length > 0) {
        const langName = normalizedTargetLang === "es" ? "Spanish" : normalizedTargetLang;
        const CHUNK_SIZE = 15;
        const AI_TIMEOUT_MS = 15000;
        const resultMap = new Map<number, string>();
        const toSaveInFirestore: Array<{ hash: string; text: string; translated: string }> = [];

        // Split uncachedItems into chunks
        const chunks: Array<Array<{ id: number; hash: string; text: string }>> = [];
        for (let i = 0; i < uncachedItems.length; i += CHUNK_SIZE) {
          chunks.push(uncachedItems.slice(i, i + CHUNK_SIZE));
        }

        for (const chunk of chunks) {
          try {
            const prompt = `Translate the following ${chunk.length} text items into ${langName}:\n\n` +
              JSON.stringify(chunk.map((item) => ({ id: item.id, text: item.text })));

            const generatePromise = getAiClient().models.generateContent({
              model: "gemini-3.5-flash",
              contents: prompt,
              config: {
                systemInstruction: `You are an expert translator for a campus ministry community web and mobile app. Translate each text item accurately, idiomatically, and naturally into the target language (${langName}).
CRITICAL RULES:
1. Preserve all Markdown formatting intact (*, **, #, -, 1., [text](url), etc.).
2. Preserve user mentions (@name or @User), emails, URLs, and phone numbers untouched.
3. Preserve emojis and special characters.
4. Return a JSON object with a 'translations' array matching the input 'id' and the 'translatedText'.`,
                responseMimeType: "application/json",
                responseSchema: {
                  type: Type.OBJECT,
                  properties: {
                    translations: {
                      type: Type.ARRAY,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          id: { type: Type.INTEGER },
                          translatedText: { type: Type.STRING }
                        },
                        required: ["id", "translatedText"]
                      }
                    }
                  },
                  required: ["translations"]
                }
              }
            });

            const timeoutPromise = new Promise<never>((_, reject) => {
              const timer = setTimeout(() => reject(new Error("Translation AI timeout after 15s")), AI_TIMEOUT_MS);
              generatePromise.finally(() => clearTimeout(timer)).catch(() => {});
            });

            const response = await Promise.race([generatePromise, timeoutPromise]);

            if (response?.text) {
              const parsed = JSON.parse(response.text.trim());
              if (parsed.translations && Array.isArray(parsed.translations)) {
                for (const item of parsed.translations) {
                  if (typeof item.id === "number" && typeof item.translatedText === "string") {
                    resultMap.set(item.id, item.translatedText);
                  }
                }
              }
            }

            for (const item of chunk) {
              const translatedText = resultMap.get(item.id) ?? item.text;
              cacheMap.set(item.hash, translatedText);
              if (resultMap.has(item.id)) {
                toSaveInFirestore.push({ hash: item.hash, text: item.text, translated: translatedText });
              }
            }
          } catch (chunkError) {
            console.warn("[Translation Service] AI translation chunk failed or timed out, falling back to original text:", chunkError);
            for (const item of chunk) {
              cacheMap.set(item.hash, item.text);
            }
          }
        }

        // Store new successful translations in Firestore using batch write
        if (toSaveInFirestore.length > 0) {
          try {
            const batch = db.batch();
            const now = new Date().toISOString();
            for (const item of toSaveInFirestore) {
              const docRef = db.collection("translations").doc(item.hash);
              batch.set(docRef, {
                hash: item.hash,
                sourceText: item.text,
                translatedText: item.translated,
                targetLang: normalizedTargetLang,
                sourceLang: typeof sourceLang === "string" ? sourceLang.slice(0, 10) : "auto",
                createdAt: now,
              });
            }
            await batch.commit();
          } catch (dbErr) {
            console.warn("[Translation Service] Failed to save translations to Firestore cache:", dbErr);
          }
        }
      }

      // Map back to output preserving exact original array ordering
      const translations = texts.map((original) => {
        const trimmed = original.trim();
        if (!trimmed) {
          return {
            original,
            translated: original,
            hash: "",
            cached: true
          };
        }
        const hash = crypto.createHash("sha256").update(`${normalizedTargetLang}:${trimmed}`).digest("hex");
        const translated = cacheMap.get(hash) ?? trimmed;
        const cached = existingCachedHashes.has(hash);
        return {
          original,
          translated,
          hash,
          cached
        };
      });

      res.status(200).json({
        success: true,
        targetLang: normalizedTargetLang,
        translations
      });
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
    app.use((req, res) => {
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
