/**
 * Demo seed for Board audience access (Session 3) + notes archive (Session 4).
 *
 * Creates a handful of dated board pages tagged with different audiences so that
 * switching persona on /coordination shows the correct subset:
 *   - a TEAM page (full-timers only)
 *   - a TRAINEES page (staff & trainees)
 *   - an EVERYONE page (any student in CISA)
 * plus a couple of Notes & learnings archive entries.
 *
 * Uses firebase-admin (bypasses security rules), so it works even before the
 * audience-aware rules are deployed. Needs a service-account credential:
 *
 *   GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json \
 *     npx tsx scripts/seed-board-audience-demo.ts
 *
 * Reads the full-timer from e2e/.test-credentials.json (gitignored) for the
 * facilitator/contributor uid. Idempotent — deterministic doc ids, re-run safe.
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

// yyyy-MM-dd for `daysAgo` days ago (local time), matching BoardDoc.date.
const isoDate = (daysAgo: number) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().slice(0, 10);
};

async function seed() {
  const fullTimer = await auth.getUserByEmail(creds.fulltimer.email);
  const ft = fullTimer.uid;
  const ftName = creds.fulltimer.label;
  const ts = admin.firestore.FieldValue.serverTimestamp();

  // --- Dated pages, one per audience tier ---
  const docs = [
    {
      id: "demo-board-team",
      audience: "team",
      date: isoDate(0),
      title: "Wednesday care — who checks in",
      md: `# Wednesday care — who checks in
**8:00 PM · Briarcliff Common**

Pastoral, team-only. Nothing here should leave the room.

- [ ] Anika's dad is post-op — Caleb to check in Thursday
- [ ] Mira's honest questions — go slow, keep meeting for coffee
- [x] Retreat scholarships: draft a partial-aid plan for Monday`,
    },
    {
      id: "demo-board-trainees",
      audience: "trainees",
      date: isoDate(1),
      title: "Trainee huddle — following up well",
      md: `# Trainee huddle — following up well
**Shared with staff & trainees**

How we follow up after a first conversation — read along.

- A coffee invite beats a gathering invite for a first contact.
- Log the conversation the same day while it's fresh.
- [ ] Re-invite Tomoko + two org-fair names before Friday`,
    },
    {
      id: "demo-board-everyone",
      audience: "everyone",
      date: isoDate(2),
      title: "Friday Night — what's happening",
      md: `# Friday Night Gathering
**7:00 PM · Lower Common Room**

Everyone's welcome — here's how the night is shaped.

- Doors 6:40, worship 7:00, talk 7:25, small groups 7:55
- Snacks + hang till 9
- Caleb's talking on Psalm 23`,
    },
  ];

  for (const d of docs) {
    await db.collection("board_docs").doc(d.id).set(
      {
        date: d.date,
        title: d.title,
        md: d.md,
        audience: d.audience,
        facilitatorId: ft,
        createdAt: ts,
        createdBy: ft,
        createdByName: ftName,
        updatedAt: ts,
        updatedBy: ft,
        updatedByName: ftName,
      },
      { merge: true },
    );
  }

  // --- Notes & learnings archive (Full-timer + Trainee surface) ---
  const notes = [
    {
      id: "demo-note-record",
      type: "record",
      series: "Friday Gathering",
      title: "Friday Night — run of show",
      body: "Doors 6:40, worship 7:00, talk 7:25, small groups 7:55, snacks till 9. Two extra greeters needed for first-timers.",
      tags: ["run-of-show", "welcome"],
    },
    {
      id: "demo-note-learning",
      type: "learning",
      series: "Outreach",
      title: "Coffee beats events for a first contact",
      body: "A one-on-one coffee converted better than inviting someone straight to a gathering. Smaller ask, realer conversation.",
      tags: ["outreach", "first-contact"],
    },
  ];

  for (const n of notes) {
    await db.collection("board_notes").doc(n.id).set(
      {
        type: n.type,
        series: n.series,
        title: n.title,
        body: n.body,
        date: isoDate(0),
        contributorIds: [ft],
        tags: n.tags,
        createdAt: ts,
        createdBy: ft,
        createdByName: ftName,
        updatedAt: ts,
        updatedBy: ft,
        updatedByName: ftName,
      },
      { merge: true },
    );
  }

  console.log(`  ✓ seeded ${docs.length} board pages (team/trainees/everyone) + ${notes.length} archive notes`);
  console.log(`    full-timer ${creds.fulltimer.email} (uid=${ft})`);
}

console.log("Seeding Board audience demo data...");
seed()
  .then(() => {
    console.log("Done.");
    process.exit(0);
  })
  .catch((err) => {
    console.error("Seed failed:", err);
    process.exit(1);
  });
