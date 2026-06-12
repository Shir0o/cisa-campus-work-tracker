// Gatherings — "Field notes": not an attendance spreadsheet. We lead with the
// people we haven't seen in a while (so absence becomes care, not a metric),
// then keep a warm record of when we gathered — tap a name to mark who was there.
// IDs and monospace are gone; the percentages are gone; the people stay.

const MO_ABBR = ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MO_LONG = ["", "January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

// ATTENDANCE_SESSIONS short looks like "Fri 5/01"
const sessionDow = (s) => s.short.split(" ")[0];
const sessionParts = (s) => {
  const md = s.short.split(" ")[1] || "1/1";
  const [m, d] = md.split("/").map(Number);
  return { m, d };
};
const sessionLabel = (s) => { const { m, d } = sessionParts(s); return `${MO_ABBR[m]} ${d}`; };

const TYPE_BLURB = {
  "Weekly": "Friday night, the whole fellowship",
  "Small Group": "A handful, around a table",
  "Special": "A one-off worship gathering",
};

const initialsOf = (name) => name.split(" ").map((x) => x[0]).join("").slice(0, 2);

const GATH_TYPES = ["Weekly", "Small Group", "Special", "Outreach"];
const DOW_ABBR = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
const MON_ABBR = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

// ── Log a Gathering Modal ─────────────────────────────────────────────────────
const LogGatheringModal = ({ onClose, onSaved }) => {
  const [title,    setTitle]    = React.useState("");
  const [type,     setType]     = React.useState("Weekly");
  const [location, setLocation] = React.useState("");
  const [dateVal,  setDateVal]  = React.useState(() => new Date().toISOString().slice(0, 10));
  const [saving,   setSaving]   = React.useState(false);
  const titleRef = React.useRef(null);

  React.useEffect(() => { titleRef.current && titleRef.current.focus(); }, []);
  React.useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const handleSubmit = () => {
    if (!title.trim()) { titleRef.current && titleRef.current.focus(); return; }
    setSaving(true);

    const d = new Date(dateVal + "T12:00:00");
    const dow = DOW_ABBR[d.getDay()];
    const mon = MON_ABBR[d.getMonth()];
    const day = d.getDate();
    const shortLabel = `${dow} ${d.getMonth() + 1}/${day}`;
    const sid = "S-" + (2000 + Math.floor(Math.random() * 9000));

    const newSession = {
      id: sid,
      short: shortLabel,
      title: title.trim(),
      type,
      location: location.trim() || undefined,
    };

    // Add session to global list
    ATTENDANCE_SESSIONS.push(newSession);

    // Give every contact an "absent" mark for this session
    CONTACTS.forEach((c) => {
      if (!ATTENDANCE[c.id]) ATTENDANCE[c.id] = {};
      ATTENDANCE[c.id][sid] = "absent";
    });

    // Log it
    EDIT_LOG.unshift({
      id: "L-" + Math.floor(Math.random() * 99999),
      at: new Date().toISOString(), staff: "u1",
      action: "logged attendance", contactId: null,
      detail: `${title.trim()} — ${shortLabel}.`,
    });

    setTimeout(() => { setSaving(false); onSaved(); }, 300);
  };

  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal li-modal" role="dialog" aria-modal="true">
        <div className="modal-head">
          <div className="li-modal-who">
            <div className="li-gather-ico"><Icon name="calendar" size={18} /></div>
            <div>
              <div className="li-modal-name">Log a gathering</div>
              <div className="li-modal-sub">Add it to the record — then mark who came.</div>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} style={{ marginLeft: "auto" }}>
            <Icon name="x" size={15} />
          </button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label>Name</label>
            <input
              ref={titleRef}
              className="li-input"
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Friday Night Gathering"
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit(); }}
            />
          </div>

          <div className="field">
            <label>Type</label>
            <div className="li-type-pills">
              {GATH_TYPES.map(t => (
                <button key={t} className={"li-type-pill" + (type === t ? " active" : "")} onClick={() => setType(t)}>{t}</button>
              ))}
            </div>
          </div>

          <div className="field-row">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Date</label>
              <input className="li-input" type="date" value={dateVal} onChange={e => setDateVal(e.target.value)} />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Location <span className="li-opt">(optional)</span></label>
              <input className="li-input" type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Lower Common Room" />
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <span className="li-hint">Mark attendance once saved.</span>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className={"btn btn-primary" + (saving ? " is-saving" : "")}
            onClick={handleSubmit}
            disabled={saving || !title.trim()}
          >
            {saving ? "Saving…" : "Log gathering"}
          </button>
        </div>
      </div>
    </div>
  );
};

const Attendance = ({ onOpenContact }) => {
  const [type, setType] = React.useState("all");
  const [marks, setMarks] = React.useState(ATTENDANCE);
  const [openId, setOpenId] = React.useState(null);
  const [logOpen, setLogOpen] = React.useState(false);
  const [, forceUpdate] = React.useReducer(x => x + 1, 0);

  const cycle = (cid, sid) =>
    setMarks((prev) => {
      const cur = prev[cid][sid];
      const next = cur === "present" ? "late" : cur === "late" ? "absent" : "present";
      return { ...prev, [cid]: { ...prev[cid], [sid]: next } };
    });

  const here = (cid, sid) => marks[cid][sid] === "present" || marks[cid][sid] === "late";

  // newest gatherings first — re-derive each render so newly added sessions appear
  const allSessions = ATTENDANCE_SESSIONS.slice().reverse();
  const sessions = allSessions.filter((s) => type === "all" || s.type === type);

  // Who we've missed: came before, but not in the most recent gatherings.
  const missed = React.useMemo(() => {
    const out = [];
    CONTACTS.forEach((c) => {
      let since = 0, lastSeen = null;
      for (const s of allSessions) {
        if (here(c.id, s.id)) { lastSeen = s; break; }
        since++;
      }
      if (lastSeen && since >= 2) out.push({ c, since, lastSeen });
    });
    return out.sort((a, b) => b.since - a.since).slice(0, 4);
  }, [marks]);

  // upcoming gatherings to invite people to
  const upcoming = EVENTS.slice().sort((a, b) => new Date(a.date) - new Date(b.date)).slice(0, 3);

  // quiet figures
  let gatheredSlots = 0;
  CONTACTS.forEach((c) => allSessions.forEach((s) => { if (here(c.id, s.id)) gatheredSlots++; }));
  const avgPer = Math.round(gatheredSlots / allSessions.length);

  return (
    <div className="page gatherings">
      <header className="dash-head">
        <div>
          <div className="dash-eyebrow">Wednesday, May 13 · Week 9 of the spring semester</div>
          <h1 className="dash-greeting">Gatherings</h1>
          <p className="dash-state">
            We've come together <b>{allSessions.length} times</b> this month — about <span className="num">{avgPer}</span> people
            each time. {missed.length > 0 &&
              <React.Fragment>A few faces have gone quiet lately; they're the first thing below.</React.Fragment>}
          </p>
        </div>
        <div className="dash-actions">
          <button className="btn btn-primary" onClick={() => setLogOpen(true)}><Icon name="plus" size={15} /> Log a gathering</button>
        </div>
      </header>

      {/* ---- Who we've missed (the heart of the reframe) ---- */}
      {missed.length > 0 &&
        <section className="dash-sec" style={{ marginTop: 40 }}>
          <div className="dash-sec-head">
            <h2 className="dash-sec-title">Who we've missed lately</h2>
            <span className="dash-sec-sub">They used to come, but it's been a few gatherings.</span>
          </div>
          <div className="reach-list">
            {missed.map(({ c, since, lastSeen }) => {
              const owner = staffById(c.owner);
              return (
                <div className="reach" key={c.id} onClick={() => onOpenContact(c.id)} style={{ cursor: "pointer" }}>
                  <div className="reach-l">
                    <Avatar initials={initialsOf(c.name)} size="l" />
                    <div className="reach-who">
                      <div className="reach-top">
                        <span className="reach-name">{c.name}</span>
                        <StageChip stage={c.stage} size="s" />
                      </div>
                      <div className="reach-since">
                        Last with us at {lastSeen.title} · {sessionLabel(lastSeen)} — {since} gatherings ago
                      </div>
                      <div className="reach-note">
                        {c.year} · {c.major} <span className="meta">· cared for by {owner.name.split(" ")[0]}</span>
                      </div>
                    </div>
                  </div>
                  <div className="reach-cta" onClick={(e) => e.stopPropagation()}>
                    <button className="btn btn-sm"><Icon name="msg" size={14} /> Reach out</button>
                    <button className="btn btn-sm btn-primary" onClick={() => onOpenContact(c.id)}>Open</button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>}

      {/* ---- When we gathered (the record + marking) ---- */}
      <section className="dash-sec" style={{ marginTop: 46 }}>
        <div className="dash-sec-head">
          <h2 className="dash-sec-title">When we met</h2>
          <span className="dash-sec-sub">Tap a gathering to see who attended — and mark anyone you remember.</span>
        </div>

        <div className="gth-filter">
          <div className="seg seg-warm">
            <button className={type === "all" ? "active" : ""} onClick={() => setType("all")}>All</button>
            <button className={type === "Weekly" ? "active" : ""} onClick={() => setType("Weekly")}>Friday Gatherings</button>
            <button className={type === "Small Group" ? "active" : ""} onClick={() => setType("Small Group")}>Small Groups</button>
            <button className={type === "Special" ? "active" : ""} onClick={() => setType("Special")}>Special</button>
          </div>
        </div>

        <div className="gth-list">
          {sessions.map((s) => {
            const present = CONTACTS.filter((c) => marks[c.id][s.id] === "present");
            const late = CONTACTS.filter((c) => marks[c.id][s.id] === "late");
            const absent = CONTACTS.filter((c) => marks[c.id][s.id] === "absent");
            const cameAll = [...present, ...late];
            const isOpen = openId === s.id;
            const { d } = sessionParts(s);
            return (
              <div className={"gth" + (isOpen ? " open" : "")} key={s.id}>
                <button className="gth-sum" onClick={() => setOpenId(isOpen ? null : s.id)}>
                  <div className="gth-date">
                    <span className="gth-dow">{sessionDow(s)}</span>
                    <span className="gth-day">{d}</span>
                    <span className="gth-mo">{MO_ABBR[sessionParts(s).m]}</span>
                  </div>
                  <div className="gth-main">
                    <div className="gth-title">{s.title}</div>
                    <div className="gth-blurb">{TYPE_BLURB[s.type] || s.type}</div>
                  </div>
                  <div className="gth-right">
                    <div className="avstack">
                      {cameAll.slice(0, 6).map((c) => <Avatar key={c.id} initials={initialsOf(c.name)} size="s" />)}
                    </div>
                    <span className="gth-count">
                      <b>{cameAll.length}</b> attended{late.length > 0 ? ` · ${late.length} late` : ""}
                    </span>
                    <span className="gth-chev" aria-hidden>{isOpen ? "▴" : "▾"}</span>
                  </div>
                </button>

                {isOpen &&
                  <div className="gth-roster">
                    <div className="gth-legend">
                      <span><i className="dot present"></i> here</span>
                      <span><i className="dot late"></i> came late</span>
                      <span><i className="dot absent"></i> missed</span>
                      <span className="gth-legend-hint">Tap a name to update who was there.</span>
                    </div>
                    <div className="gth-cols">
                      <div className="gth-col">
                        <div className="gth-col-h">Attended <span>{cameAll.length}</span></div>
                        <div className="gth-people">
                          {cameAll.length === 0 && <div className="gth-empty">No one marked yet.</div>}
                          {cameAll.map((c) => {
                            const isLate = marks[c.id][s.id] === "late";
                            return (
                              <button key={c.id} className={"gth-person here" + (isLate ? " is-late" : "")} onClick={() => cycle(c.id, s.id)}>
                                <Avatar initials={initialsOf(c.name)} size="s" />
                                <span className="gth-person-name">{c.name}</span>
                                {isLate && <span className="gth-late-tag">late</span>}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      <div className="gth-col">
                        <div className="gth-col-h muted">We missed <span>{absent.length}</span></div>
                        <div className="gth-people">
                          {absent.length === 0 && <div className="gth-empty">Everyone came.</div>}
                          {absent.map((c) => (
                            <button key={c.id} className="gth-person gone" onClick={() => cycle(c.id, s.id)}>
                              <Avatar initials={initialsOf(c.name)} size="s" />
                              <span className="gth-person-name">{c.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>}
              </div>
            );
          })}
        </div>
      </section>

      {/* ---- Coming up (forward-looking, invite-oriented) ---- */}
      <section className="dash-sec" style={{ marginTop: 46 }}>
        <div className="dash-sec-head">
          <h2 className="dash-sec-title">Coming up</h2>
          <span className="dash-sec-sub">What we can invite people to next.</span>
        </div>
        <div className="card">
          <div className="card-body" style={{ paddingTop: 4, paddingBottom: 4 }}>
            {upcoming.map((ev) => (
              <div className="tw-row" key={ev.id}>
                <div className="tw-date">
                  <div className="d">{dayNum(ev.date)}</div>
                  <div className="m">{dayMonth(ev.date)}</div>
                </div>
                <div>
                  <div className="tw-title">{ev.title}</div>
                  <div className="tw-meta">{ev.time} · {ev.location}</div>
                </div>
                <span className="chip s">{ev.attended.length ? `${ev.attended.length} coming` : "open"}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---- Quiet figures ---- */}
      <div className="dash-figures">
        <div className="fig"><span className="fig-n">{allSessions.length}</span><span className="fig-l">gatherings</span></div>
        <div className="fig"><span className="fig-n">{avgPer}</span><span className="fig-l">come, on average</span></div>
        <div className="fig"><span className="fig-n">{missed.length}</span><span className="fig-l">gone quiet</span></div>
        <span className="dash-figures-note">Counting heads is just a way of noticing who's missing.</span>
      </div>

      {logOpen && (
        <LogGatheringModal
          onClose={() => setLogOpen(false)}
          onSaved={() => {
            setLogOpen(false);
            setMarks({ ...ATTENDANCE });
            setOpenId(ATTENDANCE_SESSIONS[ATTENDANCE_SESSIONS.length - 1].id);
            forceUpdate();
          }}
        />
      )}
    </div>
  );
};

window.Attendance = Attendance;
