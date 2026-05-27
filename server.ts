import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());
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

  // Core Endpoint: Creates contact, or if already exists, updates contact details & logs interaction
  async function performQuickAdd(text: string) {
    const parsed = await parseContactFromText(text);

    if (!parsed.name) {
      throw new Error("Failed to extract a valid name from the text description.");
    }

    // Check if contact already exists
    const existingContact = await findExistingContact(parsed.name, parsed.email, parsed.phone);

    if (existingContact) {
      const updatePayload: any = {
        lastSeen: "Just now",
        updatedAt: new Date().toISOString(),
        updatedBy: "system-quick-add",
        updatedByName: "Quick Add AI Service",
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
          createdById: "system-quick-add",
          createdByName: "Quick Add AI Service",
          contactId: existingContact.id,
          contactName: existingContact.name,
          content: parsed.notes || `Interaction logged via Quick Add: "${text}"`,
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
        userId: "system-quick-add",
        userName: "Quick Add AI Service",
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
      createdBy: "system-quick-add",
      createdByName: "Quick Add Service",
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
      userId: "system-quick-add",
      userName: "Quick Add AI Service",
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
      const { text } = req.body;
      if (!text || typeof text !== "string") {
        const errMsg = "No text description provided. Please include a 'text' property.";
        await logApiCall("Quick Add API", req.body, req.headers, "error", errMsg, "Missing required 'text' parameter.");
        return res.status(400).json({ error: errMsg });
      }

      console.log(`Processing Quick Add Request: "${text}"`);
      const contact = await performQuickAdd(text) as any;
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
      const contact = await performQuickAdd(smsBody) as any;
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
      const { text, sender_type, name } = req.body;

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
      const contact = await performQuickAdd(textToParse) as any;
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
