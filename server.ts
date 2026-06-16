

import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({
    verify: (req: any, res, buf) => {
      req.rawBody = buf;
    }
  }));
  app.use(express.urlencoded({ extended: true }));

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
          });
        } else {
          firebaseApp = admin.apps[0]!;
        }

        // Properly get custom Firestore instance using getFirestore from subpath
        adminDbInstance = getFirestore(firebaseApp, config.firestoreDatabaseId);
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
      const githubRepo = process.env.GITHUB_REPO || process.env.VITE_GITHUB_REPO || "Shir0o/cisa-campus-work-traker";

      let githubIssueUrl = "";
      if (githubToken && githubRepo) {
        try {
          const kindLabel = kind || type;
          const cleanMsg = message.trim();
          const title = `[Feedback] ${kindLabel}: ${cleanMsg.slice(0, 50)}${cleanMsg.length > 50 ? '...' : ''}`;
          
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
            body += `\n\n> [!NOTE]\n> A screenshot is attached to this feedback item in the application admin panel.`;
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
        `First Met: ${contactData.location}`,
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
      const { text, userId, userName } = req.body;
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
      const { text, sender_type, name, sender_id } = req.body;

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
      const outcome = contact.isExisting 
        ? `GroupMe trigger from "${name}" matched existing contact "${contact.name}" and logged interaction.`
        : `GroupMe trigger from "${name}" created new contact "${contact.name}".`;

      await logApiCall("GroupMe", req.body, req.headers, "success", outcome);

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

  // Endpoint 3: Public endpoint to verify that the Gemini API is configured
  app.get("/api/quick-add/status", (req, res) => {
    res.json({
      geminiConfigured: !!process.env.GEMINI_API_KEY,
      endpointUrl: "/api/quick-add",
      webhookUrl: "/api/webhook/sms",
      groupmeWebhookUrl: "/api/webhook/groupme",
      appUrl: process.env.APP_URL || "https://ais-dev-...us-east1.run.app"
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
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Full-Stack Express Server active on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Fatal Server Startup Error:", err);
  process.exit(1);
});
