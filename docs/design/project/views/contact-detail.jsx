// Contact detail — "Field notes": a warm profile. No ID codes, no monospace,
// no "Pipeline"/"Quick stats" framing. Just the person and how we're walking
// with them.

const cdConnected = (d) =>
  d === 0 ? "Connected today" :
  d === 1 ? "Last connected yesterday" :
  `Last connected ${d} days ago`;

const cdDaysOpen = (iso) => Math.max(1, Math.round((Date.now() - new Date(iso)) / 86400000));

// ── interaction types ─────────────────────────────────────────────────────────
const INTERACTION_TYPES = [
  { id: "coffee",      label: "Coffee",      icon: "coffee"    },
  { id: "text",        label: "Text",        icon: "msg"       },
  { id: "phone",       label: "Phone call",  icon: "phone"     },
  { id: "meal",        label: "Meal",        icon: "coffee"    },
  { id: "small-group", label: "Small group", icon: "users"     },
  { id: "meeting",     label: "Meeting",     icon: "calendar"  },
  { id: "gathering",   label: "Gathering",   icon: "calendar"  },
  { id: "meet",        label: "Ran into",    icon: "heart"     },
];

const TYPE_TITLES = {
  coffee:        "Coffee at ",
  text:          "Checked in via text",
  phone:         "Phone call",
  meal:          "Meal together",
  "small-group": "Small group",
  meeting:       "Meeting",
  gathering:     "Friday Gathering",
  meet:          "Quick catch-up",
};

// ── Log Interaction Modal ─────────────────────────────────────────────────────
const LogInteractionModal = ({ contact, personaStaffId, onClose, onSaved }) => {
  const [type,     setType]     = React.useState("coffee");
  const [title,    setTitle]    = React.useState(TYPE_TITLES["coffee"]);
  const [body,     setBody]     = React.useState("");
  const [duration, setDuration] = React.useState("");
  const [dateVal,  setDateVal]  = React.useState(() => new Date().toISOString().slice(0, 10));
  const [saving,   setSaving]   = React.useState(false);
  const bodyRef = React.useRef(null);

  // keep title in sync with type only while it hasn't been manually edited
  const titleTouched = React.useRef(false);
  const handleType = (t) => {
    setType(t);
    if (!titleTouched.current) setTitle(TYPE_TITLES[t] || "");
  };
  const handleTitleChange = (v) => {
    titleTouched.current = true;
    setTitle(v);
  };

  const handleSubmit = () => {
    if (!title.trim()) { bodyRef.current && bodyRef.current.focus(); return; }
    setSaving(true);

    const now    = new Date().toISOString();
    const dateIso = new Date(dateVal + "T12:00:00").toISOString();
    const iid    = "I-" + (9000 + Math.floor(Math.random() * 9000));
    const lid    = "L-" + (9000 + Math.floor(Math.random() * 9000));
    const staff  = personaStaffId || (STAFF[0] && STAFF[0].id) || "u1";

    // push interaction
    INTERACTIONS.unshift({
      id: iid, contactId: contact.id, staff,
      type, title: title.trim(), body: body.trim(),
      date: dateIso, duration: parseInt(duration) || 0,
    });

    // push edit-log entry
    const staffObj = staffById(staff);
    const durNote  = parseInt(duration) > 0 ? ` — ${duration} min` : "";
    EDIT_LOG.unshift({
      id: lid, at: now, staff, action: "logged interaction",
      contactId: contact.id,
      detail: `${title.trim()}${durNote}.`,
    });

    // update lastTouch on the contact in place
    const idx = CONTACTS.findIndex(c => c.id === contact.id);
    if (idx !== -1) CONTACTS[idx].lastTouch = 0;

    setTimeout(() => { setSaving(false); onSaved(); }, 300);
  };

  // close on Esc
  React.useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const first = contact.name.split(" ")[0];

  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal li-modal" role="dialog" aria-modal="true">

        <div className="modal-head">
          <div className="li-modal-who">
            <Avatar initials={contact.name.split(" ").map(x => x[0]).join("").slice(0, 2)} size="m" />
            <div>
              <div className="li-modal-name">Log an interaction with {first}</div>
              <div className="li-modal-sub">{contact.year} · {contact.major}</div>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} style={{ marginLeft: "auto" }}>
            <Icon name="x" size={15} />
          </button>
        </div>

        <div className="modal-body">
          {/* Type pills */}
          <div className="field">
            <label>What kind of interaction?</label>
            <div className="li-type-pills">
              {INTERACTION_TYPES.map(t => (
                <button
                  key={t.id}
                  className={"li-type-pill" + (type === t.id ? " active" : "")}
                  onClick={() => handleType(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Title */}
          <div className="field">
            <label>Title</label>
            <input
              className="li-input"
              type="text"
              value={title}
              onChange={e => handleTitleChange(e.target.value)}
              placeholder={`e.g. Coffee at Grindstone`}
              onKeyDown={e => { if (e.key === "Enter") bodyRef.current && bodyRef.current.focus(); }}
            />
          </div>

          {/* Notes */}
          <div className="field">
            <label>Notes <span className="li-opt">(optional)</span></label>
            <textarea
              ref={bodyRef}
              className="li-input li-textarea"
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder={`What happened? What stood out? Anything to remember…`}
              rows={4}
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit(); }}
            />
          </div>

          {/* Duration + Date row */}
          <div className="field-row">
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Duration <span className="li-opt">(minutes)</span></label>
              <input
                className="li-input"
                type="number"
                min="0"
                value={duration}
                onChange={e => setDuration(e.target.value)}
                placeholder="e.g. 45"
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Date</label>
              <input
                className="li-input"
                type="date"
                value={dateVal}
                onChange={e => setDateVal(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <span className="li-hint">⌘↵ to save</span>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className={"btn btn-primary" + (saving ? " is-saving" : "")}
            onClick={handleSubmit}
            disabled={saving || !title.trim()}
          >
            {saving ? "Saving…" : "Save interaction"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Add Prayer Modal ──────────────────────────────────────────────────────────
const PRAYER_TAG_OPTIONS = ["family","faith","health","provision","school","future","mental-health","leadership","grief","work"];

const AddPrayerModal = ({ contact, personaStaffId, onClose, onSaved }) => {
  const [title,    setTitle]    = React.useState("");
  const [body,     setBody]     = React.useState("");
  const [tags,     setTags]     = React.useState([]);
  const [priority, setPriority] = React.useState("normal");
  const [huddle,   setHuddle]   = React.useState(false);
  const [saving,   setSaving]   = React.useState(false);
  const titleRef = React.useRef(null);

  React.useEffect(() => { titleRef.current && titleRef.current.focus(); }, []);

  React.useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const toggleTag = (t) => setTags(prev => prev.includes(t) ? prev.filter(x => x !== t) : [...prev, t]);

  const handleSubmit = () => {
    if (!title.trim()) { titleRef.current && titleRef.current.focus(); return; }
    setSaving(true);
    const staff = personaStaffId || "u1";
    const pid = "P-" + (3000 + Math.floor(Math.random() * 999));
    const lid = "L-" + (9000 + Math.floor(Math.random() * 9000));
    const now = new Date().toISOString();

    PRAYERS.unshift({
      id: pid, contactId: contact.id,
      title: title.trim(), body: body.trim(),
      date: now, status: "open",
      prayedBy: [staff],
      tags, huddle, priority,
    });

    EDIT_LOG.unshift({
      id: lid, at: now, staff, action: "created prayer",
      contactId: contact.id,
      detail: `Started praying for "${title.trim()}".`,
    });

    setTimeout(() => { setSaving(false); onSaved(); }, 300);
  };

  const first = contact.name.split(" ")[0];

  return (
    <div className="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal li-modal" role="dialog" aria-modal="true">

        <div className="modal-head">
          <div className="li-modal-who">
            <Avatar initials={contact.name.split(" ").map(x => x[0]).join("").slice(0,2)} size="m" />
            <div>
              <div className="li-modal-name">Add a prayer for {first}</div>
              <div className="li-modal-sub">{contact.year} · {contact.major}</div>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} style={{ marginLeft: "auto" }}>
            <Icon name="x" size={15} />
          </button>
        </div>

        <div className="modal-body">
          <div className="field">
            <label>What are we praying for?</label>
            <input
              ref={titleRef}
              className="li-input"
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder={`e.g. ${first}'s family back home`}
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit(); }}
            />
          </div>

          <div className="field">
            <label>More context <span className="li-opt">(optional)</span></label>
            <textarea
              className="li-input li-textarea"
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="Any background worth knowing as we pray…"
              rows={3}
              onKeyDown={e => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleSubmit(); }}
            />
          </div>

          <div className="field">
            <label>Tags <span className="li-opt">(optional)</span></label>
            <div className="li-type-pills">
              {PRAYER_TAG_OPTIONS.map(t => (
                <button
                  key={t}
                  className={"li-type-pill" + (tags.includes(t) ? " active" : "")}
                  onClick={() => toggleTag(t)}
                >{t}</button>
              ))}
            </div>
          </div>

          <div className="field-row" style={{ marginBottom: 0 }}>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Priority</label>
              <div className="li-type-pills">
                {["normal","high"].map(p => (
                  <button
                    key={p}
                    className={"li-type-pill" + (priority === p ? " active" : "")}
                    onClick={() => setPriority(p)}
                  >{p === "high" ? "High" : "Normal"}</button>
                ))}
              </div>
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label>Include in next huddle?</label>
              <div className="li-type-pills">
                <button className={"li-type-pill" + (huddle ? " active" : "")} onClick={() => setHuddle(h => !h)}>
                  {huddle ? "Yes — carry it together" : "No, personal for now"}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="modal-foot">
          <span className="li-hint">⌘↵ to save</span>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button
            className={"btn btn-primary" + (saving ? " is-saving" : "")}
            onClick={handleSubmit}
            disabled={saving || !title.trim()}
          >
            {saving ? "Saving…" : "Add prayer"}
          </button>
        </div>
      </div>
    </div>
  );
};

// ── ContactDetail ─────────────────────────────────────────────────────────────
const ContactDetail = ({ contactId, onClose, onOpenContact, personaStaffId, onToast }) => {
  const c = contactById(contactId);
  const [tab, setTab] = React.useState("overview");
  const [logOpen,    setLogOpen]    = React.useState(false);
  const [prayerOpen, setPrayerOpen] = React.useState(false);
  const [addingTag,  setAddingTag]  = React.useState(false);
  const [tagInput,   setTagInput]   = React.useState("");
  const [, forceUpdate] = React.useReducer(x => x + 1, 0);

  const callContact = () => {
    window.open("tel:" + c.phone);
    onToast && onToast("Heading to your phone — log the call when you're back.");
    setTimeout(() => setLogOpen(true), 800);
  };
  const textContact = () => {
    window.open("sms:" + c.phone);
    onToast && onToast("Opening messages — log it as an interaction after.");
  };
  const emailContact = () => {
    window.open("mailto:" + c.email);
  };

  const commitTag = () => {
    const val = tagInput.trim().toLowerCase().replace(/\s+/g, "-");
    if (val && !c.tags.includes(val)) {
      c.tags.push(val);
      EDIT_LOG.unshift({
        id: "L-" + Math.floor(Math.random()*99999), at: new Date().toISOString(),
        staff: personaStaffId || "u1", action: "added tag",
        contactId: c.id, detail: `Tag "${val}" added.`,
      });
    }
    setTagInput(""); setAddingTag(false); forceUpdate();
  };

  const removeTag = (tag) => {
    const idx = c.tags.indexOf(tag);
    if (idx !== -1) c.tags.splice(idx, 1);
    EDIT_LOG.unshift({
      id: "L-" + Math.floor(Math.random()*99999), at: new Date().toISOString(),
      staff: personaStaffId || "u1", action: "removed tag",
      contactId: c.id, detail: `Tag "${tag}" removed.`,
    });
    forceUpdate();
  };
  if (!c) return null;
  const init = c.name.split(' ').map(x => x[0]).join('').slice(0, 2);
  const owner = staffById(c.owner);
  const overdue = c.lastTouch >= 7;

  const interactions = INTERACTIONS.filter(i => i.contactId === c.id);
  const prayers = PRAYERS.filter(p => p.contactId === c.id);
  const openPrayers = prayers.filter(p => p.status === "open");
  const attendanceRows = ATTENDANCE_SESSIONS.map(s => ({ s, m: ATTENDANCE[c.id][s.id] }));
  const presentCount = attendanceRows.filter(r => r.m === "present" || r.m === "late").length;
  const editHistory = EDIT_LOG.filter(l => l.contactId === c.id);

  const stageIdx = STAGES.findIndex(s => s.id === c.stage);

  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "interactions", label: "Conversations", count: interactions.length },
    { id: "prayer", label: "Prayer", count: prayers.length },
    { id: "attendance", label: "Gatherings", count: `${presentCount}/${attendanceRows.length}` },
    { id: "history", label: "History", count: editHistory.length },
  ];

  return (
    <div className="detail">
      <div className="detail-main">
        <div className="cd-head">
          <Avatar initials={init} size="xl" />
          <div className="cd-head-main">
            <div className="cd-name-row">
              <h1 className="cd-name">{c.name}</h1>
              <span className="cd-pronouns">{c.pronouns}</span>
              <StageChip stage={c.stage} />
            </div>
            <div className={"cd-since" + (overdue ? " is-overdue" : "")}>{cdConnected(c.lastTouch)}</div>
            <div className="cd-meta">
              <span>{c.year} · {c.major}</span>
              <span className="sep">·</span>
              <span className="row"><Icon name="house" size={13}/> {c.hall}</span>
              <span className="sep">·</span>
              <span>joined {c.joinedDays} days ago</span>
            </div>
            <div className="cd-actions">
              <button className="btn btn-sm" onClick={callContact}><Icon name="phone" size={14}/> Call</button>
              <button className="btn btn-sm" onClick={textContact}><Icon name="msg" size={14}/> Text</button>
              <button className="btn btn-sm" onClick={emailContact}><Icon name="mail" size={14}/> Email</button>
              <button className="btn btn-sm" onClick={() => setLogOpen(true)}><Icon name="coffee" size={14}/> Log interaction</button>
              <button className="btn btn-sm" onClick={() => setPrayerOpen(true)}><Icon name="praying" size={14}/> Add a prayer</button>
            </div>
          </div>
          <button className="icon-btn" onClick={onClose} title="Close"><Icon name="x" size={15}/></button>
        </div>

        <div className="tabs cd-tabs">
          {tabs.map(t => (
            <div key={t.id} className={"tab " + (tab === t.id ? "active" : "")} onClick={() => setTab(t.id)}>
              {t.label}{t.count != null && <span className="count">{t.count}</span>}
            </div>
          ))}
        </div>

        {tab === "overview" && (
          <div>
            <div className="cd-sec">
              <div className="cd-sec-head"><h3 className="cd-sec-title">What we know</h3></div>
              <div className="cd-prose">{c.notes}</div>
            </div>

            <div className="cd-sec">
              <div className="cd-sec-head">
                <h3 className="cd-sec-title">Lately</h3>
                <span className="cd-sec-sub">Our last few conversations</span>
              </div>
              {interactions.length === 0 ? <div className="cd-empty">No conversations logged yet.</div> : (
                <div className="cd-tl">
                  {interactions.slice(0, 3).map(i => {
                    const u = staffById(i.staff);
                    return (
                      <div className="cd-tl-item" key={i.id}>
                        <div className="cd-tl-dot"></div>
                        <div className="cd-tl-title">{i.title}</div>
                        <div className="cd-tl-meta">{fmtDayLong(i.date)} <span className="sep">·</span> {u.name} <span className="chip s">{i.type}</span></div>
                        <div className="cd-tl-body">{i.body}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="cd-sec">
              <div className="cd-sec-head"><h3 className="cd-sec-title">Prayers we're carrying</h3></div>
              {openPrayers.length === 0 ? <div className="cd-empty">Nothing open right now.</div> : (
                <div className="cd-pray">
                  {openPrayers.map(p => (
                    <div key={p.id} className="cd-pray-card">
                      <div className="cd-pray-top">
                        <strong className="cd-pray-title">{p.title}</strong>
                        <span className="chip s accent"><span className="dot"></span>open</span>
                      </div>
                      <div className="cd-pray-body">{p.body}</div>
                      <div className="cd-pray-foot">Held {cdDaysOpen(p.date)} days · {p.prayedBy.length} have prayed</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "interactions" && (
          <div className="cd-sec">
            <div className="cd-sec-head">
              <h3 className="cd-sec-title">Every conversation</h3>
              <button className="btn btn-sm" onClick={() => setLogOpen(true)}><Icon name="plus" size={13}/> Log interaction</button>
            </div>
            <div className="cd-tl">
              {interactions.map(i => {
                const u = staffById(i.staff);
                return (
                  <div className="cd-tl-item" key={i.id}>
                    <div className="cd-tl-dot"></div>
                    <div className="cd-tl-title">{i.title}</div>
                    <div className="cd-tl-meta">{fmtDayLong(i.date)} <span className="sep">·</span> {u.name} <span className="chip s">{i.type}</span>{i.duration > 0 && <span>{i.duration} min</span>}</div>
                    <div className="cd-tl-body">{i.body}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === "prayer" && (
          <div className="cd-sec">
            <div className="cd-sec-head">
              <h3 className="cd-sec-title">Prayer history</h3>
              <button className="btn btn-sm" onClick={() => setPrayerOpen(true)}><Icon name="plus" size={13}/> Add a prayer</button>
            </div>
            <div className="cd-tl">
              {prayers.map(p => (
                <div className="cd-tl-item" key={p.id}>
                  <div className={"cd-tl-dot " + (p.status === "answered" ? "success" : "violet")}></div>
                  <div className="cd-tl-title">{p.title}</div>
                  <div className="cd-tl-meta">
                    {p.status === "answered"
                      ? <span className="chip s success"><span className="dot"></span>answered</span>
                      : <span className="chip s violet"><span className="dot"></span>open</span>}
                    <span>asked {relTime(p.date)}</span><span className="sep">·</span><span>{p.prayedBy.length} have prayed</span>
                  </div>
                  <div className="cd-tl-body">{p.body}</div>
                  {p.answeredBody && <div className="cd-answered"><b>Answered.</b> {p.answeredBody}</div>}
                </div>
              ))}
              {prayers.length === 0 && <div className="cd-empty">No prayers recorded yet.</div>}
            </div>
          </div>
        )}

        {tab === "attendance" && (
          <div className="cd-sec">
            <div className="cd-sec-head"><h3 className="cd-sec-title">Showing up</h3></div>
            <div className="cd-att-line">
              <span className="cd-att-said">Around for <b>{presentCount}</b> of the last {attendanceRows.length} gatherings.</span>
              <div className="bar" style={{ width: 150 }}><span style={{ width: `${(presentCount / attendanceRows.length) * 100}%` }}></span></div>
            </div>
            <div className="cd-sessions">
              {attendanceRows.slice().reverse().map(({ s, m }) => (
                <div className="cd-session" key={s.id}>
                  <div>
                    <div className="cd-session-title">{s.title}</div>
                    <div className="cd-session-meta">{s.type} · {s.short.replace(/^\w+\s/, "")}</div>
                  </div>
                  {m === "present" && <span className="chip s success"><span className="dot"></span>there</span>}
                  {m === "late" && <span className="chip s warn"><span className="dot"></span>came late</span>}
                  {m === "absent" && <span className="chip s"><span className="dot"></span>away</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "history" && (
          <div className="cd-sec">
            <div className="cd-sec-head"><h3 className="cd-sec-title">History</h3></div>
            <div className="cd-tl">
              {editHistory.map(l => {
                const u = staffById(l.staff);
                return (
                  <div className="cd-tl-item" key={l.id}>
                    <div className="cd-tl-dot mute"></div>
                    <div className="cd-tl-title" style={{ fontWeight: 500 }}><span style={{ fontWeight: 600 }}>{u.name}</span> {l.action}</div>
                    <div className="cd-tl-meta">{relTime(l.at)}</div>
                    <div className="cd-tl-body">{l.detail}</div>
                  </div>
                );
              })}
              {editHistory.length === 0 && <div className="cd-empty">Nothing recorded yet.</div>}
            </div>
          </div>
        )}
      </div>

      <aside className="detail-aside">
        <div className="cd-aside-sec">
          <h3 className="cd-aside-title">How to reach {c.name.split(' ')[0]}</h3>
          <div className="cd-kv">
            <div className="cd-kv-row"><Icon name="phone" size={15} className="cd-kv-ico" /><span className="cd-kv-val">{c.phone}</span></div>
            <div className="cd-kv-row"><Icon name="mail" size={15} className="cd-kv-ico" /><span className="cd-kv-val dim">{c.email}</span></div>
            <div className="cd-kv-row"><Icon name="ig" size={15} className="cd-kv-ico" /><span className="cd-kv-val dim">{c.instagram}</span></div>
            <div className="cd-kv-row"><Icon name="house" size={15} className="cd-kv-ico" /><span className="cd-kv-val">{c.hall}</span></div>
          </div>
        </div>

        <div className="cd-aside-sec">
          <h3 className="cd-aside-title">Where they are</h3>
          <div className="cd-journey">
            {STAGES.map((s, i) => {
              const state = i < stageIdx ? "done" : i === stageIdx ? "on" : "";
              return (
                <div key={s.id} className={"cd-journey-step " + state} style={{ "--tone": `var(--${s.tone})` }}>
                  <span className="cd-step-mark">
                    {state === "on" && <Icon name="check" size={11} color="#fff" />}
                    {state === "done" && <span className="pd"></span>}
                  </span>
                  <span className="cd-step-name">{s.name}</span>
                  {state === "on" && <span className="cd-step-here">here now</span>}
                </div>
              );
            })}
          </div>
        </div>

        <div className="cd-aside-sec">
          <h3 className="cd-aside-title">Cared for by</h3>
          <div className="cd-owner">
            <Avatar initials={owner.initials} size="l" />
            <div>
              <div className="cd-owner-name">{owner.name}</div>
              <div className="cd-owner-role">{owner.role}</div>
            </div>
          </div>
        </div>

        <div className="cd-aside-sec">
          <h3 className="cd-aside-title">Tags</h3>
          <div className="cd-tags">
            {c.tags.length === 0 && !addingTag && <span className="muted" style={{ fontSize: 13 }}>None yet</span>}
            {c.tags.map(t => (
              <span key={t} className="chip s cd-tag-item">
                <Icon name="tag" size={10}/> {t}
                <button className="cd-tag-x" onClick={() => removeTag(t)} title="Remove tag">×</button>
              </span>
            ))}
            {addingTag ? (
              <span className="cd-tag-input-wrap">
                <input
                  className="cd-tag-input"
                  autoFocus
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  placeholder="new tag…"
                  onKeyDown={e => {
                    if (e.key === "Enter") commitTag();
                    if (e.key === "Escape") { setTagInput(""); setAddingTag(false); }
                  }}
                  onBlur={commitTag}
                />
              </span>
            ) : (
              <button className="chip s cd-tag-add" onClick={() => setAddingTag(true)}>+ add</button>
            )}
          </div>
        </div>
      </aside>

      {prayerOpen && (
        <AddPrayerModal
          contact={c}
          personaStaffId={personaStaffId}
          onClose={() => setPrayerOpen(false)}
          onSaved={() => { setPrayerOpen(false); setTab("prayer"); forceUpdate(); }}
        />
      )}

      {logOpen && (
        <LogInteractionModal
          contact={c}
          personaStaffId={personaStaffId}
          onClose={() => setLogOpen(false)}
          onSaved={() => { setLogOpen(false); setTab("interactions"); forceUpdate(); }}
        />
      )}
    </div>
  );
};

window.ContactDetail = ContactDetail;
