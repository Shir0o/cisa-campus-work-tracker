/**
 * Demo seed for the "Walking together" feature (Session 1).
 *
 * Creates a small, self-contained demo so a full-timer has something to walk
 * through with their trainee: a few trainee-added contacts (one already
 * reviewed, two not), a couple of interactions the trainee logged, and a thread
 * of messages between the trainee and the full-timer covering all five kinds.
 *
 * Uses firebase-admin (bypasses security rules), so it works even before the
 * threads rules are deployed and can set interaction timestamps freely. Needs a
 * service-account credential:
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     npx tsx scripts/seed-walking-demo.ts
 *
 * Reads the full-timer + trainee from e2e/.test-credentials.json (gitignored)
 * and looks up their uids by email. Idempotent — deterministic doc ids, re-run
 * safe. These must match the FT_TRAINEES pair in src/lib/walking.ts.
 */

import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { readFileSync } from "node:fs";

const cfg = JSON.parse(readFileSync("firebase-applet-config.json", "utf8"));
const creds = JSON.parse(readFileSync("e2e/.test-credentials.json", "utf8")) as Record<
  string,
  { email: string; role: string; label: string }
>;

admin.initializeApp({ projectId: cfg.projectId });
const auth = admin.auth();
const db = getFirestore(admin.app(), cfg.firestoreDatabaseId);

const iso = (daysAgo: number, hoursAgo = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(d.getHours() - hoursAgo);
  return d.toISOString();
};

async function seed() {
  const fullTimer = await auth.getUserByEmail(creds.fulltimer.email);
  const trainee = await auth.getUserByEmail(creds.trainee.email);
  const ft = fullTimer.uid;
  const tr = trainee.uid;
  const trName = creds.trainee.label;

  // --- Trainee-added contacts (createdBy doubles as "added by") ---
  const contacts = [
    { id: "demo-walk-lila", name: "Lila Okwuosa", reviewed: true, joined: 18 },
    { id: "demo-walk-rio", name: "Rio Marchetti", reviewed: false, joined: 6 },
    { id: "demo-walk-kofi", name: "Kofi Boateng", reviewed: false, joined: 4 },
  ];
  for (const c of contacts) {
    await db.collection("contacts").doc(c.id).set(
      {
        name: c.name,
        email: `${c.id}@umail.edu`,
        phone: "",
        role: "",
        location: "",
        stage: "first",
        createdBy: tr,
        createdByName: trName,
        reviewed: c.reviewed,
        createdAt: iso(c.joined),
        updatedAt: iso(c.joined),
      },
      { merge: true },
    );
  }

  // --- Interactions the trainee logged ---
  const interactions = [
    {
      contactId: "demo-walk-lila",
      id: "demo-int-lila-1",
      content:
        "First real conversation over lunch. She asked the hardest question of the semester: why does God let suffering happen?",
      daysAgo: 1,
    },
    {
      contactId: "demo-walk-rio",
      id: "demo-int-rio-1",
      content: "Phone call — set up coffee for Thursday 3pm.",
      daysAgo: 3,
    },
  ];
  for (const i of interactions) {
    await db
      .collection("contacts")
      .doc(i.contactId)
      .collection("interactions")
      .doc(i.id)
      .set(
        {
          userId: tr,
          userName: trName,
          content: i.content,
          dateTime: iso(i.daysAgo),
          type: "conversation",
          createdAt: iso(i.daysAgo),
        },
        { merge: true },
      );
  }

  // --- Thread messages (all five kinds), trainee <-> full-timer ---
  const threads: {
    contactId: string;
    id: string;
    interactionId: string | null;
    from: string;
    kind: string;
    body: string;
    at: string;
    reactions: { by: string; emoji: string }[];
  }[] = [
    {
      contactId: "demo-walk-lila",
      id: "demo-th-1",
      interactionId: null,
      from: ft,
      kind: "encouragement",
      body: "This is a beautiful first contact — you asked the realest question and just listened. Keep going.",
      at: iso(1),
      reactions: [{ by: tr, emoji: "🙏" }],
    },
    {
      contactId: "demo-walk-lila",
      id: "demo-th-2",
      interactionId: "demo-int-lila-1",
      from: tr,
      kind: "question",
      body: "She asked me why God lets suffering happen and I froze. How would you have answered in the moment?",
      at: iso(0, 20),
      reactions: [],
    },
    {
      contactId: "demo-walk-lila",
      id: "demo-th-3",
      interactionId: "demo-int-lila-1",
      from: ft,
      kind: "comment",
      body: "Freezing is honest — don't rush to fix it. Try: “I don't have a clean answer, but I'd love to sit in that with you.” Slow is faithful.",
      at: iso(0, 16),
      reactions: [{ by: tr, emoji: "❤️" }],
    },
    {
      contactId: "demo-walk-rio",
      id: "demo-th-4",
      interactionId: null,
      from: ft,
      kind: "nudge",
      body: "Don't forget the Thursday coffee with Rio — want me to come along, or you've got it?",
      at: iso(0, 6),
      reactions: [],
    },
    {
      contactId: "demo-walk-kofi",
      id: "demo-th-5",
      interactionId: null,
      from: tr,
      kind: "note",
      body: "Kofi mentioned his roommate keeps asking him about God. Feels like there might be two people to reach here.",
      at: iso(0, 3),
      reactions: [],
    },
  ];
  for (const t of threads) {
    const { contactId, id, ...data } = t;
    await db
      .collection("contacts")
      .doc(contactId)
      .collection("threads")
      .doc(id)
      .set(data, { merge: true });
  }

  console.log(
    `  ✓ seeded ${contacts.length} contacts, ${interactions.length} interactions, ${threads.length} thread messages`,
  );
  console.log(`    full-timer ${creds.fulltimer.email} (uid=${ft})`);
  console.log(`    trainee    ${creds.trainee.email} (uid=${tr})`);
}

console.log("Seeding Walking-together demo data...");
seed()
  .then(() => {
    console.log("Done.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
