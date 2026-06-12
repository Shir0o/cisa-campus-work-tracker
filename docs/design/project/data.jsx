// Mock data for CISA Campus Tracker
// All names are fictional.

const STAGES = [
  { id: "first", name: "First Contact", tone: "accent", desc: "Just met. Got their info or first chat." },
  { id: "second", name: "Second Contact", tone: "amber", desc: "Followed up, met for coffee or texted." },
  { id: "regular", name: "Regular Contact", tone: "teal", desc: "In our orbit weekly. Coming to gatherings." },
  { id: "church", name: "Church Meeting", tone: "violet", desc: "Joining a church community." },
];

const STAGE_BY_ID = Object.fromEntries(STAGES.map(s => [s.id, s]));

const STAFF = [
  { id: "u1", name: "Mei Tanaka", initials: "MT", role: "Campus Director" },
  { id: "u2", name: "Jordan Park", initials: "JP", role: "Discipleship Lead" },
  { id: "u3", name: "Ana Beltrán", initials: "AB", role: "Outreach" },
  { id: "u4", name: "Caleb Owusu", initials: "CO", role: "Small Group Lead" },
  { id: "u5", name: "Priya Raman", initials: "PR", role: "Prayer Coordinator" },
];

const MAJORS = ["Computer Science", "Biology", "Economics", "Mech. Engineering", "Psychology", "English Lit", "Business", "Architecture", "Music", "Math", "Nursing", "Linguistics", "Civil Eng.", "Sociology"];

const HALLS = ["Whitman Hall", "Ridgewood House", "Oak Commons", "Eastfield Apts", "Briarcliff", "Stratton Tower", "off-campus"];

const CONTACTS = [
  { id: "C-0142", name: "Emerson Ahn", year: "Sophomore", major: "Computer Science", pronouns: "he/him", hall: "Whitman Hall", phone: "+1 (614) 555-0142", email: "emerson.ahn@umail.edu", instagram: "@em.ahn", stage: "regular", joinedDays: 64, owner: "u2", lastTouch: 2, tags: ["small-group:tues", "freshman-week-21"], notes: "Plays jazz piano. Brother in Korea. Family is Buddhist; warm but cautious." },
  { id: "C-0167", name: "Lila Okwuosa", year: "Freshman", major: "Biology", pronouns: "she/her", hall: "Ridgewood House", phone: "+1 (313) 555-0167", email: "lila.okwuosa@umail.edu", instagram: "@lilaokwu", stage: "second", joinedDays: 18, owner: "u3", lastTouch: 1, tags: ["welcome-bbq"], notes: "Met at the welcome BBQ. Asked good questions about who Jesus is." },
  { id: "C-0171", name: "Rio Marchetti", year: "Junior", major: "Economics", pronouns: "they/them", hall: "Oak Commons", phone: "+1 (415) 555-0171", email: "rio.m@umail.edu", instagram: "@riomtti", stage: "first", joinedDays: 6, owner: "u3", lastTouch: 3, tags: ["org-fair"], notes: "Curious. Roommate of Jonas (regular). Coffee scheduled Thurs." },
  { id: "C-0188", name: "Sade Mensah", year: "Senior", major: "Psychology", pronouns: "she/her", hall: "off-campus", phone: "+1 (404) 555-0188", email: "sade.mensah@umail.edu", instagram: "@sade.m", stage: "church", joinedDays: 412, owner: "u1", lastTouch: 4, tags: ["leader-track", "mentor-cohort"], notes: "Leading our Thursday women's group. Strong family church background." },
  { id: "C-0195", name: "Jonas Friedrich", year: "Junior", major: "Mech. Engineering", pronouns: "he/him", hall: "Oak Commons", phone: "+1 (212) 555-0195", email: "jonas.f@umail.edu", instagram: "@jonasf", stage: "regular", joinedDays: 196, owner: "u4", lastTouch: 1, tags: ["small-group:tues", "intern-team"], notes: "German exchange. Came to faith Spring '25. Wants to lead next year." },
  { id: "C-0203", name: "Anika Bose", year: "Sophomore", major: "Nursing", pronouns: "she/her", hall: "Ridgewood House", phone: "+1 (732) 555-0203", email: "anika.bose@umail.edu", instagram: "@anikabose", stage: "regular", joinedDays: 88, owner: "u4", lastTouch: 0, tags: ["small-group:wed"], notes: "Dad just had heart surgery. Asking deep questions about suffering." },
  { id: "C-0208", name: "Theo Vargas", year: "Freshman", major: "Architecture", pronouns: "he/him", hall: "Whitman Hall", phone: "+1 (787) 555-0208", email: "theo.vargas@umail.edu", instagram: "@theovrgs", stage: "first", joinedDays: 9, owner: "u2", lastTouch: 6, tags: ["dorm-outreach"], notes: "Met in dorm lounge. Catholic background. Lapsed." },
  { id: "C-0212", name: "Mira Tahir", year: "Junior", major: "English Lit", pronouns: "she/her", hall: "Briarcliff", phone: "+1 (510) 555-0212", email: "mira.tahir@umail.edu", instagram: "@miraontheroof", stage: "second", joinedDays: 22, owner: "u5", lastTouch: 5, tags: ["welcome-bbq"], notes: "Came from a Muslim family. Has been to two gatherings. Honest." },
  { id: "C-0221", name: "Wendell Cho", year: "Senior", major: "Business", pronouns: "he/him", hall: "Stratton Tower", phone: "+1 (646) 555-0221", email: "wendell.cho@umail.edu", instagram: "@wendelo", stage: "church", joinedDays: 360, owner: "u1", lastTouch: 7, tags: ["leader-track"], notes: "Co-leads Wed small group. Looking at grad programs in Chicago." },
  { id: "C-0227", name: "Beatriz Ferraz", year: "Sophomore", major: "Music", pronouns: "she/her", hall: "Eastfield Apts", phone: "+1 (305) 555-0227", email: "beatriz.f@umail.edu", instagram: "@bia.ferraz", stage: "regular", joinedDays: 110, owner: "u4", lastTouch: 2, tags: ["worship-team"], notes: "Plays guitar. Joined worship team last month." },
  { id: "C-0234", name: "Kofi Boateng", year: "Freshman", major: "Math", pronouns: "he/him", hall: "Whitman Hall", phone: "+1 (281) 555-0234", email: "kofi.boateng@umail.edu", instagram: "@kofi.b", stage: "first", joinedDays: 4, owner: "u3", lastTouch: 2, tags: ["org-fair"], notes: "Org-fair signup. Said his roommate is asking him about God." },
  { id: "C-0238", name: "Saoirse Lynch", year: "Junior", major: "Linguistics", pronouns: "she/her", hall: "Briarcliff", phone: "+1 (617) 555-0238", email: "saoirse.l@umail.edu", instagram: "@saoirse.l", stage: "second", joinedDays: 31, owner: "u5", lastTouch: 8, tags: [], notes: "Skeptical but kind. Friends with Beatriz." },
  { id: "C-0244", name: "Hugo Delacroix", year: "Sophomore", major: "Civil Eng.", pronouns: "he/him", hall: "Eastfield Apts", phone: "+1 (713) 555-0244", email: "hugo.d@umail.edu", instagram: "@hugod", stage: "regular", joinedDays: 142, owner: "u2", lastTouch: 1, tags: ["small-group:wed"], notes: "Quietly steady. Brings food to small group every week." },
  { id: "C-0249", name: "Tomoko Imai", year: "Freshman", major: "Sociology", pronouns: "she/her", hall: "Ridgewood House", phone: "+1 (818) 555-0249", email: "tomoko.i@umail.edu", instagram: "@tmkoimai", stage: "first", joinedDays: 11, owner: "u4", lastTouch: 5, tags: ["welcome-bbq"], notes: "Exchange from Osaka. Came to one gathering, was very quiet." },
  { id: "C-0253", name: "Marcus Holloway", year: "Senior", major: "Computer Science", pronouns: "he/him", hall: "off-campus", phone: "+1 (213) 555-0253", email: "marcus.h@umail.edu", instagram: "@m.holloway", stage: "church", joinedDays: 540, owner: "u1", lastTouch: 14, tags: ["mentor-cohort"], notes: "Graduating in May. Looking at jobs in Seattle." },
  { id: "C-0257", name: "Elena Vasquez", year: "Sophomore", major: "Psychology", pronouns: "she/her", hall: "Whitman Hall", phone: "+1 (520) 555-0257", email: "elena.v@umail.edu", instagram: "@elenavz", stage: "second", joinedDays: 26, owner: "u5", lastTouch: 4, tags: [], notes: "Family church background but hasn't been to church in 3 years." },
];

const INTERACTIONS = [
  { id: "I-9001", contactId: "C-0142", staff: "u2", type: "coffee", title: "Coffee at Grindstone", body: "Talked about his music. Opened up about brother. I asked if I could pray; he said yes. We prayed for his brother's job search.", date: daysAgo(2), duration: 60 },
  { id: "I-9002", contactId: "C-0142", staff: "u2", type: "text", title: "Checked in after gathering", body: "Sent a follow-up about Sunday's talk on hope. He replied with two questions about heaven.", date: daysAgo(5), duration: 0 },
  { id: "I-9003", contactId: "C-0142", staff: "u4", type: "small-group", title: "Tuesday small group", body: "Showed up early. Helped Hugo set up. Shared during prayer time about exam stress.", date: daysAgo(7), duration: 90 },
  { id: "I-9004", contactId: "C-0167", staff: "u3", type: "meal", title: "Lunch at the dining hall", body: "First real conversation. She grew up in Lagos. Asked the hardest question I've gotten this semester: 'why does God let suffering happen?'", date: daysAgo(1), duration: 75 },
  { id: "I-9005", contactId: "C-0167", staff: "u3", type: "text", title: "Sent her the John 11 link", body: "Followed up on her question. Shared the Lazarus chapter and the Tim Keller talk on suffering.", date: daysAgo(3), duration: 0 },
  { id: "I-9006", contactId: "C-0171", staff: "u3", type: "phone", title: "Phone call — scheduling coffee", body: "Set up coffee for Thursday 3pm at Booker's.", date: daysAgo(3), duration: 8 },
  { id: "I-9007", contactId: "C-0188", staff: "u1", type: "meeting", title: "Leader 1:1", body: "Reviewed her women's group. Discussed conflict with one member. Prayed together.", date: daysAgo(4), duration: 45 },
  { id: "I-9008", contactId: "C-0195", staff: "u4", type: "small-group", title: "Tuesday small group", body: "Led discussion on Romans 8. Walked us through verses 18–25.", date: daysAgo(7), duration: 90 },
  { id: "I-9009", contactId: "C-0203", staff: "u4", type: "phone", title: "Long call after her dad's surgery", body: "She cried for the first part. Mostly listened. Asked if I could pray over the phone; she said yes. We prayed for healing and for her mom's peace.", date: daysAgo(0), duration: 35 },
  { id: "I-9010", contactId: "C-0208", staff: "u2", type: "meet", title: "Dorm lounge chat", body: "First conversation. He asked what we do. Mentioned he hasn't been to mass in 2 years.", date: daysAgo(6), duration: 25 },
  { id: "I-9011", contactId: "C-0212", staff: "u5", type: "coffee", title: "Coffee at Grindstone", body: "She brought a copy of the Quran and we compared what each text says about Jesus. Honest, long conversation.", date: daysAgo(5), duration: 110 },
  { id: "I-9012", contactId: "C-0227", staff: "u4", type: "rehearsal", title: "Worship rehearsal", body: "Showed up to practice. Took the lead on the bridge of the second song.", date: daysAgo(2), duration: 75 },
  { id: "I-9013", contactId: "C-0234", staff: "u3", type: "meet", title: "Org fair conversation", body: "Quick chat at the table. Took a flyer and signed up.", date: daysAgo(4), duration: 8 },
  { id: "I-9014", contactId: "C-0238", staff: "u5", type: "text", title: "Text — checking in", body: "Sent a hello after she missed gathering. She replied she's been busy with midterms.", date: daysAgo(8), duration: 0 },
  { id: "I-9015", contactId: "C-0244", staff: "u2", type: "small-group", title: "Wednesday small group", body: "Brought banana bread. Asked the deepest question of the night about prayer.", date: daysAgo(1), duration: 90 },
  { id: "I-9016", contactId: "C-0249", staff: "u4", type: "gathering", title: "First gathering", body: "Came with Lila. Stayed for the whole thing but didn't speak.", date: daysAgo(5), duration: 75 },
  { id: "I-9017", contactId: "C-0257", staff: "u5", type: "coffee", title: "Coffee", body: "She said she misses church but can't picture going back to her parents'. We talked about why she left.", date: daysAgo(4), duration: 60 },
];

const PRAYERS = [
  { id: "P-3201", contactId: "C-0142", title: "Brother's job search in Seoul", body: "Emerson asked us to pray that his older brother Junho finds work this month — the family is under financial strain.", date: daysAgo(2), status: "open", prayedBy: ["u2", "u4", "u5"], tags: ["family", "provision"], huddle: true, priority: "normal" },
  { id: "P-3202", contactId: "C-0167", title: "Wisdom on suffering", body: "Lila is wrestling with why God allows suffering, especially after losing her grandmother last year.", date: daysAgo(1), status: "open", prayedBy: ["u3", "u5"], tags: ["faith", "grief"] },
  { id: "P-3203", contactId: "C-0188", title: "Conflict in women's group", body: "Sade is navigating tension between two members of her Thursday group. Praying for peace and wisdom.", date: daysAgo(4), status: "open", prayedBy: ["u1", "u5"], tags: ["leadership"] },
  { id: "P-3204", contactId: "C-0195", title: "Visa renewal", body: "Jonas's student visa renewal hearing is in 3 weeks. Praying for favor and clarity.", date: daysAgo(11), status: "answered", answeredBody: "Approved last Friday. Jonas brought donuts for the whole group.", prayedBy: ["u4", "u1", "u2", "u5"], tags: ["provision"] },
  { id: "P-3205", contactId: "C-0203", title: "Dad's recovery from heart surgery", body: "Anika's father came through surgery but recovery is slow. Praying for healing and peace for her mom.", date: daysAgo(0), status: "open", prayedBy: ["u4", "u1", "u2", "u3", "u5"], tags: ["family", "health"] },
  { id: "P-3206", contactId: "C-0212", title: "Family relationships", body: "Mira is reading the Bible and her family doesn't know. Praying for protection and wisdom for her.", date: daysAgo(6), status: "open", prayedBy: ["u5", "u3"], tags: ["family", "faith"] },
  { id: "P-3207", contactId: "C-0227", title: "Audition for symphony", body: "Beatriz is auditioning for the school symphony.", date: daysAgo(14), status: "answered", answeredBody: "Made second chair guitar.", prayedBy: ["u4", "u2"], tags: ["school"] },
  { id: "P-3208", contactId: "C-0253", title: "Job search post-graduation", body: "Marcus is applying to ML roles in Seattle. Praying for the right placement and a faith-rooted community there.", date: daysAgo(9), status: "open", prayedBy: ["u1", "u2"], tags: ["future", "provision"] },
  { id: "P-3209", contactId: "C-0257", title: "Reconnecting with church", body: "Elena is considering visiting a church next Sunday after 3 years away.", date: daysAgo(4), status: "open", prayedBy: ["u5", "u1"], tags: ["faith"] },
  { id: "P-3210", contactId: "C-0244", title: "Estranged sister", body: "Hugo asked for prayer for his older sister — they haven't spoken in 8 months.", date: daysAgo(8), status: "open", prayedBy: ["u2"], tags: ["family"] },
  { id: "P-3211", contactId: "C-0142", title: "Anxiety during exams", body: "Emerson asked for prayer for calm during midterms — sleep has been rough.", date: daysAgo(28), status: "answered", answeredBody: "He emailed: 'Finished midterms, felt the difference. Thank you.'", prayedBy: ["u2", "u5"], tags: ["mental-health", "school"] },
  { id: "P-3212", contactId: "C-0221", title: "Decision about Chicago grad school", body: "Wendell weighing whether to accept Northwestern's offer.", date: daysAgo(5), status: "open", prayedBy: ["u1", "u4"], tags: ["future"] },
];

// Team-wide / ministry prayer items (not tied to a specific contact)
const TEAM_PRAYERS = [
  { id: "TP-401", title: "Unity on our team this semester", body: "Pray for the five of us — that we'd be quick to forgive, generous with credit, and honest when we're tired.", date: daysAgo(3), status: "open", prayedBy: ["u1","u2","u3","u4","u5"], tags: ["team"], priority: "high" },
  { id: "TP-402", title: "Friday Gathering — May 15", body: "For the talk Caleb is giving on Psalm 23. For new students to feel welcomed in the first 60 seconds.", date: daysAgo(1), status: "open", prayedBy: ["u1","u4","u5"], tags: ["events"], priority: "high" },
  { id: "TP-403", title: "Spring retreat fundraising", body: "We're short $2,400 on retreat scholarships. Pray for provision in the next two weeks.", date: daysAgo(7), status: "open", prayedBy: ["u1","u2","u3"], tags: ["provision","team"], priority: "normal" },
  { id: "TP-404", title: "Wisdom on leadership hand-off", body: "Sade and Wendell graduate in May. Pray for clarity on who's next and how we hand things over.", date: daysAgo(11), status: "answered", answeredBody: "Naomi & Devin both said yes to next year's intern team. Praise God.", prayedBy: ["u1","u2","u4"], tags: ["team","future"] },
];

// Log of team prayer activity (who prayed for what when, in team prayer or 1:1)
const TEAM_PRAYER_LOG = [
  { id: "PL-9001", staff: "u5", prayedFor: "P-3205", when: hoursAgo(1), where: "huddle", note: "Tuesday huddle — opened in prayer for Anika & her dad." },
  { id: "PL-9002", staff: "u2", prayedFor: "P-3201", when: hoursAgo(3), where: "1:1", note: "After coffee with Emerson, prayed over Junho." },
  { id: "PL-9003", staff: "u1", prayedFor: "TP-402", when: hoursAgo(5), where: "huddle", note: "Tuesday huddle — for Caleb's Friday talk." },
  { id: "PL-9004", staff: "u4", prayedFor: "P-3205", when: hoursAgo(6), where: "huddle", note: "Tuesday huddle — for healing for Anika's dad." },
  { id: "PL-9005", staff: "u3", prayedFor: "P-3202", when: hoursAgo(7), where: "1:1", note: "Walking home, prayed for Lila." },
  { id: "PL-9006", staff: "u5", prayedFor: "TP-401", when: daysAgoHours(1, 2), where: "huddle", note: "Closed Tuesday huddle praying for team unity." },
  { id: "PL-9007", staff: "u1", prayedFor: "P-3212", when: daysAgoHours(1, 4), where: "1:1", note: "Texted Wendell — committed to pray daily this week." },
  { id: "PL-9008", staff: "u4", prayedFor: "TP-402", when: daysAgoHours(2, 1), where: "private", note: "Morning quiet time." },
  { id: "PL-9009", staff: "u2", prayedFor: "P-3203", when: daysAgoHours(2, 5), where: "huddle", note: "Last Friday's pre-gathering prayer." },
];

const HUDDLE_NEXT = {
  date: daysAhead(1),
  time: "8:00 AM",
  location: "Faculty Coffee Room",
  facilitator: "u5",
  focus: ["TP-402", "P-3205", "P-3201", "P-3202", "TP-401"],
};

const EVENTS = [
  { id: "E-2001", title: "Friday Night Gathering", type: "Weekly Gathering", date: daysAhead(2), time: "7:00 PM", location: "Lower Common Room", attended: ["C-0142","C-0167","C-0195","C-0203","C-0212","C-0227","C-0244","C-0238","C-0188","C-0221","C-0253","C-0257","C-0249"] },
  { id: "E-2002", title: "Tuesday Small Group — Romans", type: "Small Group", date: daysAhead(5), time: "7:30 PM", location: "Whitman Lounge", attended: ["C-0142","C-0195","C-0244"] },
  { id: "E-2003", title: "Wednesday Small Group — Women", type: "Small Group", date: daysAhead(6), time: "8:00 PM", location: "Briarcliff Common", attended: ["C-0203","C-0244","C-0188","C-0212"] },
  { id: "E-2004", title: "Coffee Outreach @ Boardwalk", type: "Outreach", date: daysAhead(8), time: "10:00 AM", location: "Boardwalk Coffee", attended: [] },
  { id: "E-2005", title: "Worship Night", type: "Special", date: daysAhead(14), time: "8:00 PM", location: "Chapel", attended: [] },
];

// Build attendance grid from events (recent + upcoming, going back)
const ATTENDANCE_SESSIONS = [
  { id: "S-1101", short: "Fri 5/01", title: "Friday Gathering", type: "Weekly" },
  { id: "S-1102", short: "Tue 5/05", title: "Tuesday SG", type: "Small Group" },
  { id: "S-1103", short: "Wed 5/06", title: "Wed Women SG", type: "Small Group" },
  { id: "S-1104", short: "Fri 5/08", title: "Friday Gathering", type: "Weekly" },
  { id: "S-1105", short: "Tue 5/12", title: "Tuesday SG", type: "Small Group" },
  { id: "S-1106", short: "Wed 5/13", title: "Wed Women SG", type: "Small Group" },
  { id: "S-1107", short: "Fri 5/15", title: "Friday Gathering", type: "Weekly" },
  { id: "S-1108", short: "Sun 5/17", title: "Worship Night", type: "Special" },
  { id: "S-1109", short: "Tue 5/19", title: "Tuesday SG", type: "Small Group" },
  { id: "S-1110", short: "Wed 5/20", title: "Wed Women SG", type: "Small Group" },
  { id: "S-1111", short: "Fri 5/22", title: "Friday Gathering", type: "Weekly" },
  { id: "S-1112", short: "Tue 5/26", title: "Tuesday SG", type: "Small Group" },
];

// Pseudo-random but deterministic attendance map: { contactId: { sessionId: 'present'|'absent'|'late' } }
const ATTENDANCE = (() => {
  const out = {};
  CONTACTS.forEach((c, ci) => {
    out[c.id] = {};
    ATTENDANCE_SESSIONS.forEach((s, si) => {
      const seed = (ci * 13 + si * 7) % 11;
      let mark = "absent";
      // weight presence by stage
      const baseChance =
        c.stage === "church" ? 0.85 :
        c.stage === "regular" ? 0.7 :
        c.stage === "second" ? 0.35 :
        0.15;
      const r = ((seed * 977 + ci * 31 + si * 71) % 100) / 100;
      if (r < baseChance) mark = "present";
      else if (r < baseChance + 0.08) mark = "late";
      out[c.id][s.id] = mark;
    });
  });
  return out;
})();

const TASKS = [
  { id: "T-501", title: "Follow up with Rio Marchetti before Thursday coffee", contactId: "C-0171", due: daysAhead(1), assignee: "u3", done: false },
  { id: "T-502", title: "Send John 11 reflection to Lila", contactId: "C-0167", due: daysAhead(0), assignee: "u3", done: false },
  { id: "T-503", title: "Plan Sade's leader 1:1 agenda", contactId: "C-0188", due: daysAhead(3), assignee: "u1", done: false },
  { id: "T-504", title: "Confirm Worship Night setlist with Beatriz", contactId: "C-0227", due: daysAhead(2), assignee: "u4", done: false },
  { id: "T-505", title: "Pray with Anika before her dad's check-up", contactId: "C-0203", due: daysAhead(-1), assignee: "u4", done: false },
  { id: "T-506", title: "Order more welcome cards", contactId: null, due: daysAhead(5), assignee: "u3", done: true },
  { id: "T-507", title: "Re-invite Tomoko to Friday gathering", contactId: "C-0249", due: daysAhead(2), assignee: "u4", done: false },
];

const EDIT_LOG = [
  { id: "L-9201", at: hoursAgo(0.5), staff: "u4", action: "moved", contactId: "C-0203", detail: "Stage changed: Regular → Regular (kept). Note: family update logged." },
  { id: "L-9202", at: hoursAgo(2), staff: "u3", action: "created prayer", contactId: "C-0167", detail: "Added prayer request: 'Wisdom on suffering'." },
  { id: "L-9203", at: hoursAgo(3.5), staff: "u3", action: "logged interaction", contactId: "C-0167", detail: "Lunch at dining hall — 75 min." },
  { id: "L-9204", at: hoursAgo(6), staff: "u2", action: "updated field", contactId: "C-0142", detail: "Phone changed: ***-***-0142 → +1 (614) 555-0142." },
  { id: "L-9205", at: hoursAgo(9), staff: "u3", action: "created contact", contactId: "C-0234", detail: "Kofi Boateng signed up via Org Fair public form." },
  { id: "L-9206", at: hoursAgo(22), staff: "u1", action: "moved", contactId: "C-0195", detail: "Stage changed: Regular → Church Meeting." },
  { id: "L-9207", at: daysAgoHours(1, 4), staff: "u5", action: "marked answered", contactId: "C-0195", detail: "Prayer P-3204 (Visa renewal) marked answered." },
  { id: "L-9208", at: daysAgoHours(1, 7), staff: "u4", action: "logged attendance", contactId: null, detail: "Friday Gathering — 13 contacts marked present." },
  { id: "L-9209", at: daysAgoHours(2, 1), staff: "u2", action: "updated note", contactId: "C-0208", detail: "Notes updated (+34 chars)." },
  { id: "L-9210", at: daysAgoHours(2, 6), staff: "u5", action: "created prayer", contactId: "C-0212", detail: "Added prayer request: 'Family relationships'." },
  { id: "L-9211", at: daysAgoHours(3, 2), staff: "u4", action: "moved", contactId: "C-0227", detail: "Stage changed: Second → Regular." },
  { id: "L-9212", at: daysAgoHours(3, 5), staff: "u3", action: "logged interaction", contactId: "C-0171", detail: "Phone call — 8 min." },
  { id: "L-9213", at: daysAgoHours(4, 1), staff: "u1", action: "created event", contactId: null, detail: "Created event: Worship Night (May 17)." },
  { id: "L-9214", at: daysAgoHours(4, 5), staff: "u5", action: "logged interaction", contactId: "C-0212", detail: "Coffee — 110 min." },
];

// --- Personas: the "Viewing as" layer (role labels only, no permissions UI) ---
// FT = full-time staff (admin), Trainee = power user, Student + Community = members.
const PERSONAS = {
  ft: {
    id: "ft", name: "Tony Wang", first: "Tony", initials: "TW",
    role: "Full-time staff", roleShort: "Full-time", subtitle: "Full-time · Campus team",
    staffId: "u1",
  },
  trainee: {
    id: "trainee", name: "Zion Adeyemi", first: "Zion", initials: "ZA",
    role: "Staff in training", roleShort: "Trainee", subtitle: "In training · Outreach",
    staffId: "u3", mentorId: "u1",
  },
  student: {
    id: "student", name: "Timothy Hale", first: "Timothy", initials: "TH",
    role: "Student", roleShort: "Student", subtitle: "Sophomore · Computer Science",
    caredById: "u2",
  },
  community: {
    id: "community", name: "Philip Nardi", first: "Philip", initials: "PN",
    role: "Community", roleShort: "Community", subtitle: "Friend of CISA",
    connectIds: ["u3", "u2"],
  },
};

// Which workspace views each role lands with. Members see far less.
const ROLE_NAV = {
  ft:        ["dashboard", "board", "contacts", "stage", "attendance", "prayer", "editlog"],
  trainee:   ["dashboard", "contacts", "stage", "attendance", "prayer"],
  student:   ["dashboard", "attendance", "prayer"],
  community: ["dashboard", "attendance", "prayer"],
};

// ---- FT landing: a shared "desk" that replaces scattered Google Docs ----
const COORDINATION_NOTES = [
  {
    id: "CN-pin", pinned: true, title: "This week — who's got what",
    updatedBy: "u5", updated: hoursAgo(2), contributors: ["u1", "u2", "u4", "u5"],
    body: "Friday gathering: Caleb on Psalm 23, Priya leading welcome, Tony + Ana on the door for new faces. Anika's dad is post-op — Caleb checking in Thursday. Retreat scholarships still $2,400 short; partial-aid call by Monday.",
    items: [
      { who: "u4", text: "Confirm Friday setlist with Beatriz", done: false },
      { who: "u3", text: "Re-invite Tomoko + two org-fair names", done: false },
      { who: "u1", text: "Draft retreat aid plan for Monday", done: false },
      { who: "u2", text: "Text Emerson about Sunday follow-up", done: true },
    ],
  },
  { id: "CN-1", title: "Friday Gathering — run of show", updatedBy: "u4", updated: hoursAgo(20), contributors: ["u4", "u5", "u1"], body: "Doors 6:40, worship 7:00, talk 7:25, small groups 7:55, snacks + hang till 9. Need two extra greeters for first-timers." },
  { id: "CN-2", title: "Spring retreat — logistics & rooming", updatedBy: "u1", updated: daysAgo(1), contributors: ["u1", "u2", "u3"], body: "Cabins booked May 30–June 1. Still finalizing transport and the scholarship list. Add names as students commit." },
  { id: "CN-3", title: "Org-fair follow-up tracker", updatedBy: "u3", updated: daysAgo(2), contributors: ["u3", "u2"], body: "14 names from the fair. Kofi + 3 already in. Ana taking first contacts this week — flag anyone who wants coffee." },
  { id: "CN-4", title: "Leadership hand-off — Sade & Wendell", updatedBy: "u1", updated: daysAgo(4), contributors: ["u1", "u2", "u4"], body: "Both graduate in May. Naomi + Devin said yes to intern team. Map what each one carries before finals." },
];

const LEARNINGS = [
  { id: "LN-1", title: "The first 60 seconds decide whether someone comes back", author: "u1", date: daysAgo(9), tags: ["welcome", "gatherings"], body: "We watched new faces all last fall. Students who got a real, unhurried hello in their first minute came back far more often. Greeters beat flyers, every time." },
  { id: "LN-2", title: "Coffee beats events for a first contact", author: "u3", date: daysAgo(21), tags: ["outreach"], body: "Inviting someone to a one-on-one coffee converted better than inviting them straight to a gathering. Smaller ask, realer conversation. Save the big room for second contact." },
  { id: "LN-3", title: "Don't rush the hard questions", author: "u5", date: daysAgo(34), tags: ["discipleship"], body: "When Mira asked about suffering, the pull was to answer fast. Sitting in it across two coffees built more trust than any clean answer would have. Slow is faithful." },
  { id: "LN-4", title: "Hand things off a semester early", author: "u1", date: daysAgo(48), tags: ["leadership"], body: "Every spring we scramble because seniors leave in May. Naming next year's leaders in the fall — and letting them shadow — made this hand-off calm instead of frantic." },
];

const FELLOWSHIPS = [
  { id: "FW-1", name: "Friday Night Gathering", rhythm: "Fridays · 7:00 PM", place: "Lower Common Room", leaderId: "u4", size: 13, tone: "accent", note: "The front door of everything. Strong turnout; could use more greeters." },
  { id: "FW-2", name: "Tuesday Small Group — Romans", rhythm: "Tuesdays · 7:30 PM", place: "Whitman Lounge", leaderId: "u4", size: 3, tone: "amber", note: "Tight and steady. Emerson opening up a little more each week." },
  { id: "FW-3", name: "Wednesday Women's Group", rhythm: "Wednesdays · 8:00 PM", place: "Briarcliff Common", leaderId: "u1", size: 4, tone: "teal", note: "Sade leading well. Gently watching one quiet conflict." },
  { id: "FW-4", name: "Worship Team", rhythm: "Sun rehearsal · 4:00 PM", place: "Chapel", leaderId: "u4", size: 5, tone: "violet", note: "Beatriz on guitar now. Building toward Worship Night." },
];

// ---- Student landing: Timothy's own circle of friends (NOT the CRM) ----
const STUDENT_FRIENDS = [
  { id: "f1", name: "Daniel Cho", initials: "DC", note: "Midterms are wrecking him — pray he finds some rest.", prayed: false },
  { id: "f2", name: "Grace Liu", initials: "GL", note: "Her grandma is in the hospital back home.", prayed: true },
  { id: "f3", name: "Sam Whitfield", initials: "SW", note: "Curious about coming Friday — pray he actually shows.", prayed: false },
];

// ============================================================
//  THE BOARD — FT shared coordination surface
//  A weekly rhythm of coordination sessions (Mon · Tue · Wed · Fri —
//  no Thursday). Each session carries an AGENDA (items to talk through,
//  added by anyone, carried forward if not covered) and a DELEGATED
//  checklist. Discussion becomes NOTES that live on as record + learning,
//  findable by the event series ("pull up last year's Friday Gathering").
// ============================================================

const BOARD_CATEGORIES = {
  gathering: { label: "Gathering", tone: "amber" },
  outreach:  { label: "Outreach",  tone: "accent" },
  care:      { label: "Care",      tone: "teal" },
  prayer:    { label: "Prayer",    tone: "violet" },
  logistics: { label: "Logistics", tone: "" },
};

const BOARD_SESSIONS = [
  {
    id: "BS-mon", weekday: "Monday", dateLabel: "May 11", status: "done",
    event: "Week kickoff", time: "8:00 AM", place: "Faculty Coffee Room",
    facilitator: "u1", noteId: "BN-mon",
    agenda: [
      { id: "a-m1", text: "Walk the weekend — who we met, who's worth a follow-up", cat: "outreach", raisedBy: "u3", status: "covered",
        actions: [
          { id: "g-m2", who: "u2", text: "Pull together the org-fair name list", done: true },
        ] },
      { id: "a-m2", text: "Plan Coffee Outreach at the Boardwalk — date and who hosts", cat: "outreach", raisedBy: "u3", status: "covered",
        actions: [
          { id: "g-m1", who: "u3", text: "Book the Boardwalk table for the 20th", done: true },
        ] },
      { id: "a-m3", text: "Greeters for Friday — we keep losing first-timers at the door", cat: "gathering", raisedBy: "u5", status: "pushed", pushedTo: "Wednesday" },
    ],
    assigned: [
      { id: "t-m1", who: "u2", text: "Send the weekly team digest", done: true },
    ],
  },
  {
    id: "BS-tue", weekday: "Tuesday", dateLabel: "May 12", status: "done",
    event: "Tuesday Small Group — Romans", time: "7:30 PM", place: "Whitman Lounge",
    facilitator: "u4", noteId: "BN-tue",
    agenda: [
      { id: "a-t1", text: "Emerson's opening up — keep it going without crowding him", cat: "care", raisedBy: "u4", status: "covered",
        actions: [
          { id: "g-t1", who: "u4", text: "Text Emerson a follow-up on Sunday's talk", done: true },
        ] },
      { id: "a-t2", text: "Midterm stress in the group — a lighter week on content?", cat: "care", raisedBy: "u4", status: "covered" },
      { id: "a-t3", text: "Who co-leads next Tuesday so Caleb's free for the door Friday", cat: "logistics", raisedBy: "u1", status: "pushed", pushedTo: "Wednesday" },
    ],
    assigned: [
      { id: "t-t1", who: "u4", text: "Tidy the Romans notes for the shared drive", done: true },
    ],
  },
  {
    id: "BS-wed", weekday: "Wednesday", dateLabel: "May 13", status: "today",
    event: "Wednesday Women's Group", time: "8:00 PM", place: "Briarcliff Common",
    facilitator: "u1", noteId: null,
    agenda: [
      { id: "a-w0a", text: "Greeters for Friday — lock two names", cat: "gathering", raisedBy: "u5", status: "open", carriedFrom: "Monday",
        actions: [
          { id: "g-w1", who: "u4", text: "Confirm Friday setlist with Beatriz", done: false },
        ] },
      { id: "a-w0b", text: "Who co-leads Tuesday so Caleb's free for the door", cat: "logistics", raisedBy: "u1", status: "open", carriedFrom: "Tuesday" },
      { id: "a-w1", text: "Anika's dad is post-op — how's the family, who checks in", cat: "care", raisedBy: "u4", status: "open" },
      { id: "a-w2", text: "Mira's honest questions — go slow, keep meeting for coffee", cat: "care", raisedBy: "u5", status: "open",
        actions: [
          { id: "g-w4", who: "u2", text: "Set up coffee with Mira this week", done: false },
        ] },
      { id: "a-w3", text: "Retreat scholarships still $2,400 short — decide a partial-aid plan", cat: "logistics", raisedBy: "u1", status: "open",
        actions: [
          { id: "g-w3", who: "u1", text: "Draft the retreat partial-aid plan for Monday", done: false },
        ] },
      { id: "a-w4", text: "Re-invite Tomoko + two org-fair names before Friday", cat: "outreach", raisedBy: "u3", status: "open",
        actions: [
          { id: "g-w2", who: "u3", text: "Re-invite Tomoko + two org-fair names", done: false },
        ] },
    ],
    assigned: [
      { id: "t-w1", who: "u3", text: "Pick up name tags + visitor cards for Friday", done: false },
      { id: "t-w2", who: "u5", text: "Refresh the printed prayer list before Thursday", done: false },
      { id: "t-w3", who: "u2", text: "Send the retreat info email to the whole group", done: true },
    ],
  },
  {
    id: "BS-fri", weekday: "Friday", dateLabel: "May 15", status: "upcoming",
    event: "Friday Night Gathering", time: "7:00 PM", place: "Lower Common Room",
    facilitator: "u5", noteId: null,
    agenda: [
      { id: "a-f1", text: "Caleb's talk on Psalm 23 — final read-through", cat: "gathering", raisedBy: "u4", status: "open" },
      { id: "a-f2", text: "The first 60 seconds — make every new face feel met", cat: "gathering", raisedBy: "u1", status: "open",
        actions: [
          { id: "g-f1", who: "u5", text: "Lead the welcome + first-timer hand-offs", done: false },
          { id: "g-f2", who: "u1", text: "On the door with Ana for new faces", done: false },
        ] },
      { id: "a-f3", text: "Pray over the night together before doors open", cat: "prayer", raisedBy: "u5", status: "open" },
    ],
    assigned: [
      { id: "t-f1", who: "u4", text: "Charge the speaker + test the mic by 6pm", done: false },
      { id: "t-f2", who: "u3", text: "Set out coffee and snacks", done: false },
    ],
  },
];

// Notes & learnings — every session becomes a record you can find again.
// Linked to an event "series" so running the same thing a year later pulls
// up last time's notes. `lastYear` items show the recall working.
const BOARD_SERIES = ["Friday Gathering", "Small Groups", "Outreach", "Retreat", "Team"];

const BOARD_NOTES = [
  { id: "BN-fri-now", type: "record", series: "Friday Gathering", title: "Friday Night — run of show", dateLabel: "this week", recent: true, contributors: ["u4", "u5", "u1"], tags: ["run-of-show", "welcome"], body: "Doors 6:40, worship 7:00, talk 7:25, small groups 7:55, snacks till 9. Two extra greeters needed for first-timers. Caleb on Psalm 23." },
  { id: "BN-mon", type: "record", series: "Outreach", title: "Monday kickoff — week 9", dateLabel: "May 11", recent: true, contributors: ["u1", "u3", "u2"], tags: ["org-fair", "boardwalk"], body: "14 names from the org fair; Kofi and three already in our orbit. Boardwalk table booked for the 20th, Ana hosting. First contacts get a coffee invite, not a gathering invite." },
  { id: "BN-tue", type: "record", series: "Small Groups", title: "Tuesday Romans — group notes", dateLabel: "May 12", recent: true, contributors: ["u4", "u1"], tags: ["romans", "care"], body: "Walked verses 18–25. Emerson shared about exam stress for the first time. Lighter content next week given midterms — more space to just talk." },
  // ---- the recall: same series, a year back ----
  { id: "BN-fri-yr", type: "learning", series: "Friday Gathering", title: "The first 60 seconds decide whether someone comes back", dateLabel: "last May", lastYear: true, contributors: ["u1", "u4"], tags: ["welcome", "gatherings"], body: "We watched new faces all last spring. Students who got a real, unhurried hello in their first minute came back far more often. Greeters beat flyers, every time — staff this before anything else." },
  { id: "BN-out-yr", type: "learning", series: "Outreach", title: "Coffee beats events for a first contact", dateLabel: "last spring", lastYear: true, contributors: ["u3"], tags: ["outreach", "first-contact"], body: "A one-on-one coffee converted better than inviting someone straight to a gathering. Smaller ask, realer conversation. Save the big room for second contact." },
  { id: "BN-sg-yr", type: "learning", series: "Small Groups", title: "Don't rush the hard questions", dateLabel: "earlier this term", contributors: ["u5"], tags: ["discipleship"], body: "When Mira asked about suffering, the pull was to answer fast. Sitting in it across two coffees built more trust than any clean answer would have. Slow is faithful." },
  { id: "BN-ret-yr", type: "record", series: "Retreat", title: "Spring retreat — last year's logistics", dateLabel: "last May", lastYear: true, contributors: ["u1", "u2", "u3"], tags: ["retreat", "rooming", "transport"], body: "Cabins May 30–June 1, two vans + one parent driver. Scholarship list closed two weeks out — leaving it later caused the scramble. Reuse the rooming sheet; it worked." },
  { id: "BN-team-yr", type: "learning", series: "Team", title: "Hand things off a semester early", dateLabel: "last fall", contributors: ["u1", "u2", "u4"], tags: ["leadership", "hand-off"], body: "Every spring we scramble because seniors leave in May. Naming next year's leaders in the fall — and letting them shadow — made the hand-off calm instead of frantic." },
];

// --- Settings: feedback inbox (admin), API/webhook log (Tony), access requests ---

// What people are telling us — shown only to full-time staff.
const FEEDBACK = [
  { id: "fb1", fromName: "Priya Raman", fromRole: "Small Group Lead", initials: "PR", channel: "in-app",
    message: "Could we get a reminder the day before a gathering? I keep forgetting to text my group until it's too late.",
    at: hoursAgo(3), status: "new" },
  { id: "fb2", fromName: "Caleb Owusu", fromRole: "Discipleship Lead", initials: "CO", channel: "in-app",
    message: "The new prayer page is lovely — being able to see who I prayed for last week changed how I show up. Thank you.",
    at: hoursAgo(20), status: "new" },
  { id: "fb3", fromName: "Ana Flores", fromRole: "Outreach", initials: "AF", channel: "sms",
    message: "Quick Add by text is a game changer at the org fair. One small thing: it guessed the wrong major twice.",
    at: daysAgo(1), status: "new" },
  { id: "fb4", fromName: "Timothy Hale", fromRole: "Student", initials: "TH", channel: "in-app",
    message: "Is there a way to see just the gatherings I'm signed up for? Right now I scroll past a lot.",
    at: daysAgo(2), status: "read" },
  { id: "fb5", fromName: "Beatriz Lima", fromRole: "Prayer Coordinator", initials: "BL", channel: "in-app",
    message: "Love the warmer language everywhere. 'Looking back' instead of 'audit log' makes it feel like ours.",
    at: daysAgo(4), status: "read" },
];

// API & webhook traffic — shown only to Tony (full-time admin).
const API_LOG = [
  { id: "lg1", method: "POST", endpoint: "/api/quick-add", channel: "siri", status: 201, ok: true, latency: 840, at: hoursAgo(0.4),
    summary: "Parsed “Met Sara at Campus Coffee…” → created Sara Doe",
    request: '{\n  "text": "Met Sarah Doe yesterday at Campus Coffee. Freshman, biology. sarah12@campus.edu, (555) 789-0123. Interested in study group.",\n  "source": "ios-shortcut"\n}',
    response: '{\n  "ok": true,\n  "contact": {\n    "name": "Sarah Doe",\n    "year": "Freshman",\n    "major": "Biology",\n    "email": "sarah12@campus.edu",\n    "phone": "(555) 789-0123",\n    "interest": "study group",\n    "stage": "first"\n  },\n  "parsedBy": "gemini-1.5"\n}' },
  { id: "lg2", method: "POST", endpoint: "/api/webhook/sms", channel: "sms", status: 200, ok: true, latency: 1120, at: hoursAgo(2.1),
    summary: "Twilio inbound → logged interaction for Jerry Doe",
    request: '{\n  "From": "+15550192",\n  "Body": "!add interaction Jerry Doe and I studied Romans today, prayed together.",\n  "MessageSid": "SM3f9a…"\n}',
    response: '{\n  "ok": true,\n  "action": "interaction.create",\n  "contactId": "C-0188",\n  "summary": "Studied Romans; prayed together"\n}' },
  { id: "lg3", method: "POST", endpoint: "/api/webhook/groupme", channel: "groupme", status: 200, ok: true, latency: 610, at: hoursAgo(6),
    summary: "!add contact Jerry Doe → merged with existing card",
    request: '{\n  "text": "!add contact Jerry Doe is a sophomore majoring in history, phone 555-0192, met at cafeteria.",\n  "name": "Ana F.",\n  "group_id": "104xxxx"\n}',
    response: '{\n  "ok": true,\n  "action": "contact.merge",\n  "contactId": "C-0188",\n  "fieldsUpdated": ["major", "phone"]\n}' },
  { id: "lg4", method: "POST", endpoint: "/api/quick-add", channel: "whatsapp", status: 422, ok: false, latency: 430, at: daysAgo(1),
    summary: "Couldn't find a name to parse — nothing created",
    request: '{\n  "text": "interested in fridays!!",\n  "source": "whatsapp"\n}',
    response: '{\n  "ok": false,\n  "error": "no_name_detected",\n  "hint": "Include a first and last name, e.g. “Met Jordan Lee…”."\n}' },
  { id: "lg5", method: "POST", endpoint: "/api/webhook/sms", channel: "sms", status: 401, ok: false, latency: 90, at: daysAgo(2),
    summary: "Rejected — Twilio signature did not validate",
    request: '{\n  "From": "+15550000",\n  "Body": "!add contact test",\n  "X-Twilio-Signature": "(missing)"\n}',
    response: '{\n  "ok": false,\n  "error": "invalid_signature"\n}' },
];

// People asking to join — an admin approves or declines.
const ACCESS_REQUESTS = [
  { id: "req1", name: "Hana Suzuki", email: "hana.suzuki@umail.edu", initials: "HS", requestedRole: "Small Group Lead",
    note: "Caleb asked me to start helping lead the Tuesday Romans group.", at: hoursAgo(5) },
  { id: "req2", name: "Marcus Bell", email: "mbell@umail.edu", initials: "MB", requestedRole: "Volunteer",
    note: "Helping with setup on Fridays — would love to see the gathering schedule.", at: daysAgo(1) },
];

// --- helpers ---

function daysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}
function daysAhead(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString();
}
function hoursAgo(n) {
  const d = new Date();
  d.setMinutes(d.getMinutes() - Math.round(n * 60));
  return d.toISOString();
}
function daysAgoHours(dn, hn) {
  const d = new Date();
  d.setDate(d.getDate() - dn);
  d.setHours(d.getHours() - hn);
  return d.toISOString();
}

function relTime(iso) {
  const t = new Date(iso).getTime();
  const now = Date.now();
  const diffMin = Math.round((now - t) / 60000);
  if (Math.abs(diffMin) < 1) return "just now";
  const abs = Math.abs(diffMin);
  const sign = diffMin >= 0 ? "" : "in ";
  const suf = diffMin >= 0 ? " ago" : "";
  if (abs < 60) return `${sign}${abs}m${suf}`.replace("in ago","").trim();
  const h = Math.round(abs / 60);
  if (h < 24) return `${sign}${h}h${suf}`.replace("in ago","").trim();
  const dys = Math.round(h / 24);
  if (dys < 30) return `${sign}${dys}d${suf}`.replace("in ago","").trim();
  const mo = Math.round(dys / 30);
  return `${sign}${mo}mo${suf}`.replace("in ago","").trim();
}

function fmtDay(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function fmtDayLong(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
function dayNum(iso) { return new Date(iso).getDate(); }
function dayMonth(iso) { return new Date(iso).toLocaleDateString(undefined, { month: "short" }).toUpperCase(); }

function staffById(id) { return STAFF.find(s => s.id === id); }
function contactById(id) { return CONTACTS.find(c => c.id === id); }

Object.assign(window, {
  STAGES, STAGE_BY_ID, STAFF, MAJORS, HALLS,
  CONTACTS, INTERACTIONS, PRAYERS, TEAM_PRAYERS, TEAM_PRAYER_LOG, HUDDLE_NEXT,
  EVENTS, ATTENDANCE_SESSIONS, ATTENDANCE, TASKS, EDIT_LOG,
  PERSONAS, ROLE_NAV, COORDINATION_NOTES, LEARNINGS, FELLOWSHIPS, STUDENT_FRIENDS,
  BOARD_CATEGORIES, BOARD_SESSIONS, BOARD_SERIES, BOARD_NOTES,
  FEEDBACK, API_LOG, ACCESS_REQUESTS,
  relTime, fmtDay, fmtDayLong, dayNum, dayMonth, staffById, contactById,
  daysAgo, daysAhead, hoursAgo,
});
