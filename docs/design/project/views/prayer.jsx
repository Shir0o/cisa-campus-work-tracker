// Team Prayer — Direction A: "the weekly walk, in one scroll."
//
// One block per person. Instead of dumping a whole prayer history (too long) or
// clicking through people one at a time (the old archived "walk"), we surface
// only what needs attention, top to bottom, so you just scroll:
//
//   • THIS WEEK — the burden we're carrying now. Written fresh, so it starts
//     with NO status; you can mark it later.
//   • LAST WEEK — the previous prayer, ALWAYS shown for context, with one mark
//     to update it (Ongoing / Answered / Archived). Tap the active mark again
//     to clear it back to no status. If it's still unmarked, it's nudged.
//   • EARLIER — folded away by default; expands inline (capped). The full
//     history lives on the person's profile.
//
// Statuses: "ongoing" | "answered" | "archived" | null (no status, the default).

// ── week math, relative to today ──────────────────────────────────────
const MONTH_IDX = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function weekStartOf(date) {
  const x = new Date(date);
  const off = (x.getDay() + 6) % 7; // Monday = 0
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - off);
  return x;
}
const THIS_WEEK_START = weekStartOf(new Date()).getTime();
const THIS_WEEK_END = THIS_WEEK_START + 7 * 24 * 3600 * 1000;
const DAY = 24 * 3600 * 1000;

// "Mon DD" label for a day in the week `weeksAgo` weeks before this one.
function weekLabel(weeksAgo, dow = 2) {
  const d = new Date(THIS_WEEK_START - weeksAgo * 7 * DAY + dow * DAY);
  return MONTH_ABBR[d.getMonth()] + " " + d.getDate();
}
function prayerDateSort(label) {
  const [m, d] = label.split(" ");
  return new Date(2026, MONTH_IDX[m] ?? 0, parseInt(d, 10)).getTime();
}
function todayLabel() {
  const d = new Date();
  return MONTH_ABBR[d.getMonth()] + " " + d.getDate();
}

// how many earlier prayers we'll show inline before sending you to the profile
const EARLIER_CAP = 4;

const STATUS_LABEL = { ongoing: "Ongoing", answered: "Answered", archived: "Archived" };
const STATUS_ORDER = ["ongoing", "answered", "archived"];

// ── seed: one entry per PERSON; each holds a flat list of dated prayers ──
// (oldest → newest). The two most recent are dated into last/this week so the
// weekly view has something to surface. `status: null` = written, not yet marked.
const PEOPLE = {
  "C-0142": [
    { date: "Mar 11", status: "answered", text: "He asked for prayer over midterms — sleep has been rough and the nerves are loud." },
    { date: "Mar 25", status: "answered", text: "He emailed: 'Finished midterms, felt the difference. Thank you.'" },
    { date: weekLabel(4, 1), status: "ongoing", text: "Emerson asked us to carry his older brother, Junho — the family is under real financial strain in his job search." },
    { date: weekLabel(3, 1), status: "ongoing", text: "Junho's first interviews fell through. Praying the waiting wouldn't crush their hope." },
    { date: weekLabel(2, 1), status: "ongoing", text: "A second-round callback for Junho — the first good news in a month." },
    { date: weekLabel(1, 2), status: null, text: "Junho's final round was Thursday. So close now — praying for favor and a steady heart." },
    { date: weekLabel(0, 1), status: null, text: "Emerson is anxious about hearing back on Junho. Praying the silence wouldn't grow loud this week." }
  ],
  "C-0203": [
    { date: weekLabel(5, 1), status: "ongoing", text: "Her dad's heart surgery is scheduled Friday. She's frightened and a long way from home." },
    { date: weekLabel(3, 2), status: "ongoing", text: "He made it through, but recovery is slow and her mom is worn thin." },
    { date: weekLabel(1, 2), status: "answered", text: "He's home. Anika cried on the phone — they're okay. We're so thankful." },
    { date: weekLabel(0, 0), status: null, text: "Holding her family from a long way off has worn Anika down. Praying rest finds her too." }
  ],
  "C-0167": [
    { date: weekLabel(3, 1), status: "ongoing", text: "Wrestling with why God allows suffering, especially since losing her grandmother." },
    { date: weekLabel(2, 2), status: "ongoing", text: "Read John 11 on her own. Texted Aria three more questions near midnight." },
    { date: weekLabel(1, 3), status: null, text: "She didn't come Friday — but asked if the group ever doubts. A new door to walk through." },
    { date: weekLabel(0, 1), status: null, text: "Praying she'd feel safe bringing the hard questions, and that we'd be unhurried with her." }
  ],
  "C-0212": [
    { date: weekLabel(4, 1), status: "ongoing", text: "She's reading the Bible quietly; her family doesn't know yet. Praying the door stays open without slamming." },
    { date: weekLabel(2, 2), status: "ongoing", text: "Brought a copy of the Quran to coffee to compare — honest and searching." },
    { date: weekLabel(1, 1), status: "ongoing", text: "Asked Caleb a real question about Jesus. The door is still open." },
    { date: weekLabel(0, 1), status: null, text: "She came to coffee on her own and stayed nearly two hours. Praying for courage as she keeps reading." }
  ],
  "C-0257": [
    { date: weekLabel(3, 1), status: "ongoing", text: "She misses church but can't picture going back to her parents' kind of faith." },
    { date: weekLabel(2, 2), status: "ongoing", text: "Asked a real question about doubt over coffee. A crack." },
    { date: weekLabel(1, 0), status: "answered", text: "She visited Citychurch on Sunday. Sat in the back. Stayed for the whole thing." }
    // no this-week entry → the card shows the "write what we're carrying" prompt
  ],
  "C-0244": [
    { date: weekLabel(3, 1), status: "archived", text: "He and his sister haven't spoken in eight months. He wants to text her but freezes." },
    { date: weekLabel(2, 2), status: "ongoing", text: "He drafted a message but didn't send it. Praying him past the fear." },
    { date: weekLabel(1, 2), status: null, text: "His roommate brought his sister up out of nowhere on Saturday. A thread to pull." },
    { date: weekLabel(0, 0), status: null, text: "Praying he'd find the courage to send something small this week — even just 'thinking of you.'" }
  ],
  "C-0253": [
    { date: weekLabel(2, 1), status: "ongoing", text: "Applying to ML roles out west. Anxious about leaving the group in May." },
    { date: weekLabel(1, 2), status: "ongoing", text: "Two interviews lined up. Praying about the people God will set in front of him." },
    { date: weekLabel(0, 1), status: null, text: "Peace about leaving, and trust about the community he'll find when he gets to Seattle." }
  ],
  "C-0188": [
    { date: weekLabel(2, 1), status: "ongoing", text: "Tension between two women in her Thursday group. She's carrying it heavily." },
    { date: weekLabel(1, 2), status: "answered", text: "They talked it through over a long lunch. Sade said it felt like grace." }
    // no this-week entry → prompt
  ]
};

const Prayer = ({ onOpenContact }) => {
  // Local override for an individual prayer's status. null clears it.
  const [statusMap, setStatusMap] = React.useState({});
  const setStatus = (key, s) => setStatusMap((m) => ({ ...m, [key]: s }));

  // Local text edits + prayers written fresh this week.
  const [textMap, setTextMap] = React.useState({});
  const setText = (key, t) => setTextMap((m) => ({ ...m, [key]: t }));
  const [addedMap, setAddedMap] = React.useState({});
  const addPrayer = (cid, item) =>
  setAddedMap((m) => ({ ...m, [cid]: [...(m[cid] || []), item] }));

  // Prayers answered since Jan 1 (across everyone we're holding).
  const answeredThisYear = React.useMemo(() => {
    return Object.values(PEOPLE).flat().filter((p) => p.status === "answered").length;
  }, []);

  const entries = Object.entries(PEOPLE).
  map(([cid, items]) => ({ contact: contactById(cid), items })).
  filter((e) => e.contact);

  // people whose last-week prayer is still unmarked — surfaced in the subtitle
  const awaiting = React.useMemo(() => {
    let n = 0;
    for (const e of entries) {
      const resolved = e.items.map((it, i) => ({
        status: statusMap[e.contact.id + "::" + i] ?? it.status,
        sort: prayerDateSort(it.date),
        i }));

      const pre = resolved.filter((r) => r.sort < THIS_WEEK_START).sort((a, b) => b.sort - a.sort);
      if (pre[0] && !pre[0].status) n++;
    }
    return n;
  }, [statusMap]);

  return (
    <div className="page page-prayer">
      <header className="pr-head">
        <h1 className="pr-h1">Prayer Log</h1>
        <p className="pr-subtitle">
          <span className="pr-answered-count">{answeredThisYear}</span>{" "}
          {answeredThisYear === 1 ? "prayer" : "prayers"} answered
          <span className="pr-subtitle-dim"> this year.</span>
          {awaiting > 0 &&
          <span className="pr-subtitle-dim">
              {" "}{awaiting} from last week {awaiting === 1 ? "still needs" : "still need"} an update below.
            </span>
          }
        </p>
      </header>

      <section className="pr-section">
        <div className="pr-section-h">
          <span className="pr-section-eyebrow">People we're carrying</span>
          <span className="pr-section-count">{entries.length}</span>
          <span className="pr-section-rule"></span>
        </div>

        <div className="prt-list">
          {entries.map((e) =>
          <PrayerThread
            key={e.contact.id}
            contact={e.contact}
            items={e.items}
            added={addedMap[e.contact.id] || []}
            statusMap={statusMap}
            textMap={textMap}
            onSetStatus={setStatus}
            onSetText={setText}
            onAddPrayer={addPrayer}
            onOpenContact={onOpenContact} />
          )}
        </div>
      </section>
    </div>);

};

// ─────────────────────────────────────────────────────────────────────
//  One person: this week, last week, and everything earlier folded away
// ─────────────────────────────────────────────────────────────────────
const PrayerThread = ({ contact: c, items, added, statusMap, textMap, onSetStatus, onSetText, onAddPrayer, onOpenContact }) => {
  const [showEarlier, setShowEarlier] = React.useState(false);
  const owner = staffById(c.owner);
  const initials = c.name.split(" ").map((x) => x[0]).join("").slice(0, 2);
  const firstName = c.name.split(" ")[0];

  // Resolve each prayer (seeded + freshly added) with local overrides.
  const combined = [
  ...items.map((item, idx) => ({ ...item, key: c.id + "::" + idx })),
  ...added.map((item, i) => ({ ...item, key: c.id + "::added::" + i }))].
  map((item) => {
    const status = statusMap[item.key] !== undefined ? statusMap[item.key] : item.status;
    const text = textMap[item.key] != null ? textMap[item.key] : item.text;
    return { ...item, status, text, sort: prayerDateSort(item.date) };
  });

  const byDesc = (a, b) => b.sort - a.sort;

  // This week's burden (surfaced on top) — the newest prayer dated this week.
  const weekItem = combined.filter((r) => r.sort >= THIS_WEEK_START && r.sort < THIS_WEEK_END).sort(byDesc)[0] || null;

  // Everything else, newest-first. The single most-recent of these is "last week"
  // (always shown for context); the rest are folded into "Earlier".
  const rest = combined.filter((r) => r !== weekItem).sort(byDesc);
  const lastItem = rest[0] || null;
  const earlier = rest.slice(1);

  const ongoingCount = combined.filter((r) => r.status === "ongoing").length;
  const needsMark = lastItem && !lastItem.status;

  return (
    <article className="prt-card">
      {/* ── header: person + a quiet count of what's still open ── */}
      <div className="prt-head">
        <button className="prt-person" onClick={() => onOpenContact(c.id)} title="Open profile">
          <Avatar initials={initials} size="lg" />
          <div className="prt-person-id">
            <div className="prt-name">{c.name}</div>
            <div className="prt-meta">{c.year} · {c.major}<span className="prt-dot">·</span>{owner.name.split(" ")[0]} shepherds</div>
          </div>
        </button>
        <div className="prt-carry">
          {ongoingCount > 0 ?
          <React.Fragment>
              <span className="prt-carry-n">{ongoingCount} ongoing</span>
              <span className="prt-carry-l">{combined.length} {combined.length === 1 ? "prayer" : "prayers"} in all</span>
            </React.Fragment> :

          <React.Fragment>
              <span className="prt-carry-n answered-tone">At rest</span>
              <span className="prt-carry-l">{combined.length} {combined.length === 1 ? "prayer" : "prayers"} in all</span>
            </React.Fragment>
          }
        </div>
      </div>

      {/* ── this week ── */}
      <div className="prt-week">
        <div className="prt-week-head">
          <span className="prt-week-eyebrow">This week</span>
          <span className="prt-week-rule"></span>
        </div>
        {weekItem ?
        <PrayerItem
          item={weekItem}
          variant="week"
          onSetStatus={(s) => onSetStatus(weekItem.key, s)}
          onSetText={(t) => onSetText(weekItem.key, t)} /> :

        <AddThisWeek
          name={firstName}
          onAdd={(text) => onAddPrayer(c.id, { date: todayLabel(), status: null, text })} />
        }
      </div>

      {/* ── last week — always shown for context, with a mark to update ── */}
      {lastItem &&
      <div className="prt-last">
          <div className="prt-last-head">
            <span className="prt-last-eyebrow">Last week</span>
            {needsMark && <span className="prt-last-nudge">Needs an update</span>}
            <span className="prt-last-rule"></span>
          </div>
          <PrayerItem
          item={lastItem}
          variant="last"
          needsMark={needsMark}
          onSetStatus={(s) => onSetStatus(lastItem.key, s)}
          onSetText={(t) => onSetText(lastItem.key, t)} />
        </div>
      }

      {/* ── earlier — folded away, expands inline (capped) ── */}
      {earlier.length > 0 &&
      <div className="prt-earlier">
          <button className={"prt-earlier-btn" + (showEarlier ? " open" : "")} onClick={() => setShowEarlier((v) => !v)}>
            <span className="prt-earlier-chev" aria-hidden>▶</span>
            <span>{showEarlier ? "Hide" : "Earlier"} — {earlier.length} {earlier.length === 1 ? "prayer" : "prayers"}</span>
            <span className="prt-earlier-rule"></span>
          </button>
          {showEarlier &&
        <div className="prt-earlier-list">
              {earlier.slice(0, EARLIER_CAP).map((it) =>
          <PrayerItem
            key={it.key}
            item={it}
            variant="earlier"
            onSetStatus={(s) => onSetStatus(it.key, s)}
            onSetText={(t) => onSetText(it.key, t)} />
          )}
              {earlier.length > EARLIER_CAP &&
          <div className="prt-earlier-more">
                  {earlier.length - EARLIER_CAP} older{" "}
                  {earlier.length - EARLIER_CAP === 1 ? "prayer" : "prayers"} —{" "}
                  <button onClick={() => onOpenContact(c.id)}>see {firstName}'s full history</button>
                </div>
          }
            </div>
        }
        </div>
      }
    </article>);

};

// ── empty state for the week: a quiet invitation to write what we're carrying ──
const AddThisWeek = ({ name, onAdd }) => {
  const [open, setOpen] = React.useState(false);
  const [val, setVal] = React.useState("");
  const save = () => {
    const t = val.trim();
    if (!t) return;
    onAdd(t);
    setVal("");
    setOpen(false);
  };
  if (!open)
  return (
    <button className="prt-week-add" onClick={() => setOpen(true)}>
        <span className="prt-week-add-plus" aria-hidden>+</span>
        <span>Write what we're carrying for {name} this week</span>
      </button>);


  return (
    <div className="prt-week-form">
      <textarea
        className="prt-week-input"
        autoFocus
        rows={3}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        placeholder={"What are we praying for " + name + " this week?"} />

      <div className="prt-week-actions">
        <button className="prt-week-save" disabled={!val.trim()} onClick={save}>Add prayer</button>
        <button className="prt-week-cancel" onClick={() => {setVal("");setOpen(false);}}>Cancel</button>
      </div>
    </div>);

};

// One individual prayer: date, what it is, a single mark (toggleable), inline edit.
const PrayerItem = ({ item, variant, needsMark, onSetStatus, onSetText }) => {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(item.text);
  const startEdit = () => {setDraft(item.text);setEditing(true);};
  const save = () => {onSetText(draft.trim() || item.text);setEditing(false);};

  const status = item.status || "none";
  const cls =
  "prt-prayer status-" + status +
  (status === "answered" ? " is-answered" : "") +
  (variant === "week" ? " is-week" : "") +
  (variant === "last" ? " is-last" : "") +
  (needsMark ? " needs-mark" : "");

  // toggle: clicking the active mark clears it back to no status
  const mark = (s) => onSetStatus(item.status === s ? null : s);

  return (
    <article className={cls}>
      <span className="prt-prayer-rail" aria-hidden></span>
      <div className="prt-prayer-body">
        <div className="prt-prayer-top">
          <span className="prt-prayer-date">{item.date}</span>
          {item.status ?
          <span className={"prt-prayer-status status-" + item.status}>{STATUS_LABEL[item.status]}</span> :
          variant !== "week" ?
          <span className="prt-prayer-status status-none">Unmarked</span> :
          null}
          {!editing &&
          <button className="prt-prayer-edit" onClick={startEdit}>Edit</button>
          }
        </div>

        {editing ?
        <div className="prt-edit">
            <textarea
            className="prt-edit-input"
            autoFocus
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)} />

            <div className="prt-edit-actions">
              <button className="prt-week-save" disabled={!draft.trim()} onClick={save}>Save</button>
              <button className="prt-week-cancel" onClick={() => {setDraft(item.text);setEditing(false);}}>Cancel</button>
            </div>
          </div> :

        <p className="prt-prayer-text">{item.text}</p>
        }

        <div className="prt-mark">
          <span className="prt-mark-label">
            {variant === "last" && needsMark ? "Where did it land?" : "Mark"}
          </span>
          <div className="prt-mark-pick">
            {STATUS_ORDER.map((s) =>
            <button
              key={s}
              className={"prt-mark-btn " + s + (item.status === s ? " on" : "")}
              onClick={() => mark(s)}>{STATUS_LABEL[s]}</button>
            )}
          </div>
        </div>
      </div>
    </article>);

};

window.Prayer = Prayer;
