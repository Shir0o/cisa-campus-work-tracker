/**
 * One-time seed for the QA Firestore database (`qa-db`).
 *
 * Populates a realistic, self-contained dataset so a reviewer can exercise the
 * mobile app end-to-end without touching production data. Seeds:
 *
 *   • approved /users docs for the real role accounts (cisa-* + the reviewer,
 *     read from the gitignored e2e/.test-credentials.json — never created here)
 *   • the stages + gatheringTypes taxonomies + season settings
 *   • ~10 contacts (with interactions, comments, and walking-together threads)
 *   • prayers + member prayer requests
 *   • gathering events + RSVPs
 *   • chat rooms (announcement / group / direct) with messages
 *   • to-dos, notifications, activities
 *   • coordination-notes board pages + notes archive
 *   • an outreach record
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
 * e2e/.test-credentials.example.json). Override the target database with
 * FIRESTORE_DATABASE_ID=… (default `qa-db`). Idempotent — deterministic doc
 * ids, safe to re-run.
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

/** ISO timestamp `daysAgo` days and `hoursAgo` hours in the past. */
const iso = (daysAgo: number, hoursAgo = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(d.getHours() - hoursAgo);
  return d.toISOString();
};

/** YYYY-MM-DD `daysAgo` days in the future (positive) or past (negative). */
const isoDate = (daysFromNow: number) => {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  return d.toISOString().slice(0, 10);
};

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
      await db.collection('users').doc(user.uid).set(
        {
          email: entry.email,
          displayName: entry.label || user.displayName || entry.email.split('@')[0],
          photoURL: user.photoURL || '',
          role: entry.role,
          approved: true,
          createdAt: ts,
          updatedAt: ts,
        },
        { merge: true },
      );
      console.log(`  ✓ ${key.padEnd(10)} ${entry.email} (${entry.role})`);
    } catch {
      console.log(`  – ${key}: ${entry.email} has no Auth account yet (skipped — create it first, then re-run)`);
    }
  }

  // Extra reviewer accounts (QA_REVIEWER_EMAILS=comma-separated, default the
  // project owner) get an approved ADMIN doc so they can explore everything
  // with their own Google account. Idempotent — never demotes an existing doc.
  const reviewerEmails = (
    process.env.QA_REVIEWER_EMAILS || 'yilongwang05@gmail.com'
  )
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  for (const email of reviewerEmails) {
    try {
      const user = await auth.getUserByEmail(email);
      await db.collection('users').doc(user.uid).set(
        {
          email,
          displayName: user.displayName || email.split('@')[0],
          photoURL: user.photoURL || '',
          role: 'admin',
          approved: true,
          createdAt: ts,
          updatedAt: ts,
        },
        { merge: true },
      );
      console.log(`  ✓ reviewer admin ${email} (uid=${user.uid})`);
    } catch {
      console.log(`  – reviewer ${email} has no Auth account yet (skipped)`);
    }
  }

  const ft = uids.fulltimer;
  const tr = uids.trainee;
  const st = uids.student;
  const cm = uids.community;
  const ftName = credsFile?.fulltimer?.label || 'Full-timer';
  const trName = credsFile?.trainee?.label || 'Trainee';
  const stName = credsFile?.student?.label || 'Student';
  const cmName = credsFile?.community?.label || 'Community';

  // --- Stages taxonomy (People → Journey pipeline) ---
  const stages = [
    { id: 'qa-stage-lead', label: 'Lead', color: '#5c5595', order: 1 },
    { id: 'qa-stage-first', label: 'First Contact', color: '#3f7d6a', order: 2 },
    { id: 'qa-stage-followup', label: 'Follow-up', color: '#b8863f', order: 3 },
    { id: 'qa-stage-growing', label: 'Growing', color: '#3a6ea5', order: 4 },
    { id: 'qa-stage-community', label: 'In Community', color: '#8a4b5c', order: 5 },
  ];
  for (const s of stages) {
    const { id, ...data } = s;
    await db.collection('stages').doc(id).set(data, { merge: true });
  }
  console.log(`  ✓ ${stages.length} stages`);

  // --- Gathering types taxonomy ---
  const gatheringTypes = [
    { id: 'qa-gt-weekly', name: 'Weekly Gathering', blurb: 'Our big Friday-night together', order: 1 },
    { id: 'qa-gt-small', name: 'Small Group', blurb: 'A few friends, a living room', order: 2 },
    { id: 'qa-gt-oneonone', name: 'One-on-one', blurb: 'Coffee or a walk, just two', order: 3 },
    { id: 'qa-gt-outreach', name: 'Outreach', blurb: 'Out in the neighborhood', order: 4 },
  ];
  for (const g of gatheringTypes) {
    const { id, ...data } = g;
    await db.collection('gatheringTypes').doc(id).set(data, { merge: true });
  }
  console.log(`  ✓ ${gatheringTypes.length} gathering types`);

  // --- Season settings ---
  await db.collection('settings').doc('season').set({ override: null, clubRush: true }, { merge: true });

  // --- Contacts (varied pipeline) ---
  const contacts = [
    { id: 'qa-c-lila', name: 'Lila Okwuosa', email: 'lila.okwuosa@umail.edu', role: 'Student', stage: 'Growing', tags: ['seeking', 'coffee'], gender: 'Female', year: 'Sophomore', major: 'Biology', spiritualBackground: 'Curious about faith', notes: 'Asked hard questions about suffering — go slow.', by: tr, byName: trName, daysAgo: 18, reviewed: true },
    { id: 'qa-c-rio', name: 'Rio Marchetti', email: 'rio.marchetti@umail.edu', role: 'Student', stage: 'First Contact', tags: ['outreach-fair'], gender: 'Male', year: 'Freshman', major: 'Engineering', spiritualBackground: 'Grew up church-adjacent', notes: 'Coffee Thursday 3pm.', by: tr, byName: trName, daysAgo: 6, reviewed: false },
    { id: 'qa-c-kofi', name: 'Kofi Boateng', email: 'kofi.boateng@umail.edu', role: 'Student', stage: 'Lead', tags: ['roommate'], gender: 'Male', year: 'Junior', major: 'Economics', spiritualBackground: 'Open, hasn’t read the Bible', notes: 'His roommate keeps asking him about God.', by: tr, byName: trName, daysAgo: 4, reviewed: false },
    { id: 'qa-c-naomi', name: 'Naomi Park', email: 'naomi.park@umail.edu', role: 'Student', stage: 'Follow-up', tags: ['prayer'], gender: 'Female', year: 'Senior', major: 'Nursing', spiritualBackground: 'Believer, new to campus', notes: 'Looking for a small group.', by: ft, byName: ftName, daysAgo: 12, reviewed: true },
    { id: 'qa-c-tomoko', name: 'Tomoko Sato', email: 'tomoko.sato@umail.edu', role: 'Student', stage: 'First Contact', tags: ['org-fair'], gender: 'Female', year: 'Freshman', major: 'Art', spiritualBackground: 'Buddhist family', notes: 'Re-invite before Friday.', by: st, byName: stName, daysAgo: 3, reviewed: false },
    { id: 'qa-c-caleb', name: 'Caleb Mensah', email: 'caleb.mensah@umail.edu', role: 'Student', stage: 'In Community', tags: ['leader'], gender: 'Male', year: 'Senior', major: 'Theology', spiritualBackground: 'Strong believer', notes: 'Helping with worship team.', by: ft, byName: ftName, daysAgo: 40, reviewed: true },
    { id: 'qa-c-mira', name: 'Mira Iqbal', email: 'mira.iqbal@umail.edu', role: 'Student', stage: 'Growing', tags: ['coffee', 'seeking'], gender: 'Female', year: 'Sophomore', major: 'Political Science', spiritualBackground: 'Honest questions', notes: 'Keep meeting for coffee.', by: ft, byName: ftName, daysAgo: 21, reviewed: true },
    { id: 'qa-c-jamal', name: 'Jamal Carter', email: 'jamal.carter@umail.edu', role: 'Student', stage: 'Lead', tags: ['basketball'], gender: 'Male', year: 'Junior', major: 'Kinesiology', spiritualBackground: 'Unknown', notes: 'Met at open gym.', by: st, byName: stName, daysAgo: 2, reviewed: false },
  ];
  for (const c of contacts) {
    const { id, name, email, role, stage, tags, gender, year, major, spiritualBackground, notes, by, byName, daysAgo, reviewed } = c;
    const initials = name.split(' ').map((p) => p[0]).join('').toUpperCase();
    await db.collection('contacts').doc(id).set(
      {
        name,
        email,
        phone: '',
        role,
        location: 'Campus',
        stage,
        initials,
        tags,
        gender,
        year,
        major,
        spiritualBackground,
        notes,
        lastSeen: `${daysAgo}d ago`,
        reviewed,
        hasNewActivity: !reviewed,
        attendance: {},
        createdBy: by,
        createdByName: byName,
        createdAt: iso(daysAgo),
        updatedAt: iso(daysAgo),
      },
      { merge: true },
    );
  }
  console.log(`  ✓ ${contacts.length} contacts`);

  // --- Interactions + comments + walking-together threads ---
  const interactions = [
    { contactId: 'qa-c-lila', id: 'qa-int-lila-1', userId: tr, userName: trName, content: 'First real conversation over lunch. She asked the hardest question: why does God let suffering happen?', daysAgo: 1 },
    { contactId: 'qa-c-lila', id: 'qa-int-lila-2', userId: ft, userName: ftName, content: 'Followed up over coffee — she opened up about family stress.', daysAgo: 0 },
    { contactId: 'qa-c-rio', id: 'qa-int-rio-1', userId: tr, userName: trName, content: 'Phone call — set up coffee for Thursday 3pm.', daysAgo: 3 },
    { contactId: 'qa-c-naomi', id: 'qa-int-naomi-1', userId: ft, userName: ftName, content: 'Introduced her to the Friday small group leaders.', daysAgo: 5 },
  ];
  for (const i of interactions) {
    const { contactId, id, userId, userName, content, daysAgo } = i;
    await db.collection('contacts').doc(contactId).collection('interactions').doc(id).set(
      { userId, userName, content, dateTime: iso(daysAgo), type: 'conversation', createdAt: iso(daysAgo) },
      { merge: true },
    );
  }

  const comments = [
    { contactId: 'qa-c-lila', id: 'qa-cmt-lila-1', userId: ft, userName: ftName, text: 'Bring a book rec next time — she asked for something approachable.', daysAgo: 0 },
    { contactId: 'qa-c-rio', id: 'qa-cmt-rio-1', userId: tr, userName: trName, text: 'Reminder set for Thursday coffee.', daysAgo: 2 },
  ];
  for (const cmt of comments) {
    const { contactId, id, userId, userName, text, daysAgo } = cmt;
    await db.collection('contacts').doc(contactId).collection('comments').doc(id).set(
      { userId, userName, text, createdAt: iso(daysAgo) },
      { merge: true },
    );
  }

  const threads = [
    { contactId: 'qa-c-lila', id: 'qa-th-1', from: ft, kind: 'encouragement', body: 'This is a beautiful first contact — you asked the realest question and just listened. Keep going.', at: iso(1), reactions: [{ by: tr, emoji: '🙏' }] },
    { contactId: 'qa-c-lila', id: 'qa-th-2', from: tr, kind: 'question', body: 'She asked me why God lets suffering happen and I froze. How would you have answered in the moment?', at: iso(0, 20), reactions: [] },
    { contactId: 'qa-c-lila', id: 'qa-th-3', from: ft, kind: 'comment', body: 'Freezing is honest — don’t rush to fix it. Try: “I don’t have a clean answer, but I’d love to sit in that with you.”', at: iso(0, 16), reactions: [{ by: tr, emoji: '❤️' }] },
    { contactId: 'qa-c-rio', id: 'qa-th-4', from: ft, kind: 'nudge', body: 'Don’t forget Thursday coffee with Rio — want me to come along, or you’ve got it?', at: iso(0, 6), reactions: [] },
    { contactId: 'qa-c-kofi', id: 'qa-th-5', from: tr, kind: 'note', body: 'Kofi mentioned his roommate keeps asking him about God — feels like two people to reach.', at: iso(0, 3), reactions: [] },
  ];
  for (const t of threads) {
    const { contactId, id, ...data } = t;
    await db.collection('contacts').doc(contactId).collection('threads').doc(id).set(data, { merge: true });
  }
  console.log(`  ✓ ${interactions.length} interactions, ${comments.length} comments, ${threads.length} thread messages`);

  // --- Prayers + prayer requests ---
  const prayers = [
    { id: 'qa-pray-lila', contactId: 'qa-c-lila', burden: 'For Lila — wrestling with the problem of suffering.', status: 'ongoing' },
    { id: 'qa-pray-naomi', contactId: 'qa-c-naomi', burden: 'For Naomi — settle into a small group and make friends.', status: 'pending' },
    { id: 'qa-pray-rio', contactId: 'qa-c-rio', burden: 'For Rio — the Thursday coffee conversation.', status: 'answered', answer: 'He opened up and is coming to Friday night.' },
  ];
  for (const p of prayers) {
    const { id, contactId, burden, status, answer } = p;
    await db.collection('prayers').doc(id).set(
      {
        contactId,
        date: iso(2),
        burden,
        status,
        prayerPage: true,
        teamPrayer: true,
        ...(answer ? { answer, answeredAt: iso(1) } : {}),
        updatedAt: iso(1),
        updatedBy: ft,
        updatedByName: ftName,
      },
      { merge: true },
    );
  }

  const prayerRequests = [
    { id: 'qa-pr-1', uid: st, name: stName, body: 'Midterms this week — pray for focus and rest.', status: 'open', daysAgo: 1 },
    { id: 'qa-pr-2', uid: cm, name: cmName, body: 'My mom is having surgery Friday — please pray.', status: 'open', daysAgo: 2 },
  ];
  for (const r of prayerRequests) {
    const { id, uid, name, body, status, daysAgo } = r;
    await db.collection('prayerRequests').doc(id).set(
      { uid, name, body, status, createdAt: iso(daysAgo), updatedAt: iso(daysAgo) },
      { merge: true },
    );
  }
  console.log(`  ✓ ${prayers.length} prayers, ${prayerRequests.length} prayer requests`);

  // --- Gathering events + RSVPs ---
  const events = [
    { id: 'qa-ev-fri', name: 'Friday Night Gathering', date: isoDate(2), order: 1, type: 'Weekly Gathering', location: 'Lower Common Room' },
    { id: 'qa-ev-small', name: 'Small Group — Men', date: isoDate(4), order: 2, type: 'Small Group', location: 'Briarcliff Common' },
    { id: 'qa-ev-coffee', name: 'New Student Coffee', date: isoDate(1), order: 3, type: 'One-on-one', location: 'Campus Café' },
  ];
  for (const e of events) {
    const { id, ...data } = e;
    await db.collection('events').doc(id).set({ ...data, createdAt: iso(1) }, { merge: true });
  }
  for (const [eventId, uid, name] of [
    ['qa-ev-fri', st, stName],
    ['qa-ev-fri', cm, cmName],
    ['qa-ev-small', ft, ftName],
  ] as const) {
    await db.collection('events').doc(eventId).collection('rsvps').doc(uid).set(
      { uid, name, status: 'going', createdAt: ts },
      { merge: true },
    );
  }
  console.log(`  ✓ ${events.length} events (+RSVPs)`);

  // --- Chat rooms + messages ---
  const announcementId = 'qa-room-announcements';
  const groupId = 'qa-room-team';
  const directFtTr = `direct_${[ft, tr].sort()[0]}_${[ft, tr].sort()[1]}`;
  const directFtSt = `direct_${[ft, st].sort()[0]}_${[ft, st].sort()[1]}`;

  const rooms = [
    { id: announcementId, type: 'announcement', name: 'Announcements', memberIds: [ft, tr, st, cm], createdById: ft, createdByName: ftName },
    { id: groupId, type: 'group', name: 'Staff', memberIds: [ft, tr], createdById: ft, createdByName: ftName },
    { id: directFtTr, type: 'direct', memberIds: [ft, tr], createdById: ft, createdByName: ftName },
    { id: directFtSt, type: 'direct', memberIds: [ft, st], createdById: ft, createdByName: ftName },
  ];
  for (const r of rooms) {
    const { id, ...data } = r;
    await db.collection('chatRooms').doc(id).set({ ...data, createdAt: iso(10) }, { merge: true });
  }

  const messages: { roomId: string; id: string; senderId: string; senderName: string; text: string; daysAgo: number }[] = [
    { roomId: announcementId, id: 'qa-msg-a1', senderId: ft, senderName: ftName, text: 'Friday Night is on — doors 6:40, worship 7:00. See you there!', daysAgo: 1 },
    { roomId: announcementId, id: 'qa-msg-a2', senderId: ft, senderName: ftName, text: 'Bring a friend — this week we’re talking through Psalm 23.', daysAgo: 1 },
    { roomId: groupId, id: 'qa-msg-g1', senderId: ft, senderName: ftName, text: 'Staff huddle moved to Tuesday 8pm.', daysAgo: 2 },
    { roomId: groupId, id: 'qa-msg-g2', senderId: tr, senderName: trName, text: 'Works for me — I’ll bring the follow-up list.', daysAgo: 2 },
    { roomId: directFtTr, id: 'qa-msg-d1', senderId: tr, senderName: trName, text: 'Coffee with Rio is confirmed for Thursday 3pm.', daysAgo: 2 },
    { roomId: directFtTr, id: 'qa-msg-d2', senderId: ft, senderName: ftName, text: 'Great — I can join if you want backup.', daysAgo: 1 },
    { roomId: directFtSt, id: 'qa-msg-e1', senderId: st, senderName: stName, text: 'Met Jamal at open gym — got his number.', daysAgo: 1 },
  ];
  for (const m of messages) {
    const { roomId, id, senderId, senderName, text, daysAgo } = m;
    await db.collection('chatRooms').doc(roomId).collection('messages').doc(id).set(
      { roomId, text, senderId, senderName, senderPhoto: '', timestamp: iso(daysAgo), type: 'text', attachments: [] },
      { merge: true },
    );
  }
  console.log(`  ✓ ${rooms.length} chat rooms, ${messages.length} messages`);

  // --- To-dos ---
  const todos = [
    { id: 'qa-todo-1', title: 'Ring Tomoko to re-invite before Friday', assigneeId: tr, dueDate: iso(-1), status: 'pending', contactId: 'qa-c-tomoko', contactName: 'Tomoko Sato', createdById: ft, createdByName: ftName },
    { id: 'qa-todo-2', title: 'Follow up with Jamal after open gym', assigneeId: st, dueDate: iso(-2), status: 'pending', contactId: 'qa-c-jamal', contactName: 'Jamal Carter', createdById: ft, createdByName: ftName },
    { id: 'qa-todo-3', title: 'Draft partial-aid retreat scholarships', assigneeId: ft, dueDate: iso(-3), status: 'pending', contactId: null, contactName: null, createdById: ft, createdByName: ftName },
    { id: 'qa-todo-4', title: 'Send Lila a book rec', assigneeId: tr, dueDate: iso(2), status: 'completed', contactId: 'qa-c-lila', contactName: 'Lila Okwuosa', createdById: ft, createdByName: ftName },
  ];
  for (const t of todos) {
    const { id, ...data } = t;
    await db.collection('tasks').doc(id).set(
      { ...data, priority: 'medium', sourceInteractionId: null, sourceDocId: null, sourceDocTitle: null, createdAt: iso(3) },
      { merge: true },
    );
  }
  console.log(`  ✓ ${todos.length} to-dos`);

  // --- Notifications ---
  const notifications = [
    { id: 'qa-notif-1', userId: tr, title: 'Contact Created', message: 'Successfully added Rio Marchetti to your directory.', type: 'success' },
    { id: 'qa-notif-2', userId: tr, title: 'New assignment', message: 'Your full-timer assigned you: Ring Tomoko.', type: 'assignment' },
    { id: 'qa-notif-3', userId: ft, title: 'New trainee activity', message: `${trName} added Kofi Boateng.`, type: 'info' },
  ];
  for (const n of notifications) {
    const { id, ...data } = n;
    await db.collection('notifications').doc(id).set({ ...data, read: false, createdAt: iso(0) }, { merge: true });
  }
  console.log(`  ✓ ${notifications.length} notifications`);

  // --- Coordination notes board pages + archive ---
  const boardDocs = [
    { id: 'qa-board-team', audience: 'team', date: isoDate(0), title: 'Wednesday care — who checks in', md: '# Wednesday care — who checks in\n\n**8:00 PM · Briarcliff Common**\n\nPastoral, team-only.\n\n- [ ] Anika’s dad is post-op — Caleb to check in Thursday\n- [ ] Mira’s honest questions — go slow\n- [x] Retreat scholarships: draft a partial-aid plan' },
    { id: 'qa-board-trainees', audience: 'trainees', date: isoDate(-1), title: 'Trainee huddle — following up well', md: '# Trainee huddle — following up well\n\n- A coffee invite beats a gathering invite for a first contact.\n- Log the conversation the same day.\n- [ ] Re-invite Tomoko before Friday' },
    { id: 'qa-board-everyone', audience: 'everyone', date: isoDate(-2), title: 'Friday Night — what’s happening', md: '# Friday Night Gathering\n\n**7:00 PM · Lower Common Room**\n\n- Doors 6:40, worship 7:00, talk 7:25, small groups 7:55\n- Snacks till 9\n- Caleb’s talking on Psalm 23' },
  ];
  for (const d of boardDocs) {
    const { id, ...data } = d;
    await db.collection('board_docs').doc(id).set(
      { ...data, facilitatorId: ft, createdBy: ft, createdByName: ftName, updatedBy: ft, updatedByName: ftName, createdAt: ts, updatedAt: ts },
      { merge: true },
    );
  }

  const boardNotes = [
    { id: 'qa-note-record', type: 'record', series: 'Friday Gathering', title: 'Friday Night — run of show', body: 'Doors 6:40, worship 7:00, talk 7:25, small groups 7:55, snacks till 9. Two extra greeters needed.', tags: ['run-of-show', 'welcome'] },
    { id: 'qa-note-learning', type: 'learning', series: 'Outreach', title: 'Coffee beats events for a first contact', body: 'A one-on-one coffee converted better than inviting someone straight to a gathering.', tags: ['outreach', 'first-contact'] },
  ];
  for (const n of boardNotes) {
    const { id, ...data } = n;
    await db.collection('board_notes').doc(id).set(
      { ...data, date: isoDate(0), contributorIds: [ft], createdBy: ft, createdByName: ftName, updatedBy: ft, updatedByName: ftName, createdAt: ts, updatedAt: ts },
      { merge: true },
    );
  }
  console.log(`  ✓ ${boardDocs.length} board pages, ${boardNotes.length} board notes`);

  // --- Outreach record ---
  await db.collection('outreach').doc('qa-outreach-1').set(
    {
      date: isoDate(-7),
      where: 'Miller Hall plaza',
      went: [ft, cm],
      others: 3,
      handed: { bibles: 6, tracts: 20, booklets: 12 },
      how: 'Sunny afternoon — steady foot traffic.',
      photoCount: 2,
      names: [
        { id: 'qa-on-1', name: 'Jordan Lee', contact: 'jordan.lee@umail.edu', spokeWith: ft, note: 'Interested in the Friday night.', contactId: null, takenBy: tr },
        { id: 'qa-on-2', name: 'Aisha Bello', contact: '555-0142', spokeWith: cm, note: 'Wants prayer for exams.', contactId: null, takenBy: null },
      ],
      createdById: ft,
      createdByName: ftName,
      createdAt: iso(7),
    },
    { merge: true },
  );
  console.log('  ✓ 1 outreach record');

  // --- Activity feed ---
  const activities = [
    { id: 'qa-act-1', userId: tr, userName: trName, action: 'created a new contact', targetId: 'qa-c-rio', targetName: 'Rio Marchetti', targetType: 'contact', type: 'create', daysAgo: 2 },
    { id: 'qa-act-2', userId: ft, userName: ftName, action: 'moved contact to stage "Growing"', targetId: 'qa-c-lila', targetName: 'Lila Okwuosa', targetType: 'contact', type: 'edit', daysAgo: 1 },
    { id: 'qa-act-3', userId: tr, userName: trName, action: 'updated a prayer for', targetId: 'qa-c-lila', targetName: 'Lila Okwuosa', targetType: 'contact', type: 'edit', daysAgo: 0 },
  ];
  for (const a of activities) {
    const { id, daysAgo, ...data } = a;
    await db.collection('activities').doc(id).set({ ...data, createdAt: iso(daysAgo), userPhoto: '' }, { merge: true });
  }
  console.log(`  ✓ ${activities.length} activity entries`);

  console.log('\nQA seeding complete. Accounts (from e2e/.test-credentials.json):');
  console.log(`  reviewer  ${credsFile?.reviewer?.email ?? '—'} (${credsFile?.reviewer?.role ?? 'admin'})  uid=${uids.reviewer ?? '—'}`);
  console.log(`  fulltimer ${credsFile?.fulltimer?.email ?? '—'} (${credsFile?.fulltimer?.role ?? 'admin'})  uid=${ft ?? '—'}`);
  console.log(`  trainee   ${credsFile?.trainee?.email ?? '—'} (${credsFile?.trainee?.role ?? 'manager'})  uid=${tr ?? '—'}`);
  console.log(`  student   ${credsFile?.student?.email ?? '—'} (${credsFile?.student?.role ?? 'operator'})  uid=${st ?? '—'}`);
  console.log(`  community ${credsFile?.community?.email ?? '—'} (${credsFile?.community?.role ?? 'viewer'})  uid=${cm ?? '—'}`);
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('QA seed failed:', err);
    process.exit(1);
  });
