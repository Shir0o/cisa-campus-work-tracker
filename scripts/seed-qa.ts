/**
 * One-time seed for the QA Firestore database (`qa-db`).
 *
 * Populates a realistic, self-contained dataset so a reviewer can exercise the
 * app end-to-end without touching production data. The dataset is a port of the
 * design bundle's mock data (the `data.jsx` from "CISA Campus Work Tracker"
 * design project) mapped onto the real role accounts, so the QA app shows the
 * same people, prayers, threads, gatherings and conversations the design
 * mocks up. Seeds:
 *
 *   • approved /users docs for the real role accounts (cisa-* + reviewer,
 *     read from the gitignored e2e/.test-credentials.json — never created here)
 *   • the 4 design stages (First/Second/Regular Contact, Church Meeting) +
 *     gathering types + season settings
 *   • the design's 23 contacts (16 roster + 7 park-outreach people) with the
 *     design's interactions, comments and walking-together threads
 *   • the design's 16 prayers (12 per-person + 4 team) + member prayer requests
 *     + the student persona's personal prayers (design's "student friends")
 *   • the 5 upcoming gatherings (+RSVPs) and the 12-session attendance grid
 *     with the design's per-contact presence marks
 *   • the design's to-dos (Board "what we're holding" + contact follow-ups)
 *   • the design's 7 Board pages + 8 notes & learnings
 *   • the design's 5 conversations (team prayer group, two broadcasts, two DMs)
 *   • the design's 7 visits (with mirrored card interactions) + 3 outreaches
 *   • the design's edit log (as the activity feed), 3 notifications and the
 *     5 webhook-console entries from the design's API log
 *
 * Staff mapping — the design's five team members map onto the QA accounts by
 * role (design personas in parentheses):
 *
 *   u1 Tony Wang    (ft persona)        → fulltimer account
 *   u3 Zion Adeyemi (trainee persona)   → trainee account
 *   u4 Caleb Owusu  (trainee)           → trainee account (second voice)
 *   u5 Priya Raman  (full-timer)        → fulltimer account (second voice)
 *   u2 Jordan Park  (full-timer)        → reviewer account (admin)
 *
 * The QA database shares Firebase Auth with production, so the role accounts are
 * looked up BY EMAIL in the shared Auth (they must already exist — this script
 * never creates Auth users); their Firestore docs live in `qa-db`, fully
 * separate from prod data.
 *
 * Usage (any admin credential works: gcloud ADC or a service-account key):
 *
 *   gcloud auth application-default login
 *   npm run seed:qa
 *
 * Requires `e2e/.test-credentials.json` (gitignored — see
 *   e2e/.test-credentials.example.json). Override the target database with
 * FIRESTORE_DATABASE_ID=… (default `qa-db`). Idempotent — deterministic doc
 * ids, safe to re-run; docs from earlier seed versions (old id prefixes) are
 * removed first so the QA db always holds exactly one coherent dataset.
 */

import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync, existsSync } from 'node:fs';

const cfg = JSON.parse(readFileSync('firebase-applet-config.json', 'utf8'));
const projectId = process.env.FIREBASE_PROJECT_ID || cfg.projectId;
const firestoreDatabaseId = process.env.FIRESTORE_DATABASE_ID || 'qa-db';

if (!admin.apps.length) {
  admin.initializeApp({ projectId });
}

const auth = admin.auth();
const db = getFirestore(admin.app(), firestoreDatabaseId);
const ts = admin.firestore.FieldValue.serverTimestamp();

const ACCOUNT_KEYS = ['fulltimer', 'trainee', 'student', 'community', 'reviewer'] as const;
const CREDS_PATH = 'e2e/.test-credentials.json';

/** ISO timestamp `daysAgo` days and `hoursAgo` hours (fractional ok) in the past. */
const iso = (daysAgo: number, hoursAgo = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(d.getHours() - hoursAgo);
  return d.toISOString();
};

/** YYYY-MM-DD `daysFromNow` days in the future (positive) or past (negative). */
const isoDate = (daysFromNow: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
};

/** YYYY-MM-DD of the given weekday (0=Sun) `weeksAgo` weeks back, never in the future. */
const sessionDate = (dow: number, weeksAgo: number) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monday = new Date(today);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const d = new Date(monday);
  d.setDate(d.getDate() - weeksAgo * 7 + (dow - 1));
  while (d.getTime() > today.getTime()) d.setDate(d.getDate() - 7);
  return d.toISOString().slice(0, 10);
};

const initialsOf = (name: string) =>
  name.split(' ').map((p) => p[0]).join('').toUpperCase();

async function seed() {
  console.log(`Seeding QA Firestore (project=${projectId}, database=${firestoreDatabaseId})…`);

  // Resolve the real role accounts (cisa-* + reviewer) from the gitignored
  // credentials file. Lookup-only — these Auth users already exist; the seed
  // never creates Auth accounts.
  const credsFile = existsSync(CREDS_PATH)
    ? (JSON.parse(readFileSync(CREDS_PATH, 'utf8')) as Record<string, { email?: string; role?: string; label?: string } | undefined>)
    : null;
  if (!credsFile) {
    console.error(`ERROR: ${CREDS_PATH} not found — copy e2e/.test-credentials.example.json and fill in the real accounts.`);
    process.exit(1);
  }

  // The four role accounts wear the design's persona names so every surface
  // (roster, threads, chat) reads like the design.
  const PERSONA_NAMES: Record<(typeof ACCOUNT_KEYS)[number], string> = {
    fulltimer: 'Tony Wang',
    trainee: 'Zion Adeyemi',
    student: 'Timothy Hale',
    community: 'Philip Nardi',
    reviewer: 'Jordan Park',
  };

  const uids: Record<(typeof ACCOUNT_KEYS)[number], string> = {} as never;
  for (const key of ACCOUNT_KEYS) {
    const entry = credsFile[key];
    if (!entry?.email) {
      console.log(`  – ${key}: missing from ${CREDS_PATH} (skipped)`);
      continue;
    }
    try {
      const user = await auth.getUserByEmail(entry.email);
      uids[key] = user.uid;
      const targetDisplayName = PERSONA_NAMES[key] || entry.label || user.displayName || entry.email.split('@')[0];
      if (!user.displayName && targetDisplayName) {
        try {
          await auth.updateUser(user.uid, { displayName: targetDisplayName });
        } catch (e) {
          console.warn(`  Could not update Auth user displayName for ${entry.email}:`, e);
        }
      }
      await db.collection('users').doc(user.uid).set(
        {
          email: entry.email,
          displayName: PERSONA_NAMES[key],
          photoURL: user.photoURL || '',
          role: entry.role,
          approved: true,
          createdAt: ts,
          updatedAt: ts,
        },
        { merge: true },
      );
      console.log(`  ✓ ${key.padEnd(10)} ${entry.email} (${entry.role}) → ${PERSONA_NAMES[key]}`);
    } catch {
      console.log(`  – ${key}: ${entry.email} has no Auth account yet (skipped — create it first, then re-run)`);
    }
  }

  // Extra reviewer accounts (QA_REVIEWER_EMAILS=comma-separated, default the
  // project owner) get an approved ADMIN doc so they can explore everything
  // with their own Google account. Idempotent — never demotes an existing doc.
  // In the seed dataset they wear the design's second full-timer, Jordan Park.
  const reviewerEmails = (
    process.env.QA_REVIEWER_EMAILS || 'yilongwang05@gmail.com'
  )
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  for (const email of reviewerEmails) {
    try {
      const user = await auth.getUserByEmail(email);
      if (!uids.reviewer) uids.reviewer = user.uid;
      const targetDisplayName = PERSONA_NAMES.reviewer || user.displayName || email.split('@')[0];
      if (!user.displayName && targetDisplayName) {
        try {
          await auth.updateUser(user.uid, { displayName: targetDisplayName });
        } catch (e) {
          console.warn(`  Could not update Auth user displayName for ${email}:`, e);
        }
      }
      await db.collection('users').doc(user.uid).set(
        {
          email,
          displayName: PERSONA_NAMES.reviewer,
          photoURL: user.photoURL || '',
          role: 'admin',
          approved: true,
          createdAt: ts,
          updatedAt: ts,
        },
        { merge: true },
      );
      console.log(`  ✓ reviewer admin ${email} (uid=${user.uid}) → ${PERSONA_NAMES.reviewer}`);
    } catch {
      console.log(`  – reviewer ${email} has no Auth account yet (skipped)`);
    }
  }

  // Design staff → QA accounts (see the header note). A missing account keeps
  // its uid unresolved so the operator sees exactly what did not seed.
  const missing = (key: (typeof ACCOUNT_KEYS)[number]) => {
    if (!uids[key]) console.warn(`  ! WARNING: ${key} account unresolved — data for that role will use "unresolved" uids.`);
    return uids[key] || 'unresolved';
  };
  const ft = missing('fulltimer');
  const tr = missing('trainee');
  const st = missing('student');
  const cm = missing('community');
  const rv = missing('reviewer');

  const STAFF: Record<string, { uid: string; name: string }> = {
    u1: { uid: ft, name: 'Tony Wang' },
    u2: { uid: rv, name: 'Jordan Park' },
    u3: { uid: tr, name: 'Zion Adeyemi' },
    u4: { uid: tr, name: 'Caleb Owusu' },
    u5: { uid: ft, name: 'Priya Raman' },
  };
  const staffUid = (id: string) => STAFF[id]?.uid || 'unresolved';
  const staffName = (id: string) => STAFF[id]?.name || id;

  // Remove docs from earlier seed versions (deterministic id prefixes) so a
  // re-run leaves exactly one coherent dataset. Subcollections go first —
  // Firestore deletes never cascade.
  const OLD_DOC_PREFIXES: Record<string, string[]> = {
    contacts: ['qa-c-'],
    events: ['qa-ev-'],
    stages: ['qa-stage-'],
    gatheringTypes: ['qa-gt-oneonone'],
    prayers: ['qa-pray-'],
    tasks: ['qa-todo-'],
    board_docs: ['qa-board-'],
    board_notes: ['qa-note-'],
    chatRooms: ['qa-room-'],
    outreach: ['qa-outreach-'],
    activities: ['qa-act-'],
  };
  const matchesAny = (id: string, prefixes: string[]) => prefixes.some((p) => id.startsWith(p));
  const deleteSubcollections = async (ref: admin.firestore.DocumentReference, subs: string[]) => {
    for (const sub of subs) {
      const snap = await ref.collection(sub).get();
      await Promise.all(snap.docs.map((s) => s.ref.delete()));
    }
  };
  for (const [coll, prefixes] of Object.entries(OLD_DOC_PREFIXES)) {
    const snap = await db.collection(coll).get();
    const hits = snap.docs.filter((d) => matchesAny(d.id, prefixes));
    for (const d of hits) {
      await deleteSubcollections(d.ref, coll === 'contacts' ? ['interactions', 'comments', 'threads'] : coll === 'events' ? ['rsvps'] : []);
      await d.ref.delete();
    }
    if (hits.length) console.log(`  – removed ${hits.length} stale ${coll} doc(s) from an earlier seed`);
  }
  // The old seed's two deterministic direct rooms between the role accounts.
  for (const [a, b] of [[ft, tr], [ft, st]] as const) {
    if (!a || !b) continue;
    const sorted = [a, b].sort();
    const roomRef = db.collection('chatRooms').doc(`direct_${sorted[0]}_${sorted[1]}`);
    await deleteSubcollections(roomRef, ['messages']);
    await roomRef.delete().catch(() => {});
  }

  // --- Stages taxonomy (the design's journey pipeline) ---
  const stages = [
    { id: 'first', label: 'First Contact', color: '#5c5595', order: 1 },
    { id: 'second', label: 'Second Contact', color: '#b8863f', order: 2 },
    { id: 'regular', label: 'Regular Contact', color: '#3a8292', order: 3 },
    { id: 'church', label: 'Church Meeting', color: '#8a4b5c', order: 4 },
  ];
  for (const s of stages) {
    const { id, ...data } = s;
    await db.collection('stages').doc(id).set(data, { merge: true });
  }
  console.log(`  ✓ ${stages.length} stages`);

  // --- Gathering types taxonomy (design blurb set) ---
  const gatheringTypes = [
    { id: 'qa-gt-weekly', name: 'Weekly Gathering', blurb: 'Friday night, the whole fellowship', order: 1 },
    { id: 'qa-gt-small', name: 'Small Group', blurb: 'A handful, around a table', order: 2 },
    { id: 'qa-gt-outreach', name: 'Outreach', blurb: 'Meeting people where they are', order: 3 },
    { id: 'qa-gt-special', name: 'Special', blurb: 'A one-off worship gathering', order: 4 },
  ];
  for (const g of gatheringTypes) {
    const { id, ...data } = g;
    await db.collection('gatheringTypes').doc(id).set(data, { merge: true });
  }
  console.log(`  ✓ ${gatheringTypes.length} gathering types`);

  // --- Season settings ---
  await db.collection('settings').doc('season').set({ override: null, clubRush: false }, { merge: true });

  // --- Contacts (the design roster + park-outreach people) ---
  type SeedContact = {
    id: string; name: string; year: string; major: string; pronouns: string; hall: string;
    phone: string; email: string; instagram: string; stage: string; joinedDays: number;
    owner: string; lastTouch: number; tags: string[]; notes: string;
    addedBy?: string; reviewed?: boolean; coCreators?: string[];
  };
  const genderOf = (pronouns: string) =>
    pronouns === 'he/him' ? 'Male' : pronouns === 'she/her' ? 'Female' : undefined;

  const contacts: SeedContact[] = [
    { id: 'C-0142', name: 'Emerson Ahn', year: 'Sophomore', major: 'Computer Science', pronouns: 'he/him', hall: 'Whitman Hall', phone: '+1 (614) 555-0142', email: 'emerson.ahn@umail.edu', instagram: '@em.ahn', stage: 'regular', joinedDays: 64, owner: 'u2', lastTouch: 2, tags: ['small-group:tues', 'freshman-week-21'], notes: 'Plays jazz piano. Brother in Korea. Family is Buddhist; warm but cautious.' },
    { id: 'C-0167', name: 'Lila Okwuosa', year: 'Freshman', major: 'Biology', pronouns: 'she/her', hall: 'Ridgewood House', phone: '+1 (313) 555-0167', email: 'lila.okwuosa@umail.edu', instagram: '@lilaokwu', stage: 'second', joinedDays: 18, owner: 'u3', lastTouch: 1, tags: ['welcome-bbq'], notes: 'Met at the welcome BBQ. Asked good questions about who Jesus is.', addedBy: 'u3', reviewed: true },
    { id: 'C-0171', name: 'Rio Marchetti', year: 'Junior', major: 'Economics', pronouns: 'they/them', hall: 'Oak Commons', phone: '+1 (415) 555-0171', email: 'rio.m@umail.edu', instagram: '@riomtti', stage: 'first', joinedDays: 6, owner: 'u3', lastTouch: 3, tags: ['org-fair'], notes: 'Curious. Roommate of Jonas (regular). Coffee scheduled Thurs.', addedBy: 'u3', reviewed: false },
    { id: 'C-0188', name: 'Sade Mensah', year: 'Senior', major: 'Psychology', pronouns: 'she/her', hall: 'off-campus', phone: '+1 (404) 555-0188', email: 'sade.mensah@umail.edu', instagram: '@sade.m', stage: 'church', joinedDays: 412, owner: 'u1', lastTouch: 4, tags: ['leader-track', 'mentor-cohort'], notes: "Leading our Thursday women's group. Strong family church background." },
    { id: 'C-0195', name: 'Jonas Friedrich', year: 'Junior', major: 'Mech. Engineering', pronouns: 'he/him', hall: 'Oak Commons', phone: '+1 (212) 555-0195', email: 'jonas.f@umail.edu', instagram: '@jonasf', stage: 'regular', joinedDays: 196, owner: 'u4', lastTouch: 1, tags: ['small-group:tues', 'intern-team'], notes: "German exchange. Came to faith Spring '25. Wants to lead next year." },
    { id: 'C-0203', name: 'Anika Bose', year: 'Sophomore', major: 'Nursing', pronouns: 'she/her', hall: 'Ridgewood House', phone: '+1 (732) 555-0203', email: 'anika.bose@umail.edu', instagram: '@anikabose', stage: 'regular', joinedDays: 88, owner: 'u4', lastTouch: 0, tags: ['small-group:wed'], notes: 'Dad just had heart surgery. Asking deep questions about suffering.', coCreators: ['u3'] },
    { id: 'C-0208', name: 'Theo Vargas', year: 'Freshman', major: 'Architecture', pronouns: 'he/him', hall: 'Whitman Hall', phone: '+1 (787) 555-0208', email: 'theo.vargas@umail.edu', instagram: '@theovrgs', stage: 'first', joinedDays: 9, owner: 'u2', lastTouch: 6, tags: ['dorm-outreach'], notes: 'Met in dorm lounge. Catholic background. Lapsed.', addedBy: 'u2', reviewed: false },
    { id: 'C-0212', name: 'Mira Tahir', year: 'Junior', major: 'English Lit', pronouns: 'she/her', hall: 'Briarcliff', phone: '+1 (510) 555-0212', email: 'mira.tahir@umail.edu', instagram: '@miraontheroof', stage: 'second', joinedDays: 22, owner: 'u5', lastTouch: 5, tags: ['welcome-bbq'], notes: 'Came from a Muslim family. Has been to two gatherings. Honest.', addedBy: 'u5', reviewed: false, coCreators: ['u3'] },
    { id: 'C-0221', name: 'Wendell Cho', year: 'Senior', major: 'Business', pronouns: 'he/him', hall: 'Stratton Tower', phone: '+1 (646) 555-0221', email: 'wendell.cho@umail.edu', instagram: '@wendelo', stage: 'church', joinedDays: 360, owner: 'u1', lastTouch: 7, tags: ['leader-track'], notes: 'Co-leads Wed small group. Looking at grad programs in Chicago.' },
    { id: 'C-0227', name: 'Beatriz Ferraz', year: 'Sophomore', major: 'Music', pronouns: 'she/her', hall: 'Eastfield Apts', phone: '+1 (305) 555-0227', email: 'beatriz.f@umail.edu', instagram: '@bia.ferraz', stage: 'regular', joinedDays: 110, owner: 'u4', lastTouch: 2, tags: ['worship-team'], notes: 'Plays guitar. Joined worship team last month.' },
    { id: 'C-0234', name: 'Kofi Boateng', year: 'Freshman', major: 'Math', pronouns: 'he/him', hall: 'Whitman Hall', phone: '+1 (281) 555-0234', email: 'kofi.boateng@umail.edu', instagram: '@kofi.b', stage: 'first', joinedDays: 4, owner: 'u3', lastTouch: 2, tags: ['org-fair'], notes: 'Org-fair signup. Said his roommate is asking him about God.', addedBy: 'u3', reviewed: false },
    { id: 'C-0238', name: 'Saoirse Lynch', year: 'Junior', major: 'Linguistics', pronouns: 'she/her', hall: 'Briarcliff', phone: '+1 (617) 555-0238', email: 'saoirse.l@umail.edu', instagram: '@saoirse.l', stage: 'second', joinedDays: 31, owner: 'u5', lastTouch: 8, tags: [], notes: 'Skeptical but kind. Friends with Beatriz.' },
    { id: 'C-0244', name: 'Hugo Delacroix', year: 'Sophomore', major: 'Civil Eng.', pronouns: 'he/him', hall: 'Eastfield Apts', phone: '+1 (713) 555-0244', email: 'hugo.d@umail.edu', instagram: '@hugod', stage: 'regular', joinedDays: 142, owner: 'u2', lastTouch: 1, tags: ['small-group:wed'], notes: 'Quietly steady. Brings food to small group every week.' },
    { id: 'C-0249', name: 'Tomoko Imai', year: 'Freshman', major: 'Sociology', pronouns: 'she/her', hall: 'Ridgewood House', phone: '+1 (818) 555-0249', email: 'tomoko.i@umail.edu', instagram: '@tmkoimai', stage: 'first', joinedDays: 11, owner: 'u4', lastTouch: 5, tags: ['welcome-bbq'], notes: 'Exchange from Osaka. Came to one gathering, was very quiet.', addedBy: 'u4', reviewed: true },
    { id: 'C-0253', name: 'Marcus Holloway', year: 'Senior', major: 'Computer Science', pronouns: 'he/him', hall: 'off-campus', phone: '+1 (213) 555-0253', email: 'marcus.h@umail.edu', instagram: '@m.holloway', stage: 'church', joinedDays: 540, owner: 'u1', lastTouch: 14, tags: ['mentor-cohort'], notes: 'Graduating in May. Looking at jobs in Seattle.' },
    { id: 'C-0257', name: 'Elena Vasquez', year: 'Sophomore', major: 'Psychology', pronouns: 'she/her', hall: 'Whitman Hall', phone: '+1 (520) 555-0257', email: 'elena.v@umail.edu', instagram: '@elenavz', stage: 'second', joinedDays: 26, owner: 'u5', lastTouch: 4, tags: [], notes: "Family church background but hasn't been to church in 3 years." },
    // --- park outreach people ---
    { id: 'C-0601', name: 'Duy Pham', year: 'Sophomore', major: 'Mechanical Engineering', pronouns: '', hall: 'off-campus', phone: '+1 (614) 555-0601', email: '', instagram: '', stage: 'first', joinedDays: 5, owner: 'u1', lastTouch: 3, tags: ['outreach', 'park'], notes: 'Stopped for a Bible, stayed twenty minutes. Grew up going to Mass with his grandmother.', addedBy: 'community', reviewed: false },
    { id: 'C-0602', name: 'Chloe Baptiste', year: 'Freshman', major: 'Nursing', pronouns: '', hall: 'Stratton Tower', phone: '+1 (614) 555-0602', email: '', instagram: '', stage: 'first', joinedDays: 5, owner: 'u3', lastTouch: 5, tags: ['outreach', 'park'], notes: 'Took a booklet on suffering. Her friend died in the spring.', addedBy: 'u3', reviewed: false },
    { id: 'C-0603', name: 'Sam Ortiz', year: 'Junior', major: 'Business', pronouns: '', hall: 'off-campus', phone: '+1 (614) 555-0603', email: '', instagram: '', stage: 'first', joinedDays: 5, owner: 'u1', lastTouch: 5, tags: ['outreach', 'park'], notes: 'Runs the loop most afternoons. Said to catch him there rather than text.', addedBy: 'community', reviewed: false },
    { id: 'C-0604', name: 'Aisha Nur', year: 'Senior', major: 'Public Health', pronouns: '', hall: 'Eastfield Apts', phone: '+1 (614) 555-0604', email: '', instagram: '', stage: 'first', joinedDays: 5, owner: 'u2', lastTouch: 4, tags: ['outreach', 'park'], notes: 'Asked for a Bible in Somali if we can find one.', addedBy: 'u2', reviewed: false },
    { id: 'C-0605', name: 'Grace Wanjiru', year: 'Sophomore', major: 'Statistics', pronouns: '', hall: 'Briarcliff', phone: '+1 (614) 555-0605', email: '', instagram: '', stage: 'first', joinedDays: 34, owner: 'u1', lastTouch: 30, tags: ['outreach', 'park'], notes: 'Came to a Friday gathering two weeks after the park.', addedBy: 'u1', reviewed: false },
    { id: 'C-0606', name: 'Tomas Reyes', year: 'Freshman', major: 'Undeclared', pronouns: '', hall: 'off-campus', phone: '+1 (614) 555-0606', email: '', instagram: '', stage: 'first', joinedDays: 34, owner: 'u1', lastTouch: 34, tags: ['outreach', 'park'], notes: "Gave his number readily. Nobody has rung it.", addedBy: 'community', reviewed: false },
    { id: 'C-0607', name: 'Nadia Halim', year: 'Junior', major: 'Architecture', pronouns: '', hall: 'Oak Commons', phone: '+1 (614) 555-0607', email: '', instagram: '', stage: 'first', joinedDays: 63, owner: 'u5', lastTouch: 51, tags: ['outreach', 'park'], notes: 'Sat with us on the grass for an hour arguing about Genesis.', addedBy: 'u5', reviewed: false },
  ];

  const contactById = (id: string) => contacts.find((c) => c.id === id);

  // The design's deterministic attendance grid (12 sessions × 16 roster people).
  type SessionSeed = { id: string; dow: number; weeksAgo: number; title: string; type: string; location: string };
  const SESSIONS: SessionSeed[] = [
    { id: 'S-1101', dow: 5, weeksAgo: 3, title: 'Friday Gathering', type: 'Weekly Gathering', location: 'Lower Common Room' },
    { id: 'S-1102', dow: 2, weeksAgo: 3, title: 'Tuesday SG', type: 'Small Group', location: 'Whitman Lounge' },
    { id: 'S-1103', dow: 3, weeksAgo: 3, title: 'Wed Women SG', type: 'Small Group', location: 'Briarcliff Common' },
    { id: 'S-1104', dow: 5, weeksAgo: 2, title: 'Friday Gathering', type: 'Weekly Gathering', location: 'Lower Common Room' },
    { id: 'S-1105', dow: 2, weeksAgo: 2, title: 'Tuesday SG', type: 'Small Group', location: 'Whitman Lounge' },
    { id: 'S-1106', dow: 3, weeksAgo: 2, title: 'Wed Women SG', type: 'Small Group', location: 'Briarcliff Common' },
    { id: 'S-1107', dow: 5, weeksAgo: 1, title: 'Friday Gathering', type: 'Weekly Gathering', location: 'Lower Common Room' },
    { id: 'S-1108', dow: 0, weeksAgo: 1, title: 'Worship Night', type: 'Special', location: 'Chapel' },
    { id: 'S-1109', dow: 2, weeksAgo: 1, title: 'Tuesday SG', type: 'Small Group', location: 'Whitman Lounge' },
    { id: 'S-1110', dow: 3, weeksAgo: 1, title: 'Wed Women SG', type: 'Small Group', location: 'Briarcliff Common' },
    { id: 'S-1111', dow: 5, weeksAgo: 0, title: 'Friday Gathering', type: 'Weekly Gathering', location: 'Lower Common Room' },
    { id: 'S-1112', dow: 2, weeksAgo: 0, title: 'Tuesday SG', type: 'Small Group', location: 'Whitman Lounge' },
  ];
  const attendanceFor = (contact: SeedContact, ci: number): Record<string, true | 'absent'> => {
    const out: Record<string, true | 'absent'> = {};
    SESSIONS.forEach((s, si) => {
      const seed = (ci * 13 + si * 7) % 11;
      const baseChance =
        contact.stage === 'church' ? 0.85 : contact.stage === 'regular' ? 0.7 : contact.stage === 'second' ? 0.35 : 0.15;
      const r = ((seed * 977 + ci * 31 + si * 71) % 100) / 100;
      out[s.id] = r < baseChance ? true : 'absent';
    });
    return out;
  };

  for (const [ci, c] of contacts.entries()) {
    const by = c.addedBy || c.owner;
    const gender = genderOf(c.pronouns);
    await db.collection('contacts').doc(c.id).set(
      {
        name: c.name,
        email: c.email,
        phone: c.phone,
        role: 'Student',
        location: c.hall,
        stage: c.stage,
        initials: initialsOf(c.name),
        tags: c.tags,
        pronouns: c.pronouns,
        ...(gender ? { gender } : {}),
        year: c.year,
        major: c.major,
        instagram: c.instagram,
        notes: c.notes,
        lastSeen: c.lastTouch === 0 ? 'Today' : `${c.lastTouch}d ago`,
        reviewed: c.reviewed ?? true,
        hasNewActivity: c.reviewed === false,
        attendance: ci < 16 ? attendanceFor(c, ci) : {},
        createdBy: c.addedBy === 'community' ? cm : staffUid(by),
        createdByName: c.addedBy === 'community' ? 'Philip Nardi' : staffName(by),
        owner: staffUid(c.owner),
        ...(c.addedBy ? { addedBy: c.addedBy === 'community' ? cm : staffUid(c.addedBy) } : {}),
        ...(c.coCreators ? { coCreators: c.coCreators.map(staffUid) } : {}),
        createdAt: iso(c.joinedDays),
        updatedAt: iso(c.joinedDays),
      },
      { merge: true },
    );
  }
  console.log(`  ✓ ${contacts.length} contacts (+attendance grid)`);

  // --- Interactions (design log) + comments + walking-together threads ---
  const interactions = [
    { id: 'I-9001', contactId: 'C-0142', staff: 'u2', type: 'coffee', body: 'Talked about his music. Opened up about brother. I asked if I could pray; he said yes. We prayed for his brother\'s job search.', daysAgo: 2, duration: 60 },
    { id: 'I-9002', contactId: 'C-0142', staff: 'u2', type: 'text', body: "Sent a follow-up about Sunday's talk on hope. He replied with two questions about heaven.", daysAgo: 5, duration: 0 },
    { id: 'I-9003', contactId: 'C-0142', staff: 'u4', type: 'small-group', body: 'Showed up early. Helped Hugo set up. Shared during prayer time about exam stress.', daysAgo: 7, duration: 90 },
    { id: 'I-9004', contactId: 'C-0167', staff: 'u3', type: 'meal', body: "First real conversation. She grew up in Lagos. Asked the hardest question I've gotten this semester: 'why does God let suffering happen?'", daysAgo: 1, duration: 75 },
    { id: 'I-9005', contactId: 'C-0167', staff: 'u3', type: 'text', body: 'Followed up on her question. Shared the Lazarus chapter and the Tim Keller talk on suffering.', daysAgo: 3, duration: 0 },
    { id: 'I-9006', contactId: 'C-0171', staff: 'u3', type: 'phone', body: "Set up coffee for Thursday 3pm at Booker's.", daysAgo: 3, duration: 8 },
    { id: 'I-9007', contactId: 'C-0188', staff: 'u1', type: 'meeting', body: "Reviewed her women's group. Discussed conflict with one member. Prayed together.", daysAgo: 4, duration: 45 },
    { id: 'I-9008', contactId: 'C-0195', staff: 'u4', type: 'small-group', body: 'Led discussion on Romans 8. Walked us through verses 18–25.', daysAgo: 7, duration: 90 },
    { id: 'I-9009', contactId: 'C-0203', staff: 'u4', type: 'phone', body: "She cried for the first part. Mostly listened. Asked if I could pray over the phone; she said yes. We prayed for healing and for her mom's peace.", daysAgo: 0, duration: 35 },
    { id: 'I-9010', contactId: 'C-0208', staff: 'u2', type: 'meet', body: "First conversation. He asked what we do. Mentioned he hasn't been to mass in 2 years.", daysAgo: 6, duration: 25 },
    { id: 'I-9011', contactId: 'C-0212', staff: 'u5', type: 'coffee', body: 'She brought a copy of the Quran and we compared what each text says about Jesus. Honest, long conversation.', daysAgo: 5, duration: 110 },
    { id: 'I-9012', contactId: 'C-0227', staff: 'u4', type: 'rehearsal', body: 'Showed up to practice. Took the lead on the bridge of the second song.', daysAgo: 2, duration: 75 },
    { id: 'I-9013', contactId: 'C-0234', staff: 'u3', type: 'meet', body: 'Quick chat at the table. Took a flyer and signed up.', daysAgo: 4, duration: 8 },
    { id: 'I-9014', contactId: 'C-0238', staff: 'u5', type: 'text', body: "Sent a hello after she missed gathering. She replied she's been busy with midterms.", daysAgo: 8, duration: 0 },
    { id: 'I-9015', contactId: 'C-0244', staff: 'u2', type: 'small-group', body: 'Brought banana bread. Asked the deepest question of the night about prayer.', daysAgo: 1, duration: 90 },
    { id: 'I-9016', contactId: 'C-0249', staff: 'u4', type: 'gathering', body: "Came with Lila. Stayed for the whole thing but didn't speak.", daysAgo: 5, duration: 75 },
    { id: 'I-9017', contactId: 'C-0257', staff: 'u5', type: 'coffee', body: "She said she misses church but can't picture going back to her parents'. We talked about why she left.", daysAgo: 4, duration: 60 },
    // park follow-ups (who actually rang the name on the list)
    { id: 'I-OT601', contactId: 'C-0601', staff: 'u1', type: 'phone', body: 'Followed up on the park.', daysAgo: 3, duration: 20 },
    { id: 'I-OT604', contactId: 'C-0604', staff: 'u2', type: 'phone', body: 'Followed up on the park.', daysAgo: 4, duration: 20 },
    { id: 'I-OT605', contactId: 'C-0605', staff: 'u1', type: 'coffee', body: 'Followed up on the park.', daysAgo: 30, duration: 20 },
    { id: 'I-OT607', contactId: 'C-0607', staff: 'u5', type: 'coffee', body: 'Followed up on the park.', daysAgo: 51, duration: 20 },
  ];
  for (const i of interactions) {
    const { contactId, id, staff, type, body, daysAgo, duration } = i;
    await db.collection('contacts').doc(contactId).collection('interactions').doc(id).set(
      {
        userId: staffUid(staff),
        userName: staffName(staff),
        content: body,
        dateTime: iso(daysAgo),
        type,
        ...(duration > 0 ? { duration: `${duration} min` } : {}),
        createdAt: iso(daysAgo),
      },
      { merge: true },
    );
  }

  const comments = [
    { contactId: 'C-0167', id: 'qa-cmt-lila-1', staff: 'u1', text: 'Bring a book rec next time — she asked for something approachable.', daysAgo: 0 },
    { contactId: 'C-0171', id: 'qa-cmt-rio-1', staff: 'u3', text: "Coffee confirmed for Thursday 3pm at Booker's.", daysAgo: 2 },
  ];
  for (const cmt of comments) {
    const { contactId, id, staff, text, daysAgo } = cmt;
    await db.collection('contacts').doc(contactId).collection('comments').doc(id).set(
      { userId: staffUid(staff), userName: staffName(staff), text, createdAt: iso(daysAgo) },
      { merge: true },
    );
  }

  const threads = [
    { id: 'TH-1', contactId: 'C-0167', interactionId: null, from: 'u1', kind: 'encouragement', body: 'Zion — this is a beautiful first contact. You asked her the realest question of the semester and just listened. Keep going.', at: iso(1), reactions: [{ by: 'u3', emoji: '🙏' }] },
    { id: 'TH-2', contactId: 'C-0167', interactionId: 'I-9004', from: 'u3', kind: 'question', body: 'She asked me why God lets suffering happen and I froze a little. How would you have answered in the moment — or is freezing okay?', at: iso(0, 20), reactions: [] },
    { id: 'TH-3', contactId: 'C-0167', interactionId: 'I-9004', from: 'u1', kind: 'comment', body: 'Freezing is honest — don\'t rush to fix it. Next time try: “I don\'t have a clean answer, but I\'d love to sit in that with you.” Then keep showing up. Slow is faithful.', at: iso(0, 16), reactions: [{ by: 'u3', emoji: '❤️' }] },
    { id: 'TH-4', contactId: 'C-0171', interactionId: null, from: 'u1', kind: 'nudge', body: 'Don\'t forget the Thursday coffee with Rio — want me to come along, or you\'ve got it?', at: iso(0, 6), reactions: [] },
    { id: 'TH-5', contactId: 'C-0234', interactionId: null, from: 'u3', kind: 'note', body: 'Kofi mentioned his roommate keeps asking him about God. Feels like there might be two people to reach here, not one.', at: iso(0, 3), reactions: [] },
    { id: 'TH-T1', contactId: 'C-0167', interactionId: null, from: 'u1', kind: 'comment', scope: 'team', body: "Between us: Lila's questions are further along than her Sunday attendance suggests. I don't want to rush her into a leader track, but she's ready for a real study.", at: iso(1, 6), reactions: [] },
    { id: 'TH-T2', contactId: 'C-0167', interactionId: null, from: 'u2', kind: 'comment', scope: 'team', body: "Agreed. Her roommate situation is the pressure point — if that blows up she'll go quiet for a month. Worth one of us checking in mid-week rather than waiting for the gathering.", at: iso(1, 2), reactions: [{ by: 'u1', emoji: '🙏' }] },
  ] as const;
  for (const t of threads) {
    const { contactId, id, from, ...data } = t;
    await db.collection('contacts').doc(contactId).collection('threads').doc(id).set(
      {
        from: staffUid(from),
        fromName: staffName(from),
        ...data,
        interactionId: data.interactionId,
        reactions: data.reactions.map((r) => ({ by: staffUid(r.by), emoji: r.emoji })),
      },
      { merge: true },
    );
  }
  console.log(`  ✓ ${interactions.length} interactions, ${comments.length} comments, ${threads.length} thread messages`);

  // --- Prayers (design contact prayers + team prayers) + member requests ---
  const PRAYER_ADDED_BY: Record<string, string> = { 'P-3202': 'u3', 'P-3203': 'u5', 'P-3206': 'u3', 'P-3209': 'u4', 'P-3210': 'u2', 'P-3212': 'u5' };
  const prayers = [
    { id: 'P-3201', contactId: 'C-0142', burden: 'Emerson asked us to pray that his older brother Junho finds work this month — the family is under financial strain.', daysAgo: 2, status: 'ongoing' },
    { id: 'P-3202', contactId: 'C-0167', burden: 'Lila is wrestling with why God allows suffering, especially after losing her grandmother last year.', daysAgo: 1, status: 'ongoing' },
    { id: 'P-3203', contactId: 'C-0188', burden: "Sade is navigating tension between two members of her Thursday group. Praying for peace and wisdom.", daysAgo: 4, status: 'ongoing' },
    { id: 'P-3204', contactId: 'C-0195', burden: "Jonas's student visa renewal hearing is in 3 weeks. Praying for favor and clarity.", daysAgo: 11, status: 'answered', answer: 'Approved last Friday. Jonas brought donuts for the whole group.', answeredDaysAgo: 2 },
    { id: 'P-3205', contactId: 'C-0203', burden: "Anika's father came through surgery but recovery is slow. Praying for healing and peace for her mom.", daysAgo: 0, status: 'ongoing' },
    { id: 'P-3206', contactId: 'C-0212', burden: "Mira is reading the Bible and her family doesn't know. Praying for protection and wisdom for her.", daysAgo: 6, status: 'ongoing' },
    { id: 'P-3207', contactId: 'C-0227', burden: 'Beatriz is auditioning for the school symphony.', daysAgo: 14, status: 'answered', answer: 'Made second chair guitar.', answeredDaysAgo: 3 },
    { id: 'P-3208', contactId: 'C-0253', burden: 'Marcus is applying to ML roles in Seattle. Praying for the right placement and a faith-rooted community there.', daysAgo: 9, status: 'ongoing' },
    { id: 'P-3209', contactId: 'C-0257', burden: 'Elena is considering visiting a church next Sunday after 3 years away.', daysAgo: 4, status: 'ongoing' },
    { id: 'P-3210', contactId: 'C-0244', burden: "Hugo asked for prayer for his older sister — they haven't spoken in 8 months.", daysAgo: 8, status: 'ongoing' },
    { id: 'P-3211', contactId: 'C-0142', burden: 'Emerson asked for prayer for calm during midterms — sleep has been rough.', daysAgo: 28, status: 'answered', answer: "He emailed: 'Finished midterms, felt the difference. Thank you.'", answeredDaysAgo: 6 },
    { id: 'P-3212', contactId: 'C-0221', burden: "Wendell weighing whether to accept Northwestern's offer.", daysAgo: 5, status: 'ongoing' },
    // team-wide ministry prayers (anchored to the person they're most about)
    { id: 'TP-401', contactId: 'C-0142', burden: "Pray for the five of us — that we'd be quick to forgive, generous with credit, and honest when we're tired.", daysAgo: 3, status: 'ongoing' },
    { id: 'TP-402', contactId: 'C-0249', burden: 'For the talk Caleb is giving on Psalm 23. For new students to feel welcomed in the first 60 seconds.', daysAgo: 1, status: 'ongoing' },
    { id: 'TP-403', contactId: 'C-0212', burden: "We're short $2,400 on retreat scholarships. Pray for provision in the next two weeks.", daysAgo: 7, status: 'ongoing' },
    { id: 'TP-404', contactId: 'C-0188', burden: 'Sade and Wendell graduate in May. Pray for clarity on who\'s next and how we hand things over.', daysAgo: 11, status: 'answered', answer: "Naomi & Devin both said yes to next year's intern team. Praise God.", answeredDaysAgo: 1 },
  ];
  for (const p of prayers) {
    const { id, contactId, burden, daysAgo, status, answer, answeredDaysAgo } = p;
    const by = PRAYER_ADDED_BY[id] || contactById(contactId)?.owner || 'u1';
    await db.collection('prayers').doc(id).set(
      {
        contactId,
        date: iso(daysAgo),
        burden,
        status,
        prayerPage: true,
        teamPrayer: true,
        ...(answer ? { answer, answeredAt: iso(answeredDaysAgo!) } : {}),
        updatedAt: iso(daysAgo),
        updatedBy: staffUid(by),
        updatedByName: staffName(by),
      },
      { merge: true },
    );
  }

  const prayerRequests = [
    { id: 'qa-pr-1', uid: st, name: 'Timothy Hale', body: 'Midterms this week — pray for focus and rest.', status: 'open', daysAgo: 1 },
    { id: 'qa-pr-2', uid: cm, name: 'Philip Nardi', body: 'My mom is having surgery Friday — please pray.', status: 'open', daysAgo: 2 },
  ];
  for (const r of prayerRequests) {
    const { id, uid, name, body, status, daysAgo } = r;
    await db.collection('prayerRequests').doc(id).set(
      { uid, name, body, status, createdAt: iso(daysAgo), updatedAt: iso(daysAgo) },
      { merge: true },
    );
  }

  // The student persona's own prayer list (the design's "student friends").
  const personalPrayers = [
    { id: 'qa-pp-1', title: 'Pray for Daniel — midterms are wrecking him', daysAgo: 4 },
    { id: 'qa-pp-2', title: "Pray for Grace's grandma, in the hospital back home", daysAgo: 6 },
    { id: 'qa-pp-3', title: 'Pray for Sam — that he actually shows up Friday', daysAgo: 2 },
  ];
  for (const p of personalPrayers) {
    await db.collection('users').doc(st).collection('personalPrayers').doc(p.id).set(
      { title: p.title, contactId: null, date: iso(p.daysAgo), status: 'open' },
      { merge: true },
    );
  }
  console.log(`  ✓ ${prayers.length} prayers, ${prayerRequests.length} prayer requests, ${personalPrayers.length} personal prayers`);

  // --- Gatherings: 5 upcoming events (+RSVPs) and the 12-session history grid ---
  const events = [
    { id: 'E-2001', name: 'Friday Night Gathering', type: 'Weekly Gathering', date: isoDate(2), location: 'Lower Common Room', order: 1, attended: ['C-0142', 'C-0167', 'C-0195', 'C-0203', 'C-0212', 'C-0227', 'C-0244', 'C-0238', 'C-0188', 'C-0221', 'C-0253', 'C-0257', 'C-0249'] },
    { id: 'E-2002', name: 'Tuesday Small Group — Romans', type: 'Small Group', date: isoDate(5), location: 'Whitman Lounge', order: 2, attended: ['C-0142', 'C-0195', 'C-0244'] },
    { id: 'E-2003', name: 'Wednesday Small Group — Women', type: 'Small Group', date: isoDate(6), location: 'Briarcliff Common', order: 3, attended: ['C-0203', 'C-0244', 'C-0188', 'C-0212'] },
    { id: 'E-2004', name: 'Coffee Outreach @ Boardwalk', type: 'Outreach', date: isoDate(8), location: 'Boardwalk Coffee', order: 4, attended: [] },
    { id: 'E-2005', name: 'Worship Night', type: 'Special', date: isoDate(14), location: 'Chapel', order: 5, attended: [] },
  ];
  for (const e of events) {
    const { id, attended, ...data } = e;
    await db.collection('events').doc(id).set({ ...data, createdAt: iso(1) }, { merge: true });
    for (const contactId of attended) {
      const c = contactById(contactId);
      if (!c) continue;
      await db.collection('events').doc(id).collection('rsvps').doc(contactId).set(
        { uid: contactId, name: c.name, status: 'going', createdAt: ts },
        { merge: true },
      );
    }
    if (id === 'E-2001') {
      await db.collection('events').doc(id).collection('rsvps').doc(st).set(
        { uid: st, name: 'Timothy Hale', status: 'going', createdAt: ts },
        { merge: true },
      );
    }
  }
  for (const [i, s] of SESSIONS.entries()) {
    await db.collection('events').doc(s.id).set(
      { name: s.title, date: sessionDate(s.dow, s.weeksAgo), order: 10 + i, type: s.type, location: s.location, createdAt: iso(40) },
      { merge: true },
    );
  }
  console.log(`  ✓ ${events.length} upcoming events (+RSVPs), ${SESSIONS.length} attendance sessions`);

  // --- To-dos (design Board "what we're holding" + contact follow-ups) ---
  const todos = [
    { id: 'TD-1', title: 'Confirm the Friday setlist with Beatriz', assignee: 'u4', by: 'u1', createdHoursAgo: 20, dueDays: 1, done: false, contactId: 'C-0227', docId: 'BD-wed', docTitle: 'Wednesday Women\'s Group' },
    { id: 'TD-2', title: 'Re-invite Tomoko and two org-fair names before Friday', assignee: 'u3', by: 'u1', createdHoursAgo: 19, dueDays: 1, done: false, contactId: 'C-0249', docId: 'BD-wed', docTitle: 'Wednesday Women\'s Group' },
    { id: 'TD-3', title: 'Draft the retreat partial-aid plan for Monday', assignee: 'u1', by: 'u1', createdHoursAgo: 18, dueDays: 4, done: false, contactId: null, docId: 'BD-wed', docTitle: 'Wednesday Women\'s Group' },
    { id: 'TD-4', title: 'On the door with Zion, welcoming new faces', assignee: 'u1', by: 'u5', createdHoursAgo: 8, dueDays: 2, done: false, contactId: null, docId: 'BD-fri', docTitle: 'Friday Night — run of show' },
    { id: 'TD-5', title: 'Charge the speaker and test the mic by 6:00', assignee: 'u4', by: 'u5', createdHoursAgo: 7, dueDays: 2, done: false, contactId: null, docId: 'BD-fri', docTitle: 'Friday Night — run of show' },
    { id: 'TD-6', title: 'Set up coffee with Mira this week', assignee: 'u2', by: 'u5', createdHoursAgo: 30, dueDays: 3, done: false, contactId: 'C-0212', docId: 'BD-wed', docTitle: 'Wednesday Women\'s Group' },
    { id: 'TD-7', title: 'Send the retreat info email to the whole group', assignee: 'u2', by: 'u1', createdDaysAgo: 1, dueDays: 0, done: true, contactId: null, docId: 'BD-wed', docTitle: 'Wednesday Women\'s Group' },
    { id: 'TD-8', title: 'Refresh the printed prayer list before Thursday', assignee: 'u5', by: 'u1', createdHoursAgo: 16, dueDays: 1, done: false, contactId: null, docId: 'BD-wed', docTitle: 'Wednesday Women\'s Group' },
    { id: 'T-501', title: 'Follow up with Rio Marchetti before Thursday coffee', assignee: 'u3', by: 'u1', createdDaysAgo: 3, dueDays: 1, done: false, contactId: 'C-0171', docId: null, docTitle: null },
    { id: 'T-505', title: "Pray with Anika before her dad's check-up", assignee: 'u4', by: 'u1', createdDaysAgo: 2, dueDays: -1, done: false, contactId: 'C-0203', docId: null, docTitle: null },
  ];
  for (const t of todos) {
    const { id, title, assignee, by, dueDays, done, contactId, docId, docTitle } = t;
    await db.collection('tasks').doc(id).set(
      {
        title,
        assigneeId: staffUid(assignee),
        dueDate: isoDate(dueDays),
        status: done ? 'completed' : 'pending',
        contactId,
        contactName: contactId ? contactById(contactId)?.name ?? null : null,
        createdById: staffUid(by),
        createdByName: staffName(by),
        priority: 'medium',
        sourceInteractionId: null,
        sourceDocId: docId,
        sourceDocTitle: docTitle,
        createdAt: 'createdDaysAgo' in t ? iso(t.createdDaysAgo as number) : iso(0, t.createdHoursAgo as number),
      },
      { merge: true },
    );
  }
  console.log(`  ✓ ${todos.length} to-dos`);

  // --- Board pages (design weekly docs, renamed to the persona voices) ---
  const boardDocs = [
    {
      id: 'BD-mon', audience: 'team', date: isoDate(-4), title: 'Monday kickoff — week 9', facilitator: 'u3', place: 'Faculty Coffee Room', time: '8:00 AM',
      md: `# Monday kickoff — week 9
**8:00 AM · Faculty Coffee Room · Zion leading**

## Where the weekend landed

Fourteen names off the org fair — Kofi and three others are already in our orbit, so those four get a coffee invite, not a gathering invite. Smaller ask, realer conversation.

- [x] Zion — pull together the org-fair name list
- [x] Zion — book the Boardwalk table for the 20th
- [ ] Re-invite Tomoko before Friday

## Coffee outreach at the Boardwalk

Booked for the **20th**, Zion hosting. Keep it to first contacts — save the big room for the second time we see someone.

## Carried into Wednesday

> Greeters for Friday — we keep losing first-timers at the door. Lock two names before the weekend.
`,
    },
    {
      id: 'BD-tue', audience: 'trainees', date: isoDate(-3), title: 'Tuesday Romans — small group', facilitator: 'u4', place: 'Whitman Lounge', time: '7:30 PM',
      md: `# Tuesday Romans — small group
**7:30 PM · Whitman Lounge · Caleb leading**

Walked **Romans 8:18–25** together. A quieter night than usual, in a good way.

## What we noticed

- Emerson opened up about exam stress for the first time — keep it going, don't crowd him.
- Midterm week is heavy on everyone. A lighter content week next Tuesday — more space to just talk.

## Who's holding what

- [x] Caleb — text Emerson a follow-up on Sunday's talk
- [x] Caleb — tidy the Romans notes for the shared drive
- [ ] Decide who co-leads next Tuesday so Caleb's free for the door Friday

> Slow is faithful. When someone asks an honest question, sitting in it builds more trust than a clean answer ever does.
`,
    },
    {
      id: 'BD-wed', audience: 'team', date: isoDate(-2), title: 'Wednesday Women\'s Group', facilitator: 'u1', place: 'Briarcliff Common', time: '8:00 PM',
      md: `# Wednesday Women's Group
**8:00 PM · Briarcliff Common · Tony leading**

## To talk through

- [ ] Greeters for Friday — lock two names *(carried from Monday)*
- [ ] Who co-leads Tuesday so Caleb's free for the door *(carried from Tuesday)*
- [ ] Anika's dad is post-op — how's the family, and who checks in this week?
- [ ] Mira's honest questions — go slow, keep meeting her for coffee
- [ ] Retreat scholarships are still **$2,400 short** — decide a partial-aid plan
- [ ] Re-invite Tomoko and two org-fair names before Friday

## Who's holding what

- [ ] Zion — pick up name tags and visitor cards for Friday
- [ ] Priya — refresh the printed prayer list before Thursday
- [x] Jordan — send the retreat info email to the whole group

## A line to hold onto

> The first sixty seconds decide whether a new face comes back. Greeters before flyers, every time.
`,
    },
    {
      id: 'BD-thu', audience: 'trainees', date: isoDate(-1), title: 'Prayer time — a quick page', facilitator: 'u5', place: 'Faculty Coffee Room', time: '8:00 AM',
      md: `# Prayer time — a quick page
**8:00 AM · Faculty Coffee Room · Priya leading**

Just the five of us, fifteen minutes before the day starts. No agenda — only what we're each holding.

- Anika's family, through her dad's recovery
- Mira's questions, and the patience to go slow
- The retreat shortfall, and the students it might keep home

> Nothing important should live in one person's inbox — least of all the things we're praying for.
`,
    },
    {
      id: 'BD-fri', audience: 'everyone', date: isoDate(0), title: 'Friday Night — run of show', facilitator: 'u5', place: 'Lower Common Room', time: '7:00 PM',
      md: `# Friday Night — run of show
**7:00 PM · Lower Common Room · Priya leading**

## The shape of the night

1. Doors open 6:40 — greeters in place first
2. Worship 7:00
3. Caleb's talk on **Psalm 23** 7:25
4. Small groups 7:55
5. Snacks till 9:00

## The first sixty seconds

Make every new face feel met before anything else happens.

- [ ] Priya — lead the welcome and first-timer hand-offs
- [ ] Tony — on the door with Zion for new faces
- [ ] Caleb — final read-through of the Psalm 23 talk
- [ ] Pray over the night together before doors open

## Setup

- [ ] Caleb — charge the speaker and test the mic by 6:00
- [ ] Zion — set out coffee and snacks
`,
    },
    {
      id: 'BD-fri8', audience: 'everyone', date: isoDate(-7), title: 'Friday Night — week 8', facilitator: 'u5', place: 'Lower Common Room', time: '7:00 PM',
      md: `# Friday Night — week 8
**7:00 PM · Lower Common Room · Priya leading**

Best turnout of the term — and the welcome table was the difference. Two students who'd only ever waved in passing stayed the whole night because someone met them at the door.

## What worked

- Greeters before flyers. Again.
- Naming people out loud when they arrived.

## What to fix

- We ran out of name tags by 7:15 — order more for next week.
- The talk ran long; protect the small-group time.
`,
    },
    {
      id: 'BD-mon8', audience: 'team', date: isoDate(-11), title: 'Monday kickoff — week 8', facilitator: 'u3', place: 'Faculty Coffee Room', time: '8:00 AM',
      md: `# Monday kickoff — week 8
**8:00 AM · Faculty Coffee Room · Zion leading**

Set the rhythm for the week. Quieter outreach week with midterms landing — lean on the relationships we already have rather than chasing new contacts.

- [x] Confirm the Boardwalk table date
- [x] Check in with the small-group leaders before Tuesday
- [ ] Start the retreat scholarship list early this year
`,
    },
  ];
  for (const d of boardDocs) {
    const { id, facilitator, ...data } = d;
    await db.collection('board_docs').doc(id).set(
      {
        ...data,
        facilitatorId: staffUid(facilitator),
        createdBy: ft,
        createdByName: staffName('u1'),
        updatedBy: ft,
        updatedByName: staffName('u1'),
        createdAt: ts,
        updatedAt: ts,
      },
      { merge: true },
    );
  }

  const boardNotes = [
    { id: 'BN-fri-now', type: 'record', series: 'Friday Gathering', title: 'Friday Night — run of show', tags: ['run-of-show', 'welcome'], body: 'Doors 6:40, worship 7:00, talk 7:25, small groups 7:55, snacks till 9. Two extra greeters needed for first-timers. Caleb on Psalm 23.', date: isoDate(-2), contributors: ['u4', 'u5', 'u1'] },
    { id: 'BN-mon', type: 'record', series: 'Outreach', title: 'Monday kickoff — week 9', tags: ['org-fair', 'boardwalk'], body: '14 names from the org fair; Kofi and three already in our orbit. Boardwalk table booked for the 20th, Zion hosting. First contacts get a coffee invite, not a gathering invite.', date: isoDate(-4), contributors: ['u1', 'u3', 'u2'], sessionId: 'BD-mon' },
    { id: 'BN-tue', type: 'record', series: 'Small Groups', title: 'Tuesday Romans — group notes', tags: ['romans', 'care'], body: 'Walked verses 18–25. Emerson shared about exam stress for the first time. Lighter content next week given midterms — more space to just talk.', date: isoDate(-3), contributors: ['u4', 'u1'], sessionId: 'BD-tue' },
    { id: 'BN-fri-yr', type: 'learning', series: 'Friday Gathering', title: 'The first 60 seconds decide whether someone comes back', tags: ['welcome', 'gatherings'], body: 'We watched new faces all last spring. Students who got a real, unhurried hello in their first minute came back far more often. Greeters beat flyers, every time — staff this before anything else.', date: isoDate(-370), contributors: ['u1', 'u4'] },
    { id: 'BN-out-yr', type: 'learning', series: 'Outreach', title: 'Coffee beats events for a first contact', tags: ['outreach', 'first-contact'], body: 'A one-on-one coffee converted better than inviting someone straight to a gathering. Smaller ask, realer conversation. Save the big room for second contact.', date: isoDate(-380), contributors: ['u3'] },
    { id: 'BN-sg-yr', type: 'learning', series: 'Small Groups', title: 'Don\'t rush the hard questions', tags: ['discipleship'], body: 'When Mira asked about suffering, the pull was to answer fast. Sitting in it across two coffees built more trust than any clean answer would have. Slow is faithful.', date: isoDate(-400), contributors: ['u5'] },
    { id: 'BN-ret-yr', type: 'record', series: 'Retreat', title: 'Spring retreat — last year\'s logistics', tags: ['retreat', 'rooming', 'transport'], body: 'Cabins May 30–June 1, two vans + one parent driver. Scholarship list closed two weeks out — leaving it later caused the scramble. Reuse the rooming sheet; it worked.', date: isoDate(-372), contributors: ['u1', 'u2', 'u3'] },
    { id: 'BN-team-yr', type: 'learning', series: 'Team', title: 'Hand things off a semester early', tags: ['leadership', 'hand-off'], body: 'Every spring we scramble because seniors leave in May. Naming next year\'s leaders in the fall — and letting them shadow — made the hand-off calm instead of frantic.', date: isoDate(-450), contributors: ['u1', 'u2', 'u4'] },
  ];
  for (const n of boardNotes) {
    const { id, contributors, ...data } = n;
    await db.collection('board_notes').doc(id).set(
      {
        ...data,
        contributorIds: contributors.map(staffUid),
        createdBy: ft,
        createdByName: staffName('u1'),
        updatedBy: ft,
        updatedByName: staffName('u1'),
        createdAt: ts,
        updatedAt: ts,
      },
      { merge: true },
    );
  }
  console.log(`  ✓ ${boardDocs.length} board pages, ${boardNotes.length} board notes`);

  // --- Chat rooms + messages (the design's conversations, mapped to accounts) ---
  const rooms = [
    { id: 'M-4', type: 'group', name: 'Team prayer', members: ['u1', 'u2', 'u3', 'u4', 'u5'] },
    { id: 'M-5', type: 'announcement', name: 'Fall Retreat sign-ups', members: ['u1', 'u2', 'u3', 'u4', 'u5'] },
    { id: 'M-6', type: 'announcement', name: 'Friday Night Gathering', members: ['u1', 'u2', 'u3', 'u4', 'u5', 'student', 'community'] },
    { id: 'M-7', type: 'direct', name: null, members: ['community', 'u3'] },
    { id: 'M-8', type: 'direct', name: null, members: ['student', 'u2'] },
  ] as const;
  const uidOf = (persona: string) =>
    persona === 'student' ? st : persona === 'community' ? cm : staffUid(persona);
  const nameOf = (persona: string) =>
    persona === 'student' ? 'Timothy Hale' : persona === 'community' ? 'Philip Nardi' : staffName(persona);

  for (const r of rooms) {
    const memberIds = [...new Set(r.members.map(uidOf))];
    const first = r.members[0];
    await db.collection('chatRooms').doc(r.id).set(
      {
        type: r.type,
        ...(r.name ? { name: r.name } : {}),
        memberIds,
        createdById: uidOf(first),
        createdByName: nameOf(first),
        createdAt: iso(10),
      },
      { merge: true },
    );
  }

  const messages = [
    { roomId: 'M-4', id: 'm-4-1', from: 'u5', text: 'Praying for Anika\'s family this week — her dad\'s follow-up appointment is Thursday.', daysAgo: 3 },
    { roomId: 'M-4', id: 'm-4-2', from: 'u1', text: 'Thank you for holding that, Priya. Keep us posted.', daysAgo: 3 },
    { roomId: 'M-4', id: 'm-4-3', from: 'u2', text: 'Also heads up — Theo mentioned he hasn\'t been to mass in two years. Gentle territory, might take some of us a bit to earn trust there.', daysAgo: 2 },
    { roomId: 'M-4', id: 'm-4-4', from: 'u4', text: 'Good flag, thank you. I\'ll keep an eye out for him at small group.', daysAgo: 2 },
    { roomId: 'M-4', id: 'm-4-5', from: 'u3', text: 'Org fair follow-ups are trickling in — 3 new signups this week, all pretty cold contacts so go slow', hoursAgo: 10 },
    { roomId: 'M-4', id: 'm-4-6', from: 'u1', text: 'Great work this week, all of you. Truly.', hoursAgo: 3 },
    { roomId: 'M-5', id: 'm-5-1', from: 'u1', text: 'Retreat sign-ups close this Sunday — if you\'ve got students on the fence, now\'s the week to ask them in person. Link\'s in the usual spot.', daysAgo: 2, reactions: [{ by: 'u2', emoji: '🙏' }, { by: 'u4', emoji: '🙌' }] },
    { roomId: 'M-6', id: 'm-6-1', from: 'u1', text: 'This Friday, 7:00 in the Lower Common Room — worship, a short talk, and dinner after. Bring a friend, we\'d love to meet them 💛', daysAgo: 1, reactions: [{ by: 'student', emoji: '🙏' }, { by: 'u3', emoji: '❤️' }, { by: 'community', emoji: '🙌' }] },
    { roomId: 'M-7', id: 'm-7-1', from: 'community', text: 'Hi Zion! We\'d love to have a few students over for dinner again this month — any faces you think would enjoy it?', daysAgo: 5 },
    { roomId: 'M-7', id: 'm-7-2', from: 'u3', text: 'This means so much, thank you. I\'ll ask Kofi and Rio — both pretty new and could use a warm table.', daysAgo: 4 },
    { roomId: 'M-7', id: 'm-7-3', from: 'community', text: 'Wonderful. Does the 14th work? We\'ll do the usual 6:30.', daysAgo: 1 },
    { roomId: 'M-8', id: 'm-8-1', from: 'student', text: 'hey Jordan, random question — is there a way to see just the gatherings I\'m actually signed up for? I keep scrolling past stuff', daysAgo: 2 },
    { roomId: 'M-8', id: 'm-8-2', from: 'u2', text: 'Good callout, I\'ll pass it along. For now Friday Nights are the standing one — anything else usually gets a direct invite like this 🙂', daysAgo: 2 },
    { roomId: 'M-8', id: 'm-8-3', from: 'student', text: 'makes sense, thank you!', daysAgo: 2 },
  ];
  for (const m of messages) {
    const { roomId, id, from, text, reactions = [] } = m;
    await db.collection('chatRooms').doc(roomId).collection('messages').doc(id).set(
      {
        roomId,
        text,
        senderId: uidOf(from),
        senderName: nameOf(from),
        senderPhoto: '',
        timestamp: 'hoursAgo' in m ? iso(0, m.hoursAgo as number) : iso(m.daysAgo as number),
        type: 'text',
        attachments: [],
        reactions: reactions.map((r) => ({ by: uidOf(r.by), emoji: r.emoji })),
      },
      { merge: true },
    );
  }
  console.log(`  ✓ ${rooms.length} chat rooms, ${messages.length} messages`);

  // --- Visits (design log, with the app's mirrored card interactions) ---
  const visits = [
    { id: 'V-3001', daysAgo: 1, contactIds: ['C-0203'], went: ['u1', 'u3'], where: 'Ridgewood House, room 214', purpose: 'Her dad\'s surgery — wanted to be in the room, not on the phone.', how: 'Her roommate let us in. Anika had just come off a call with her mum and was holding it together for everyone else. We mostly listened. She cried once, apologised for it, and we told her she didn\'t have to. Prayed before we left; she asked us to pray for her mum rather than her dad.', followUp: 'Ask after her mum on Friday' },
    { id: 'V-3002', daysAgo: 3, contactIds: ['C-0208', 'C-0234'], went: ['u1', 'u2'], where: 'Whitman Hall, 4th floor lounge', purpose: 'Dorm round — both new, neither has been back since the org fair.', how: 'Caught Theo coming out of the lift, and Kofi came down when Theo texted him. An hour in the lounge over instant noodles. Theo talked about his grandmother\'s church in San Juan; Kofi asked, out of nowhere, what we actually believe happens when you die.', followUp: '' },
    { id: 'V-3003', daysAgo: 6, contactIds: ['C-0142'], went: ['u1', 'u4'], where: 'Whitman Hall, room 118', purpose: 'He\'s been quiet for two weeks.', how: 'Not quiet — buried. Two midterms and a recital. He played us the piece he\'s working on. We didn\'t push anything, just stayed 40 minutes and left him with food.', followUp: '' },
    { id: 'V-3004', daysAgo: 9, contactIds: ['C-0212'], went: ['u5', 'u3'], where: 'Briarcliff, flat 6', purpose: 'She invited us — first time.', how: 'Mira cooked. Her flatmates ate with us and stayed for the whole conversation. She was honest about how her family would take it if she kept coming, and asked us not to text her at home over the break.', followUp: 'Don\'t text over break — wait for her' },
    { id: 'V-3005', daysAgo: 13, contactIds: ['C-0249'], went: ['u1', 'u4'], where: 'Ridgewood House, room 302', purpose: 'Came once, then nothing.', how: 'Shy, but she\'d made tea before we arrived, which told us more than the conversation did. Homesick for Osaka. Said the gathering was \'very loud\' — fair. Invited her to Tuesday small group instead.', followUp: 'Walk her to Tuesday small group' },
    { id: 'V-3006', daysAgo: 17, contactIds: ['C-0195', 'C-0171'], went: ['u2', 'u4'], where: 'Oak Commons, flat 3', purpose: 'Jonas asked us round to meet his roommate properly.', how: 'Rio cooked half of it. They argue about everything and clearly love each other. Rio asked hard questions for an hour and Jonas let them, which was the whole point of going.', followUp: '' },
    { id: 'V-3007', daysAgo: 24, contactIds: ['C-0238'], went: ['u5', 'u1'], where: 'Briarcliff, flat 11', purpose: 'Beatriz thought she\'d say yes to us coming, and she did.', how: 'Saoirse is a careful thinker and doesn\'t want to be handled. We said as much and she relaxed. An hour on whether suffering means anything. No conclusions, and she said she\'d rather that than a tidy answer.', followUp: '' },
  ];
  for (const v of visits) {
    const { id, daysAgo, contactIds, went, where, purpose, how, followUp } = v;
    const date = isoDate(-daysAgo);
    const author = STAFF[went[0]];
    await db.collection('visits').doc(id).set(
      {
        date,
        contactIds,
        contactNames: contactIds.map((cid) => contactById(cid)?.name ?? cid),
        went: went.map(staffUid),
        wentNames: went.map(staffName),
        where,
        purpose,
        how,
        followUp,
        followUpTaskId: null,
        prayerId: null,
        prayerBurden: null,
        photos: [],
        createdAt: iso(daysAgo),
        createdById: author.uid,
        createdByName: author.name,
        updatedAt: iso(daysAgo),
        updatedBy: author.uid,
        updatedByName: author.name,
      },
      { merge: true },
    );
    for (const contactId of contactIds) {
      const content = `Visited at ${where} — ${how}`;
      await db.collection('contacts').doc(contactId).collection('interactions').doc(`visit_${id}`).set(
        {
          userId: author.uid,
          userName: author.name,
          content,
          dateTime: `${date}T12:00:00.000Z`,
          type: 'visit',
          createdAt: iso(daysAgo),
        },
        { merge: true },
      );
    }
  }
  console.log(`  ✓ ${visits.length} visits (+mirrored interactions)`);

  // --- Outreach records (design park log) ---
  const outreaches = [
    {
      id: 'OT-4001', daysAgo: 5, where: 'Cedar Park — the north lawn', went: ['u1', 'u2', 'u3', 'community'], others: 8,
      handed: { bibles: 34, tracts: 120, booklets: 26 },
      how: 'Warmest afternoon we\'ve had out there. We set the table up by the path rather than the bandstand and it made all the difference — people walked into us instead of past us. Philip preached twice, about twenty minutes each, and both times a handful stayed afterwards to argue and ask.\n\nThe Bibles went faster than we expected; we were out by four. Two of the students who stopped had been given a booklet at the org fair in the spring and recognised us.',
      names: [
        { id: 'ON-1', name: 'Duy Pham', contact: '+1 (614) 555-0601', spokeWith: 'community', note: 'Wants a Bible in Vietnamese for his mum.', contactId: 'C-0601' },
        { id: 'ON-2', name: 'Chloe Baptiste', contact: '+1 (614) 555-0602', spokeWith: 'u3', note: 'Took the booklet on suffering. Lost a friend in the spring.', contactId: 'C-0602' },
        { id: 'ON-3', name: 'Sam Ortiz', contact: '+1 (614) 555-0603', spokeWith: 'community', note: 'Said to catch him on the loop rather than text.', contactId: 'C-0603' },
        { id: 'ON-4', name: 'Aisha Nur', contact: 'aisha.nur@umail.edu', spokeWith: 'u2', note: 'Asked for a Bible in Somali.', contactId: 'C-0604' },
      ],
    },
    {
      id: 'OT-4002', daysAgo: 34, where: 'Cedar Park — by the bandstand', went: ['u1', 'u5', 'community'], others: 11,
      handed: { bibles: 22, tracts: 90, booklets: 15 },
      how: 'Quieter month. The bandstand looks like the right spot and isn\'t — nobody has a reason to come near it. We stayed two hours and gave out less than half of what we brought.\n\nOne long conversation made the afternoon: a groundskeeper who has watched us come back every month and finally asked why.',
      names: [
        { id: 'ON-5', name: 'Grace Wanjiru', contact: '+1 (614) 555-0605', spokeWith: 'u1', note: 'Asked when the Friday thing is.', contactId: 'C-0605' },
        { id: 'ON-6', name: 'Tomas Reyes', contact: '+1 (614) 555-0606', spokeWith: 'community', note: 'Gave his number without being asked.', contactId: 'C-0606' },
      ],
    },
    {
      id: 'OT-4003', daysAgo: 63, where: 'Riverside Park — the west gate', went: ['u5', 'u4', 'community'], others: 6,
      handed: { bibles: 9, tracts: 40, booklets: 8 },
      how: 'Rain from one o\'clock. We handed out what we could keep dry, prayed under the shelter with the six of us who\'d come, and went home early. Worth writing down that it happened.',
      names: [
        { id: 'ON-7', name: 'Nadia Halim', contact: '+1 (614) 555-0607', spokeWith: 'u5', note: 'Sat under the shelter with us for an hour.', contactId: 'C-0607' },
      ],
    },
  ];
  for (const o of outreaches) {
    const { id, daysAgo, went, names, ...data } = o;
    await db.collection('outreach').doc(id).set(
      {
        ...data,
        date: isoDate(-daysAgo),
        went: went.map(uidOf),
        photoCount: 0,
        names: names.map((n) => ({ ...n, spokeWith: uidOf(n.spokeWith), takenBy: null })),
        createdById: ft,
        createdByName: staffName('u1'),
        createdAt: iso(daysAgo),
      },
      { merge: true },
    );
  }
  console.log(`  ✓ ${outreaches.length} outreach records`);

  // --- Activity feed (the design's edit log) ---
  const activities = [
    { id: 'L-9201', at: iso(0, 0.5), staff: 'u4', action: 'moved a contact', contactId: 'C-0203', detail: 'Note: family update logged.' },
    { id: 'L-9202', at: iso(0, 2), staff: 'u3', action: 'created a prayer for', contactId: 'C-0167', detail: 'Added prayer request: \'Wisdom on suffering\'.' },
    { id: 'L-9203', at: iso(0, 3.5), staff: 'u3', action: 'logged an interaction for', contactId: 'C-0167', detail: 'Lunch at dining hall — 75 min.' },
    { id: 'L-9204', at: iso(0, 6), staff: 'u2', action: 'updated a field for', contactId: 'C-0142', detail: 'Phone changed: ***-***-0142 → +1 (614) 555-0142.' },
    { id: 'L-9205', at: iso(0, 9), staff: 'u3', action: 'created a new contact', contactId: 'C-0234', detail: 'Kofi Boateng signed up via Org Fair public form.' },
    { id: 'L-9206', at: iso(0, 22), staff: 'u1', action: 'moved contact to stage "Church Meeting"', contactId: 'C-0195', detail: 'Stage changed: Regular → Church Meeting.' },
    { id: 'L-9207', at: iso(1, 4), staff: 'u5', action: 'marked a prayer answered', contactId: 'C-0195', detail: 'Prayer P-3204 (Visa renewal) marked answered.' },
    { id: 'L-9208', at: iso(1, 7), staff: 'u4', action: 'logged attendance for', contactId: null, targetName: 'Friday Gathering', detail: 'Friday Gathering — 13 contacts marked present.' },
    { id: 'L-9209', at: iso(2, 1), staff: 'u2', action: 'updated notes for', contactId: 'C-0208', detail: 'Notes updated (+34 chars).' },
    { id: 'L-9210', at: iso(2, 6), staff: 'u5', action: 'created a prayer for', contactId: 'C-0212', detail: 'Added prayer request: \'Family relationships\'.' },
    { id: 'L-9211', at: iso(3, 2), staff: 'u4', action: 'moved contact to stage "Regular Contact"', contactId: 'C-0227', detail: 'Stage changed: Second → Regular.' },
    { id: 'L-9212', at: iso(3, 5), staff: 'u3', action: 'logged an interaction for', contactId: 'C-0171', detail: 'Phone call — 8 min.' },
    { id: 'L-9213', at: iso(4, 1), staff: 'u1', action: 'created an event', contactId: null, targetName: 'Worship Night', detail: 'Created event: Worship Night (May 17).' },
    { id: 'L-9214', at: iso(4, 5), staff: 'u5', action: 'logged an interaction for', contactId: 'C-0212', detail: 'Coffee — 110 min.' },
  ];
  for (const a of activities) {
    const { id, at, staff, action, contactId, detail } = a;
    await db.collection('activities').doc(id).set(
      {
        userId: staffUid(staff),
        userName: staffName(staff),
        action,
        targetId: contactId ?? '',
        targetName: contactId ? contactById(contactId)?.name ?? '' : a.targetName ?? '',
        targetType: contactId ? 'contact' : 'event',
        description: detail,
        type: action.includes('created') ? 'create' : 'edit',
        createdAt: at,
        userPhoto: '',
      },
      { merge: true },
    );
  }
  console.log(`  ✓ ${activities.length} activity entries`);

  // --- Notifications ---
  const notifications = [
    { id: 'qa-notif-1', userId: tr, title: 'Contact Created', message: 'Successfully added Kofi Boateng to your directory.', type: 'success' },
    { id: 'qa-notif-2', userId: tr, title: 'New assignment', message: 'Tony assigned you: Re-invite Tomoko and two org-fair names before Friday.', type: 'assignment' },
    { id: 'qa-notif-3', userId: ft, title: 'New trainee activity', message: 'Zion added Kofi Boateng.', type: 'info' },
  ];
  for (const n of notifications) {
    const { id, ...data } = n;
    await db.collection('notifications').doc(id).set({ ...data, read: false, createdAt: iso(0) }, { merge: true });
  }
  console.log(`  ✓ ${notifications.length} notifications`);

  // --- Webhook console (the design's API log) ---
  const webhookLogs = [
    { id: 'lg1', source: 'siri', result: 'Parsed “Met Sara at Campus Coffee…” → created Sara Doe', status: 'success', at: iso(0, 0.4), payload: '{\n  "text": "Met Sarah Doe yesterday at Campus Coffee. Freshman, biology. sarah12@campus.edu, (555) 789-0123. Interested in study group.",\n  "source": "ios-shortcut"\n}' },
    { id: 'lg2', source: 'sms', result: 'Twilio inbound → logged interaction for Jerry Doe', status: 'success', at: iso(0, 2.1), payload: '{\n  "From": "+15550192",\n  "Body": "!add interaction Jerry Doe and I studied Romans today, prayed together.",\n  "MessageSid": "SM3f9a…"\n}' },
    { id: 'lg3', source: 'groupme', result: '!add contact Jerry Doe → merged with existing card', status: 'success', at: iso(0, 6), payload: '{\n  "text": "!add contact Jerry Doe is a sophomore majoring in history, phone 555-0192, met at cafeteria.",\n  "name": "Zion A.",\n  "group_id": "104xxxx"\n}' },
    { id: 'lg4', source: 'whatsapp', result: 'Couldn\'t find a name to parse — nothing created', status: 'error', at: iso(1), error: 'no_name_detected — include a first and last name, e.g. “Met Jordan Lee…”.', payload: '{\n  "text": "interested in fridays!!",\n  "source": "whatsapp"\n}' },
    { id: 'lg5', source: 'sms', result: 'Rejected — Twilio signature did not validate', status: 'error', at: iso(2), error: 'invalid_signature', payload: '{\n  "From": "+15550000",\n  "Body": "!add contact test",\n  "X-Twilio-Signature": "(missing)"\n}' },
  ];
  for (const l of webhookLogs) {
    const { id, at, ...data } = l;
    await db.collection('webhook_logs').doc(id).set({ ...data, timestamp: at, headers: '{}' }, { merge: true });
  }
  console.log(`  ✓ ${webhookLogs.length} webhook log entries`);

  console.log('\nQA seeding complete. Accounts (from e2e/.test-credentials.json):');
  console.log(`  reviewer  ${credsFile?.reviewer?.email ?? '—'} (${credsFile?.reviewer?.role ?? 'admin'})  → ${PERSONA_NAMES.reviewer}  uid=${rv}`);
  console.log(`  fulltimer ${credsFile?.fulltimer?.email ?? '—'} (${credsFile?.fulltimer?.role ?? 'admin'})  → ${PERSONA_NAMES.fulltimer}  uid=${ft}`);
  console.log(`  trainee   ${credsFile?.trainee?.email ?? '—'} (${credsFile?.trainee?.role ?? 'manager'})  → ${PERSONA_NAMES.trainee}  uid=${tr}`);
  console.log(`  student   ${credsFile?.student?.email ?? '—'} (${credsFile?.student?.role ?? 'operator'})  → ${PERSONA_NAMES.student}  uid=${st}`);
  console.log(`  community ${credsFile?.community?.email ?? '—'} (${credsFile?.community?.role ?? 'viewer'})  → ${PERSONA_NAMES.community}  uid=${cm}`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('QA seed failed:', err);
    process.exit(1);
  });
