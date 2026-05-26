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

  // Core Endpoint: Creates contact, activity feed, and system notification in Firestore
  async function performQuickAdd(text: string) {
    const parsed = await parseContactFromText(text);

    if (!parsed.name) {
      throw new Error("Failed to extract a valid name from the text description.");
    }

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

    return { id: docRef.id, ...contactData };
  }

  // Endpoint 1: Direct JSON API endpoint for custom clients, Siri, Android Shortcuts, or browser tools
  app.post("/api/quick-add", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "No text description provided. Please include a 'text' property." });
      }

      console.log(`Processing Quick Add Request: "${text}"`);
      const contact = await performQuickAdd(text);
      res.status(200).json({ success: true, contact });
    } catch (error: any) {
      console.error("Quick Add Service Error: ", error);
      res.status(500).json({ success: false, error: error.message || "Internal Server Error" });
    }
  });

  // Endpoint 2: URL-Encoded Twilio Webhook compatibility endpoint (SMS & WhatsApp trigger)
  app.post("/api/webhook/sms", async (req, res) => {
    try {
      // Twilio passes the SMS or WhatsApp body in 'Body' and sender number in 'From'
      const smsBody = req.body.Body;
      const smsFrom = req.body.From;

      if (!smsBody) {
        return res.status(400).type("text/xml").send(`
          <Response>
            <Message>Error: Please provide a valid text description in the body.</Message>
          </Response>
        `);
      }

      console.log(`Processing Webhook Trigger from ${smsFrom}: "${smsBody}"`);
      const contact = await performQuickAdd(smsBody);

      // Reply with Standard TwiML (compatible with SMS and WhatsApp)
      const twiml = `
<Response>
  <Message>
🎉 Added ${contact.name} to Campus Hub!
📋 Group: ${contact.role}
📍 First Met: ${contact.location ? contact.location : "Not specified"}
💡 Notes: ${contact.notes.substring(0, 100)}${contact.notes.length > 100 ? "..." : ""}
  </Message>
</Response>
      `.trim();

      res.status(200).type("text/xml").send(twiml);
    } catch (error: any) {
      console.error("Webhook Quick Add Error: ", error);
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

      // Ignore messages sent by bots to prevent infinite response patterns
      if (sender_type === "bot") {
        return res.status(200).json({ status: "ignored_bot_sender" });
      }

      if (!text || typeof text !== "string") {
        return res.status(400).json({ error: "No message text provided." });
      }

      const cleanText = text.trim();
      
      // We look for a prefix trigger to keep the chat tidy (e.g. "!add " or "add:")
      let textToParse = "";
      const lowerText = cleanText.toLowerCase();
      if (lowerText.startsWith("!add ")) {
        textToParse = cleanText.substring(5).trim();
      } else if (lowerText.startsWith("add: ")) {
        textToParse = cleanText.substring(5).trim();
      } else if (lowerText.startsWith("/add ")) {
        textToParse = cleanText.substring(5).trim();
      } else {
        // If it does not start with a command, we don't treat it as a trigger in multi-user groups
        return res.status(200).json({ status: "ignored_no_trigger_prefix" });
      }

      if (!textToParse) {
        return res.status(200).json({ status: "empty_content_after_prefix" });
      }

      console.log(`Processing GroupMe Bot incoming trigger from user "${name}": "${textToParse}"`);
      const contact = await performQuickAdd(textToParse);

      res.status(200).json({
        success: true,
        message: `Successfully created contact ${contact.name}`,
        contact
      });
    } catch (error: any) {
      console.error("GroupMe Webhook Error: ", error);
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
